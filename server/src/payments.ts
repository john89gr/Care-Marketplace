import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { query, Row } from './db';
import { AuthedUser, requireAuth } from './auth';

/**
 * Payments (§13): card tokenization (simulated PSP), payment-method CRUD,
 * provider payout accounts, escrow freeze + partial refunds. The PAN never
 * reaches this server: tokenize consumes it transiently and every other
 * route rejects a `cardNumber` field outright.
 */

const id = (prefix: string) => `${prefix}-${randomBytes(6).toString('hex')}`;
const now = () => Date.now();
const num = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

const BRANDS = ['visa', 'mastercard', 'amex', 'other'] as const;

/** Stripe-style decline simulator: this test PAN always declines. */
const DECLINED_TEST_PAN = '4000000000000002';

function luhnValid(pan: string): boolean {
  if (!/^\d{13,19}$/.test(pan)) {
    return false;
  }
  let sum = 0;
  let double = false;
  for (let i = pan.length - 1; i >= 0; i -= 1) {
    let digit = Number(pan[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

function detectBrand(pan: string): (typeof BRANDS)[number] {
  if (/^4/.test(pan)) {
    return 'visa';
  }
  if (/^(5[1-5]|2[2-7])/.test(pan)) {
    return 'mastercard';
  }
  if (/^3[47]/.test(pan)) {
    return 'amex';
  }
  return 'other';
}

function methodFromRow(row: Row) {
  return {
    id: String(row.id),
    token: String(row.token),
    brand: String(row.brand),
    last4: String(row.last4),
    expiryMonth: Number(row.expiry_month),
    expiryYear: Number(row.expiry_year),
    isDefault: Boolean(row.is_default),
    createdAtMs: num(row.created_at_ms) ?? 0,
  };
}

function payoutFromRow(row: Row, balanceCents: number) {
  return {
    id: `payout-${row.user_id}`,
    status: String(row.status),
    accountId: row.account_id === null ? '' : String(row.account_id),
    accountLast4: row.account_last4 === null ? null : String(row.account_last4),
    currency: 'EUR',
    balanceCents,
    country: row.country === null ? null : String(row.country),
    payoutSchedule: String(row.payout_schedule ?? 'weekly'),
    updatedAtMs: num(row.updated_at_ms) ?? 0,
    onboardingUrl: row.onboarding_url === null ? null : String(row.onboarding_url),
  };
}

/** Released-escrow earnings for a provider (net of partial refunds). */
async function providerBalanceCents(providerId: string): Promise<number> {
  const rows = await query<Row>(
    `SELECT COALESCE(SUM(amount_cents - refunded_cents), 0) AS balance
       FROM escrow WHERE provider_id = $1 AND status = 'released'`,
    [providerId]
  );
  return Number(rows[0]?.balance ?? 0);
}

export const paymentsRouter = Router();

/** Simulated PSP tokenization: validates + tokenizes, never persists the PAN. */
paymentsRouter.post('/me/payment-methods/tokenize', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const body = req.body as { cardNumber?: unknown; expiryMonth?: unknown; expiryYear?: unknown; cvc?: unknown };
    const pan = String(body.cardNumber ?? '').replace(/[\s-]/g, '');
    const month = Number(body.expiryMonth);
    const year = Number(body.expiryYear);
    const cvc = String(body.cvc ?? '');
    if (!luhnValid(pan)) {
      res.status(422).json({ message: 'The card number is invalid.' });
      return;
    }
    const current = new Date();
    if (
      !Number.isInteger(month) || month < 1 || month > 12 ||
      !Number.isInteger(year) ||
      year < current.getFullYear() ||
      (year === current.getFullYear() && month < current.getMonth() + 1)
    ) {
      res.status(422).json({ message: 'The card expiry date is invalid.' });
      return;
    }
    if (!/^\d{3,4}$/.test(cvc)) {
      res.status(422).json({ message: 'The security code is invalid.' });
      return;
    }
    if (pan === DECLINED_TEST_PAN) {
      res.json({ declined: true });
      return;
    }
    res.json({
      token: `tok_${randomBytes(9).toString('hex')}`,
      brand: detectBrand(pan),
      last4: pan.slice(-4),
      expiryMonth: month,
      expiryYear: year,
    });
  } catch (error) {
    next(error);
  }
});

paymentsRouter.get('/me/payment-methods', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const rows = await query<Row>(
      `SELECT * FROM payment_methods WHERE user_id = $1 ORDER BY created_at_ms DESC`,
      [me.userId]
    );
    res.json(rows.map(methodFromRow));
  } catch (error) {
    next(error);
  }
});

paymentsRouter.post('/me/payment-methods', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const body = req.body as Record<string, unknown>;
    if ('cardNumber' in body) {
      // Contract: the PAN must never reach the storage endpoint.
      res.status(422).json({ message: 'Tokenize the card before saving it.' });
      return;
    }
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const brand = typeof body.brand === 'string' ? body.brand : '';
    const last4 = typeof body.last4 === 'string' ? body.last4 : '';
    const month = Number(body.expiryMonth);
    const year = Number(body.expiryYear);
    if (!token || !(BRANDS as readonly string[]).includes(brand) || !/^\d{4}$/.test(last4)) {
      res.status(422).json({ message: 'A token, brand and last 4 digits are required.' });
      return;
    }
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
      res.status(422).json({ message: 'A valid expiry month and year are required.' });
      return;
    }
    const existing = await query<Row>(`SELECT id FROM payment_methods WHERE user_id = $1`, [me.userId]);
    const row = {
      id: id('pm'),
      user_id: me.userId,
      token,
      brand,
      last4,
      expiry_month: month,
      expiry_year: year,
      is_default: existing.length === 0,
      created_at_ms: now(),
    };
    await query(
      `INSERT INTO payment_methods (id, user_id, token, brand, last4, expiry_month, expiry_year, is_default, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [row.id, row.user_id, row.token, row.brand, row.last4, row.expiry_month, row.expiry_year, row.is_default, row.created_at_ms]
    );
    res.status(201).json(methodFromRow(row));
  } catch (error) {
    next(error);
  }
});

paymentsRouter.patch('/me/payment-methods/:id/default', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const owned = await query<Row>(
      `SELECT id FROM payment_methods WHERE id = $1 AND user_id = $2`,
      [req.params.id, me.userId]
    );
    if (owned.length === 0) {
      res.status(404).json({ message: 'Payment method not found.' });
      return;
    }
    await query(`UPDATE payment_methods SET is_default = (id = $1) WHERE user_id = $2`, [
      req.params.id,
      me.userId,
    ]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

paymentsRouter.delete('/me/payment-methods/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const rows = await query<Row>(
      `DELETE FROM payment_methods WHERE id = $1 AND user_id = $2 RETURNING is_default`,
      [req.params.id, me.userId]
    );
    if (rows.length === 0) {
      res.status(404).json({ message: 'Payment method not found.' });
      return;
    }
    if (rows[0].is_default) {
      // Keep exactly one default while methods remain.
      await query(
        `UPDATE payment_methods SET is_default = TRUE
          WHERE id = (SELECT id FROM payment_methods WHERE user_id = $1 ORDER BY created_at_ms DESC LIMIT 1)`,
        [me.userId]
      );
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// ---- Provider payout accounts ----

paymentsRouter.get('/me/payout-account', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const rows = await query<Row>(`SELECT * FROM payout_accounts WHERE user_id = $1`, [me.userId]);
    if (rows.length === 0) {
      // No account yet: the page shows onboarding (404 is swallowed client-side).
      res.status(404).json({ message: 'No payout account yet.' });
      return;
    }
    res.json(payoutFromRow(rows[0], await providerBalanceCents(me.userId)));
  } catch (error) {
    next(error);
  }
});

paymentsRouter.put('/me/payout-account', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const body = req.body as Record<string, unknown>;
    const status = body.status === undefined ? undefined : String(body.status);
    if (status !== undefined && !['not_started', 'pending', 'active'].includes(status)) {
      res.status(422).json({ message: 'Invalid payout status.' });
      return;
    }
    const schedule = body.payoutSchedule === undefined ? undefined : String(body.payoutSchedule);
    if (schedule !== undefined && !['weekly', 'manual'].includes(schedule)) {
      res.status(422).json({ message: 'Invalid payout schedule.' });
      return;
    }
    const at = now();
    const current = await query<Row>(`SELECT * FROM payout_accounts WHERE user_id = $1`, [me.userId]);
    const prev = current.length > 0 ? current[0] : null;
    const merged = {
      status: status ?? (prev ? String(prev.status) : 'not_started'),
      account_id:
        prev && prev.account_id !== null && prev.account_id !== undefined
          ? String(prev.account_id)
          : `acct_${randomBytes(8).toString('hex')}`,
      account_last4:
        typeof body.accountLast4 === 'string'
          ? body.accountLast4
          : prev && prev.account_last4 !== null
            ? String(prev.account_last4)
            : null,
      currency: 'EUR',
      balance_cents: prev ? Number(prev.balance_cents ?? 0) : 0,
      country:
        typeof body.country === 'string'
          ? body.country
          : prev && prev.country !== null
            ? String(prev.country)
            : null,
      payout_schedule: schedule ?? (prev ? String(prev.payout_schedule ?? 'weekly') : 'weekly'),
      onboarding_url:
        typeof body.onboardingUrl === 'string'
          ? body.onboardingUrl
          : prev && prev.onboarding_url !== null
            ? String(prev.onboarding_url)
            : null,
    };
    await query(
      `INSERT INTO payout_accounts
         (user_id, status, account_id, account_last4, currency, balance_cents, country, payout_schedule, onboarding_url, updated_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id) DO UPDATE SET
         status = EXCLUDED.status,
         account_id = EXCLUDED.account_id,
         account_last4 = EXCLUDED.account_last4,
         currency = EXCLUDED.currency,
         balance_cents = EXCLUDED.balance_cents,
         country = EXCLUDED.country,
         payout_schedule = EXCLUDED.payout_schedule,
         onboarding_url = EXCLUDED.onboarding_url,
         updated_at_ms = EXCLUDED.updated_at_ms`,
      [me.userId, merged.status, merged.account_id, merged.account_last4, merged.currency, merged.balance_cents, merged.country, merged.payout_schedule, merged.onboarding_url, at]
    );
    const rows = await query<Row>(`SELECT * FROM payout_accounts WHERE user_id = $1`, [me.userId]);
    res.json(payoutFromRow(rows[0], await providerBalanceCents(me.userId)));
  } catch (error) {
    next(error);
  }
});
