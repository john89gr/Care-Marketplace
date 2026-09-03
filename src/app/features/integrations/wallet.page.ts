import { Component, inject, OnInit, signal, computed, effect } from '@angular/core';
import { WalletStore, WalletDocument, WalletCategory, WALLET_CATEGORIES } from './wallet.store';
import { SessionStore } from '../../core/auth/session';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatSyncAge(ms: number): string {
  if (ms < 0) return 'never';
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
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

      <header class="wallet-header">
        <h1>Health Wallet</h1>
        @if (store.isVerifiedViaGovGr()) {
          <span class="verified-chip" title="Identity verified via Gov.gr">
            ✅ Verified via Gov.gr
          </span>
        } @else {
          <span class="unverified-chip" title="Verified via email only">
            Email verified
          </span>
        }
      </header>

      <div class="toolbar">
        <button
          type="button"
          class="secondary"
          [disabled]="store.syncState() === 'syncing'"
          (click)="syncAll()"
        >
          {{ store.syncState() === 'syncing' ? 'Syncing…' : 'Refresh all' }}
        </button>
        <span class="meta">{{ statusText() }}</span>
      </div>

      @if (store.error()) {
        <p class="error" role="alert">{{ store.error() }}</p>
      }

      <!-- Category tabs -->
      <nav class="tabs" role="tablist">
        @for (cat of WALLET_CATEGORIES; track cat) {
          <button
            type="button"
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
        <p>Loading…</p>
      } @else {
        <ul class="card-grid" role="tabpanel">
          @for (doc of store.docsFor(activeCategory()); track doc.id) {
            <li class="doc-card">
              <button
                type="button"
                class="card-inner"
                (click)="openViewer(doc)"
                [attr.aria-label]="'View ' + doc.title"
              >
                <span class="doc-icon">{{ docTypeIcon(doc.docType) }}</span>
                <div class="doc-info">
                  <h3>{{ doc.title }}</h3>
                  <p class="issuer">{{ doc.issuer }}</p>
                  <p class="meta">
                    Issued {{ formatDate(doc.issuedAtMs) }}
                    @if (doc.expiresAtMs) {
                      · Expires {{ formatDate(doc.expiresAtMs) }}
                    }
                  </p>
                </div>
                @if (doc.verified) {
                  <span class="verified" title="Gov.gr verified">✅</span>
                }
              </button>
            </li>
          }
          @empty {
            <li class="empty">No documents in this category.</li>
          }
        </ul>
      }
    </section>

    <!-- Modal viewer: PDF or image via object URL -->
    @if (viewerDoc()) {
      <div class="overlay" (click)="closeViewer()" role="button" tabindex="0">
        <div class="modal" (click)="$event.stopPropagation()">
          <button type="button" class="close" (click)="closeViewer()" aria-label="Close">×</button>
          <h3>{{ viewerDoc()!.title }}</h3>
          <p class="meta">{{ viewerDoc()!.issuer }} · {{ formatDate(viewerDoc()!.issuedAtMs) }}</p>
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
          <div class="actions">
            <button type="button" (click)="download(viewerDoc()!)">Download</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    .wallet { max-width: 72rem; display: grid; gap: 1rem; }
    .wallet-header { display: flex; align-items: center; gap: 1rem; }
    .verified-chip, .unverified-chip {
      padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.85rem;
    }
    .verified-chip { background: color-mix(in srgb, var(--success) 15%, transparent); color: var(--success); }
    .unverified-chip { background: var(--surface); border: 1px solid var(--border); color: var(--text-muted); }
    .toolbar { display: flex; align-items: center; gap: 0.75rem; }
    button.secondary { background: var(--surface); border: 1px solid var(--border); }
    .meta { color: var(--text-muted); font-size: 0.85rem; margin-left: auto; }
    .error { color: var(--danger); }
    .tabs { display: flex; gap: 0.25rem; border-bottom: 1px solid var(--border); }
    .tabs button {
      padding: 0.5rem 1rem; border: none; border-bottom: 2px solid transparent;
      cursor: pointer; font-size: 0.9rem;
    }
    .tabs button.active { border-bottom-color: var(--accent); font-weight: 600; }
    .tabs button:disabled { opacity: 0.5; cursor: not-allowed; }
    .tabs .badge { margin-left: 0.25rem; font-size: 0.8rem; color: var(--text-muted); }
    .card-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 1rem; list-style: none; padding: 0; margin: 0;
    }
    .doc-card { border: 1px solid var(--border); border-radius: 0.75rem; padding: 0; }
    .card-inner {
      display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-start;
      width: 100%; padding: 1rem; background: var(--surface); border: none; cursor: pointer;
      text-align: left;
    }
    .card-inner:hover { background: var(--surface-hover, var(--surface)); }
    .doc-icon { font-size: 1.75rem; }
    .doc-info h3 { font-size: 1rem; margin: 0; }
    .issuer { color: var(--text-muted); font-size: 0.85rem; margin: 0; }
    .verified { font-size: 1rem; }
    .empty { padding: 2rem; text-align: center; color: var(--text-muted); grid-column: 1 / -1; }
    .overlay {
      position: fixed; inset: 0; background: color-mix(in srgb, var(--bg) 60%, transparent);
      display: flex; align-items: center; justify-content: center; z-index: 1000;
    }
    .modal {
      background: var(--surface); border-radius: 0.75rem; padding: 1.5rem;
      max-width: 90vw; max-height: 90vh; overflow: auto; position: relative;
    }
    .close { position: absolute; top: 0.5rem; right: 0.75rem; background: none; border: none; font-size: 1.5rem; cursor: pointer; }
    iframe { border: 1px solid var(--border); border-radius: 0.5rem; }
    img { max-width: 100%; border-radius: 0.5rem; border: 1px solid var(--border); }
    .actions { margin-top: 1rem; }
  `,
})
export class WalletPage implements OnInit {
  readonly store = inject(WalletStore);
  private readonly session = inject(SessionStore);

  readonly activeCategory = signal<WalletCategory>('vaccinations');

  readonly viewerDoc = signal<WalletDocument | null>(null);
  private readonly _objectUrls = signal<string[]>([]);

  readonly categoryLabel = (cat: WalletCategory): string => {
    const labels: Record<WalletCategory, string> = {
      vaccinations: 'Vaccinations',
      prescriptions: 'Prescriptions',
      exams: 'Exams',
      kepa_certificates: 'KEPA Certificates',
    };
    return labels[cat] ?? cat;
  };

  readonly docTypeIcon = (type: 'pdf' | 'image'): string => (type === 'pdf' ? '📄' : '🖼️');

  readonly isVerifiedViaGovGr = computed(() => this.session.isVerifiedViaGovGr());

  /** Status line: sync age + overall state. */
  readonly statusText = computed(() => {
    const age = this.store.syncAgeMs(this.activeCategory());
    const state = this.store.syncState();
    return `Synced ${formatSyncAge(age)} · ${state === 'syncing' ? 'syncing…' : state === 'error' ? 'error' : 'up to date'}`;
  });

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
