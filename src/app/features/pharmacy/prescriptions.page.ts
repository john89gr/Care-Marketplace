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
import { addressFromProfile, statusLabel } from './pharmacy.models';
import { BarcodeParseError, parseBarcodePayload, type ParsedPrescriptionPayload } from './barcode';

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
      <h1>E-prescription scan</h1>
      <p class="meta">
        Scan the prescription barcode with your camera, or type the code (or
        medication lines) below. The camera is optional — manual entry works
        fully by keyboard.
      </p>

      <h2>1. Capture</h2>
      @if (detectorAvailable) {
        <div class="camera">
          @if (!cameraOn()) {
            <button type="button" (click)="startCamera()">Start camera scan</button>
          } @else {
            <button type="button" class="secondary" (click)="stopCamera()">Stop camera</button>
          }
          @if (cameraError()) {
            <p class="error" role="alert">{{ cameraError() }}</p>
          }
          <video #video playsinline muted [hidden]="!cameraOn()" aria-label="Camera preview for barcode scanning"></video>
        </div>
      } @else {
        <p class="meta" role="note">
          Camera scanning is not supported in this browser — use manual entry below.
        </p>
      }

      <h2><label for="rx-code">2. Code or medication lines</label></h2>
      <textarea
        id="rx-code"
        #codeInput
        rows="4"
        [value]="code()"
        (input)="onCodeInput($any($event.target).value)"
        placeholder='Paste the scanned code, or type lines like:&#10;Insulin glargine | 10 units | x1'
        aria-describedby="rx-code-help"
      ></textarea>
      <p class="meta" id="rx-code-help">
        One medication per line: name, dose and quantity (e.g. “Amoxicillin | 500 mg | x21”).
      </p>

      <div class="fields">
        <label>Prescriber (optional override)
          <input
            type="text"
            [value]="prescriberOverride()"
            (input)="prescriberOverride.set($any($event.target).value)"
            autocomplete="off"
          />
        </label>
        <label>Delivery address
          <input
            type="text"
            [value]="deliveryAddress()"
            (input)="deliveryAddress.set($any($event.target).value)"
            autocomplete="street-address"
          />
        </label>
      </div>

      @if (previewError()) {
        <p class="warning" role="status">{{ previewError() }}</p>
      }
      @if (preview()) {
        <div class="preview">
          <h3>Parsed medications (confirm before submitting)</h3>
          <p class="meta">Prescriber: {{ prescriberOverride() || preview()!.prescriber }}</p>
          <ul>
            @for (med of preview()!.meds; track med.name) {
              <li>{{ med.name }} — {{ med.dose || 'dose as directed' }} × {{ med.qty }}</li>
            }
          </ul>
        </div>
      }

      <div class="actions">
        <button type="button" (click)="submit()" [disabled]="store.scanning() || !code().trim()">
          {{ store.scanning() ? 'Submitting…' : 'Submit prescription' }}
        </button>
      </div>

      @if (store.error()) {
        <div class="error-box" role="alert">
          <p>{{ store.error() }}</p>
          <button type="button" class="secondary" (click)="retry()">Try again</button>
        </div>
      }

      @if (store.lastResult()) {
        <div class="result">
          <h3 tabindex="-1" #resultHeading>Prescription confirmed</h3>
          <p aria-live="polite">
            @if (store.lastResult()!.order.status === 'failed') {
              Routing failed — no partner pharmacy has stock right now.
              <button type="button" class="secondary" (click)="submit()">Retry routing</button>
            } @else {
              Routed to <strong>{{ store.lastResult()!.order.pharmacyName }}</strong>
              ({{ statusLabel(store.lastResult()!.order.status) }}).
            }
          </p>
          <ul>
            @for (med of store.lastResult()!.prescription.meds; track med.name) {
              <li>{{ med.name }} — {{ med.dose || 'dose as directed' }} × {{ med.qty }}</li>
            }
          </ul>
          <a routerLink="/pharmacy-orders">Track in pharmacy orders →</a>
        </div>
      }
    </section>
  `,
  styles: `
    .prescriptions { display: grid; gap: 0.75rem; max-width: 40rem; }
    .camera { display: grid; gap: 0.5rem; justify-items: start; }
    video { width: 100%; max-width: 24rem; border-radius: 0.5rem; background: #000; }
    textarea { width: 100%; font: inherit; padding: 0.6rem; border-radius: 0.5rem; border: 1px solid var(--border, #d9dee7); }
    .fields { display: grid; gap: 0.6rem; }
    label { display: grid; gap: 0.25rem; font-weight: 600; }
    input[type='text'] { font: inherit; padding: 0.5rem 0.6rem; border-radius: 0.5rem; border: 1px solid var(--border, #d9dee7); min-height: 44px; }
    button { min-height: 44px; padding: 0.5rem 1rem; cursor: pointer; }
    .secondary { background: none; }
    .preview, .result { border: 1px solid var(--border, #d9dee7); border-radius: 0.6rem; padding: 0.75rem 1rem; }
    .error-box { border: 2px solid var(--danger, #c62828); border-radius: 0.6rem; padding: 0.75rem 1rem; }
    .error { color: var(--danger, #c62828); }
    .warning { color: var(--warning, #8a5a00); }
    .meta { color: var(--text-muted); }
    .actions { display: flex; gap: 0.5rem; }
  `,
})
export class PrescriptionsPage implements OnDestroy {
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
  readonly previewError = signal('');
  readonly cameraOn = signal(false);
  readonly cameraError = signal('');

  protected readonly statusLabel = statusLabel;

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
      this.previewError.set('');
      return;
    }
    try {
      this.preview.set(parseBarcodePayload(value));
      this.previewError.set('');
    } catch (error) {
      this.preview.set(null);
      this.previewError.set(
        error instanceof BarcodeParseError
          ? error.message
          : 'That code is not readable yet — keep typing or submit to let the pharmacy check it.'
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
      this.cameraError.set('Camera scanning is not supported in this browser — use manual entry.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      this.cameraError.set('No camera is available — use manual entry below.');
      return;
    }
    this.cameraError.set('');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
    } catch {
      this.cameraError.set('Camera access was denied. You can still enter the code manually.');
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
            this.cameraError.set('');
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
