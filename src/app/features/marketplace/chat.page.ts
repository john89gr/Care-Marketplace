import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ChatStore } from './chat.store';
import { SessionStore } from '../../core/auth/session';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="chat">
      <h1>Chat</h1>

      <div class="chat-layout">
        <aside class="chat-list" aria-label="Conversations">
          @if (conversations().length === 0) {
            <p class="muted">No conversations yet. Find a caregiver in the marketplace and tap “Message”.</p>
          } @else {
            <ul>
              @for (conv of conversations(); track conv.id) {
                <li>
                  <button
                    type="button"
                    class="conv"
                    (click)="open(conv.id)"
                    [class.active]="conv.id === activeId()"
                  >
                    <span class="name">{{ conv.displayName }}</span>
                    @if (conv.unread > 0) {
                      <span class="badge">{{ conv.unread }}</span>
                    }
                  </button>
                </li>
              }
            </ul>
          }
        </aside>

        <div class="chat-thread">
          @if (activeId() === null) {
            <p class="muted">Select a conversation to start chatting.</p>
          } @else {
            <div class="messages" aria-live="polite">
              @for (msg of activeMessages(); track msg.id) {
                <p class="msg" [class.mine]="msg.authorId === myId()">
                  {{ msg.text }}
                  <span class="meta">
                    @if (msg.status === 'failed') {
                      not delivered
                    } @else if (msg.status === 'sending') {
                      sending…
                    }
                  </span>
                </p>
              }
            </div>
            @if (store.sendError()) {
              <p class="error" role="alert">{{ store.sendError() }}</p>
            }
            <form class="composer" (ngSubmit)="send()">
              <input
                type="text"
                [(ngModel)]="draft"
                name="message"
                placeholder="Type a message…"
                autocomplete="off"
              />
              <button type="submit" [disabled]="!draft.trim()">Send</button>
            </form>
          }
        </div>
      </div>
    </section>
  `,
  styles: `
    .chat-layout {
      display: grid;
      grid-template-columns: 16rem 1fr;
      gap: 1rem;
      align-items: start;
    }
    .chat-list ul {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 0.35rem;
    }
    .chat-list .conv {
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 100%;
      padding: 0.6rem 0.8rem;
      border-radius: 0.5rem;
      text-decoration: none;
      color: var(--text);
      background: var(--surface);
      border: 1px solid var(--border);
    }
    .chat-list .conv.active {
      border-color: var(--accent);
      background: var(--accent-soft);
    }
    .badge {
      background: var(--accent);
      color: #fff;
      border-radius: 999px;
      font-size: 0.75rem;
      padding: 0.05rem 0.45rem;
      font-weight: 700;
    }
    .messages {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-height: 22rem;
      overflow-y: auto;
      padding: 0.75rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
    }
    .msg {
      align-self: flex-start;
      max-width: 75%;
      background: var(--surface-raised);
      border-radius: 0.75rem;
      padding: 0.45rem 0.7rem;
      margin: 0;
    }
    .msg.mine {
      align-self: flex-end;
      background: var(--accent-soft);
    }
    .msg .meta {
      display: block;
      font-size: 0.7rem;
      color: var(--text-muted);
    }
    .composer {
      display: flex;
      gap: 0.5rem;
      margin-top: 0.75rem;
      max-width: none;
    }
    .muted {
      color: var(--text-muted);
    }
  `,
})
export class ChatPage implements OnInit {
  readonly store = inject(ChatStore);
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(SessionStore);

  draft = '';

  readonly conversations = this.store.conversations;
  readonly activeId = this.store.activeId;
  readonly activeMessages = this.store.activeMessages;
  readonly myId = () => this.session.session()?.userId ?? '';

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const peerId = params.get('with');
    if (peerId) {
      this.store.openConversation(peerId, params.get('name') ?? peerId);
    }
    this.store.connect();
  }

  open(id: string): void {
    this.store.openConversation(id);
  }

  send(): void {
    this.store.send(this.draft);
    this.draft = '';
  }
}
