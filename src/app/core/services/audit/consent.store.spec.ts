import '@angular/compiler'; // required for JIT partial declarations (HttpClient)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import {
  ConsentStore,
  Consent,
  ConsentState,
  CONSENT_PURPOSES,
  consentRequiredFor,
  isConsentGranted,
  canPerformAction,
} from './consent.store';
import { ApiClient } from '../../api/api.client';
import { SessionStore } from '../../auth/session';

function makeApi(overrides: Partial<Record<'get' | 'post' | 'put', unknown>> = {}) {
  return {
    get: vi.fn(() => of({ userId: 'u-client', consents: [], currentDocumentVersion: 'v1.0' })),
    post: vi.fn(() => of(null)),
    put: vi.fn(() => of(null)),
    patch: vi.fn(() => of(null)),
    delete: vi.fn(() => of(null)),
    ...overrides,
  } as unknown as ApiClient;
}

function makeSession(userId = 'u-client', roles: string[] = ['client']) {
  const session = {
    session: () => ({ userId, displayName: 'Maria', roles, expiresAtMs: 0 }),
  };
  return session as unknown as SessionStore;
}

function consent(overrides: Partial<Consent> = {}): Consent {
  return {
    purpose: 'family_sharing',
    granted: true,
    documentVersion: 'v1.0',
    updatedAtMs: 1000,
    updatedBy: 'u-client',
    ...overrides,
  };
}

function fullState(consents: Consent[]): ConsentState {
  return {
    userId: 'u-client',
    consents,
    currentDocumentVersion: 'v1.0',
  };
}

describe('consentRequiredFor / isConsentGranted / canPerformAction', () => {
  it('maps view-family access to the family_sharing purpose', () => {
    expect(consentRequiredFor('vitals.view_family')).toBe('family_sharing');
    expect(consentRequiredFor('medications.view_family')).toBe('family_sharing');
  });

  it('maps exports to the data_export purpose', () => {
    expect(consentRequiredFor('export.pdf')).toBe('data_export');
    expect(consentRequiredFor('export.fhir')).toBe('data_export');
  });

  it('maps bluetooth and sms to their purposes', () => {
    expect(consentRequiredFor('bluetooth.pair')).toBe('bluetooth');
    expect(consentRequiredFor('reminder.sms')).toBe('sms_reminders');
  });

  it('returns null for unconstrained actions', () => {
    expect(consentRequiredFor('vitals.view_own')).toBeNull();
    expect(consentRequiredFor('marketplace.search')).toBeNull();
  });

  it('isConsentGranted reflects the current state (granted / withdrawn)', () => {
    const consents = [consent({ purpose: 'family_sharing', granted: true })];
    expect(isConsentGranted(consents, 'family_sharing')).toBe(true);
    expect(isConsentGranted(consents, 'data_export')).toBe(false);
    const withdrawn = [consent({ purpose: 'family_sharing', granted: false })];
    expect(isConsentGranted(withdrawn, 'family_sharing')).toBe(false);
  });

  it('canPerformAction enforces the matrix (view vs share vs export)', () => {
    // No family_sharing consent → blocked from viewing family data.
    expect(canPerformAction([], 'vitals.view_family')).toBe(false);
    // With family_sharing → allowed.
    expect(canPerformAction([consent({ purpose: 'family_sharing', granted: true })], 'vitals.view_family')).toBe(true);
    // data_export required for export, even if family_sharing is granted.
    expect(canPerformAction([consent({ purpose: 'family_sharing', granted: true })], 'export.pdf')).toBe(false);
    expect(
      canPerformAction(
        [
          consent({ purpose: 'family_sharing', granted: true }),
          consent({ purpose: 'data_export', granted: true }),
        ],
        'export.pdf'
      )
    ).toBe(true);
    // Withdraw family_sharing → blocked again.
    expect(
      canPerformAction([consent({ purpose: 'family_sharing', granted: false })], 'vitals.view_family')
    ).toBe(false);
  });
});

describe('ConsentStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('loads consents from the API and persists them', () => {
    const api = makeApi({
      get: vi.fn(() =>
        of(fullState([consent({ purpose: 'family_sharing', granted: true }), consent({ purpose: 'data_export', granted: false })]))
      ),
    });
    const store = new ConsentStore(api, makeSession());
    store.load().subscribe();
    expect(store.consents()).toHaveLength(2);
    expect(store.isGranted('family_sharing')).toBe(true);
    expect(store.isGranted('data_export')).toBe(false);
    expect(store.loaded()).toBe(true);
    expect(localStorage.getItem('cm.consents.v1')).toBeTruthy();
  });

  it('exposes all purposes via byPurpose with default not-granted', () => {
    const api = makeApi({
      get: vi.fn(() => of(fullState([]))),
    });
    const store = new ConsentStore(api, makeSession());
    store.load().subscribe();
    const byPurpose = store.byPurpose();
    for (const purpose of CONSENT_PURPOSES) {
      expect(byPurpose[purpose].purpose).toBe(purpose);
      expect(byPurpose[purpose].granted).toBe(false);
    }
  });

  it('updates a consent and PUTs the full state', async () => {
    const api = makeApi({
      get: vi.fn(() => of(fullState([]))),
      put: vi.fn(() => of(fullState([consent({ purpose: 'bluetooth', granted: true })]))),
    });
    const store = new ConsentStore(api, makeSession());
    store.load().subscribe();
    const ok = await new Promise<boolean>((resolve) =>
      store.update('bluetooth', true).subscribe(resolve)
    );
    expect(ok).toBe(true);
    expect(api.put).toHaveBeenCalledWith('/me/consents', {
      userId: 'u-client',
      consents: expect.arrayContaining([
        expect.objectContaining({ purpose: 'bluetooth', granted: true }),
      ]),
      currentDocumentVersion: 'v1.0',
    });
    expect(store.isGranted('bluetooth')).toBe(true);
  });

  it('creates a new consent when none existed for the purpose', async () => {
    const api = makeApi({
      get: vi.fn(() => of(fullState([]))),
      put: vi.fn(() => of(fullState([consent({ purpose: 'sms_reminders', granted: true })]))),
    });
    const store = new ConsentStore(api, makeSession());
    store.load().subscribe();
    await store.update('sms_reminders', true).subscribe();
    expect(api.put).toHaveBeenCalled();
  });

  it('withdraws an existing consent', async () => {
    const api = makeApi({
      get: vi.fn(() =>
        of(fullState([consent({ purpose: 'family_sharing', granted: true, documentVersion: 'v1.0' })]))
      ),
      put: vi.fn(() => of(fullState([consent({ purpose: 'family_sharing', granted: false })]))),
    });
    const store = new ConsentStore(api, makeSession());
    store.load().subscribe();
    await store.update('family_sharing', false).subscribe();
    const updated = store.consents().find((c) => c.purpose === 'family_sharing');
    expect(updated?.granted).toBe(false);
  });

  it('canPerform checks the enforcement matrix against loaded consents', () => {
    const api = makeApi({
      get: vi.fn(() => of(fullState([consent({ purpose: 'family_sharing', granted: true })]))),
    });
    const store = new ConsentStore(api, makeSession());
    store.load().subscribe();
    expect(store.canPerform('vitals.view_family')).toBe(true);
    expect(store.canPerform('export.pdf')).toBe(false);
  });

  it('detects stale purposes when the document version bumps (subtask 10)', () => {
    const api = makeApi({
      get: vi.fn(() =>
        of({
          userId: 'u-client',
          consents: [consent({ purpose: 'family_sharing', granted: true, documentVersion: 'v1.0' })],
          currentDocumentVersion: 'v2.0',
        })
      ),
    });
    const store = new ConsentStore(api, makeSession());
    store.load().subscribe();
    expect(store.needsReConsent()).toBe(true);
    expect(store.stalePurposes()).toEqual(['family_sharing']);
  });

  it('reports no re-consent needed when all consents match the document version', () => {
    const api = makeApi({
      get: vi.fn(() => of(fullState([consent({ purpose: 'data_export', granted: true, documentVersion: 'v1.0' })]))),
    });
    const store = new ConsentStore(api, makeSession());
    store.load().subscribe();
    expect(store.needsReConsent()).toBe(false);
  });

  it('reports failure with an error message', async () => {
    const api = makeApi({
      get: vi.fn(() => throwError(() => ({ error: { message: 'network down' } }))),
    });
    const store = new ConsentStore(api, makeSession());
    const ok = await new Promise<boolean>((resolve) => store.load().subscribe(resolve));
    expect(ok).toBe(false);
    expect(store.error()).toContain('network down');
    expect(store.loaded()).toBe(false);
  });

  it('reports update failure without clearing the local state', async () => {
    const api = makeApi({
      get: vi.fn(() => of(fullState([]))),
      put: vi.fn(() => throwError(() => ({ error: { message: 'conflict' } }))),
    });
    const store = new ConsentStore(api, makeSession());
    store.load().subscribe();
    const ok = await new Promise<boolean>((resolve) =>
      store.update('data_export', true).subscribe(resolve)
    );
    expect(ok).toBe(false);
    expect(store.error()).toContain('conflict');
  });
});
