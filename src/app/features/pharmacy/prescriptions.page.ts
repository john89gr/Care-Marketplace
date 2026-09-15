/**
 * Prescription scan page (FEATURE_PLAN.md §9 subtasks 5, 8, 13–14, 18):
 * camera scan via the BarcodeDetector API (progressive enhancement) with a
 * fully keyboard-operable manual-entry fallback, parsed-meds confirmation,
 * delivery-address override (prefilled from the profile), and retry on
 * unreadable barcodes / routing failures.
 */
import { Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PrescriptionsStore } from './prescriptions.store';
import { OrdersStore } from './orders.store';
import { ProfileStore } from '../profiles/profile.store';
import { GeolocationService } from '../../core/services/geo/geolocation.service';
import {
  addressFromProfile,
  statusLabel as statusLabelFor,
  type PharmacyOrderStatus,
} from './pharmacy.models';
import {
  BarcodeParseError,
  UNKNOWN_PRESCRIBER,
  parseBarcodePayload,
  type ParsedPrescriptionPayload,
} from './barcode';
import { I18n, TranslatableMessage } from '../../core/i18n/i18n.service';

/** Minimal shape of the browser BarcodeDetector API (not in all TS libs). */
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource | Blob | ImageData): Promise<Array<{ rawValue: string }>>;
}

function detectorConstructor(): (new () => BarcodeDetectorLike) | null {
  const candidate = (window as unknown as Record<string, unknown>)['BarcodeDetector'];
  return typeof candidate === 'function' ? (candidate as new () => BarcodeDetectorLike) : null;
}

@Component({
  selector: 'app-prescriptions',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="prescriptions">
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('pharmacy.scanTitle') }}</h1>
          <p class="page-subtitle">{{ i18n.t('pharmacy.scanIntro') }}</p>
        </div>
      </header>

      <div class="scan-grid">
        <div class="card scan-form">
          <div class="step">
            <h2 class="section-title">
              <span class="step-num" aria-hidden="true">1</span>
              {{ i18n.t('pharmacy.step1') }}
            </h2>
            @if (detectorAvailable) {
              <div class="camera">
                @if (!cameraOn()) {
                  <button type="button" class="btn secondary" (click)="startCamera()">
                    {{ i18n.t('pharmacy.startCamera') }}
                  </button>
                } @else {
                  <button type="button" class="btn secondary" (click)="stopCamera()">
                    {{ i18n.t('pharmacy.stopCamera') }}
                  </button>
                }
                @if (cameraError()) {
                  <p class="error" role="alert">{{ i18n.message(cameraError(), '') }}</p>
                }
                <video
                  #video
                  playsinline
                  muted
                  [hidden]="!cameraOn()"
                  [attr.aria-label]="i18n.t('pharmacy.cameraPreview')"
                ></video>
              </div>
            } @else {
              <p class="alert info" role="note">
                <span class="alert-icon" aria-hidden="true">ℹ️</span>
                <span>{{ i18n.t('pharmacy.noCamera') }}</span>
              </p>
            }
          </div>

          <div class="step">
            <h2 class="section-title">
              <span class="step-num" aria-hidden="true">2</span>
              <label for="rx-code">{{ i18n.t('pharmacy.step2') }}</label>
            </h2>
            <textarea
              id="rx-code"
              #codeInput
              rows="4"
              [value]="code()"
              (input)="onCodeInput($any($event.target).value)"
              [attr.placeholder]="i18n.t('pharmacy.codePlaceholder')"
              aria-describedby="rx-code-help"
            ></textarea>
            <p class="section-hint" id="rx-code-help">{{ i18n.t('pharmacy.codeHelp') }}</p>
          </div>

          <div class="fields">
            <label class="field">
              <span class="field-label">{{ i18n.t('pharmacy.prescriber') }}</span>
              <input
                type="text"
                [value]="prescriberOverride()"
                (input)="prescriberOverride.set($any($event.target).value)"
                autocomplete="off"
              />
            </label>
            <label class="field">
              <span class="field-label">{{ i18n.t('pharmacy.deliveryAddress') }}</span>
              <input
                type="text"
                [value]="deliveryAddress()"
                (input)="deliveryAddress.set($any($event.target).value)"
                autocomplete="street-address"
              />
            </label>
          </div>

          @if (previewError()) {
            <p class="alert warning" role="status">
              <span class="alert-icon" aria-hidden="true">⚠️</span>
              <span>{{ i18n.message(previewError(), '') }}</span>
            </p>
          }

          <div class="card-actions">
            <button type="button" class="btn" (click)="submit()" [disabled]="store.scanning() || !code().trim()">
              {{ store.scanning() ? i18n.t('pharmacy.submitting') : i18n.t('pharmacy.submit') }}
            </button>
          </div>

          @if (store.error()) {
            <p class="alert danger" role="alert">
              <span class="alert-icon" aria-hidden="true">⚠️</span>
              <span>
                {{ i18n.message(store.errorSource(), store.error()) }}
                <button type="button" class="link" (click)="retry()">
                  {{ i18n.t('pharmacy.tryAgain') }}
                </button>
              </span>
            </p>
          }
        </div>

        <div class="scan-side">
          @if (preview()) {
            <div class="card preview">
              <h3 class="card-title">{{ i18n.t('pharmacy.parsedTitle') }}</h3>
              <p class="meta">
                {{ i18n.t('pharmacy.prescriberLabel', { name: prescriberText() }) }}
              </p>
              <ul class="med-list">
                @for (med of preview()!.meds; track med.name) {
                  <li>
                    <span class="med-name">{{ med.name }}</span>
                    <span class="med-dose">
                      {{ med.dose || i18n.t('pharmacy.doseAsDirected') }} × {{ med.qty }}
                    </span>
                  </li>
                }
              </ul>
            </div>
          }

          @if (store.lastResult()) {
            <div class="card result">
              <div class="result-head">
                <span class="icon-bubble" aria-hidden="true">✅</span>
                <h3 tabindex="-1" class="card-title" #resultHeading>{{ i18n.t('pharmacy.confirmed') }}</h3>
              </div>
              <p aria-live="polite" class="result-status">
                @if (store.lastResult()!.order.status === 'failed') {
                  {{ i18n.t('pharmacy.routingFailed') }}
                  <button type="button" class="btn secondary sm" (click)="submit()">
                    {{ i18n.t('pharmacy.retryRouting') }}
                  </button>
                } @else {
                  {{
                    i18n.t('pharmacy.routedTo', {
                      name: store.lastResult()!.order.pharmacyName ?? '',
                      status: statusLabel(store.lastResult()!.order.status),
                    })
                  }}
                }
              </p>
              <ul class="med-list">
                @for (med of store.lastResult()!.prescription.meds; track med.name) {
                  <li>
                    <span class="med-name">{{ med.name }}</span>
                    <span class="med-dose">
                      {{ med.dose || i18n.t('pharmacy.doseAsDirected') }} × {{ med.qty }}
                    </span>
                  </li>
                }
              </ul>
              <a routerLink="/pharmacy-orders">{{ i18n.t('pharmacy.trackOrders') }} →</a>
            </div>
          }

          @if (!preview() && !store.lastResult()) {
            <div class="card side-hint">
              <span class="icon-bubble lg" aria-hidden="true">📄</span>
              <p class="meta">{{ i18n.t('pharmacy.codeHelp') }}</p>
            </div>
          }
        </div>
      </div>
    </section>
  `,
  styles: `
    .scan-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.4fr) minmax(16rem, 1fr);
      gap: var(--space-4);
      align-items: start;
    }
    @media (max-width: 52rem) {
      .scan-grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .scan-form {
      display: grid;
      gap: var(--space-5);
    }
    .step {
      display: grid;
      gap: var(--space-2);
    }
    .step .section-title {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin: 0;
    }
    .step .section-title label {
      font: inherit;
      color: inherit;
      cursor: pointer;
    }
    .step-num {
      display: grid;
      place-items: center;
      flex: none;
      width: 1.6rem;
      height: 1.6rem;
      border-radius: var(--radius-full);
      background: var(--accent-grad);
      color: var(--accent-contrast);
      font-size: var(--text-xs);
      font-weight: var(--weight-bold);
    }
    .camera {
      display: grid;
      gap: var(--space-2);
      justify-items: start;
    }
    video {
      width: 100%;
      max-width: 24rem;
      border-radius: var(--radius-md);
      background: #000;
    }
    .fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
      gap: var(--space-3);
    }
    .card-actions {
      margin-top: 0;
      padding-top: var(--space-3);
      border-top: 1px solid var(--border);
    }
    .scan-side {
      display: grid;
      gap: var(--space-4);
      position: sticky;
      top: calc(var(--topbar-height) + var(--space-4));
    }
    .med-list {
      list-style: none;
      margin: var(--space-3) 0;
      padding: 0;
      display: grid;
      gap: var(--space-1);
    }
    .med-list li {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--space-3);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-sm);
      background: var(--surface-raised);
      font-size: var(--text-sm);
    }
    .med-name {
      font-weight: var(--weight-semibold);
    }
    .med-dose {
      color: var(--text-muted);
      white-space: nowrap;
    }
    .result {
      border-color: color-mix(in srgb, var(--success) 55%, transparent);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--success) 25%, transparent);
    }
    .result-head {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .result-status {
      margin: var(--space-3) 0 0;
    }
    .side-hint {
      display: grid;
      justify-items: center;
      text-align: center;
      gap: var(--space-2);
      border-style: dashed;
      box-shadow: none;
    }
  `,
})
export class PrescriptionsPage implements OnDestroy {
  protected readonly i18n = inject(I18n);

  readonly store = inject(PrescriptionsStore);
  private readonly orders = inject(OrdersStore);
  private readonly profile = inject(ProfileStore);
  private readonly geo = inject(GeolocationService);

  @ViewChild('video') private videoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('codeInput') private codeInputRef?: ElementRef<HTMLTextAreaElement>;
  @ViewChild('resultHeading') private resultHeadingRef?: ElementRef<HTMLHeadingElement>;

  readonly detectorAvailable = detectorConstructor() !== null;
  readonly code = signal('');
  readonly prescriberOverride = signal('');
  readonly deliveryAddress = signal('');
  readonly preview = signal<ParsedPrescriptionPayload | null>(null);
  readonly previewError = signal<TranslatableMessage | null>(null);
  readonly cameraOn = signal(false);
  /** Bilingual failure slots: an app key, or `null` when there is none. */
  readonly cameraError = signal<TranslatableMessage | null>(null);

  /** Pipeline status in the active language. */
  statusLabel(status: PharmacyOrderStatus): string {
    return statusLabelFor(status, this.i18n.language());
  }

  /** Prescriber line: the parser's "unknown" placeholder is translatable. */
  prescriberText(): string {
    const prescriber = this.prescriberOverride() || this.preview()?.prescriber || '';
    return prescriber === UNKNOWN_PRESCRIBER ? this.i18n.t('pharmacy.unknownPrescriber') : prescriber;
  }

  private stream: MediaStream | null = null;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private origin: { lat: number; lng: number } | null = null;

  constructor() {
    // Prefill the delivery address from the profile (subtask 14); the field
    // stays editable as a per-order override.
    this.profile.load().subscribe(() => {
      if (!this.deliveryAddress()) {
        this.deliveryAddress.set(addressFromProfile(this.profile.profile()));
      }
    });
    // Best-effort origin for nearest-with-stock routing (server defaults to
    // the city centre when unavailable).
    this.geo.currentPosition().subscribe({
      next: (point) => {
        this.origin = { lat: point.lat, lng: point.lng };
      },
      error: () => {
        this.origin = null;
      },
    });
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }

  onCodeInput(value: string): void {
    this.code.set(value);
    this.store.clearError();
    if (!value.trim()) {
      this.preview.set(null);
      this.previewError.set(null);
      return;
    }
    try {
      this.preview.set(parseBarcodePayload(value));
      this.previewError.set(null);
    } catch (error) {
      this.preview.set(null);
      this.previewError.set(
        error instanceof BarcodeParseError
          ? { key: error.errorKey }
          : { key: 'pharmacy.error.unreadableYet' }
      );
    }
  }

  submit(): void {
    const barcode = this.code().trim();
    if (!barcode || this.store.scanning()) {
      return;
    }
    this.store
      .scanBarcode({
        barcode,
        prescriber: this.prescriberOverride().trim() || undefined,
        deliveryAddress: this.deliveryAddress().trim(),
        ...(this.origin ? { lat: this.origin.lat, lng: this.origin.lng } : {}),
      })
      .subscribe((ok) => {
        if (ok) {
          const result = this.store.lastResult();
          if (result) {
            this.orders.upsert(result.order);
          }
          queueMicrotask(() => this.resultHeadingRef?.nativeElement.focus());
        }
      });
  }

  retry(): void {
    this.store.clearError();
    this.codeInputRef?.nativeElement.focus();
  }

  async startCamera(): Promise<void> {
    const Ctor = detectorConstructor();
    if (!Ctor) {
      this.cameraError.set({ key: 'pharmacy.error.noDetector' });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.cameraError.set({ key: 'pharmacy.error.noCameraDevice' });
      return;
    }
    this.cameraError.set(null);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
    } catch {
      this.cameraError.set({ key: 'pharmacy.error.cameraDenied' });
      return;
    }
    const video = this.videoRef?.nativeElement;
    if (!video) {
      this.stopCamera();
      return;
    }
    video.srcObject = this.stream;
    await video.play().catch(() => undefined);
    this.cameraOn.set(true);
    const detector = new Ctor();
    this.scanTimer = setInterval(() => {
      detector.detect(video).then(
        (barcodes) => {
          const raw = barcodes[0]?.rawValue?.trim();
          if (raw) {
            this.stopCamera();
            this.onCodeInput(raw);
            this.cameraError.set(null);
          }
        },
        () => {
          // Per-frame misses are expected while aiming; keep scanning.
        }
      );
    }, 600);
  }

  stopCamera(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.cameraOn.set(false);
  }
}
