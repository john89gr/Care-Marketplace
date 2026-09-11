import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { HistoryStore } from './history.store';
import type { MedicalCondition, PrescriptionRecord } from './history.models';
import { planFromPrescription } from './prescription.schedule';

/**
 * HistoryStore unit tests (FEATURE_PLAN.md §21 subtasks 5–7, 17): CRUD
 * round-trips against a stubbed ApiClient, optimistic add + rollback on
 * failure, read-only rejection for family roles, and the prescription →
 * medication bridge.
 */

interface ApiStub {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
}

function stubApi(): ApiStub {
  return {
    get: vi.fn(() => of([])),
    post: vi.fn(() => of(null)),
    patch: vi.fn(() => of(null)),
  };
}

const conditionDraft = {
  name: 'Υπέρταση',
  icd11Code: 'BA00',
  status: 'chronic' as const,
  diagnosedAtMs: 1_600_000_000_000,
  notes: '',
};

describe('HistoryStore.load', () => {
  it('loads a kind once and caches it', () => {
    const api = stubApi();
    api.get.mockReturnValue(of([{ ...conditionDraft, id: 'c1', createdAtMs: 1 }]));
    const store = new HistoryStore(api as never);
    let ok = false;
    store.load('conditions').subscribe((v) => (ok = v));
    expect(ok).toBe(true);
    expect(api.get).toHaveBeenCalledWith('/me/history/conditions');
    expect(store.isLoaded('conditions')).toBe(true);
    expect(store.records('conditions')).toHaveLength(1);

    // Second load hits the cache — no extra request.
    store.load('conditions').subscribe();
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('surfaces load failures through error', () => {
    const api = stubApi();
    api.get.mockReturnValue(throwError(() => ({ error: { message: 'boom' } })));
    const store = new HistoryStore(api as never);
    let ok = true;
    store.load('allergies').subscribe((v) => (ok = v));
    expect(ok).toBe(false);
    expect(store.error()).toBe('boom');
    expect(store.isLoaded('allergies')).toBe(false);
  });

  it('routes prescriptions to the register endpoint', () => {
    const api = stubApi();
    api.get.mockReturnValue(of([]));
    const store = new HistoryStore(api as never);
    store.load('prescriptions').subscribe();
    expect(api.get).toHaveBeenCalledWith('/me/prescriptions');
  });
});

describe('HistoryStore.add', () => {
  it('optimistically renders the draft and replaces it with the server row', () => {
    const api = stubApi();
    const created: MedicalCondition = {
      id: 'c-server',
      ...conditionDraft,
      createdAtMs: 2,
    };
    api.post.mockReturnValue(of(created));
    const store = new HistoryStore(api as never);
    let ok = false;
    store.add('conditions', conditionDraft).subscribe((v) => (ok = v));
    expect(ok).toBe(true);
    // Optimistic row was replaced by the server row (no local-* id left).
    const rows = store.records('conditions');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('c-server');
    expect(api.post).toHaveBeenCalledWith('/me/history/conditions', conditionDraft);
  });

  it('rolls back the optimistic row when the POST fails', () => {
    const api = stubApi();
    api.post.mockReturnValue(throwError(() => ({ error: { message: 'down' } })));
    const store = new HistoryStore(api as never);
    let ok = true;
    store.add('conditions', conditionDraft).subscribe((v) => (ok = v));
    expect(ok).toBe(false);
    expect(store.records('conditions')).toHaveLength(0);
    expect(store.error()).toBe('down');
  });
});

describe('HistoryStore.update / archive', () => {
  it('patches and replaces the local row', () => {
    const api = stubApi();
    api.get.mockReturnValue(
      of<MedicalCondition[]>([{ id: 'c1', ...conditionDraft, createdAtMs: 1 }])
    );
    api.patch.mockReturnValue(
      of<MedicalCondition>({ id: 'c1', ...conditionDraft, status: 'resolved', createdAtMs: 1 })
    );
    const store = new HistoryStore(api as never);
    store.load('conditions').subscribe();
    let ok = false;
    store.update('conditions', 'c1', { status: 'resolved' }).subscribe((v) => (ok = v));
    expect(ok).toBe(true);
    expect(store.records('conditions')[0].status).toBe('resolved');
    expect(api.patch).toHaveBeenCalledWith('/me/history/conditions/c1', { status: 'resolved' });
  });

  it('archives via PATCH and hides the row from records()', () => {
    const api = stubApi();
    api.get.mockReturnValue(
      of<MedicalCondition[]>([{ id: 'c1', ...conditionDraft, createdAtMs: 1 }])
    );
    api.patch.mockReturnValue(
      of<MedicalCondition>({ id: 'c1', ...conditionDraft, archived: true, createdAtMs: 1 })
    );
    const store = new HistoryStore(api as never);
    store.load('conditions').subscribe();
    let ok = false;
    store.archive('conditions', 'c1').subscribe((v) => (ok = v));
    expect(ok).toBe(true);
    expect(store.records('conditions')).toHaveLength(0);
  });
});

describe('HistoryStore RBAC', () => {
  it('rejects every mutation when read-only', () => {
    const api = stubApi();
    const store = new HistoryStore(api as never);
    store.setReadOnly(true);
    let ok = true;
    store.add('conditions', conditionDraft).subscribe((v) => (ok = v));
    expect(ok).toBe(false);
    store.update('conditions', 'x', { notes: 'n' }).subscribe((v) => (ok = v));
    expect(ok).toBe(false);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(store.error()).toBe('This view is read-only for your role.');
  });
});

describe('HistoryStore family mode (§21 subtask 16)', () => {
  it('loads every kind through the consent-gated family endpoint', () => {
    const api = stubApi();
    api.get.mockReturnValue(of([]));
    const store = new HistoryStore(api as never);
    store.setReadOnly(true);
    store.setRecipient('u-client');
    store.load('conditions').subscribe();
    store.load('prescriptions').subscribe();
    expect(api.get).toHaveBeenCalledWith('/history/u-client/conditions');
    expect(api.get).toHaveBeenCalledWith('/history/u-client/prescriptions');
    // Never the owner routes for the recipient's record.
    expect(api.get).not.toHaveBeenCalledWith('/me/history/conditions');
    expect(store.targetUserId()).toBe('u-client');
  });

  it('drops the cache when the recipient changes so data never leaks', () => {
    const api = stubApi();
    api.get.mockReturnValue(of([]));
    const store = new HistoryStore(api as never);
    store.load('conditions').subscribe();
    expect(api.get).toHaveBeenCalledTimes(1);
    store.setRecipient('u-client');
    // Cache dropped → the next load re-fetches from the family endpoint.
    store.load('conditions').subscribe();
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.get).toHaveBeenLastCalledWith('/history/u-client/conditions');
  });

  it('returns to owner reads with a null recipient', () => {
    const api = stubApi();
    api.get.mockReturnValue(of([]));
    const store = new HistoryStore(api as never);
    store.setRecipient('u-client');
    store.load('conditions').subscribe();
    store.setRecipient(null);
    store.load('conditions').subscribe();
    expect(api.get).toHaveBeenLastCalledWith('/me/history/conditions');
  });
});

describe('HistoryStore.linkPharmacyPrescription', () => {
  it('attaches the scanned pharmacy prescription id via PATCH', () => {
    const api = stubApi();
    const rx: PrescriptionRecord = {
      id: 'p1',
      drug: 'Ατορβαστατίνη',
      status: 'active',
      issuedAtMs: 1,
      createdAtMs: 1,
    };
    api.get.mockReturnValue(of<PrescriptionRecord[]>([rx]));
    api.patch.mockReturnValue(
      of<PrescriptionRecord>({ ...rx, pharmacyPrescriptionId: 'rx-ph-7' })
    );
    const store = new HistoryStore(api as never);
    store.load('prescriptions').subscribe();
    let ok = false;
    store.linkPharmacyPrescription('p1', 'rx-ph-7').subscribe((v) => (ok = v));
    expect(ok).toBe(true);
    expect(api.patch).toHaveBeenCalledWith('/me/prescriptions/p1', {
      pharmacyPrescriptionId: 'rx-ph-7',
    });
    expect(store.records('prescriptions')[0].pharmacyPrescriptionId).toBe('rx-ph-7');
  });
});

describe('HistoryStore.addPrescriptionToMedications', () => {
  it('links the created medication back to the prescription', () => {
    const api = stubApi();
    const rx: PrescriptionRecord = {
      id: 'p1',
      drug: 'Μετφορμίνη',
      dose: '500mg',
      status: 'active',
      issuedAtMs: 1,
      createdAtMs: 1,
    };
    api.get.mockReturnValue(of<PrescriptionRecord[]>([rx]));
    api.post.mockReturnValue(
      of({ prescription: rx, medicationId: 'med-9' })
    );
    const store = new HistoryStore(api as never);
    store.load('prescriptions').subscribe();
    let ok = false;
    store.addPrescriptionToMedications('p1').subscribe((v) => (ok = v));
    expect(ok).toBe(true);
    expect(store.records('prescriptions')[0].medicationId).toBe('med-9');
    expect(api.post).toHaveBeenCalledWith('/me/prescriptions/p1/to-medication', {});
  });
});

describe('HistoryStore.setPillReminder (Track 3 bridge)', () => {
  const rx: PrescriptionRecord = {
    id: 'p1',
    drug: 'Μετφορμίνη',
    dose: '500mg',
    instructions: '1x3',
    status: 'active',
    issuedAtMs: 1,
    createdAtMs: 1,
  };

  it('forwards the parsed schedule and sheet and returns the medication id', () => {
    const api = stubApi();
    api.get.mockReturnValue(of<PrescriptionRecord[]>([rx]));
    api.post.mockReturnValue(of({ prescription: rx, medicationId: 'med-7' }));
    const store = new HistoryStore(api as never);
    store.load('prescriptions').subscribe();

    const plan = planFromPrescription(rx);
    let created: { medicationId: string } | null = null;
    store.setPillReminder('p1', { schedule: plan.schedule ?? undefined, instructions: plan.instructions })
      .subscribe((v) => (created = v));

    expect(created).toEqual({ medicationId: 'med-7' });
    expect(api.post).toHaveBeenCalledWith('/me/prescriptions/p1/to-medication', {
      schedule: { kind: 'daily', timesMinutes: [480, 840, 1200] },
      instructions: plan.instructions,
    });
    expect(store.records('prescriptions')[0].medicationId).toBe('med-7');
    expect(store.actingKey()).toBeNull();
  });

  it('returns null and surfaces the error on failure', () => {
    const api = stubApi();
    api.get.mockReturnValue(of<PrescriptionRecord[]>([rx]));
    api.post.mockReturnValue(throwError(() => ({ error: { message: 'boom' } })));
    const store = new HistoryStore(api as never);
    store.load('prescriptions').subscribe();

    let created: { medicationId: string } | null = { medicationId: 'x' };
    store.setPillReminder('p1', { schedule: { kind: 'daily', timesMinutes: [480] } }).subscribe(
      (v) => (created = v)
    );

    expect(created).toBeNull();
    expect(store.error()).toBe('boom');
  });

  it('is rejected for read-only family roles', () => {
    const api = stubApi();
    api.get.mockReturnValue(of<PrescriptionRecord[]>([rx]));
    const store = new HistoryStore(api as never);
    store.load('prescriptions').subscribe();
    store.setReadOnly(true);

    let created: { medicationId: string } | null = { medicationId: 'x' };
    store.setPillReminder('p1').subscribe((v) => (created = v));

    expect(created).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });
});