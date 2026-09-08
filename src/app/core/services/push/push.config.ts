/**
 * Web Push (VAPID) configuration — FEATURE_PLAN.md §20 subtask 7.
 *
 * The Angular service worker (ngsw-worker.js) is the push handler: it shows
 * the system notification and navigates on click (see `data.onActionClick`
 * in the payload contract below). The app only ever needs the *public* key,
 * passed to `SwPush.requestSubscription()` so the browser can create a
 * subscription the server can send to.
 *
 * Deployment contract:
 *  - Replace `VAPID_PUBLIC_KEY` with your deployment's key (or keep this
 *    demo pair — it was generated for this repo and is valid for testing).
 *  - The *private* key lives server-side only (env var `VAPID_PRIVATE_KEY`
 *    on the push-sending service). It must never ship in the frontend bundle.
 *  - Push payload shape the worker understands:
 *      {
 *        notification: {
 *          title, body,
 *          data: {
 *            onActionClick: {
 *              default: { operation: 'navigateLastFocusedOrOpen', url: '/vitals' }
 *            }
 *          }
 *        }
 *      }
 *    Reuse the kind→route map in NotificationsService#routeForKind so a click
 *    lands on the right feature (subtask 8).
 */
export const VAPID_PUBLIC_KEY =
  'BDSg7Zozl9hBT2i_ho_-QOcxtdmJXAWKOMNccXQUs1pOc0sjHXBFg3trEZnfM5PTE0YOAb1Uh_iF89GRcsmH48U';