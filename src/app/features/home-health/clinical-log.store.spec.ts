import '@angular/compiler'; // required for JIT partial declarations (HttpClient)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { ClinicalLogStore, ClinicalLogEntry } from './clinical-log.store';
import { SessionStore } from '../../core/auth/session';
import { ApiClient } from '../../core/api/api.client';
import { ROLES, Role } from '../../core/auth/roles';

function makeApi(overrides: Partial<Record<'get' | 'post', unknown>> = {}) {
  return {
    get: vi.fn(() => of([])),
    post: vi.fn(() => of(null)),
    patch: vi.fn(() => of(null)),
    delete: vi.fn(() => of(null)),
    ...overrides,
  } as unknown as ApiClient;
}

function makeSession(roles: Role[] = [ROLES.NURSE]) {
  return {
    userId: 'u-nurse',
    displayName: 'Elena Papadaki',
    roles,
    expiresAtMs: Date.now() + 60 * 60 * 1000,
  };
}

function entry(overrides: Partial<ClinicalLogEntry> = {}): ClinicalLogEntry {
  return {
    id: 'cl-1',
    visitId: 'visit-1',
    authorId: 'u-nurse',
    authorName: 'Elena Papadaki',
    specialty: 'nurse',
    observations: 'BP stable, injection site clean.',
    vitals: { systolic: 125, diastolic: 80, heartRate: 72, spo2: 98 },
    rehab: null,
    signatureDataUrl: 'data:image/png;base64,abc',
    signedAtMs: 1000,
    ...overrides,
  };
}

describe('ClinicalLogStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('loads entries, optionally filtered by visit', () => {
    const api = makeApi({ get: vi.fn(() => of([entry(), entry({ id: 'cl-2', visitId: 'visit-2' })])) });
    const store = new ClinicalLogStore(api, new SessionStore());
    store.load('visit-1');
    expect(store.entries()).toHaveLength(1);
    expect(store.entries()[0].visitId).toBe('visit-1');
  });

  it('detects a nurse specialty from the session', () => {
    const session = new SessionStore();
    session.setSession(makeSession());
    const store = new ClinicalLogStore(makeApi(), session);
    expect(store.specialty()).toBe('nurse');
  });

  it('detects a physio specialty from the session', () => {
    const session = new SessionStore();
    session.setSession(makeSession([ROLES.PHYSIO]));
    const store = new ClinicalLogStore(makeApi(), session);
    expect(store.specialty()).toBe('physio');
  });

  it('saves an entry and prepends it to the list', async () => {
    const session = new SessionStore();
    session.setSession(makeSession());
    const api = makeApi({ post: vi.fn(() => of(entry())) });
    const store = new ClinicalLogStore(api, session);
    const ok = await new Promise<boolean>((resolve) =>
      store
        .save(
          {
            visitId: 'visit-1',
            observations: 'BP stable.',
            vitals: { systolic: 125, diastolic: 80, heartRate: 72, spo2: 98 },
          },
          'data:image/png;base64,abc'
        )
        .subscribe(resolve)
    );
    expect(ok).toBe(true);
    expect(store.saved()).toBe(true);
    expect(store.entries()[0].authorName).toBe('Elena Papadaki');
    const posted = (api.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(posted.signatureDataUrl).toBe('data:image/png;base64,abc');
    expect(posted.signedAtMs).not.toBeNull();
  });

  it('saves an unsigned draft with no signature', async () => {
    const session = new SessionStore();
    session.setSession(makeSession());
    const api = makeApi({ post: vi.fn(() => of(entry({ signatureDataUrl: null, signedAtMs: null }))) });
    const store = new ClinicalLogStore(api, session);
    const ok = await new Promise<boolean>((resolve) =>
      store
        .save({ visitId: 'visit-1', observations: 'No findings.' }, null)
        .subscribe(resolve)
    );
    expect(ok).toBe(true);
    const posted = (api.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(posted.signatureDataUrl).toBeNull();
    expect(posted.signedAtMs).toBeNull();
  });

  it('reports save failure', async () => {
    const session = new SessionStore();
    session.setSession(makeSession());
    const api = makeApi({ post: vi.fn(() => throwError(() => new Error('nope'))) });
    const store = new ClinicalLogStore(api, session);
    const ok = await new Promise<boolean>((resolve) =>
      store.save({ visitId: 'visit-1', observations: 'x' }, null).subscribe(resolve)
    );
    expect(ok).toBe(false);
    expect(store.error()).toContain('Could not save');
  });
});