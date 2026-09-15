import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClinicalLogStore, ClinicalLogEntry } from './clinical-log.store';
import { VisitStore, Visit } from './visit.store';
import { SignaturePad } from '../../shared/signature-pad/signature-pad';
import { I18n } from '../../core/i18n/i18n.service';

@Component({
  selector: 'app-clinical-log',
  standalone: true,
  imports: [ReactiveFormsModule, SignaturePad],
  template: `
    <section class="clinical-log">
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('clinicalLog.title') }}</h1>
        </div>
      </header>

      <div class="card visit-picker">
        <label class="field">
          <span class="field-label">{{ i18n.t('clinicalLog.visit') }}</span>
          <select [value]="selectedVisitId()" (change)="selectVisit($any($event.target).value)">
            <option value="">{{ i18n.t('clinicalLog.selectVisit') }}</option>
            @for (visit of visits(); track visit.id) {
              <option [value]="visit.id">
                {{ visit.act }} — {{ visit.clientName }} ({{ visit.status }})
              </option>
            }
          </select>
        </label>
      </div>

      @if (store.loading()) {
        <div class="skeleton block" aria-hidden="true"></div>
      } @else if (!selectedVisitId()) {
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">📝</span>
          <p>{{ i18n.t('clinicalLog.chooseVisit') }}</p>
        </div>
      } @else {
        <form class="card log-form" [formGroup]="form" (ngSubmit)="submit()">
          <h2 class="section-title">{{ i18n.t('clinicalLog.observationNotes') }}</h2>
          <label class="field">
            <span class="field-label">{{ i18n.t('clinicalLog.observations') }}</span>
            <textarea rows="4" formControlName="observations"
              [attr.placeholder]="i18n.t('clinicalLog.observationsPlaceholder')"></textarea>
          </label>

          @if (isNurse()) {
            <fieldset>
              <legend>{{ i18n.t('clinicalLog.vitalsNurse') }}</legend>
              <div class="vitals-grid">
                <label class="field">
                  <span class="field-label">{{ i18n.t('clinicalLog.systolic') }}</span>
                  <input type="number" formControlName="systolic" />
                </label>
                <label class="field">
                  <span class="field-label">{{ i18n.t('clinicalLog.diastolic') }}</span>
                  <input type="number" formControlName="diastolic" />
                </label>
                <label class="field">
                  <span class="field-label">{{ i18n.t('clinicalLog.heartRate') }}</span>
                  <input type="number" formControlName="heartRate" />
                </label>
                <label class="field">
                  <span class="field-label">{{ i18n.t('clinicalLog.spo2') }}</span>
                  <input type="number" min="0" max="100" formControlName="spo2" />
                </label>
              </div>
            </fieldset>
          } @else {
            <fieldset>
              <legend>{{ i18n.t('clinicalLog.rehabPhysio') }}</legend>
              <label class="field">
                <span class="field-label">{{ i18n.t('clinicalLog.rangeOfMotion') }}</span>
                <input type="text" formControlName="rangeOfMotion"
                  [attr.placeholder]="i18n.t('clinicalLog.romPlaceholder')" />
              </label>
              <label class="field">
                <span class="field-label">{{ i18n.t('clinicalLog.painLevel') }}</span>
                <input type="number" min="0" max="10" formControlName="painLevel" />
              </label>
              <label class="field">
                <span class="field-label">{{ i18n.t('clinicalLog.exercises') }}</span>
                <textarea rows="2" formControlName="exercisesPrescribed"></textarea>
              </label>
            </fieldset>
          }

          <fieldset>
            <legend>{{ i18n.t('clinicalLog.signature') }}</legend>
            <app-signature-pad #pad />
            <p class="hint">{{ i18n.t('clinicalLog.signatureHint') }}</p>
          </fieldset>

          <div class="card-actions">
            <button type="submit" class="btn"
              [disabled]="store.saving() || form.invalid || !pad.signed()">
              {{ store.saving() ? i18n.t('common.saving') : i18n.t('clinicalLog.signSave') }}
            </button>
          </div>

          @if (store.error()) {
            <p class="error" role="alert">{{ i18n.message(store.errorSource(), store.error()) }}</p>
          }
        </form>
      }

      @if (selectedVisitId() && entries().length > 0) {
        <section class="section">
          <div class="section-header">
            <h2 class="section-title">{{ i18n.t('clinicalLog.signedEntries') }}</h2>
          </div>
          <ul class="results">
            @for (entry of entries(); track entry.id) {
              <li class="card entry">
                <div class="entry-head">
                  <span class="avatar soft" aria-hidden="true">{{ initials(entry.authorName) }}</span>
                  <div>
                    <p class="entry-author">{{ entry.authorName }}</p>
                    <p class="meta">
                      {{ entry.specialty }} ·
                      <span [class]="'badge ' + (entry.signedAtMs !== null ? 'success' : 'warning')">
                        <span class="dot"></span>
                        {{ entry.signedAtMs !== null ? i18n.t('clinicalLog.signed') : i18n.t('clinicalLog.unsigned') }}
                      </span>
                    </p>
                  </div>
                </div>
                <p class="entry-body">{{ entry.observations }}</p>
                @if (entry.signatureDataUrl) {
                  <img
                    class="sig"
                    [src]="entry.signatureDataUrl"
                    [attr.alt]="i18n.t('clinicalLog.signatureAlt')"
                  />
                }
              </li>
            }
          </ul>
        </section>
      }
    </section>
  `,
  styles: `
    .visit-picker {
      margin-bottom: var(--space-4);
      max-width: 34rem;
    }
    .log-form {
      display: grid;
      gap: var(--space-4);
      max-width: 46rem;
    }
    .log-form .section-title {
      margin: 0;
    }
    fieldset {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .vitals-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
      gap: var(--space-3);
    }
    .hint {
      margin: 0;
      color: var(--text-muted);
      font-size: var(--text-sm);
    }
    .card-actions {
      margin-top: 0;
      padding-top: var(--space-3);
      border-top: 1px solid var(--border);
    }
    .entry-head {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .entry-author {
      margin: 0;
      font-weight: var(--weight-semibold);
    }
    .entry-head .meta {
      margin: 0;
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }
    .entry-body {
      margin: var(--space-3) 0 0;
    }
    .sig {
      display: block;
      margin-top: var(--space-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      /* Paper artifact: signature ink is dark, so the pad stays light paper
         in both themes (deliberately not var(--surface)). */
      background: #fff;
      max-width: 220px;
    }
  `,
})
export class ClinicalLogPage implements OnInit {
  protected readonly i18n = inject(I18n);

  readonly store = inject(ClinicalLogStore);
  private readonly visitStore = inject(VisitStore);
  private readonly fb = inject(FormBuilder);

  protected readonly pad = viewChild(SignaturePad);
  protected readonly selectedVisitId = signal('');
  protected readonly visits: () => Visit[] = () => this.visitStore.visits();
  protected readonly entries: () => ClinicalLogEntry[] = () => this.store.entries();

  protected readonly isNurse = computed(() => this.store.specialty() === 'nurse');

  protected readonly form = this.fb.nonNullable.group({
    observations: ['', [Validators.required, Validators.minLength(5)]],
    systolic: [null as number | null],
    diastolic: [null as number | null],
    heartRate: [null as number | null],
    spo2: [null as number | null],
    rangeOfMotion: [''],
    painLevel: [null as number | null],
    exercisesPrescribed: [''],
  });

  ngOnInit(): void {
    this.visitStore.connect();
    this.visitStore.load();
    this.store.load();
  }

  /** Initials for the author avatar (decorative). */
  initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  selectVisit(id: string): void {
    this.selectedVisitId.set(id);
    this.store.load(id);
  }

  submit(): void {
    if (this.form.invalid || this.store.saving()) {
      return;
    }
    const raw = this.form.getRawValue();
    const signatureDataUrl = this.pad()?.toDataUrl() ?? null;
    this.store
      .save(
        {
          visitId: this.selectedVisitId(),
          observations: raw.observations,
          vitals: this.isNurse()
            ? {
                systolic: raw.systolic,
                diastolic: raw.diastolic,
                heartRate: raw.heartRate,
                spo2: raw.spo2,
              }
            : null,
          rehab: this.isNurse()
            ? null
            : {
                rangeOfMotion: raw.rangeOfMotion,
                painLevel: raw.painLevel,
                exercisesPrescribed: raw.exercisesPrescribed,
              },
        },
        signatureDataUrl
      )
      .subscribe((ok) => {
        if (ok) {
          this.pad()?.clear();
          this.form.controls.observations.reset();
        }
      });
  }
}
