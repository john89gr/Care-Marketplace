import '@angular/compiler'; // required for JIT partial declarations
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Subject, of } from 'rxjs';
import { PushService } from './push.service';
import { VAPID_PUBLIC_KEY } from './push.config';

/** Stub Notification API (jsdom has none). */
class FakeNotification {
  static permission: NotificationPermission = 'default';
  static async requestPermission(): Promise<NotificationPermission> {
    return FakeNotification.permission;
  }
}

function fakeSwPush() {
  const messages = new Subject<object>();
  const subscription = new Subject<PushSubscription | null>();
  const requestSubscription = vi.fn();
  return {
    isEnabled: true,
    messages: messages.asObservable(),
    subscription: subscription.asObservable(),
    requestSubscription,
    messages$: messages,
    subscription$: subscription,
  };
}

function fakeSubscription(endpoint = 'https://fcm.example/push/abc'): PushSubscription {
  return {
    endpoint,
    toJSON: () => ({
      endpoint,
      expirationTime: null,
      keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
    }),
  } as unknown as PushSubscription;
}

describe('PushService', () => {
  let sw: ReturnType<typeof fakeSwPush>;
  let api: { post: ReturnType<typeof vi.fn> };
  let notifications: { notify: ReturnType<typeof vi.fn> };
  let service: PushService;

  beforeEach(() => {
    FakeNotification.permission = 'default';
    vi.stubGlobal('Notification', FakeNotification);
    sw = fakeSwPush();
    api = { post: vi.fn(() => of({ ok: true })) };
    notifications = { notify: vi.fn() };
    service = new PushService(
      sw as never,
      api as never,
      notifications as never
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports whether this browser can subscribe (SW + Notification API)', () => {
    expect(service.canPush()).toBe(true);
    const withoutSw = new PushService(null, api as never, notifications as never);
    expect(withoutSw.canPush()).toBe(false);
  });

  it('returns denied when the user blocks the permission', async () => {
    FakeNotification.permission = 'denied';
    const result = await service.requestPush();
    expect(result).toBe('denied');
    expect(sw.requestSubscription).not.toHaveBeenCalled();
  });

  it('subscribes with the VAPID public key and persists server-side on grant', async () => {
    FakeNotification.permission = 'granted';
    sw.requestSubscription.mockResolvedValue(fakeSubscription());
    const result = await service.requestPush();

    expect(result).toBe('granted');
    expect(sw.requestSubscription).toHaveBeenCalledWith({
      serverPublicKey: VAPID_PUBLIC_KEY,
    });
    expect(api.post).toHaveBeenCalledWith('/me/push-subscription', {
      endpoint: 'https://fcm.example/push/abc',
      keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
    });
    expect(service.subscribed()).toBe(true);
  });

  it('returns unavailable when permission is granted but the SW is disabled', async () => {
    FakeNotification.permission = 'granted';
    const noSw = new PushService(null, api as never, notifications as never);
    const result = await noSw.requestPush();
    expect(result).toBe('unavailable');
  });

  it('returns unavailable when the push subscription fails', async () => {
    FakeNotification.permission = 'granted';
    sw.requestSubscription.mockRejectedValue(new Error('push service unreachable'));
    expect(await service.requestPush()).toBe('unavailable');
    expect(service.subscribed()).toBe(false);
  });

  it('reports unsupported when there is no Notification API', async () => {
    vi.stubGlobal('Notification', undefined);
    expect(await service.requestPush()).toBe('unsupported');
  });

  it('pushEnabled mirrors the Notification permission', async () => {
    FakeNotification.permission = 'default';
    expect(await service.pushEnabled()).toBe(false);
    FakeNotification.permission = 'granted';
    expect(await service.pushEnabled()).toBe(true);
  });

  it('ingests a push payload received while the app is open into the panel', () => {
    sw.messages$.next({ kind: 'booking.accepted', title: 'Accepted', body: 'Elena accepted.', link: '/bookings' });
    expect(notifications.notify).toHaveBeenCalledWith(
      'booking.accepted',
      'Accepted',
      'Elena accepted.',
      '/bookings'
    );
  });

  it('ignores push payloads without a title', () => {
    sw.messages$.next({ body: 'no title here' });
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('tracks subscription state from the SwPush subscription stream', () => {
    sw.subscription$.next(fakeSubscription());
    expect(service.subscribed()).toBe(true);
    sw.subscription$.next(null);
    expect(service.subscribed()).toBe(false);
  });
});