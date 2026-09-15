import { Component, computed, inject, OnInit } from '@angular/core';
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
        <div>
          <h1 class="page-title">{{ i18n.t('chat.title') }}</h1>
          <p class="page-subtitle">{{ i18n.t('chat.subtitle') }}</p>
        </div>
      </header>

      <div class="chat-layout">
        <aside class="chat-list card" [attr.aria-label]="i18n.t('chat.conversations')">
          <p class="list-label">{{ i18n.t('chat.conversations') }}</p>
          @if (conversations().length === 0) {
            <div class="empty-state">
              <span class="empty-icon" aria-hidden="true">💬</span>
              <p>{{ i18n.t('chat.empty') }}</p>
            </div>
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
                    <span class="avatar soft conv-avatar" aria-hidden="true">{{ initials(conv.displayName) }}</span>
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
            <div class="empty-state thread-empty">
              <span class="empty-icon" aria-hidden="true">💬</span>
              <p>{{ i18n.t('chat.selectPrompt') }}</p>
            </div>
          } @else {
            <div class="thread-head">
              <span class="avatar soft" aria-hidden="true">{{ initials(activeName()) }}</span>
              <span class="thread-name">{{ activeName() }}</span>
            </div>

            <div class="messages" aria-live="polite">
              @for (msg of activeMessages(); track msg.id) {
                <p class="msg" [class.mine]="msg.authorId === myId()" [class.failed]="msg.status === 'failed'">
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
      grid-template-columns: 17rem minmax(0, 1fr);
      gap: var(--space-4);
      align-items: start;
    }
    @media (max-width: 52rem) {
      .chat-layout {
        grid-template-columns: 1fr;
      }
    }
    .chat-list {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-3);
      position: sticky;
      top: calc(var(--topbar-height) + var(--space-4));
      max-height: calc(100dvh - var(--topbar-height) - var(--space-7));
      overflow-y: auto;
    }
    .list-label {
      margin: 0 0 var(--space-1);
      padding: 0 var(--space-2);
      font-size: var(--text-xs);
      font-weight: var(--weight-bold);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-subtle);
    }
    .chat-list .list {
      display: grid;
      gap: 2px;
    }
    .chat-list .conv {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      width: 100%;
      padding: 0.5rem 0.6rem;
      border-radius: var(--radius-md);
      text-align: left;
      color: var(--text);
      background: transparent;
      border: 1px solid transparent;
      cursor: pointer;
      font: inherit;
      box-shadow: none;
      transition:
        background-color var(--dur-fast) ease,
        border-color var(--dur-fast) ease;
    }
    .chat-list .conv:hover {
      background: var(--surface-raised);
      border-color: var(--border);
    }
    .chat-list .conv.active {
      background: var(--accent-soft);
      border-color: color-mix(in srgb, var(--accent) 45%, transparent);
      font-weight: var(--weight-semibold);
    }
    .conv-avatar {
      width: 1.9rem;
      height: 1.9rem;
      font-size: 0.7rem;
    }
    .name {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chat-thread {
      display: grid;
      gap: var(--space-3);
      min-height: 26rem;
      align-content: start;
    }
    .thread-empty {
      align-self: center;
      border: none;
      background: transparent;
    }
    .thread-head {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding-bottom: var(--space-3);
      border-bottom: 1px solid var(--border);
    }
    .thread-name {
      font-weight: var(--weight-semibold);
    }
    .messages {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      max-height: 26rem;
      overflow-y: auto;
      padding: var(--space-3);
      border-radius: var(--radius-md);
      background: var(--surface-raised);
    }
    .msg {
      align-self: flex-start;
      max-width: 75%;
      margin: 0;
      padding: 0.5rem 0.75rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      border-bottom-left-radius: var(--radius-xs);
      box-shadow: var(--shadow-xs);
      overflow-wrap: anywhere;
    }
    .msg.mine {
      align-self: flex-end;
      background: var(--accent-grad);
      border-color: transparent;
      color: var(--accent-contrast);
      border-radius: var(--radius-lg);
      border-bottom-right-radius: var(--radius-xs);
    }
    .msg.mine .meta {
      color: color-mix(in srgb, var(--accent-contrast) 78%, transparent);
    }
    .msg.failed {
      border-color: var(--danger);
      background: var(--danger-soft);
      color: var(--danger);
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
      padding-top: var(--space-3);
      border-top: 1px solid var(--border);
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

  /** Display name of the open conversation (thread header). */
  readonly activeName = computed(() => {
    const id = this.activeId();
    return this.conversations().find((c) => c.id === id)?.displayName ?? '';
  });

  /** Initials for a conversation avatar (decorative). */
  initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

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
