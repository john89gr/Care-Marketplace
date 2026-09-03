import { isDemoMode } from './demo.mode';

/**
 * Minimal WebSocket stand-in for demo mode: connects immediately and answers
 * `chat.send` with an ack + a canned peer reply, and echoes `visit.position`
 * broadcasts. Only used when demo mode is on.
 *
 * Notification pushes (FEATURE_PLAN.md §4): `notification.poll` cycles
 * through sample notifications (booking accepted, vitals alert, system) so
 * the WS → store path is exercised without a backend.
 */

interface DemoFrame {
  type: string;
  payload?: Record<string, unknown>;
}

export class DemoWebSocket {
  readyState = 1; // WebSocket.OPEN
  url = '';
  onopen: ((ev: Event) => unknown) | null = null;
  onmessage: ((ev: MessageEvent) => unknown) | null = null;
  onclose: ((ev: CloseEvent) => unknown) | null = null;
  onerror: ((ev: Event) => unknown) | null = null;

  constructor(url: string) {
    this.url = url;
    queueMicrotask(() => {
      if (this.readyState === 1) {
        this.onopen?.(new Event('open'));
      }
    });
  }

  private pollCount = 0;

  send(data: string): void {
    let frame: DemoFrame;
    try {
      frame = JSON.parse(data) as DemoFrame;
    } catch {
      return;
    }
    const { type, payload } = frame;
    if (type === 'chat.send' && payload) {
      const conversationId = String(payload['conversationId']);
      const clientMessageId = String(payload['clientMessageId']);
      this.deliver({ type: 'chat.ack', payload: { clientMessageId } });
      this.deliver({
        type: 'chat.message',
        payload: {
          conversationId,
          authorId: conversationId,
          text: 'Bonjour ! Je suis disponible pour cette visite. On se confirme ?',
          sentAtMs: Date.now(),
        },
      });
    } else if (type === 'visit.position') {
      // Broadcast the position back so listeners (family view) receive it.
      this.deliver({ type: 'visit.position', payload });
    } else if (type === 'visit.completed' && payload) {
      // A completed visit prompts the client to leave a review
      // (FEATURE_PLAN.md §1): broadcast the status so visit lists update and
      // push a notification that deep-links to the review form.
      const bookingId = String(payload['bookingId'] ?? '');
      const visitId = String(payload['visitId'] ?? '');
      const caregiverName = String(payload['caregiverName'] ?? 'your caregiver');
      if (visitId) {
        this.deliver({ type: 'visit.status', payload: { visitId, status: 'completed' } });
      }
      this.deliver({
        type: 'notification.push',
        payload: {
          id: `ntf-review-${Date.now().toString(36)}`,
          kind: 'booking.completed',
          title: 'Visit completed',
          body: `How was your visit with ${caregiverName}? Rate it now.`,
          link: bookingId ? `/review?booking=${bookingId}` : '/review',
          createdAtMs: Date.now(),
          readAtMs: null,
        },
      });
    } else if (type === 'medication.alert' && payload) {
      // Family alert fan-out (FEATURE_PLAN.md §7 subtask 9): the client store
      // emits `medication.alert` on a missed critical dose; the demo backend
      // delivers it to family clients as a `notification.push`.
      const name = String(payload['name'] ?? 'Medication');
      const streak = Number(payload['consecutiveMisses'] ?? 1);
      this.deliver({
        type: 'notification.push',
        payload: {
          id: `ntf-med-${Date.now().toString(36)}`,
          kind: 'medication.missed',
          title: `Missed dose: ${name}`,
          body:
            streak >= 2
              ? `A critical medication dose was missed. This is the ${streak}nd consecutive miss — please check in.`
              : 'A critical medication dose was missed.',
          link: '/medications',
          createdAtMs: Date.now(),
          readAtMs: null,
        },
      });
    } else if (type === 'reminder.test') {
      // Smart-reminders test mode (FEATURE_PLAN.md §8 subtask 9): answer with
      // a live push so the inbox + toast path is exercised without a backend.
      const name = String((payload as Record<string, unknown> | undefined)?.['name'] ?? 'medication');
      this.deliver({
        type: 'notification.push',
        payload: {
          id: `ntf-reminder-${Date.now().toString(36)}`,
          kind: 'medication.missed',
          title: `Test reminder: ${name}`,
          body: 'This is how your reminder will look.',
          link: '/medications',
          createdAtMs: Date.now(),
          readAtMs: null,
        },
      });
    } else if (type === 'pharmacy.watch' && payload) {
      // Order-status progression (FEATURE_PLAN.md §9 subtask 11): the client
      // store watches open orders; the demo backend streams the remaining
      // pipeline steps as `pharmacy.status` pushes. The store merges only
      // legal transitions, so emitting the full chain is safe.
      const orderId = String(payload['orderId'] ?? '');
      const chain = ['routed', 'accepted', 'preparing', 'out_for_delivery', 'delivered'];
      chain.forEach((status, index) => {
        setTimeout(() => {
          if (this.readyState !== 1) {
            return;
          }
          this.deliver({ type: 'pharmacy.status', payload: { orderId, status, atMs: Date.now() } });
        }, 400 * (index + 1));
      });
    } else if (type === 'notification.poll') {
      // Demo live push: acknowledge the poll with a sample notification so
      // the WS path is exercised without a backend (FEATURE_PLAN.md §4).
      // Cycle kinds so booking/vitals/system pushes are all covered.
      const samples = [
        {
          kind: 'booking.accepted',
          title: 'Booking accepted',
          body: 'Elena Papadaki accepted your visit request.',
        },
        {
          kind: 'vitals.alert',
          title: 'Blood pressure above range',
          body: 'Latest reading is outside the expected range — check the trends view.',
        },
        {
          kind: 'system',
          title: 'Live update',
          body: 'This notification arrived over the WebSocket in real time.',
        },
      ];
      const sample = samples[this.pollCount++ % samples.length];
      this.deliver({
        type: 'notification.push',
        payload: {
          id: `ntf-live-${Date.now().toString(36)}`,
          ...sample,
          createdAtMs: Date.now(),
          readAtMs: null,
        },
      });
    }
  }

  close(): void {
    this.readyState = 3; // WebSocket.CLOSED
    this.onclose?.(new CloseEvent('close'));
  }

  private deliver(frame: DemoFrame): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }
}

export const demoSocketFactory = (url: string): WebSocket => new DemoWebSocket(url) as unknown as WebSocket;

/** The socket factory to use: demo stand-in when demo mode is on. */
export function socketFactoryForMode(): (url: string) => WebSocket {
  return isDemoMode() ? demoSocketFactory : (url: string) => new WebSocket(url);
}
