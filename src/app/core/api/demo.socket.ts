import { isDemoMode } from './demo.mode';

/**
 * Minimal WebSocket stand-in for demo mode: connects immediately and answers
 * `chat.send` with an ack + a canned peer reply, and echoes `visit.position`
 * broadcasts. Only used when demo mode is on.
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
