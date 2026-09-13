import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { I18n } from './i18n.service';
import { TRANSLATIONS, isLocaleInvariantKey } from './translations';

/** jsdom's `navigator.language` is read-only; stub it per test and restore. */
function stubBrowserLanguage(language: string): void {
  Object.defineProperty(window.navigator, 'language', {
    value: language,
    configurable: true,
  });
}

const originalLanguage = window.navigator.language;

describe('I18n', () => {
  beforeEach(() => {
    localStorage.clear();
    stubBrowserLanguage('en-US');
  });

  afterEach(() => {
    stubBrowserLanguage(originalLanguage);
  });

  describe('language detection', () => {
    it('defaults to English for an English browser with no stored choice', () => {
      expect(new I18n().language()).toBe('en');
    });

    it('detects Greek from the browser locale', () => {
      stubBrowserLanguage('el-GR');
      expect(new I18n().language()).toBe('el');
    });

    it('matches on the primary subtag only', () => {
      stubBrowserLanguage('el-CY');
      expect(new I18n().language()).toBe('el');
    });

    it('falls back to English for an unsupported browser locale', () => {
      stubBrowserLanguage('fr-FR');
      expect(new I18n().language()).toBe('en');
    });

    it('prefers a stored choice over the browser locale', () => {
      localStorage.setItem('cm.lang.v1', 'el');
      stubBrowserLanguage('en-US');
      expect(new I18n().language()).toBe('el');
    });

    it('ignores an unsupported stored value', () => {
      localStorage.setItem('cm.lang.v1', 'klingon');
      expect(new I18n().language()).toBe('en');
    });

    it('applies the detected language to <html lang> on construction', () => {
      stubBrowserLanguage('el-GR');
      new I18n();
      expect(document.documentElement.lang).toBe('el');
    });

    it('survives localStorage failures during detection', () => {
      const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      expect(() => new I18n()).not.toThrow();
      spy.mockRestore();
    });
  });

  describe('t()', () => {
    it('translates a key in the active language', () => {
      const i18n = new I18n();
      expect(i18n.t('nav.marketplace')).toBe('Marketplace');
    });

    it('translates the same key in Greek after a switch', () => {
      const i18n = new I18n();
      i18n.setLanguage('el');
      expect(i18n.t('nav.marketplace')).toBe('Αγορά');
    });

    it('interpolates placeholders', () => {
      const i18n = new I18n();
      expect(i18n.t('notifications.unread', { count: 3 })).toBe('Notifications, 3 unread');
    });

    it('leaves unknown placeholders untouched', () => {
      const i18n = new I18n();
      expect(i18n.t('demo.body', { nope: 1 })).toContain('in-memory demo backend');
    });

    it('selects the .one variant for a count of 1', () => {
      const i18n = new I18n();
      expect(i18n.t('offline.pending', { count: 1 })).toBe('1 action waiting to sync');
    });

    it('selects the .other variant for other counts', () => {
      const i18n = new I18n();
      expect(i18n.t('offline.pending', { count: 4 })).toBe('4 actions waiting to sync');
    });

    it('pluralises in Greek too', () => {
      const i18n = new I18n();
      i18n.setLanguage('el');
      expect(i18n.t('offline.pending', { count: 1 })).toBe('1 ενέργεια σε αναμονή συγχρονισμού');
      expect(i18n.t('offline.pending', { count: 2 })).toBe('2 ενέργειες σε αναμονή συγχρονισμού');
    });

    it('returns the key itself when it is unknown everywhere', () => {
      expect(new I18n().t('does.not.exist')).toBe('does.not.exist');
    });

    it('falls back to English when a key is missing from the active dictionary', () => {
      const i18n = new I18n();
      i18n.setLanguage('el');
      const removed = TRANSLATIONS.el['common.saved'];
      delete TRANSLATIONS.el['common.saved'];
      try {
        expect(i18n.t('common.saved')).toBe('Saved');
      } finally {
        TRANSLATIONS.el['common.saved'] = removed;
      }
    });
  });

  describe('switching', () => {
    it('persists the chosen language', () => {
      const i18n = new I18n();
      i18n.setLanguage('el');
      expect(localStorage.getItem('cm.lang.v1')).toBe('el');
    });

    it('updates <html lang>', () => {
      const i18n = new I18n();
      i18n.setLanguage('el');
      expect(document.documentElement.lang).toBe('el');
    });

    it('ignores an unsupported language code', () => {
      const i18n = new I18n();
      i18n.setLanguage('fr' as never);
      expect(i18n.language()).toBe('en');
    });

    it('toggleLanguage flips between the two locales', () => {
      const i18n = new I18n();
      expect(i18n.language()).toBe('en');
      i18n.toggleLanguage();
      expect(i18n.language()).toBe('el');
      i18n.toggleLanguage();
      expect(i18n.language()).toBe('en');
    });

    it('exposes the BCP-47 tag for Intl formatting', () => {
      const i18n = new I18n();
      expect(i18n.locale()).toBe('en-US');
      i18n.setLanguage('el');
      expect(i18n.locale()).toBe('el-GR');
    });

    it('exposes the active language metadata', () => {
      const i18n = new I18n();
      i18n.setLanguage('el');
      expect(i18n.activeOption().code).toBe('el');
      expect(i18n.activeOption().label).toBe('Ελληνικά');
    });
  });

  describe('dictionaries', () => {
    it('ships both locales', () => {
      expect(Object.keys(TRANSLATIONS).sort()).toEqual(['el', 'en']);
    });

    it('keeps Greek in sync with English — no missing or stray keys', () => {
      const en = Object.keys(TRANSLATIONS.en).sort();
      const el = Object.keys(TRANSLATIONS.el).sort();
      expect(el).toEqual(en);
    });

    it('translates every key to a non-empty string', () => {
      for (const [language, table] of Object.entries(TRANSLATIONS)) {
        for (const [key, value] of Object.entries(table)) {
          expect(value.trim(), `${language}:${key}`).not.toBe('');
        }
      }
    });

    it('does not leave English text behind in the Greek dictionary', () => {
      // Guards against copy-paste: a Greek value identical to its English
      // counterpart is almost always an untranslated string. The shared
      // allowlist covers the values that genuinely do not translate.
      for (const key of Object.keys(TRANSLATIONS.en)) {
        if (isLocaleInvariantKey(key)) {
          continue;
        }
        expect(TRANSLATIONS.el[key], key).not.toBe(TRANSLATIONS.en[key]);
      }
    });
  });
});
