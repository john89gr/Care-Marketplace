import { computed, signal, Signal } from '@angular/core';
import { TranslatableMessage, translateStatic } from './i18n.service';

/**
 * One user-facing message slot that is bilingual by construction.
 *
 * Stores cannot inject `I18n` — they are constructed directly in unit tests, so
 * an `inject()` in the constructor would throw outside an injection context.
 * They therefore hold the *source* of a message rather than a rendered string:
 *
 * - an app-authored key, translated per locale when a page renders it, or
 * - server text, shown verbatim (it is the server's copy to own).
 *
 * `value` is the English rendering so existing behaviour — and the specs that
 * read the plain string — keep working unchanged.
 */
export class LocalizedMessage {
  private readonly _source = signal<TranslatableMessage | null>(null);
  private readonly _text = signal('');

  /** The translatable source, or null when the message came from the server. */
  readonly source: Signal<TranslatableMessage | null> = this._source.asReadonly();

  /** English rendering, or the server's own text. */
  readonly value: Signal<string> = computed(() => {
    const source = this._source();
    return source ? translateStatic(source.key, source.params) : this._text();
  });

  /** App-authored message (translatable). */
  set(source: TranslatableMessage): void {
    this._source.set(source);
    this._text.set('');
  }

  /**
   * Server-provided message, used verbatim; `fallback` is the app-authored
   * message that applies when the server did not send one of its own.
   */
  setFromServer(message: string | null | undefined, fallback: TranslatableMessage): void {
    if (message) {
      this._text.set(message);
      this._source.set(null);
      return;
    }
    this.set(fallback);
  }

  /** No message. */
  clear(): void {
    this._source.set(null);
    this._text.set('');
  }
}
