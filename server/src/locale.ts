import type { Request } from 'express';

/**
 * Content localisation.
 *
 * The UI is translated at runtime in the browser; *content* (provider bios,
 * specialities, service names, review comments, booking and care-plan notes,
 * chat seeds) lives in the database, so the client asks for the language it is
 * displaying: `?lang=en|el`. Responses stay plain strings — no shape changes —
 * which keeps every existing consumer and contract intact.
 *
 * A value may be stored either as a plain string (legacy, single language) or
 * as a {@link LocalizedText} bundle; `pick()` handles both, and falls back to
 * the other locale before giving up, so a half-translated row still renders.
 */

export type Lang = 'en' | 'el';

export const LANGS: readonly Lang[] = ['en', 'el'];

/** The default content language when a request does not ask for one. */
export const DEFAULT_LANG: Lang = 'en';

/** A string in every supported locale; either side may be missing. */
export interface LocalizedText {
  en?: string;
  el?: string;
}

/** A list of strings in every supported locale. */
export interface LocalizedList {
  en?: string[];
  el?: string[];
}

export function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'el';
}

/** The other supported locale (there are only two). */
export function otherLang(lang: Lang): Lang {
  return lang === 'en' ? 'el' : 'en';
}

function primarySubtag(value: string): string {
  return value.trim().toLowerCase().split('-')[0].split('_')[0];
}

/**
 * Content language for a request: `?lang=` wins, then `Accept-Language`, then
 * English. Unknown values fall through rather than erroring — a bad `lang`
 * should never break a request.
 */
export function requestLang(req: Pick<Request, 'query' | 'headers'>): Lang {
  const fromQuery = req.query?.['lang'];
  const queryValue = Array.isArray(fromQuery) ? fromQuery[0] : fromQuery;
  if (typeof queryValue === 'string') {
    const subtag = primarySubtag(queryValue);
    if (isLang(subtag)) {
      return subtag;
    }
  }
  const header = req.headers?.['accept-language'];
  const headerValue = Array.isArray(header) ? header[0] : header;
  if (typeof headerValue === 'string') {
    // Take the highest-priority entry only; ranges are not worth parsing here.
    const subtag = primarySubtag(headerValue.split(',')[0] ?? '');
    if (isLang(subtag)) {
      return subtag;
    }
  }
  return DEFAULT_LANG;
}

/** Resolve a localized value (or a legacy plain string) for one language. */
export function pick(value: unknown, lang: Lang): string {
  if (typeof value === 'string') {
    return value;
  }
  if (!value || typeof value !== 'object') {
    return '';
  }
  const bundle = value as LocalizedText;
  const chosen = bundle[lang];
  if (typeof chosen === 'string' && chosen.trim()) {
    return chosen;
  }
  const fallback = bundle[otherLang(lang)];
  return typeof fallback === 'string' ? fallback : '';
}

/** Resolve a localized list for one language, preferring a non-empty side. */
export function pickList(value: unknown, lang: Lang): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  if (!value || typeof value !== 'object') {
    return [];
  }
  const bundle = value as LocalizedList;
  const chosen = bundle[lang];
  if (Array.isArray(chosen) && chosen.length > 0) {
    return chosen;
  }
  const fallback = bundle[otherLang(lang)];
  return Array.isArray(fallback)
    ? fallback.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/**
 * Every locale's copy of a value, joined — what a *search* has to match.
 * A Greek client searching «Ενέσεις» must find a provider whose English list
 * says "Injections", so free-text search spans both languages.
 */
export function searchableText(value: unknown): string {
  if (typeof value === 'string') {
    return value.toLowerCase();
  }
  if (!value || typeof value !== 'object') {
    return '';
  }
  const bundle = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ['en', 'el']) {
    const side = bundle[key];
    if (typeof side === 'string') {
      parts.push(side);
    } else if (Array.isArray(side)) {
      for (const entry of side) {
        if (typeof entry === 'string') {
          parts.push(entry);
        }
      }
    }
  }
  return parts.join(' \u0000 ').toLowerCase();
}

/** Parse a JSONB column that may come back as an object or a JSON string. */
export function asBundle(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}
