import webpush from 'web-push';
import { query, queryOne } from './db';

/**
 * Web Push sender (FEATURE_PLAN.md §20 subtasks 7–8): persists the browser
 * push subscription per user and delivers notifications through the
 * subscription's push service (FCM, Mozilla autopush, …).
 *
 * VAPID keys come from env (`VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`,
 * `VAPID_PRIVATE_KEY`) with a generated demo pair as fallback so
 * `npm run server` works out of the box — same convention as the dev JWT
 * secret. The demo private key is for development only: override both env
 * vars in production. The public key must match the one compiled into the
 * frontend bundle (`src/app/core/services/push/push.config.ts`).
 */
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:care@caremarketplace.example';

/** Demo keypair generated with `npx web-push generate-vapid-keys --json`. */
export const DEMO_VAPID_PUBLIC_KEY =
  'BKZ612A7cLiu4XQmBK770IJrs2dh8WOLvi5mnmBkv-hh0t-uaJBDFn_kaJ8Ep-NKLTQLBJPLp1wU2aaKuxvmbfg';
export const DEMO_VAPID_PRIVATE_KEY = '_BEIXePdc6rBistobTsz9RQX516J7DgehiQTwI9Coiw';

webpush.setVapidDetails(
  VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY ?? DEMO_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY ?? DEMO_VAPID_PRIVATE_KEY
);

export interface PushSubscriptionRow {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function getSubscription(userId: string): Promise<PushSubscriptionRow | null> {
  return queryOne<PushSubscriptionRow>(
    'SELECT * FROM push_subscriptions WHERE user_id = $1',
    [userId]
  );
}

export async function saveSubscription(
  userId: string,
  input: { endpoint: string; keys: { p256dh: string; auth: string } }
): Promise<void> {
  const at = Date.now();
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at_ms, updated_at_ms)
     VALUES ($1, $2, $3, $4, $5, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       endpoint = EXCLUDED.endpoint, p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth, updated_at_ms = EXCLUDED.updated_at_ms`,
    [userId, input.endpoint, input.keys.p256dh, input.keys.auth, at]
  );
}

export async function removeSubscription(userId: string): Promise<void> {
  await query('DELETE FROM push_subscriptions WHERE user_id = $1', [userId]);
}

export interface PushNotification {
  kind: string;
  title: string;
  body: string;
  /** Frontend route the notification opens on click (kind→route map). */
  link: string;
}

export type NotifyResult = 'sent' | 'no-subscription' | 'expired' | 'failed';

/**
 * Send a Web Push to a user's subscription, if one exists. The payload is the
 * shape Angular's ngsw-worker understands: it shows the system notification
 * and, on click, navigates the focused client to `link` (subtask 8). The
 * top-level kind/title/body/link fields are also broadcast to open tabs, where
 * the frontend's PushService ingests them into the in-app panel.
 * A 404/410 from the push service means the subscription is dead — drop it so
 * we never send again.
 */
export async function notifyUser(userId: string, n: PushNotification): Promise<NotifyResult> {
  const sub = await getSubscription(userId);
  if (!sub) {
    return 'no-subscription';
  }
  const payload = JSON.stringify({
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link,
    notification: {
      title: n.title,
      body: n.body,
      data: {
        onActionClick: {
          default: { operation: 'navigateLastFocusedOrOpen', url: n.link },
        },
      },
    },
  });
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload
    );
    return 'sent';
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await removeSubscription(userId);
      return 'expired';
    }
    return 'failed';
  }
}