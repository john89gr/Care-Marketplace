import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ChatStore } from './chat.store';
import { SessionStore } from '../../core/auth/session';
import { I18n } from '../../core/i18n/i18n.service';

/**
 * Caregiver chat (FEATURE_PLAN.md §6). Two-pane layout: conversation list on
 * the left, thread + composer on the right; messages acknowledge optimistically
 * and roll back to a "not delivered" marker if the socket drops.
 *
 * Bilingual. Load-bearing for the E2E suite: the conversation button carries the
 * `conv` class and gains `active` when selected, and the composer placeholder is
 * the chat input's only label, so both are kept verbatim.
 */
@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="chat">
      <header class="page-header">
        <h1 class="page-title">{{ i18n.t('chat.title') }}</h1>
        <p class="page-subtitle">{{ i18n.t('chat.subtitle') }}</p>
      </header>

      <div class="chat-layout">
        <aside class="chat-list" [attr.aria-label]="i18n.t('chat.conversations')">
          @if (conversations().length === 0) {
            <p class="empty-state">{{ i18n.t('chat.empty') }}</p>
          } @else {
            <ul class="list">
              @for (conv of conversations(); track conv.id) {
                <li>
                  <button
                    type="button"
                    class="conv"
                    (click)="open(conv.id)"
                    [class.active]="conv.id === activeId()"
                    [attr.aria-current]="conv.id === activeId() ? 'true' : null"
                  >
                    <span class="name">{{ conv.displayName }}</span>
                    @if (conv.unread > 0) {
                      <span class="badge accent" [attr.aria-label]="i18n.t('chat.unread', { count: conv.unread })">
                        {{ conv.unread }}
                      </span>
                    }
                  </button>
                </li>
              }
            </ul>
          }
        </aside>

        <div class="chat-thread card">
          @if (activeId() === null) {
            <p class="empty-state">{{ i18n.t('chat.selectPrompt') }}</p>
          } @else {
            <div class="messages" aria-live="polite">
              @for (msg of activeMessages(); track msg.id) {
                <p class="msg" [class.mine]="msg.authorId === myId()">
                  {{ msg.text }}
                  <span class="meta">
                    @if (msg.status === 'failed') {
                      {{ i18n.t('chat.notDelivered') }}
                    } @else if (msg.status === 'sending') {
                      {{ i18n.t('chat.sending') }}
                    }
                  </span>
                </p>
              }
            </div>

            @if (store.sendError()) {
              <p class="error" role="alert">
                {{ i18n.message(store.sendErrorSource(), store.sendError()) }}
              </p>
            }

            <form class="composer" (ngSubmit)="send()">
              <label class="field">
                <span class="visually-hidden">{{ i18n.t('chat.messageLabel') }}</span>
                <input
                  type="text"
                  [(ngModel)]="draft"
                  name="message"
                  [attr.placeholder]="i18n.t('chat.placeholder')"
                  autocomplete="off"
                />
              </label>
              <button type="submit" class="btn" [disabled]="!draft.trim()">
                {{ i18n.t('chat.send') }}
              </button>
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
      gap: var(--space-4);
      align-items: start;
    }
    @media (max-width: 48rem) {
      .chat-layout {
        grid-template-columns: 1fr;
      }
    }
    .chat-list .list {
      display: grid;
      gap: var(--space-1);
    }
    .chat-list .conv {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-2);
      width: 100%;
      padding: 0.6rem 0.8rem;
      border-radius: var(--radius-md);
      text-align: left;
      color: var(--text);
      background: var(--surface);
      border: 1px solid var(--border);
      cursor: pointer;
      font: inherit;
    }
    .chat-list .conv:hover {
      border-color: var(--accent);
    }
    .chat-list .conv.active {
      border-color: var(--accent);
      background: var(--accent-soft);
      font-weight: var(--weight-semibold);
    }
    .chat-thread {
      display: grid;
      gap: var(--space-3);
    }
    .messages {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      max-height: 24rem;
      overflow-y: auto;
      padding: var(--space-3);
      background: var(--surface-raised);
      border-radius: var(--radius-md);
    }
    .msg {
      align-self: flex-start;
      max-width: 75%;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 0.45rem 0.7rem;
      margin: 0;
    }
    .msg.mine {
      align-self: flex-end;
      background: var(--accent-soft);
      border-color: var(--accent);
    }
    .msg .meta {
      display: block;
      font-size: var(--text-xs);
      color: var(--text-muted);
    }
    .composer {
      display: flex;
      align-items: flex-end;
      gap: var(--space-2);
      max-width: none;
    }
    .composer .field {
      flex: 1;
    }
  `,
})
export class ChatPage implements OnInit {
  readonly store = inject(ChatStore);
  protected readonly i18n = inject(I18n);
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
