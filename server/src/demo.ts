import { Router, Request, Response } from 'express';
import { query, Row } from './db';

/**
 * Demo sign-in roster (`GET /api/demo/accounts`).
 *
 * The login page renders these as one-click sign-ins so every role — and so
 * every capability of the product — is one tap away. The same panel is served
 * by the in-memory demo backend (`src/app/core/api/demo.api.ts`), which keeps
 * the two runtimes interchangeable: the client normally hits the real server,
 * and falls back to the mock when demo mode is on.
 *
 * This is a *convenience* endpoint, not a feature: it hands out the shared
 * seeded password, so it is deliberately unavailable in production unless
 * `ALLOW_DEMO_ACCOUNTS=1` is set explicitly. When disabled it answers **404**,
 * which is exactly the signal the login page already treats as "no demo
 * sign-in here" — so a production build simply renders without the panel.
 *
 * Accounts come from `user_accounts` (the seeded Greek dataset) rather than a
 * hard-coded list, so the picker can never advertise an account that cannot
 * actually log in — every entry is a real row that `POST /api/auth/login`
 * accepts.
 */

/** Password every seeded account shares (see `seed.ts`). */
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'demo1234';

/**
 * Fixture accounts that exist for test invariants rather than as personas —
 * `u-expired` is a lapsed-licence provider the certification specs assert on.
 * Listing them would offer a sign-in nobody wants.
 */
const HIDDEN_ACCOUNT_PREFIXES = ['u-expired'];

/** Roster order: the accounts a visitor most likely wants come first. */
const ROLE_ORDER = ['client', 'nurse', 'caregiver', 'physio', 'pharmacy', 'admin'];

/**
 * Demo sign-in is on outside production, or when explicitly enabled. Read per
 * request so a test can flip it without rebuilding the app.
 */
export function demoAccountsEnabled(): boolean {
  const flag = (process.env.ALLOW_DEMO_ACCOUNTS ?? '').trim().toLowerCase();
  if (flag === '1' || flag === 'true') {
    return true;
  }
  if (flag === '0' || flag === 'false') {
    return false;
  }
  return process.env.NODE_ENV !== 'production';
}

export function demoRouter(): Router {
  const router = Router();

  router.get('/demo/accounts', async (_req: Request, res: Response, next) => {
    try {
      if (!demoAccountsEnabled()) {
        // 404 (not 403): "this build has no demo picker", which is the case the
        // client already handles without surfacing an error.
        res.status(404).json({ message: 'Not found.' });
        return;
      }

      const rows = await query<Row>(
        `SELECT id, display_name, email, roles
           FROM user_accounts
          ORDER BY display_name ASC`
      );

      const accounts = rows
        .filter((row) => {
          const id = String(row.id);
          return !HIDDEN_ACCOUNT_PREFIXES.some((prefix) => id.startsWith(prefix));
        })
        .map((row) => ({
          userId: String(row.id),
          displayName: String(row.display_name ?? ''),
          email: String(row.email ?? ''),
          roles: Array.isArray(row.roles) ? (row.roles as string[]) : [],
          password: DEMO_PASSWORD,
        }));

      // Sort by the most privileged-to-most-common role the account holds, then
      // by name, so the order is stable across runs and databases.
      accounts.sort((a, b) => {
        const rank = (roles: string[]): number => {
          const index = ROLE_ORDER.findIndex((role) => roles.includes(role));
          return index === -1 ? ROLE_ORDER.length : index;
        };
        return rank(a.roles) - rank(b.roles) || a.displayName.localeCompare(b.displayName);
      });

      res.json(accounts);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
