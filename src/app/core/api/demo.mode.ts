/**
 * Demo backend mode (PLAN.md §6): when enabled, an HTTP interceptor answers
 * /api/** requests from an in-memory store so the app works end-to-end in the
 * browser without a server.
 *
 * The real Express/Postgres API is the default path — this is an explicitly
 * opt-in escape hatch for exploring the UI and for the Playwright suite (which
 * passes `?demo=1`), never a silent fallback. The shell shows a banner while
 * it is active so a demo session is never mistaken for real data.
 */
const DEMO_KEY = 'cm.demo.v1';

export function isDemoMode(): boolean {
  try {
    return localStorage.getItem(DEMO_KEY) === '1';
  } catch {
    return false;
  }
}

/** Persists the flag when the URL carries ?demo=1, so it survives navigation. */
export function enableDemoFromUrl(): void {
  try {
    if (new URLSearchParams(location.search).has('demo')) {
      localStorage.setItem(DEMO_KEY, '1');
    }
  } catch {
    // Ignore storage failures.
  }
}
