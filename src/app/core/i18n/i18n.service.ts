import { Injectable, computed, signal } from '@angular/core';
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  Language,
  LanguageOption,
  TRANSLATIONS,
} from './translations';

/**
 * Values interpolated into `{placeholder}` tokens. A nested
 * {@link TranslatableMessage} is resolved at render time, so a label that is
 * itself translatable (a vitals type, a screening rule) follows the locale
 * switch instead of being frozen in the language that emitted the message.
 */
export type TranslateParams = Record<string, string | number | TranslatableMessage>;

/**
 * A user-facing message the app authored: a dictionary key plus optional
 * interpolation params.
 *
 * Stores and pure helpers return this instead of a hard-coded English string,
 * so the same failure reads in the active language. Messages that come *from
 * the server* are not wrapped — they are the server's copy to own and are shown
 * verbatim.
 */
export interface TranslatableMessage {
  readonly key: string;
  readonly params?: TranslateParams;
}

const LANGUAGE_KEY = 'cm.lang.v1';

/**
 * Runtime i18n.
 *
 * One build serves every locale: `t()` resolves against the active dictionary
 * at render time, so switching language re-renders only the views that read it
 * (it reads a signal, which Angular tracks as a dependency of the template).
 *
 * Resolution order for a key: active language → English → the key itself, so a
 * missing translation degrades to something readable instead of blank space.
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  private readonly _language = signal<Language>(detectLanguage());

  /** Active language. Read this in `computed`/templates to react to changes. */
  readonly language = this._language.asReadonly();

  /** Selectable languages, for the switcher. */
  readonly languages: readonly LanguageOption[] = LANGUAGES;

  /** Full metadata (label, BCP-47 tag) for the active language. */
  readonly activeOption = computed(
    () => LANGUAGES.find((option) => option.code === this._language()) ?? LANGUAGES[0]
  );

  /** BCP-47 tag for `Intl` date/number formatting (`el-GR`, `en-US`). */
  readonly locale = computed(() => this.activeOption().tag);

  constructor() {
    this.applyLanguage(this._language());
  }

  /**
   * Translate `key`, interpolating `{placeholders}`.
   *
   * When `params.count` is a number, a `<key>.one` / `<key>.other` variant is
   * preferred, falling back to the base key — enough pluralisation for the
   * "N actions waiting to sync" style strings without pulling in ICU.
   */
  t(key: string, params?: TranslateParams): string {
    // Reading the signal makes any template that calls t() re-render on switch.
    const language = this._language();
    return resolve(key, language, params);
  }

  /**
   * Render an app-authored message, falling back to plain text.
   *
   * Templates use this for store errors: a message the app authored carries a
   * key and is translated, while a server error has no key and passes through
   * unchanged.
   */
  message(source: TranslatableMessage | null | undefined, fallback = ''): string {
    return source ? resolve(source.key, this._language(), source.params) : fallback;
  }

  setLanguage(language: Language): void {
    if (!LANGUAGES.some((option) => option.code === language)) {
      return;
    }
    this._language.set(language);
    this.applyLanguage(language);
  }

  /** Flip between the two supported locales (used by the shell shortcut). */
  toggleLanguage(): void {
    this.setLanguage(this._language() === 'en' ? 'el' : 'en');
  }

  /** Persist the choice and keep `<html lang>` accurate for a11y/SEO. */
  private applyLanguage(language: Language): void {
    try {
      localStorage.setItem(LANGUAGE_KEY, language);
    } catch {
      // Storage unavailable (private mode): the choice stays in memory.
    }
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }
}

/** Interpolate `{placeholders}`, resolving any nested translatable value. */
function interpolate(template: string, params: TranslateParams | undefined, language: Language): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    if (!(name in params)) {
      return match;
    }
    const value = params[name];
    return typeof value === 'object' ? resolve(value.key, language, value.params) : String(value);
  });
}

function lookup(key: string, language: Language): string | undefined {
  return TRANSLATIONS[language]?.[key] ?? TRANSLATIONS[DEFAULT_LANGUAGE]?.[key];
}

/** Key resolution + interpolation, shared by `I18n.t` and `translateStatic`. */
function resolve(key: string, language: Language, params?: TranslateParams): string {
  const pluralKey =
    typeof params?.['count'] === 'number'
      ? `${key}.${params['count'] === 1 ? 'one' : 'other'}`
      : null;
  const template =
    (pluralKey ? lookup(pluralKey, language) : undefined) ??
    lookup(key, language) ??
    key;
  return interpolate(template, params, language);
}

/**
 * Translate without a DI container — for stores, pure helpers and tests, which
 * cannot inject `I18n`. Defaults to English, the reference locale.
 */
export function translateStatic(
  key: string,
  params?: TranslateParams,
  language: Language = DEFAULT_LANGUAGE
): string {
  return resolve(key, language, params);
}

/**
 * The active language without DI.
 *
 * `I18n` is the authority while the app runs; this mirrors its detection for
 * non-DI call sites (stores, pure helpers) that must pick a label or a date
 * format for the language the user is actually in.
 */
export function detectLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    if (stored && LANGUAGES.some((option) => option.code === stored)) {
      return stored as Language;
    }
  } catch {
    // Fall through to browser detection.
  }
  const browser = typeof navigator !== 'undefined' ? navigator.language : '';
  const primary = browser.split('-')[0].toLowerCase();
  return LANGUAGES.find((option) => option.code === primary)?.code ?? DEFAULT_LANGUAGE;
}

/** BCP-47 tag of the active language, without DI (for `Intl` formatting). */
export function activeLocaleTag(): string {
  const code = detectLanguage();
  return LANGUAGES.find((option) => option.code === code)?.tag ?? 'en-US';
}
