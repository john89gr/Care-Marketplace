import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { LocalizedMessage } from './localized-message';
import { translateStatic } from './i18n.service';
import { TRANSLATIONS, isLocaleInvariantKey } from './translations';

describe('LocalizedMessage', () => {
  it('starts empty', () => {
    const message = new LocalizedMessage();
    expect(message.value()).toBe('');
    expect(message.source()).toBeNull();
  });

  it('renders an app-authored key in the reference locale', () => {
    const message = new LocalizedMessage();
    message.set({ key: 'booking.error.notFound' });
    expect(message.value()).toBe('Booking not found.');
    expect(message.source()?.key).toBe('booking.error.notFound');
  });

  it('interpolates params', () => {
    const message = new LocalizedMessage();
    message.set({
      key: 'booking.error.invalidTransition',
      params: { from: 'completed', to: 'accepted' },
    });
    expect(message.value()).toBe('Cannot move this booking from "completed" to "accepted".');
  });

  it('falls back to the app message when the server sent none', () => {
    const message = new LocalizedMessage();
    message.setFromServer(undefined, { key: 'booking.error.notFound' });
    expect(message.value()).toBe('Booking not found.');
    expect(message.source()).not.toBeNull();
  });

  it('passes server text through untouched, with no key', () => {
    const message = new LocalizedMessage();
    message.setFromServer('Stale state.', { key: 'booking.error.stale' });
    expect(message.value()).toBe('Stale state.');
    expect(message.source()).toBeNull();
  });

  it('clears back to empty', () => {
    const message = new LocalizedMessage();
    message.set({ key: 'booking.error.notFound' });
    message.clear();
    expect(message.value()).toBe('');
    expect(message.source()).toBeNull();
  });
});

describe('app-authored message keys', () => {
  /**
   * Every file that hands a dictionary key to a store-owned message slot or to
   * the notification center. A store holds only the key — it cannot inject
   * `I18n` — so a typo would silently render the key itself in the UI. These
   * files are scanned for `key: '…'` literals, which must exist in *both*
   * dictionaries and be genuinely translated.
   */
  const files = [
    'src/app/core/auth/auth.api.ts',
    'src/app/core/services/notifications/notifications.service.ts',
    'src/app/core/services/audit/consent.store.ts',
    'src/app/core/services/bluetooth/bluetooth.service.ts',
    'src/app/features/admin/audit-viewer.component.ts',
    'src/app/features/admin/consents-admin.component.ts',
    'src/app/features/consents/consent.store.ts',
    'src/app/features/health-record/contacts.store.ts',
    'src/app/features/health-record/export.service.ts',
    'src/app/features/health-record/history.store.ts',
    'src/app/features/health-record/medications.store.ts',
    'src/app/features/health-record/screening.store.ts',
    'src/app/features/health-record/vitals.store.ts',
    'src/app/features/health-record/reminders.store.ts',
    'src/app/features/home-health/care-plan.store.ts',
    'src/app/features/home-health/clinical-log.store.ts',
    'src/app/features/home-health/shifts.store.ts',
    'src/app/features/home-health/visit.store.ts',
    'src/app/features/integrations/gov-gr-auth.page.ts',
    'src/app/features/integrations/wallet.store.ts',
    'src/app/features/marketplace/booking.store.ts',
    'src/app/features/marketplace/caregiver-profile.store.ts',
    'src/app/features/marketplace/chat.store.ts',
    'src/app/features/marketplace/marketplace.store.ts',
    'src/app/features/marketplace/reviews.store.ts',
    'src/app/features/marketplace/saved-search.store.ts',
    'src/app/features/payments/disputes.store.ts',
    'src/app/features/payments/escrow.store.ts',
    'src/app/features/payments/payment-methods.store.ts',
    'src/app/features/payments/payout.store.ts',
    'src/app/features/pharmacy/orders.store.ts',
    'src/app/features/pharmacy/prescriptions.store.ts',
    'src/app/features/profiles/profile.store.ts',
    'src/app/features/vetting/vetting.store.ts',
  ];

  const keysIn = (file: string): string[] => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');
    return [...source.matchAll(/\bkey:\s*'([^']+)'/g)].map((match) => match[1]);
  };

  it.each(files)('%s references only known keys', (file) => {
    const keys = keysIn(file);
    for (const key of keys) {
      expect(TRANSLATIONS.en[key], `en:${key}`).toBeTruthy();
      expect(TRANSLATIONS.el[key], `el:${key}`).toBeTruthy();
    }
  });

  it('keeps every scanned key translated (English differs from Greek)', () => {
    for (const file of files) {
      for (const key of keysIn(file)) {
        if (isLocaleInvariantKey(key)) {
          continue;
        }
        expect(TRANSLATIONS.el[key], key).not.toBe(TRANSLATIONS.en[key]);
      }
    }
  });

  it('covers every store that owns a message slot', () => {
    // A new `LocalizedMessage` store must be added to the list above, or its
    // keys go unverified.
    const roots = ['src/app/core/auth', 'src/app/core/services', 'src/app/features'];
    const found: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(resolve(process.cwd(), dir), { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(path);
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
          const source = readFileSync(resolve(process.cwd(), path), 'utf8');
          if (/new LocalizedMessage\(/.test(source)) {
            found.push(path);
          }
        }
      }
    };
    roots.forEach(walk);
    expect(found.sort()).toEqual([...files].sort());
  });

  it('resolves keys through translateStatic', () => {
    expect(translateStatic('chat.error.notConnected')).toContain('Not connected');
    expect(translateStatic('chat.error.notConnected', undefined, 'el')).toContain('Χωρίς σύνδεση');
  });
});
