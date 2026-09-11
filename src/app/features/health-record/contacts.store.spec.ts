import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { ContactsStore } from './contacts.store';
import type { MedicalContact } from './contacts.models';

/**
 * ContactsStore unit tests: load, optimistic add + rollback, update,
 * soft-archive, optimistic setPrimary with rollback, and read-only rejection.
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

const ice: MedicalContact = {
  id: 'ice-1',
  kind: 'emergency',
  name: 'Γιώργος',
  relationship: 'Σύζυγος',
  phone: '6970000001',
  isPrimary: true,
  priority: 0,
  createdAtMs: 1,
};

const second: MedicalContact = {
  ...ice,
  id: 'ice-2',
  name: 'Ελένη',
  isPrimary: false,
};

describe('ContactsStore.load', () => {
  it('loads and caches the directory', () => {
    const api = stubApi();
    api.get.mockReturnValue(of([ice, second]));
    const store = new ContactsStore(api as never);
    let ok = false;
    store.load().subscribe((v) => (ok = v));
    expect(ok).toBe(true);
    expect(api.get).toHaveBeenCalledWith('/me/contacts');
    expect(store.list('emergency')).toHaveLength(2);
    expect(store.primaryEmergency()?.id).toBe('ice-1');
  });

  it('surfaces load failures', () => {
    const api = stubApi();
    api.get.mockReturnValue(throwError(() => ({ error: { message: 'boom' } })));
    const store = new ContactsStore(api as never);
    let ok = true;
    store.load().subscribe((v) => (ok = v));
    expect(ok).toBe(false);
    expect(store.error()).toBe('boom');
  });
});

describe('ContactsStore.add', () => {
  it('renders the draft optimistically and swaps in the server row', () => {
    const api = stubApi();
    api.get.mockReturnValue(of([]));
    api.post.mockReturnValue(of({ ...second, id: 'server-1' }));
    const store = new ContactsStore(api as never);
    store.load().subscribe();

    let ok = false;
    store
      .add({ kind: 'emergency', name: 'Ελένη', relationship: 'Κόρη', phone: '6970000002', isPrimary: false, priority: 0 })
      .subscribe((v) => (ok = v));

    expect(ok).toBe(true);
    expect(store.list('emergency').map((c) => c.id)).toEqual(['server-1']);
  });

  it('demotes an existing primary when adding a new one', () => {
    const api = stubApi();
    api.get.mockReturnValue(of([ice]));
    api.post.mockReturnValue(of({ ...second, id: 'server-2', isPrimary: true }));
    const store = new ContactsStore(api as never);
    store.load().subscribe();
    store
      .add({ kind: 'emergency', name: 'Ελένη', relationship: 'Κόρη', phone: '6970000002', isPrimary: true, priority: 0 })
      .subscribe();

    expect(store.list('emergency').filter((c) => c.isPrimary).map((c) => c.id)).toEqual(['server-2']);
  });

  it('rolls the optimistic row back on failure', () => {
    const api = stubApi();
    api.get.mockReturnValue(of([ice]));
    api.post.mockReturnValue(throwError(() => ({ error: { message: 'nope' } })));
    const store = new ContactsStore(api as never);
    store.load().subscribe();

    let ok = true;
    store
      .add({ kind: 'care', name: 'Φαρμακείο', relationship: 'pharmacy', phone: '2100000000', isPrimary: false, priority: 0 })
      .subscribe((v) => (ok = v));

    expect(ok).toBe(false);
    expect(store.list('care')).toHaveLength(0);
    expect(store.error()).toBe('nope');
  });
});

describe('ContactsStore.update / archive', () => {
  it('replaces the row with the server response', () => {
    const api = stubApi();
    api.get.mockReturnValue(of([ice]));
    api.patch.mockReturnValue(of({ ...ice, phone: '6980000000' }));
    const store = new ContactsStore(api as never);
    store.load().subscribe();
    store.update('ice-1', { phone: '6980000000' }).subscribe();
    expect(store.list('emergency')[0]?.phone).toBe('6980000000');
    expect(api.patch).toHaveBeenCalledWith('/me/contacts/ice-1', { phone: '6980000000' });
  });

  it('soft-archives through PATCH', () => {
    const api = stubApi();
    api.get.mockReturnValue(of([ice]));
    api.patch.mockReturnValue(of({ ...ice, archived: true }));
    const store = new ContactsStore(api as never);
    store.load().subscribe();
    store.archive('ice-1').subscribe();
    expect(store.list('emergency')).toHaveLength(0);
    expect(api.patch).toHaveBeenCalledWith('/me/contacts/ice-1', { archived: true });
  });
});

describe('ContactsStore.setPrimary', () => {
  it('optimistically demotes siblings and keeps the server row', () => {
    const api = stubApi();
    api.get.mockReturnValue(of([ice, second]));
    api.patch.mockReturnValue(of({ ...second, isPrimary: true }));
    const store = new ContactsStore(api as never);
    store.load().subscribe();

    let ok = false;
    store.setPrimary('ice-2').subscribe((v) => (ok = v));

    expect(ok).toBe(true);
    expect(store.primaryEmergency()?.id).toBe('ice-2');
    expect(store.list('emergency').filter((c) => c.isPrimary)).toHaveLength(1);
  });

  it('rolls back the demotion when the write fails', () => {
    const api = stubApi();
    api.get.mockReturnValue(of([ice, second]));
    api.patch.mockReturnValue(throwError(() => ({ error: { message: 'offline' } })));
    const store = new ContactsStore(api as never);
    store.load().subscribe();

    let ok = true;
    store.setPrimary('ice-2').subscribe((v) => (ok = v));

    expect(ok).toBe(false);
    expect(store.primaryEmergency()?.id).toBe('ice-1');
    expect(store.error()).toBe('offline');
  });
});

describe('ContactsStore read-only', () => {
  it('rejects writes for family roles', () => {
    const api = stubApi();
    api.get.mockReturnValue(of([ice]));
    const store = new ContactsStore(api as never);
    store.load().subscribe();
    store.setReadOnly(true);

    let ok = true;
    store.archive('ice-1').subscribe((v) => (ok = v));
    store.setPrimary('ice-2').subscribe();

    expect(ok).toBe(false);
    expect(store.error()).toBe('This view is read-only for your role.');
    expect(api.patch).not.toHaveBeenCalled();
  });
});
