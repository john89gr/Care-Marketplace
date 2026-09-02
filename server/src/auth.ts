import { NextFunction, Request, RequestHandler, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';
import { query, queryOne, Row } from './db';

/**
 * Cookie-based session auth (PLAN.md §1 Security & Auth): a short-lived JWT
 * access token plus a long-lived refresh token stored in httpOnly cookies.
 * Refresh tokens are hashed server-side so logout can revoke them even if a
 * cookie is stolen after logout.
 */

const ACCESS_TTL_S = 15 * 60; // 15 minutes
const REFRESH_TTL_S = 14 * 24 * 60 * 60; // 14 days

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-change-me';
const COOKIE_ACCESS = 'cm_access';
const COOKIE_REFRESH = 'cm_refresh';
const isProd = process.env.NODE_ENV === 'production';

export interface AuthedUser {
  userId: string;
  displayName: string;
  roles: string[];
  expiresAtMs: number;
}

export interface SessionPayload extends AuthedUser {}

export interface WsUser extends AuthedUser {}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

async function tokenFor(user: AuthedUser): Promise<string> {
  return jwt.sign(
    { userId: user.userId, displayName: user.displayName, roles: user.roles },
    JWT_SECRET,
    { expiresIn: ACCESS_TTL_S }
  );
}

function verifyToken(token: string): AuthedUser | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      userId: string;
      displayName: string;
      roles: string[];
      exp: number;
    };
    return {
      userId: payload.userId,
      displayName: payload.displayName,
      roles: payload.roles,
      expiresAtMs: payload.exp * 1000,
    };
  } catch {
    return null;
  }
}

export interface UserRow extends Row {
  id: string;
  display_name: string;
  email: string;
  password_hash: string;
  roles: string[];
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  return queryOne<UserRow>('SELECT * FROM user_accounts WHERE email = $1', [email]);
}

export async function findUserById(id: string): Promise<UserRow | null> {
  return queryOne<UserRow>('SELECT * FROM user_accounts WHERE id = $1', [id]);
}

export async function createUser(input: {
  displayName: string;
  email: string;
  password: string;
  roles: string[];
}): Promise<UserRow> {
  const id = `u-${randomBytes(6).toString('hex')}`;
  const passwordHash = await hashPassword(input.password);
  await query(
    `INSERT INTO user_accounts (id, display_name, email, password_hash, roles, created_at_ms)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, input.displayName, input.email, passwordHash, input.roles, Date.now()]
  );
  const created = await findUserById(id);
  if (!created) {
    throw new Error('User creation failed.');
  }
  return created;
}

function toUser(row: UserRow): AuthedUser {
  return {
    userId: row.id,
    displayName: row.display_name,
    roles: row.roles ?? [],
    expiresAtMs: Date.now() + ACCESS_TTL_S * 1000,
  };
}

/** Creates a refresh session and returns the raw refresh token (cookie value). */
async function createRefreshSession(userId: string): Promise<string> {
  const raw = randomBytes(48).toString('hex');
  const id = `s-${randomBytes(6).toString('hex')}`;
  const now = Date.now();
  await query(
    `INSERT INTO sessions (id, user_id, refresh_hash, created_at_ms, expires_at_ms)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, userId, sha256(raw), now, now + REFRESH_TTL_S * 1000]
  );
  return raw;
}

async function revokeRefreshSession(raw: string): Promise<void> {
  await query(`UPDATE sessions SET revoked_at_ms = $1 WHERE refresh_hash = $2 AND revoked_at_ms IS NULL`, [
    Date.now(),
    sha256(raw),
  ]);
}

/** Validates a refresh token; on success rotates it and returns the new pair. */
async function rotateRefreshSession(
  raw: string
): Promise<{ refreshToken: string; user: AuthedUser } | null> {
  const session = await queryOne<{
    user_id: string;
    refresh_hash: string;
    expires_at_ms: number;
    revoked_at_ms: number | null;
  }>('SELECT * FROM sessions WHERE refresh_hash = $1', [sha256(raw)]);
  if (!session || session.revoked_at_ms || session.expires_at_ms < Date.now()) {
    return null;
  }
  const userRow = await findUserById(session.user_id);
  if (!userRow) {
    return null;
  }
  // Rotate: revoke the old session, mint a new one.
  await revokeRefreshSession(raw);
  const refreshToken = await createRefreshSession(userRow.id);
  return { refreshToken, user: toUser(userRow) };
}

async function currentUser(userId: string): Promise<AuthedUser | null> {
  const row = await findUserById(userId);
  return row ? toUser(row) : null;
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  const base = { httpOnly: true, sameSite: 'lax' as const, secure: isProd, path: '/' as const };
  res.cookie(COOKIE_ACCESS, accessToken, { ...base, maxAge: ACCESS_TTL_S * 1000 });
  res.cookie(COOKIE_REFRESH, refreshToken, { ...base, maxAge: REFRESH_TTL_S * 1000 });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(COOKIE_ACCESS, { httpOnly: true, sameSite: 'lax', path: '/' });
  res.clearCookie(COOKIE_REFRESH, { httpOnly: true, sameSite: 'lax', path: '/' });
}

export function sessionPayloadFor(user: AuthedUser): SessionPayload {
  return user;
}

/**
 * Express middleware: requires a valid access-token cookie. Attaches req.user.
 */
export const requireAuth: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.[COOKIE_ACCESS] as string | undefined;
  const user = token ? verifyToken(token) : null;
  if (!user) {
    res.status(401).json({ message: 'Authentication required.' });
    return;
  }
  req.user = user;
  next();
};

/**
 * Express middleware: requires `roles` to include at least one of the given
 * roles. Must run after requireAuth.
 */
export function requireRole(...roles: string[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ message: 'Authentication required.' });
      return;
    }
    if (!roles.some((role) => user.roles.includes(role))) {
      res.status(403).json({ message: 'You do not have permission to do that.' });
      return;
    }
    next();
  };
}

export const auth = {
  toUser,
  currentUser,
  createRefreshSession,
  rotateRefreshSession,
  revokeRefreshSession,
  tokenFor,
  sessionPayloadFor,
};