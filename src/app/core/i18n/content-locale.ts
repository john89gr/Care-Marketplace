import { effect, inject, untracked } from '@angular/core';
import { I18n } from './i18n.service';

/**
 * Re-fetch *content* when the reader switches language.
 *
 * Labels translate instantly in the browser, but content — provider bios,
 * specialities, service names, review comments, care-plan notes — is rendered
 * by the backend (the locale interceptor attaches `?lang=`), so the data on
 * screen is stale the moment the locale changes. This helper re-runs a page's
 * load so the words follow the switch instead of lingering in the old language.
 *
 * The first run of the underlying effect is the page's own initial load, so it
 * is skipped: only genuine changes trigger a re-fetch.
 *
 * Call it from a component constructor (an injection context), where the
 * page's own stores and load calls are already in scope:
 *
 * ```ts
 * constructor() {
 *   reloadOnLanguageChange(() => this.store.search());
 * }
 * ```
 *
 * `reload` runs untracked: it reads and writes signals, and those must not
 * become dependencies of the effect (that would loop).
 */
export function reloadOnLanguageChange(reload: () => void): void {
  const i18n = inject(I18n);
  let settled = false;
  effect(() => {
    i18n.language();
    if (!settled) {
      settled = true;
      return;
    }
    untracked(reload);
  });
}
