import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { query, queryOne, Row } from './db';
import { AuthedUser, requireAuth, requireRole } from './auth';

/**
 * e-Prescriptions & pharmacy orders (§9): barcode scan → parsed prescription
 * + auto-routed order, client order list, and the pharmacy fulfilment
 * pipeline. Barcode parsing mirrors the frontend parser (JSON e-prescription
 * first, `Name | Dose | xQty` lines fallback); unreadable payloads are 422.
 * Pipeline moves follow the ORDER_TRANSITIONS matrix — illegal moves are 409.
 */

const ORDER_TRANSITIONS: Record<string, readonly string[]> = {
  uploaded: ['routed', 'failed'],
  routed: ['accepted', 'failed'],
  accepted: ['preparing', 'failed'],
  preparing: ['out_for_delivery', 'failed'],
  out_for_delivery: ['delivered', 'failed'],
  delivered: [],
  failed: ['routed'],
};

const id = (prefix: string) => `${prefix}-${randomBytes(6).toString('hex')}`;
const now = () => Date.now();
const num = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

interface ParsedMed {
  name: string;
  dose: string;
  qty: number;
}

interface PartnerPharmacy {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  inStock: boolean;
  phone?: string;
  workingHours?: string;
  stockItems?: unknown[];
}

function partnerFromRow(row: Row) {
  let stockItems = row.stock_items;
  if (typeof stockItems === 'string') {
    try {
      stockItems = JSON.parse(stockItems);
    } catch {
      stockItems = [];
    }
  }
  return {
    id: String(row.id),
    name: String(row.name),
    address: String(row.address ?? ''),
    lat: Number(row.lat),
    lng: Number(row.lng),
    inStock: Boolean(row.in_stock),
    phone: String(row.phone ?? ''),
    workingHours: String(row.working_hours ?? ''),
    stockItems: Array.isArray(stockItems) ? stockItems : [],
  };
}

function parseLine(line: string): ParsedMed | null {
  const parts = line
    .split(/[|,]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0 || !parts[0]) {
    return null;
  }
  const qtyMatch = /x\s?(\d+)\s*$/.exec(parts[parts.length - 1] ?? '');
  let qty = 1;
  if (qtyMatch) {
    qty = Math.max(1, Number(qtyMatch[1]));
    parts[parts.length - 1] = (parts[parts.length - 1] ?? '').replace(/x\s?\d+\s*$/, '').trim();
  }
  const [name, dose] = parts;
  if (!name) {
    return null;
  }
  return { name, dose: dose ?? '', qty };
}

/** Mirror of the frontend barcode parser (JSON first, manual lines fallback). */
function parseBarcodePayload(raw: unknown): { prescriber: string; meds: ParsedMed[] } {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) {
    throw new Error('No barcode data found. Please scan again or enter the details manually.');
  }
  if (/^[[{]/.test(text)) {
    try {
      const parsed = JSON.parse(text) as {
        prescriber?: unknown;
        meds?: unknown;
        medications?: unknown;
      };
      const list = Array.isArray(parsed.meds)
        ? parsed.meds
        : Array.isArray(parsed.medications)
          ? parsed.medications
          : null;
      if (list) {
        const meds: ParsedMed[] = [];
        for (const entry of list) {
          if (!entry || typeof entry !== 'object') {
            continue;
          }
          const item = entry as Record<string, unknown>;
          const name = typeof item.name === 'string' ? item.name.trim() : '';
          if (!name) {
            continue;
          }
          meds.push({
            name,
            dose: typeof item.dose === 'string' ? item.dose : '',
            qty: Number.isInteger(item.qty) && (item.qty as number) > 0 ? (item.qty as number) : 1,
          });
        }
        if (meds.length > 0) {
          return {
            prescriber: typeof parsed.prescriber === 'string' ? parsed.prescriber : '',
            meds,
          };
        }
      }
    } catch {
      // Fall through to the unreadable error below.
    }
    throw new Error('The barcode could not be read. Please check the code or enter the details manually.');
  }
  const meds: ParsedMed[] = [];
  for (const chunk of text.split(/[\n;]+/)) {
    const med = parseLine(chunk.trim());
    if (med) {
      meds.push(med);
    }
  }
  if (meds.length === 0) {
    throw new Error('We could not read that code. Use one line per medication.');
  }
  return { prescriber: '', meds };
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function orderFromRow(row: Row) {
  let origin: { lat: number; lng: number } | null = null;
  if (row.origin) {
    try {
      origin = typeof row.origin === 'string' ? JSON.parse(row.origin) : row.origin;
    } catch {
      origin = null;
    }
  }
  return {
    id: String(row.id),
    prescriptionId: String(row.prescription_id),
    clientId: String(row.client_id),
    pharmacyId: row.pharmacy_id === null ? null : String(row.pharmacy_id),
    pharmacyName: row.pharmacy_name === null ? null : String(row.pharmacy_name),
    meds: (row.meds ?? []) as ParsedMed[],
    prescriber: String(row.prescriber ?? ''),
    status: String(row.status),
    deliveryAddress: String(row.delivery_address ?? ''),
    timeline: (row.timeline ?? []) as { status: string; atMs: number; note?: string }[],
    createdAtMs: num(row.created_at_ms) ?? 0,
    updatedAtMs: num(row.updated_at_ms) ?? 0,
    origin: origin ?? undefined,
  };
}

export const pharmacyRouter = Router();

/** Scan → parse → auto-route. 422 when the payload is unreadable. */
pharmacyRouter.post('/prescriptions/scan', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const body = req.body as {
      barcode?: unknown;
      prescriber?: unknown;
      deliveryAddress?: unknown;
      lat?: unknown;
      lng?: unknown;
    };
    let parsed: { prescriber: string; meds: ParsedMed[] };
    try {
      parsed = parseBarcodePayload(body.barcode);
    } catch (error) {
      res.status(422).json({ message: (error as Error).message });
      return;
    }
    const at = now();
    const prescriptionId = id('rx');
    const prescriber =
      typeof body.prescriber === 'string' && body.prescriber.trim()
        ? body.prescriber.trim()
        : parsed.prescriber;
    await query(
      `INSERT INTO prescriptions_scanned (id, user_id, barcode_payload, meds, prescriber, state, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, 'parsed', $6)`,
      [
        prescriptionId,
        me.userId,
        typeof body.barcode === 'string' ? body.barcode : '',
        JSON.stringify(parsed.meds),
        prescriber,
        at,
      ]
    );
    // Nearest in-stock partner (browser geolocation or Athens fallback).
    const lat = typeof body.lat === 'number' ? body.lat : 37.9838;
    const lng = typeof body.lng === 'number' ? body.lng : 23.7275;
    const partners = await query<Row>(`SELECT * FROM partner_pharmacies WHERE in_stock = TRUE`);
    let best: PartnerPharmacy | null = null;
    let bestKm = Number.POSITIVE_INFINITY;
    for (const row of partners) {
      const km = haversineKm(lat, lng, Number(row.lat), Number(row.lng));
      if (km < bestKm) {
        bestKm = km;
        best = {
          id: String(row.id),
          name: String(row.name),
          address: String(row.address ?? ''),
          lat: Number(row.lat),
          lng: Number(row.lng),
          inStock: true,
        };
      }
    }
    const orderId = id('po');
    const status = best ? 'routed' : 'failed';
    const timeline = [
      { status: 'uploaded', atMs: at },
      {
        status,
        atMs: at,
        note: best ? `Routed to ${best.name} (${bestKm.toFixed(1)} km).` : 'No partner pharmacy in stock.',
      },
    ];
    await query(
      `INSERT INTO pharmacy_orders
         (id, prescription_id, client_id, pharmacy_id, pharmacy_name, meds, prescriber, status, delivery_address, timeline, created_at_ms, updated_at_ms, origin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $12)`,
      [
        orderId,
        prescriptionId,
        me.userId,
        best?.id ?? null,
        best?.name ?? null,
        JSON.stringify(parsed.meds),
        prescriber,
        status,
        typeof body.deliveryAddress === 'string' ? body.deliveryAddress : '',
        JSON.stringify(timeline),
        at,
        JSON.stringify({ lat, lng }),
      ]
    );
    const orderRows = await query<Row>(`SELECT * FROM pharmacy_orders WHERE id = $1`, [orderId]);
    res.status(201).json({
      prescription: {
        id: prescriptionId,
        barcodePayload: typeof body.barcode === 'string' ? body.barcode : '',
        meds: parsed.meds,
        prescriber,
        state: 'parsed',
        createdAtMs: at,
      },
      order: orderFromRow(orderRows[0]),
    });
  } catch (error) {
    next(error);
  }
});

/** Client or pharmacy order list, newest first. */
pharmacyRouter.get('/me/pharmacy-orders', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const isPharmacy = me.roles.includes('pharmacy');
    const isAdmin = me.roles.includes('admin');

    if (isPharmacy || isAdmin) {
      let pharmacyId: string | null = null;
      const queryPharmacyId = (req.query.pharmacy_id ?? req.query.pharmacyId) as string | undefined;

      if (queryPharmacyId && typeof queryPharmacyId === 'string') {
        pharmacyId = queryPharmacyId;
      } else {
        const partner = await queryOne<Row>(
          `SELECT id FROM partner_pharmacies WHERE id = $1 OR user_id = $1 LIMIT 1`,
          [me.userId]
        );
        if (partner) {
          pharmacyId = String(partner.id);
        }
      }

      let rows: Row[];
      if (pharmacyId) {
        const activeOnly = req.query.active === 'true';
        rows = activeOnly
          ? await query<Row>(
              `SELECT * FROM pharmacy_orders WHERE pharmacy_id = $1 AND status NOT IN ('delivered', 'failed') ORDER BY created_at_ms DESC`,
              [pharmacyId]
            )
          : await query<Row>(
              `SELECT * FROM pharmacy_orders WHERE pharmacy_id = $1 ORDER BY created_at_ms DESC`,
              [pharmacyId]
            );
      } else {
        const all = req.query.all === 'true';
        rows = all
          ? await query<Row>(
              `SELECT * FROM pharmacy_orders ORDER BY created_at_ms DESC`
            )
          : await query<Row>(
              `SELECT * FROM pharmacy_orders WHERE status NOT IN ('delivered', 'failed') ORDER BY created_at_ms DESC`
            );
      }
      res.json(rows.map(orderFromRow));
      return;
    }

    const rows = await query<Row>(
      `SELECT * FROM pharmacy_orders WHERE client_id = $1 ORDER BY created_at_ms DESC`,
      [me.userId]
    );
    res.json(rows.map(orderFromRow));
  } catch (error) {
    next(error);
  }
});

/** Pharmacy fulfilment pipeline; illegal moves are 409. */
pharmacyRouter.post('/pharmacy-orders/:id/status', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const to = (req.body as { to?: unknown })?.to;
    if (typeof to !== 'string' || !(ORDER_TRANSITIONS as Record<string, readonly string[]>)[to]) {
      res.status(422).json({ message: 'A valid target status is required.' });
      return;
    }
    const order = await queryOne<Row>(`SELECT * FROM pharmacy_orders WHERE id = $1`, [req.params.id]);
    if (!order) {
      res.status(404).json({ message: 'Order not found.' });
      return;
    }
    const from = String(order.status);
    if (!ORDER_TRANSITIONS[from]?.includes(to)) {
      res.status(409).json({ message: `Cannot move an order from ${from} to ${to}.` });
      return;
    }

    const at = now();

    // Retry edge: failed -> routed
    if (from === 'failed' && to === 'routed') {
      let originLat = 37.9838;
      let originLng = 23.7275;
      if (order.origin) {
        try {
          const o = typeof order.origin === 'string' ? JSON.parse(order.origin) : order.origin;
          if (typeof o?.lat === 'number' && typeof o?.lng === 'number') {
            originLat = o.lat;
            originLng = o.lng;
          }
        } catch {
          // fallback
        }
      }
      const body = req.body as { lat?: unknown; lng?: unknown };
      if (typeof body?.lat === 'number' && typeof body?.lng === 'number') {
        originLat = body.lat;
        originLng = body.lng;
      }

      const partners = await query<Row>(`SELECT * FROM partner_pharmacies WHERE in_stock = TRUE`);
      let best: PartnerPharmacy | null = null;
      let bestKm = Number.POSITIVE_INFINITY;
      for (const row of partners) {
        const km = haversineKm(originLat, originLng, Number(row.lat), Number(row.lng));
        if (km < bestKm) {
          bestKm = km;
          best = {
            id: String(row.id),
            name: String(row.name),
            address: String(row.address ?? ''),
            lat: Number(row.lat),
            lng: Number(row.lng),
            inStock: true,
          };
        }
      }

      if (!best) {
        res.status(409).json({ message: 'Still no partner pharmacy with stock. Please try again later.' });
        return;
      }

      const timeline = [
        ...((order.timeline ?? []) as { status: string; atMs: number; note?: string }[]),
        {
          status: 'routed',
          atMs: at,
          note: `Re-routed to ${best.name} (${bestKm.toFixed(1)} km).`,
        },
      ];

      const rows = await query<Row>(
        `UPDATE pharmacy_orders
           SET status = 'routed',
               pharmacy_id = $1,
               pharmacy_name = $2,
               timeline = $3,
               updated_at_ms = $4
         WHERE id = $5 AND status = 'failed'
         RETURNING *`,
        [best.id, best.name, JSON.stringify(timeline), at, req.params.id]
      );
      if (rows.length === 0) {
        res.status(409).json({ message: 'The order changed under you. Please reload.' });
        return;
      }
      res.json(orderFromRow(rows[0]));
      return;
    }

    const timeline = [
      ...((order.timeline ?? []) as { status: string; atMs: number }[]),
      { status: to, atMs: at },
    ];
    const rows = await query<Row>(
      `UPDATE pharmacy_orders SET status = $1, timeline = $2, updated_at_ms = $3
        WHERE id = $4 AND status = $5 RETURNING *`,
      [to, JSON.stringify(timeline), at, req.params.id, from]
    );
    if (rows.length === 0) {
      res.status(409).json({ message: 'The order changed under you. Please reload.' });
      return;
    }
    res.json(orderFromRow(rows[0]));
  } catch (error) {
    next(error);
  }
});

/** List all partner pharmacies. */
pharmacyRouter.get('/pharmacy/partners', async (_req: Request, res: Response, next) => {
  try {
    const rows = await query<Row>(`SELECT * FROM partner_pharmacies ORDER BY id ASC`);
    res.json(rows.map(partnerFromRow));
  } catch (error) {
    next(error);
  }
});

/** Update partner pharmacy stock / stock items. Requires pharmacy partner or admin role. */
pharmacyRouter.patch(
  '/pharmacy/partners/:id/stock',
  requireAuth,
  requireRole('pharmacy', 'admin'),
  async (req: Request, res: Response, next) => {
    try {
      const partner = await queryOne<Row>(`SELECT * FROM partner_pharmacies WHERE id = $1`, [req.params.id]);
      if (!partner) {
        res.status(404).json({ message: 'Partner pharmacy not found.' });
        return;
      }
      const body = (req.body ?? {}) as {
        inStock?: unknown;
        in_stock?: unknown;
        stockItems?: unknown;
        stock_items?: unknown;
      };

      const inStockVal = typeof body.inStock === 'boolean'
        ? body.inStock
        : typeof body.in_stock === 'boolean'
          ? body.in_stock
          : undefined;

      const stockItemsVal = body.stockItems !== undefined
        ? body.stockItems
        : body.stock_items !== undefined
          ? body.stock_items
          : undefined;

      if (inStockVal === undefined && stockItemsVal === undefined) {
        res.status(422).json({ message: 'Provide inStock (boolean) and/or stockItems.' });
        return;
      }

      const updates: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (inStockVal !== undefined) {
        updates.push(`in_stock = $${idx++}`);
        values.push(inStockVal);
      }
      if (stockItemsVal !== undefined) {
        updates.push(`stock_items = $${idx++}`);
        values.push(JSON.stringify(stockItemsVal));
      }

      values.push(req.params.id);
      const rows = await query<Row>(
        `UPDATE partner_pharmacies SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
        values
      );
      res.json(partnerFromRow(rows[0]));
    } catch (error) {
      next(error);
    }
  }
);
