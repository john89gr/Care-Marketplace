import { HttpInterceptorFn } from '@angular/common/http';
import { DEFAULT_LANGUAGE } from './translations';
import { detectLanguage } from './i18n.service';

/**
 * Tells the backend which language to render *content* in.
 *
 * Labels and messages are translated in the browser, but content — provider
 * bios, specialities, service names, review comments, booking and care-plan
 * notes — lives in the database, so the server has to know the active locale:
 * `GET /api/caregivers/u-nurse?lang=el`.
 *
 * English is the server's default, so the parameter is only attached when the
 * user is in another locale. That keeps canonical URLs (and every Playwright
 * route mock) unchanged for the default language, and makes the override
 * explicit exactly when it matters. A `lang` already on the URL — an explicit
 * deep link — always wins.
 */
export const localeInterceptor: HttpInterceptorFn = (req, next) => {
  const language = detectLanguage();
  if (
    !req.url.startsWith('/api/') ||
    language === DEFAULT_LANGUAGE ||
    req.params.has('lang')
  ) {
    return next(req);
  }
  return next(req.clone({ params: req.params.set('lang', language) }));
};
