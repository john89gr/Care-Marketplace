import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { query, queryOne, Row } from './db';
import { AuthedUser, requireAuth } from './auth';

/**
 * Gov.gr health wallet (§15): per-user verified documents (vaccinations,
 * prescriptions, exams, KEPA certificates), optionally filtered by category.
 */

export const CATEGORIES = ['vaccinations', 'prescriptions', 'exams', 'kepa_certificates'] as const;
export type WalletCategory = (typeof CATEGORIES)[number];

export interface DigitalSignatureMetadata {
  signedBy: string;
  algorithm: string;
  certificateSerial: string;
  timestampMs: number;
  valid: boolean;
  [key: string]: unknown;
}

export interface WalletDocumentResponse {
  id: string;
  userId: string;
  category: string;
  title: string;
  issuer: string;
  issuedAtMs: number;
  expiresAtMs: number | null;
  docType: string;
  dataUrl: string;
  verified: boolean;
  verificationStatus: 'verified' | 'unverified';
  signatureMetadata: DigitalSignatureMetadata | null;
  digitalSignature: DigitalSignatureMetadata | null;
}

export function isValidCategory(cat: unknown): cat is WalletCategory {
  return typeof cat === 'string' && (CATEGORIES as readonly string[]).includes(cat);
}

export function documentFromRow(row: Row): WalletDocumentResponse {
  let signatureMetadata: DigitalSignatureMetadata | null = null;
  if (row.signature_metadata) {
    try {
      signatureMetadata =
        typeof row.signature_metadata === 'string'
          ? JSON.parse(row.signature_metadata)
          : (row.signature_metadata as DigitalSignatureMetadata);
    } catch {
      signatureMetadata = null;
    }
  }

  const isVerified = Boolean(row.verified);
  if (!signatureMetadata && isVerified) {
    signatureMetadata = {
      signedBy: String(row.issuer || 'Gov.gr National Health Service'),
      algorithm: 'SHA256withRSA',
      certificateSerial: `GR-GOV-${String(row.id).toUpperCase()}`,
      timestampMs: Number(row.issued_at_ms),
      valid: true,
    };
  }

  return {
    id: String(row.id),
    userId: String(row.user_id),
    category: String(row.category),
    title: String(row.title),
    issuer: String(row.issuer ?? ''),
    issuedAtMs: Number(row.issued_at_ms),
    expiresAtMs: row.expires_at_ms === null || row.expires_at_ms === undefined ? null : Number(row.expires_at_ms),
    docType: String(row.doc_type ?? 'pdf'),
    dataUrl: String(row.data_url ?? ''),
    verified: isVerified,
    verificationStatus: isVerified ? 'verified' : 'unverified',
    signatureMetadata,
    digitalSignature: signatureMetadata,
  };
}

export interface MockWalletDoc {
  id: string;
  category: WalletCategory;
  title: string;
  issuer: string;
  issuedAtMs: number;
  expiresAtMs: number | null;
  docType: 'pdf' | 'image';
  dataUrl: string;
  signatureMetadata: DigitalSignatureMetadata;
}

export function getGovGrCertifiedRecords(userId: string): Record<WalletCategory, MockWalletDoc[]> {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const userTag = userId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || 'USER';

  const svgSample = (title: string, sub: string) =>
    `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200" viewBox="0 0 600 200"><rect width="600" height="200" fill="#f0f4f8"/><rect x="10" y="10" width="580" height="180" fill="#ffffff" stroke="#003399" stroke-width="2" rx="8"/><text x="30" y="50" font-family="sans-serif" font-size="20" font-weight="bold" fill="#003399">ΕΛΛΗΝΙΚΗ ΔΗΜΟΚΡΑΤΙΑ - GOV.GR</text><text x="30" y="90" font-family="sans-serif" font-size="16" fill="#1e293b">${title}</text><text x="30" y="130" font-family="sans-serif" font-size="14" fill="#64748b">${sub}</text><text x="30" y="170" font-family="sans-serif" font-size="12" fill="#10b981">✓ ΨΗΦΙΑΚΑ ΥΠΟΓΕΓΡΑΜΜΕΝΟ ΚΑΙ ΕΠΑΛΗΘΕΥΜΕΝΟ</text></svg>`
    )}`;

  const pdfSample = `data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrCjEgMCBvYmoKPDwKL1RpdGxlIChHb3YuZ3IgSGVhbHRoIFJlY29yZCkKL0NyZWF0b3IgKEdvdi5nciBOYXRpb25hbCBIZWFsdGggV2FsbGV0KQo+PgplbmRvYmoK`;

  return {
    vaccinations: [
      {
        id: `gov-vac-${userId}-1`,
        category: 'vaccinations',
        title: 'Εμβόλιο COVID-19 mRNA (Comirnaty)',
        issuer: 'Gov.gr / Εθνικό Μητρώο Εμβολιασμών',
        issuedAtMs: now - 180 * day,
        expiresAtMs: null,
        docType: 'pdf',
        dataUrl: pdfSample,
        signatureMetadata: {
          signedBy: 'Gov.gr National Vaccination Registry PKI',
          algorithm: 'SHA256withRSA',
          certificateSerial: `GR-VAC-${userTag}-2025`,
          timestampMs: now - 180 * day,
          valid: true,
        },
      },
      {
        id: `gov-vac-${userId}-2`,
        category: 'vaccinations',
        title: 'Εμβόλιο Εποχικής Γρίπης 2025-2026',
        issuer: 'Gov.gr / Εθνικό Μητρώο Εμβολιασμών',
        issuedAtMs: now - 45 * day,
        expiresAtMs: now + 320 * day,
        docType: 'image',
        dataUrl: svgSample('Εμβόλιο Εποχικής Γρίπης', 'Κέντρο Υγείας Αθηνών'),
        signatureMetadata: {
          signedBy: 'Gov.gr National Vaccination Registry PKI',
          algorithm: 'SHA256withRSA',
          certificateSerial: `GR-VAC-${userTag}-FLU26`,
          timestampMs: now - 45 * day,
          valid: true,
        },
      },
    ],
    prescriptions: [
      {
        id: `gov-rx-${userId}-1`,
        category: 'prescriptions',
        title: 'Ηλεκτρονική Συνταγή #984210 - Ατορβαστατίνη 20mg',
        issuer: 'Gov.gr / ΗΔΙΚΑ',
        issuedAtMs: now - 10 * day,
        expiresAtMs: now + 20 * day,
        docType: 'pdf',
        dataUrl: pdfSample,
        signatureMetadata: {
          signedBy: 'HDIKA Electronic Prescription PKI Authority',
          algorithm: 'SHA256withRSA',
          certificateSerial: `HDIKA-RX-${userTag}-984210`,
          timestampMs: now - 10 * day,
          valid: true,
        },
      },
    ],
    exams: [
      {
        id: `gov-exam-${userId}-1`,
        category: 'exams',
        title: 'Γενική Αίματος & Βιοχημικός Έλεγχος',
        issuer: 'Gov.gr / ΕΟΠΥΥ Διαγνωστικά',
        issuedAtMs: now - 25 * day,
        expiresAtMs: null,
        docType: 'pdf',
        dataUrl: pdfSample,
        signatureMetadata: {
          signedBy: 'EOPYY Diagnostic Network PKI',
          algorithm: 'SHA256withRSA',
          certificateSerial: `EOPYY-LAB-${userTag}-4412`,
          timestampMs: now - 25 * day,
          valid: true,
        },
      },
    ],
    kepa_certificates: [
      {
        id: `gov-kepa-${userId}-1`,
        category: 'kepa_certificates',
        title: 'Γνωστοποίηση Αποτελέσματος Πιστοποίησης Αναπηρίας ΚΕΠΑ',
        issuer: 'Gov.gr / e-ΕΦΚΑ ΚΕΠΑ',
        issuedAtMs: now - 90 * day,
        expiresAtMs: now + 640 * day,
        docType: 'pdf',
        dataUrl: pdfSample,
        signatureMetadata: {
          signedBy: 'e-EFKA KEPA Certification Authority',
          algorithm: 'SHA256withRSA',
          certificateSerial: `KEPA-CERT-${userTag}-7711`,
          timestampMs: now - 90 * day,
          valid: true,
        },
      },
    ],
  };
}

export const walletRouter = Router();

/**
 * GET /api/me/wallet
 * Returns list of wallet documents for the current user, optionally filtered by category.
 */
walletRouter.get('/me/wallet', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const category = typeof req.query.category === 'string' ? req.query.category : null;
    if (category !== null && !isValidCategory(category)) {
      res.status(422).json({ message: 'Unknown wallet category.' });
      return;
    }
    const rows = category
      ? await query<Row>(
          `SELECT * FROM wallet_documents WHERE user_id = $1 AND category = $2 ORDER BY issued_at_ms DESC`,
          [me.userId, category]
        )
      : await query<Row>(`SELECT * FROM wallet_documents WHERE user_id = $1 ORDER BY issued_at_ms DESC`, [
          me.userId,
        ]);
    res.json({ documents: rows.map(documentFromRow) });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/me/wallet/sync
 * Simulates pulling and synchronizing certified medical records from Gov.gr National Health Wallet.
 * Supports optional category query parameter.
 * Returns { ok: true, syncedCount: number, lastSyncedAtMs: number }.
 */
walletRouter.post('/me/wallet/sync', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const categoryQuery = typeof req.query.category === 'string' ? req.query.category : null;

    if (categoryQuery !== null && !isValidCategory(categoryQuery)) {
      res.status(422).json({ message: 'Unknown wallet category.' });
      return;
    }

    const recordsByCategory = getGovGrCertifiedRecords(me.userId);
    const toSync: MockWalletDoc[] = categoryQuery
      ? recordsByCategory[categoryQuery] ?? []
      : Object.values(recordsByCategory).flat();

    for (const doc of toSync) {
      await query(
        `INSERT INTO wallet_documents
           (id, user_id, category, title, issuer, issued_at_ms, expires_at_ms, doc_type, data_url, verified, signature_metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           issuer = EXCLUDED.issuer,
           issued_at_ms = EXCLUDED.issued_at_ms,
           expires_at_ms = EXCLUDED.expires_at_ms,
           doc_type = EXCLUDED.doc_type,
           data_url = EXCLUDED.data_url,
           verified = EXCLUDED.verified,
           signature_metadata = EXCLUDED.signature_metadata`,
        [
          doc.id,
          me.userId,
          doc.category,
          doc.title,
          doc.issuer,
          doc.issuedAtMs,
          doc.expiresAtMs,
          doc.docType,
          doc.dataUrl,
          true,
          JSON.stringify(doc.signatureMetadata),
        ]
      );
    }

    const lastSyncedAtMs = Date.now();
    res.json({
      ok: true,
      syncedCount: toSync.length,
      lastSyncedAtMs,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/me/wallet/upload
 * Allows citizen to upload verified PDF/image document to their health wallet.
 * Validates category against ['vaccinations', 'prescriptions', 'exams', 'kepa_certificates'].
 * Returns 201 with created document.
 */
walletRouter.post('/me/wallet/upload', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const body = req.body as {
      title?: unknown;
      category?: unknown;
      issuer?: unknown;
      issuedAtMs?: unknown;
      expiresAtMs?: unknown;
      docType?: unknown;
      dataUrl?: unknown;
      verified?: unknown;
      signatureMetadata?: unknown;
    };

    if (typeof body.category !== 'string' || !isValidCategory(body.category)) {
      res.status(422).json({ message: 'Invalid or missing wallet category.' });
      return;
    }

    if (typeof body.title !== 'string' || body.title.trim() === '') {
      res.status(422).json({ message: 'Title is required.' });
      return;
    }

    if (body.docType !== undefined && body.docType !== 'pdf' && body.docType !== 'image') {
      res.status(422).json({ message: 'docType must be pdf or image.' });
      return;
    }

    const docType = (body.docType === 'image' ? 'image' : 'pdf') as 'pdf' | 'image';
    const title = body.title.trim();
    const issuer =
      typeof body.issuer === 'string' && body.issuer.trim() !== '' ? body.issuer.trim() : me.displayName;
    const issuedAtMs =
      typeof body.issuedAtMs === 'number' && Number.isFinite(body.issuedAtMs) ? body.issuedAtMs : Date.now();
    const expiresAtMs =
      typeof body.expiresAtMs === 'number' && Number.isFinite(body.expiresAtMs) ? body.expiresAtMs : null;
    const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl : '';
    const verified = body.verified !== undefined ? Boolean(body.verified) : true;

    const docId = `wd-${randomBytes(6).toString('hex')}`;
    const sigMetadata: DigitalSignatureMetadata =
      body.signatureMetadata && typeof body.signatureMetadata === 'object'
        ? (body.signatureMetadata as DigitalSignatureMetadata)
        : {
            signedBy: issuer,
            algorithm: 'SHA256withRSA',
            certificateSerial: `GR-UPLOAD-${docId.replace(/^wd-/, '').toUpperCase()}`,
            timestampMs: issuedAtMs,
            valid: true,
          };

    const rows = await query<Row>(
      `INSERT INTO wallet_documents
         (id, user_id, category, title, issuer, issued_at_ms, expires_at_ms, doc_type, data_url, verified, signature_metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        docId,
        me.userId,
        body.category,
        title,
        issuer,
        issuedAtMs,
        expiresAtMs,
        docType,
        dataUrl,
        verified,
        JSON.stringify(sigMetadata),
      ]
    );

    res.status(201).json(documentFromRow(rows[0]));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/me/wallet/:id
 * Returns full document details including issuer, verification status, docType, dataUrl,
 * and digital signature metadata.
 * Returns 404 if document does not belong to user or does not exist.
 */
walletRouter.get('/me/wallet/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const docId = req.params.id;
    const row = await queryOne<Row>(
      `SELECT * FROM wallet_documents WHERE id = $1 AND user_id = $2`,
      [docId, me.userId]
    );
    if (!row) {
      res.status(404).json({ message: 'Document not found.' });
      return;
    }
    res.json(documentFromRow(row));
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/me/wallet/:id
 * Allows citizen to remove an uploaded document from their wallet.
 * Returns 404 if document does not exist or does not belong to user.
 */
walletRouter.delete('/me/wallet/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const docId = req.params.id;
    const rows = await query<Row>(
      `DELETE FROM wallet_documents WHERE id = $1 AND user_id = $2 RETURNING id`,
      [docId, me.userId]
    );
    if (rows.length === 0) {
      res.status(404).json({ message: 'Document not found.' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
