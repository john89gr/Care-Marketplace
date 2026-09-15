import { Router, Request, Response } from 'express';
import multer from 'multer';
import { randomBytes } from 'crypto';
import { mkdirSync } from 'fs';
import { join, extname } from 'path';
import { AuthedUser, requireAuth } from './auth';

/**
 * Chat attachment uploads (§18): multipart `file` (image / PDF / voice note,
 * ≤ 10 MB — the same allowlist the chat store validates client-side).
 * Stored on local disk under UPLOAD_DIR and served back at the returned
 * `url`, so the message send can reference it immediately.
 */

const ALLOWED: Record<string, { kind: 'image' | 'pdf' | 'voice'; exts: string[] }> = {
  'image/png': { kind: 'image', exts: ['.png'] },
  'image/jpeg': { kind: 'image', exts: ['.jpg', '.jpeg'] },
  'image/gif': { kind: 'image', exts: ['.gif'] },
  'image/webp': { kind: 'image', exts: ['.webp'] },
  'image/avif': { kind: 'image', exts: ['.avif'] },
  'application/pdf': { kind: 'pdf', exts: ['.pdf'] },
  'audio/webm': { kind: 'voice', exts: ['.webm'] },
};

const MAX_BYTES = 10 * 1024 * 1024;
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? '/tmp/uploads';
mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, done) => done(null, UPLOAD_DIR),
    filename: (_req, file, done) => {
      const entry = ALLOWED[file.mimetype];
      const ext = extname(file.originalname).toLowerCase();
      const safe = entry && entry.exts.includes(ext) ? ext : entry.exts[0];
      done(null, `up-${randomBytes(8).toString('hex')}${safe}`);
    },
  }),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, done) => {
    if (ALLOWED[file.mimetype]) {
      done(null, true);
      return;
    }
    done(new Error('Unsupported file type. Allowed: images, PDF, and voice notes.'));
  },
});

export const uploadsRouter = Router();

uploadsRouter.post(
  '/uploads',
  requireAuth,
  (req: Request, res: Response, next) => {
    upload.single('file')(req, res, (error: unknown) => {
      if (error) {
        const message =
          error instanceof Error && (error as { code?: string }).code === 'LIMIT_FILE_SIZE'
            ? 'File is larger than the 10 MB limit.'
            : (error as Error)?.message ?? 'Upload failed.';
        res.status(422).json({ message });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response, next) => {
    try {
      const me = req.user as AuthedUser;
      void me;
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) {
        res.status(422).json({ message: 'No file received. Re-select the attachment to retry sending.' });
        return;
      }
      const entry = ALLOWED[file.mimetype];
      res.status(201).json({
        url: `/api/uploads/${file.filename}`,
        name: file.originalname || file.filename,
        sizeMs: file.size,
        kind: entry.kind,
      });
    } catch (error) {
      next(error);
    }
  }
);
