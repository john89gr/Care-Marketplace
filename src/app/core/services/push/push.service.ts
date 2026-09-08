import { Injectable, inject, signal } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { ApiClient } from '../../api/api.client';
import { AppNotification, NotificationsService } from '../notifications/notifications.service';
import { VAPID_PUBLIC_KEY } from './push.config';

/**
 * Browser push opt-in + delivery (FEATURE_PLAN.md §20 subtasks 7–9).
 *
 * The service worker (ngsw-worker.js) does the actual push work: it displays
 * the system notification and navigates on click per the payload's
 * `data.onActionClick` (see push.config.ts). This service only:
 *  - requests the browser push subscription (VAPID public key),
 *  - persists the subscription server-side (`/me/push-subscription`),
 *  - routes push payloads received while the app is open into the in-app
 *    notification panel so the badge stays in sync.
 */
export type PushRequestResult = 'granted' | 'denied' | 'unavailable' | 'unsupported';

const SUB_KEY = 'cm.push.subscription.v1';

@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly _subscribed = signal(false);
  readonly subscribed = this._subscribed.asReadonly();

  // Default-parameter injection keeps direct instantiation possible in unit
  // tests (codebase convention); SwPush is absent when the SW is disabled
  // (dev mode), hence optional.
  constructor(
    private readonly swPush: SwPush | null = inject(SwPush, { optional: true }),
    private readonly api: ApiClient = inject(ApiClient),
    private readonly notifications: NotificationsService = inject(NotificationsService)
  ) {
    // Real Web Push message received while the app is open — surface it in
    // the panel (the worker already shows the system notification).
    this.swPush?.messages.subscribe((msg) => this.ingestMessage(msg));
    this.swPush?.subscription.subscribe((sub) => {
      this._subscribed.set(!!sub);
    });
  }

  /** True when this browser can subscribe to Web Push at all. */
  canPush(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof Notification !== 'undefined' &&
      this.swPush !== null &&
      this.swPush.isEnabled
    );
  }

  /**
   * Opt-in flow (subtask 9): browser permission first, then the push
   * subscription. Returns the outcome so callers can update their UI.
   */
  async requestPush(): Promise<PushRequestResult> {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') {
      return 'unsupported';
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return permission === 'denied' ? 'denied' : 'unavailable';
    }
    if (!this.swPush || !this.swPush.isEnabled) {
      return 'unavailable';
    }
    try {
      const sub = await this.swPush.requestSubscription({
        serverPublicKey: VAPID_PUBLIC_KEY,
      });
      this._subscribed.set(true);
      this.saveLocal(sub);
      // Persist server-side so the push service can reach this browser.
      this.api
        .post('/me/push-subscription', {
          endpoint: sub.endpoint,
          keys: sub.toJSON().keys ?? null,
        })
        .subscribe({ error: () => undefined });
      return 'granted';
    } catch {
      return 'unavailable';
    }
  }

  /** Permission-state helper for the reminders settings UI. */
  async pushEnabled(): Promise<boolean> {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') {
      return false;
    }
    return Notification.permission === 'granted';
  }

  private saveLocal(sub: PushSubscription): void {
    try {
      localStorage.setItem(SUB_KEY, JSON.stringify(sub.toJSON()));
    } catch {
      // Storage unavailable — server copy is enough.
    }
  }

  /**
   * Push payload while the app is open → notification panel entry. The
   * payload mirrors AppNotification (kind/title/body/link); the worker shows
   * the system copy, this keeps the in-app badge consistent.
   */
  private ingestMessage(msg: unknown): void {
    const m = msg as { title?: unknown; body?: unknown; kind?: unknown; link?: unknown } | null;
    if (!m || typeof m.title !== 'string') {
      return;
    }
    this.notifications.notify(
      (typeof m.kind === 'string' ? m.kind : 'system') as AppNotification['kind'],
      m.title,
      typeof m.body === 'string' ? m.body : '',
      typeof m.link === 'string' ? m.link : undefined
    );
  }
}