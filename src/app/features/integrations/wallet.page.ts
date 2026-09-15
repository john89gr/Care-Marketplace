import { Component, inject, OnInit, signal, computed, effect } from '@angular/core';
import { WalletStore, WalletDocument, WalletCategory, WALLET_CATEGORIES } from './wallet.store';
import { SessionStore } from '../../core/auth/session';
import { I18n } from '../../core/i18n/i18n.service';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Gov.gr Health Wallet page (FEATURE_PLAN.md §15 subtask 9): document cards
 * grouped by category tabs, with a modal viewer that renders PDFs and images
 * via object URLs (never cached in localStorage, subtask 11).
 */
@Component({
  selector: 'app-wallet',
  standalone: true,
  template: `
    <section class="wallet" [attr.aria-busy]="store.syncState() === 'syncing'">
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('wallet.title') }}</h1>
          <p class="page-subtitle">{{ statusText() }}</p>
        </div>
        <div class="page-actions">
          @if (isVerifiedViaGovGr()) {
            <span class="badge success" [attr.title]="i18n.t('wallet.govGrVerifiedTitle')">
              <span class="dot"></span>{{ i18n.t('wallet.govGrVerified') }}
            </span>
          } @else {
            <span class="badge outline" [attr.title]="i18n.t('wallet.emailVerifiedTitle')">
              {{ i18n.t('wallet.emailVerified') }}
            </span>
          }
          <button
            type="button"
            class="btn secondary"
            [disabled]="store.syncState() === 'syncing'"
            (click)="syncAll()"
          >
            {{ store.syncState() === 'syncing' ? i18n.t('wallet.syncing') : i18n.t('wallet.refreshAll') }}
          </button>
        </div>
      </header>

      @if (store.error()) {
        <p class="error" role="alert">{{ i18n.message(store.errorSource(), store.error()) }}</p>
      }

      <!-- Category tabs -->
      <nav class="tabs" role="tablist">
        @for (cat of WALLET_CATEGORIES; track cat) {
          <button
            type="button"
            class="tab"
            role="tab"
            [attr.aria-selected]="activeCategory() === cat"
            [class.active]="activeCategory() === cat"
            [disabled]="store.syncState() === 'syncing'"
            (click)="activeCategory.set(cat)"
          >
            {{ categoryLabel(cat) }}
            <span class="badge">{{ store.counts()[cat] }}</span>
          </button>
        }
      </nav>

      <!-- Document cards for the active category -->
      @if (store.syncState() === 'syncing' && !store.loaded()) {
        <div class="grid grid-auto" aria-hidden="true">
          <div class="skeleton block"></div>
          <div class="skeleton block"></div>
          <div class="skeleton block"></div>
        </div>
      } @else {
        <ul class="card-grid grid grid-auto" role="tabpanel">
          @for (doc of store.docsFor(activeCategory()); track doc.id) {
            <li class="doc-card card interactive">
              <button
                type="button"
                class="doc-inner"
                (click)="openViewer(doc)"
                [attr.aria-label]="i18n.t('wallet.view', { title: doc.title })"
              >
                <span class="icon-bubble lg" aria-hidden="true">{{ docTypeIcon(doc.docType) }}</span>
                <span class="doc-info">
                  <span class="doc-title">{{ doc.title }}</span>
                  <span class="issuer">{{ doc.issuer }}</span>
                  <span class="meta">
                    {{ i18n.t('wallet.issued', { date: formatDate(doc.issuedAtMs) }) }}
                    @if (doc.expiresAtMs) {
                      {{ i18n.t('wallet.expires', { date: formatDate(doc.expiresAtMs) }) }}
                    }
                  </span>
                </span>
                @if (doc.verified) {
                  <span class="verified" [attr.title]="i18n.t('wallet.docVerified')" aria-hidden="true">✅</span>
                }
              </button>
            </li>
          } @empty {
            <li class="empty">
              <div class="empty-state">
                <span class="empty-icon" aria-hidden="true">🗄️</span>
                <p>{{ i18n.t('wallet.empty') }}</p>
              </div>
            </li>
          }
        </ul>
      }
    </section>

    <!-- Modal viewer: PDF or image via object URL -->
    @if (viewerDoc()) {
      <div class="overlay" role="presentation" (click)="closeViewer()">
        <div
          class="modal"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="viewerDoc()!.title"
          (click)="$event.stopPropagation()"
        >
          <div class="modal-head">
            <div>
              <h3 class="card-title">{{ viewerDoc()!.title }}</h3>
              <p class="meta">{{ viewerDoc()!.issuer }} · {{ formatDate(viewerDoc()!.issuedAtMs) }}</p>
            </div>
            <button
              type="button"
              class="icon-btn close"
              (click)="closeViewer()"
              [attr.aria-label]="i18n.t('common.close')"
            >
              ✕
            </button>
          </div>
          <div class="modal-body">
            @if (viewerUrl()) {
              @if (viewerDoc()!.docType === 'pdf') {
                <iframe
                  [src]="viewerUrl()"
                  title="{{ viewerDoc()!.title }}"
                  width="100%"
                  height="600"
                ></iframe>
              } @else {
                <img [src]="viewerUrl()" [alt]="viewerDoc()!.title" />
              }
            }
          </div>
          <div class="modal-actions">
            <button type="button" class="btn" (click)="download(viewerDoc()!)">
              {{ i18n.t('wallet.download') }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .tabs {
      margin-bottom: var(--space-4);
    }
    .tab .badge {
      margin-left: var(--space-2);
    }
    .card-grid {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .doc-card {
      padding: 0;
      overflow: hidden;
    }
    .doc-inner {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      width: 100%;
      padding: var(--space-4);
      background: transparent;
      border: none;
      box-shadow: none;
      color: inherit;
      text-align: left;
      position: relative;
    }
    .doc-inner:hover:not(:disabled) {
      background: var(--surface-raised);
    }
    .doc-info {
      display: grid;
      gap: 0.2rem;
      min-width: 0;
    }
    .doc-title {
      font-weight: var(--weight-semibold);
      font-size: var(--text-md);
    }
    .issuer {
      color: var(--text-muted);
      font-size: var(--text-sm);
    }
    .doc-info .meta {
      font-size: var(--text-xs);
    }
    .verified {
      position: absolute;
      top: var(--space-3);
      right: var(--space-3);
      font-size: var(--text-sm);
    }
    .empty {
      grid-column: 1 / -1;
    }
    .overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4);
      background: var(--scrim);
      backdrop-filter: blur(4px);
      animation: page-enter var(--dur) var(--ease) both;
    }
    .modal {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      width: min(56rem, 100%);
      max-height: 90vh;
      padding: var(--space-4) var(--space-5) var(--space-5);
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-xl);
      overflow: auto;
    }
    .modal-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3);
    }
    .modal-head .card-title {
      margin: 0;
    }
    .modal-head .meta {
      margin: 0;
    }
    .close {
      flex: none;
    }
    .modal-body iframe {
      display: block;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface-raised);
    }
    .modal-body img {
      display: block;
      max-width: 100%;
      border-radius: var(--radius-md);
      border: 1px solid var(--border);
    }
    .modal-actions {
      display: flex;
      justify-content: flex-end;
    }
  `,
})
export class WalletPage implements OnInit {
  protected readonly i18n = inject(I18n);

  readonly store = inject(WalletStore);
  private readonly session = inject(SessionStore);

  /** Category order for the tab bar (stable feature-list ordering). */
  protected readonly WALLET_CATEGORIES = WALLET_CATEGORIES;

  readonly activeCategory = signal<WalletCategory>('vaccinations');

  readonly viewerDoc = signal<WalletDocument | null>(null);
  private readonly _objectUrls = signal<string[]>([]);

  readonly categoryLabel = (cat: WalletCategory): string => {
    const keys: Record<WalletCategory, string> = {
      vaccinations: 'wallet.category.vaccinations',
      prescriptions: 'wallet.category.prescriptions',
      exams: 'wallet.category.exams',
      kepa_certificates: 'wallet.category.kepa',
    };
    return this.i18n.t(keys[cat] ?? cat);
  };

  readonly docTypeIcon = (type: 'pdf' | 'image'): string => (type === 'pdf' ? '📄' : '🖼️');

  readonly isVerifiedViaGovGr = computed(() => this.session.isVerifiedViaGovGr());

  /** Status line: sync age + overall state, in the active language. */
  readonly statusText = computed(() => {
    const state = this.store.syncState();
    return this.i18n.t('wallet.synced', {
      age: this.syncAgeLabel(this.store.syncAgeMs(this.activeCategory())),
      state:
        state === 'syncing'
          ? this.i18n.t('wallet.stateSyncing')
          : state === 'error'
            ? this.i18n.t('wallet.stateError')
            : this.i18n.t('wallet.stateUpToDate'),
    });
  });

  /** "2 h ago" style sync age. */
  private syncAgeLabel(ms: number): string {
    if (ms < 0) {
      return this.i18n.t('wallet.ageNever');
    }
    const minutes = Math.floor(ms / 60000);
    if (minutes < 1) {
      return this.i18n.t('wallet.ageJustNow');
    }
    if (minutes < 60) {
      return this.i18n.t('wallet.ageMinutes', { n: minutes });
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return this.i18n.t('wallet.ageHours', { n: hours });
    }
    return this.i18n.t('wallet.ageDays', { count: Math.floor(hours / 24) });
  }

  readonly viewerUrl = computed(() => {
    const doc = this.viewerDoc();
    if (!doc) return '';
    const url = URL.createObjectURL(this._dataUrlToBlob(doc.dataUrl, doc.docType));
    this._objectUrls.update((urls) => [...urls, url]);
    return url;
  });

  ngOnInit(): void {
    this.store.sync();
  }

  syncAll(): void {
    this.store.sync().subscribe();
  }

  openViewer(doc: WalletDocument): void {
    this.viewerDoc.set(doc);
  }

  closeViewer(): void {
    this._revokeUrls();
    this.viewerDoc.set(null);
  }

  download(doc: WalletDocument): void {
    const link = document.createElement('a');
    link.href = doc.dataUrl;
    link.download = `${doc.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${doc.docType === 'pdf' ? 'pdf' : 'png'}`;
    link.click();
  }

  private _dataUrlToBlob(dataUrl: string, docType: 'pdf' | 'image'): Blob {
    const [header, base64] = dataUrl.split(',');
    const mime = docType === 'pdf' ? 'application/pdf' : 'image/png';
    const byteChars = atob(base64 ?? '');
    const byteArr = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteArr[i] = byteChars.charCodeAt(i);
    }
    return new Blob([byteArr], { type: mime });
  }

  private _revokeUrls(): void {
    for (const url of this._objectUrls()) {
      URL.revokeObjectURL(url);
    }
    this._objectUrls.set([]);
  }

  formatDate(ms: number): string {
    return formatDate(ms);
  }
}
