/**
 * Demo backend mode (PLAN.md §6): when enabled, an HTTP interceptor answers
 * /api/** requests from an in-memory store so the app works end-to-end in the
 * browser without a server. Disabled by default so real backends (and the
 * Playwright E2E network mocks) are unaffected.
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
