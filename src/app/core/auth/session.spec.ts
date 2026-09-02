import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionStore } from './session';
import { ROLES } from './roles';

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'u-1',
    displayName: 'Maria Papadopoulou',
    roles: [ROLES.CLIENT],
    expiresAtMs: Date.now() + 60 * 60 * 1000,
    ...overrides,
  };
}

describe('SessionStore', () => {
  beforeEach(() => {
    localStorage.clear();
    // A fresh store per test: Angular DI caches providedIn: 'root' services,
    // so reset the internal state via a clean localStorage + new signal load.
    const store = new SessionStore();
    store.clear();
  });

  it('starts empty when no session is stored', () => {
    const store = new SessionStore();
    expect(store.isLoggedIn()).toBe(false);
    expect(store.session()).toBeNull();
    expect(store.roles()).toEqual([]);
  });

  it('stores and exposes a session', () => {
    const store = new SessionStore();
    store.setSession(makeSession());
    expect(store.isLoggedIn()).toBe(true);
    expect(store.displayName()).toBe('Maria Papadopoulou');
    expect(store.roles()).toEqual([ROLES.CLIENT]);
  });

  it('persists the session to localStorage', () => {
    const store = new SessionStore();
    store.setSession(makeSession({ userId: 'u-42' }));
    const raw = localStorage.getItem('cm.session.v1');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).userId).toBe('u-42');
  });

  it('reloads a persisted session on construction', () => {
    localStorage.setItem(
      'cm.session.v1',
      JSON.stringify(makeSession({ roles: [ROLES.NURSE] }))
    );
    const store = new SessionStore();
    expect(store.isLoggedIn()).toBe(true);
    expect(store.roles()).toEqual([ROLES.NURSE]);
  });

  it('drops an expired session on load', () => {
    localStorage.setItem(
      'cm.session.v1',
      JSON.stringify(makeSession({ expiresAtMs: Date.now() - 1000 }))
    );
    const store = new SessionStore();
    expect(store.isLoggedIn()).toBe(false);
    expect(localStorage.getItem('cm.session.v1')).toBeNull();
  });

  it('ignores corrupted stored sessions', () => {
    localStorage.setItem('cm.session.v1', '{not-json');
    const store = new SessionStore();
    expect(store.isLoggedIn()).toBe(false);
  });

  it('ignores stored sessions with an invalid role payload', () => {
    localStorage.setItem(
      'cm.session.v1',
      JSON.stringify({ userId: 'u-1', roles: 'admin', expiresAtMs: Date.now() + 1000 })
    );
    const store = new SessionStore();
    expect(store.roles()).toEqual([]);
  });

  it('clear() removes the session and the storage entry', () => {
    const store = new SessionStore();
    store.setSession(makeSession());
    store.clear();
    expect(store.isLoggedIn()).toBe(false);
    expect(localStorage.getItem('cm.session.v1')).toBeNull();
  });

  it('hasAnyRole returns true for a matching role', () => {
    const store = new SessionStore();
    store.setSession(makeSession({ roles: [ROLES.NURSE, ROLES.CAREGIVER] }));
    expect(store.hasAnyRole([ROLES.NURSE])).toBe(true);
    expect(store.hasAnyRole([ROLES.ADMIN, ROLES.NURSE])).toBe(true);
  });

  it('hasAnyRole returns false when no role matches', () => {
    const store = new SessionStore();
    store.setSession(makeSession({ roles: [ROLES.CLIENT] }));
    expect(store.hasAnyRole([ROLES.ADMIN])).toBe(false);
  });

  it('survives localStorage failures on setSession', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const store = new SessionStore();
    expect(() => store.setSession(makeSession())).not.toThrow();
    expect(store.isLoggedIn()).toBe(true);
    spy.mockRestore();
  });
});
