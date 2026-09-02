import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClinicalLogStore, ClinicalLogEntry } from './clinical-log.store';
import { VisitStore, Visit } from './visit.store';
import { SignaturePad } from '../../shared/signature-pad/signature-pad';

@Component({
  selector: 'app-clinical-log',
  standalone: true,
  imports: [ReactiveFormsModule, SignaturePad],
  template: `
    <section class="clinical-log">
      <h1>Clinical log</h1>

      <label>Visit
        <select [value]="selectedVisitId()" (change)="selectVisit($any($event.target).value)">
          <option value="">Select a visit…</option>
          @for (visit of visits(); track visit.id) {
            <option [value]="visit.id">
              {{ visit.act }} — {{ visit.clientName }} ({{ visit.status }})
            </option>
          }
        </select>
      </label>

      @if (store.loading()) {
        <p>Loading…</p>
      } @else if (!selectedVisitId()) {
        <p>Choose a visit above to document it.</p>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()">
          <h2>Observation notes</h2>
          <label>Observations
            <textarea rows="4" formControlName="observations"
              placeholder="Clinical findings, complaints, response to treatment…"></textarea>
          </label>

          @if (isNurse()) {
            <fieldset>
              <legend>Vitals (nurse)</legend>
              <div class="grid">
                <label>Systolic (mmHg)
                  <input type="number" formControlName="systolic" />
                </label>
                <label>Diastolic (mmHg)
                  <input type="number" formControlName="diastolic" />
                </label>
                <label>Heart rate (bpm)
                  <input type="number" formControlName="heartRate" />
                </label>
                <label>SpO2 (%)
                  <input type="number" min="0" max="100" formControlName="spo2" />
                </label>
              </div>
            </fieldset>
          } @else {
            <fieldset>
              <legend>Rehab assessment (physio)</legend>
              <label>Range of motion
                <input type="text" formControlName="rangeOfMotion"
                  placeholder="e.g. shoulder flexion 0–120°" />
              </label>
              <label>Pain level (0–10)
                <input type="number" min="0" max="10" formControlName="painLevel" />
              </label>
              <label>Exercises prescribed
                <textarea rows="2" formControlName="exercisesPrescribed"></textarea>
              </label>
            </fieldset>
          }

          <h2>Digital signature</h2>
          <app-signature-pad #pad />
          <p class="hint">
            Signing certifies the observations above were made during this visit.
          </p>

          <button type="submit"
            [disabled]="store.saving() || form.invalid || !pad.signed()">
            {{ store.saving() ? 'Saving…' : 'Sign & save' }}
          </button>

          @if (store.error()) {
            <p class="error" role="alert">{{ store.error() }}</p>
          }
        </form>

        @if (entries().length > 0) {
          <h2>Signed entries</h2>
          <ul class="results">
            @for (entry of entries(); track entry.id) {
              <li class="card">
                <p class="meta">{{ entry.authorName }} · {{ entry.specialty }} ·
                  {{ entry.signedAtMs !== null ? 'signed' : 'unsigned' }}</p>
                <p>{{ entry.observations }}</p>
                @if (entry.signatureDataUrl) {
                  <img class="sig" [src]="entry.signatureDataUrl" alt="Signed signature" />
                }
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
  styles: `
    h2 { margin: 1.5rem 0 0.5rem; font-size: 1.1rem; }
    fieldset {
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 0.75rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
    }
    legend { color: var(--text-muted); font-size: 0.85rem; padding-inline: 0.25rem; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; }
    .hint { color: var(--text-muted); font-size: 0.85rem; }
    .sig { border: 1px solid var(--border); border-radius: 0.5rem; max-width: 220px; }
  `,
})
export class ClinicalLogPage implements OnInit {
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