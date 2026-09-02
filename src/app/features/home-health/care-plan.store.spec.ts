import '@angular/compiler'; // required for JIT partial declarations (HttpClient)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { CarePlanStore, CarePlan, careGoalStatusLabel } from './care-plan.store';
import { SessionStore } from '../../core/auth/session';
import { ApiClient } from '../../core/api/api.client';
import { ROLES, Role } from '../../core/auth/roles';

function makeApi(overrides: Partial<Record<'get' | 'post' | 'patch', unknown>> = {}) {
  return {
    get: vi.fn(() => of([])),
    post: vi.fn(() => of(null)),
    patch: vi.fn(() => of(null)),
    delete: vi.fn(() => of(null)),
    ...overrides,
  } as unknown as ApiClient;
}

function makeSession(roles: Role[] = [ROLES.CLIENT]) {
  return {
    userId: 'u-client',
    displayName: 'Maria Papadopoulou',
    roles,
    expiresAtMs: Date.now() + 60 * 60 * 1000,
  };
}

function plan(overrides: Partial<CarePlan> = {}): CarePlan {
  return {
    id: 'cp-1',
    clientId: 'u-client',
    clientName: 'Maria Papadopoulou',
    goals: [{ id: 'g-1', text: 'Mobilise shoulder', status: 'open' }],
    notes: [
      {
        id: 'n-1',
        authorId: 'u-nurse',
        authorName: 'Elena Papadaki',
        authorRole: 'nurse',
        text: 'BP stable.',
        atMs: 1000,
      },
    ],
    updatedAtMs: 1000,
    updatedBy: 'Elena Papadaki',
    ...overrides,
  };
}

describe('CarePlanStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('loads the plan for the current client', () => {
    const session = new SessionStore();
    session.setSession(makeSession());
    const api = makeApi({ get: vi.fn(() => of([plan(), plan({ id: 'cp-2', clientId: 'u-other' })])) });
    const store = new CarePlanStore(api, session);
    store.load();
    expect(store.plan()?.id).toBe('cp-1');
  });

  it('adds a goal', async () => {
    const session = new SessionStore();
    session.setSession(makeSession());
    const api = makeApi({
      get: vi.fn(() => of([plan()])),
      post: vi.fn(() => of(plan({ goals: [plan().goals[0], { id: 'g-2', text: 'Walk daily', status: 'open' }] }))),
    });
    const store = new CarePlanStore(api, session);
    store.load();
    const ok = await new Promise<boolean>((resolve) => store.addGoal('Walk daily').subscribe(resolve));
    expect(ok).toBe(true);
    expect(store.plan()?.goals).toHaveLength(2);
    expect(api.post).toHaveBeenCalledWith('/care-plans/cp-1/goals', { text: 'Walk daily' });
  });

  it('updates a goal status', async () => {
    const session = new SessionStore();
    session.setSession(makeSession());
    const api = makeApi({
      get: vi.fn(() => of([plan()])),
      patch: vi.fn(() =>
        of(plan({ goals: [{ id: 'g-1', text: 'Mobilise shoulder', status: 'done' }] }))
      ),
    });
    const store = new CarePlanStore(api, session);
    store.load();
    const ok = await new Promise<boolean>((resolve) => store.setGoalStatus('g-1', 'done').subscribe(resolve));
    expect(ok).toBe(true);
    expect(store.plan()?.goals[0].status).toBe('done');
    expect(api.patch).toHaveBeenCalledWith('/care-plans/cp-1/goals/g-1', { status: 'done' });
  });

  it('adds a note with author info from the session (cross-provider update)', async () => {
    const session = new SessionStore();
    session.setSession(makeSession([ROLES.PHYSIO]));
    const api = makeApi({
      get: vi.fn(() => of([plan()])),
      post: vi.fn(() =>
        of(
          plan({
            notes: [
              {
                id: 'n-2',
                authorId: 'u-client',
                authorName: 'Maria Papadopoulou',
                authorRole: 'physio',
                text: 'Range of motion improving.',
                atMs: 2000,
              },
              plan().notes[0],
            ],
          })
        )
      ),
    });
    const store = new CarePlanStore(api, session);
    store.load();
    const ok = await new Promise<boolean>((resolve) => store.addNote('Range of motion improving.').subscribe(resolve));
    expect(ok).toBe(true);
    expect(api.post).toHaveBeenCalledWith('/care-plans/cp-1/notes', {
      text: 'Range of motion improving.',
      authorId: 'u-client',
      authorName: 'Maria Papadopoulou',
      authorRole: 'physio',
    });
    expect(store.plan()?.notes[0].authorRole).toBe('physio');
  });

  it('reports failure when a mutation errors', async () => {
    const session = new SessionStore();
    session.setSession(makeSession());
    const api = makeApi({
      get: vi.fn(() => of([plan()])),
      post: vi.fn(() => throwError(() => new Error('nope'))),
    });
    const store = new CarePlanStore(api, session);
    store.load();
    const ok = await new Promise<boolean>((resolve) => store.addNote('x').subscribe(resolve));
    expect(ok).toBe(false);
    expect(store.error()).toContain('Could not update');
  });

  it('refuses mutations without a loaded plan', async () => {
    const session = new SessionStore();
    session.setSession(makeSession());
    const store = new CarePlanStore(makeApi(), session);
    const ok = await new Promise<boolean>((resolve) => store.addGoal('x').subscribe(resolve));
    expect(ok).toBe(false);
  });

  it('labels goal statuses', () => {
    expect(careGoalStatusLabel('in-progress')).toBe('in progress');
    expect(careGoalStatusLabel('done')).toBe('done');
  });
});