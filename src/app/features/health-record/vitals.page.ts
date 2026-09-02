import { Component, computed, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  VitalsStore,
  VitalReading,
  VitalType,
  VITAL_LABELS,
  VITAL_UNITS,
  isOutOfRange,
} from './vitals.store';

@Component({
  selector: 'app-vitals',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <section class="vitals">
      <h1>Vitals</h1>

      @if (store.alerts().length > 0) {
        <div class="alerts" role="alert">
          <h2>Threshold alerts</h2>
          @for (reading of store.alerts(); track reading.id) {
            <p>
              ⚠️ {{ label(reading.type) }} {{ display(reading) }} —
              outside the normal range ({{ rangeText(reading.type) }}).
            </p>
          }
        </div>
      }

      @if (store.loading()) {
        <p>Loading…</p>
      } @else {
        <h2>Log a reading</h2>
        <form [formGroup]="form" (ngSubmit)="submit()">
          <label>Type
            <select formControlName="type">
              @for (type of types; track type) {
                <option [value]="type">{{ label(type) }} ({{ VITAL_UNITS[type] }})</option>
              }
            </select>
          </label>
          <label>{{ label(form.controls.type.value) }}
            <input type="number" step="0.1" formControlName="value"
              [attr.aria-label]="'Value in ' + VITAL_UNITS[form.controls.type.value]" />
          </label>
          @if (form.controls.type.value === 'bloodPressure') {
            <label>Diastolic (mmHg)
              <input type="number" formControlName="value2" />
            </label>
          }
          <button type="submit" [disabled]="store.saving() || form.invalid">
            {{ store.saving() ? 'Saving…' : 'Save reading' }}
          </button>
        </form>

        @if (store.error()) {
          <p class="error" role="alert">{{ store.error() }}</p>
        }

        <h2>Trends</h2>
        @for (type of types; track type) {
          @if (trendVisible(type); as trend) {
            <div class="card trend">
              <h3>{{ label(type) }}</h3>
              @if (latest(type); as latest) {
                <p class="meta">Latest: {{ display(latest) }} · {{ formatDate(latest.measuredAtMs) }}</p>
              }
              <ul class="trend-list">
                @for (reading of trend; track reading.id) {
                  <li [class.alert]="outOfRange(reading)">
                    <span>{{ display(reading) }}</span>
                    <span class="date">{{ formatDate(reading.measuredAtMs) }}</span>
                  </li>
                }
              </ul>
            </div>
          }
        }
      }
    </section>
  `,
  styles: `
    h2 { margin: 1.5rem 0 0.5rem; font-size: 1.1rem; }
    .alerts {
      border-radius: 0.75rem;
      padding: 0.75rem 1rem;
      background: var(--danger-soft);
      color: var(--danger);
      margin-bottom: 0.75rem;
    }
    .alerts h2 { margin: 0 0 0.35rem; }
    .alerts p { margin: 0.25rem 0; }
    .trends { display: grid; gap: 0.75rem; }
    .trend-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.2rem; }
    .trend-list li { display: flex; justify-content: space-between; font-variant-numeric: tabular-nums; }
    .trend-list li.alert { color: var(--danger); font-weight: 600; }
    .date { color: var(--text-muted); font-size: 0.85rem; }
  `,
})
export class VitalsPage implements OnInit {
  readonly store = inject(VitalsStore);
  private readonly fb = inject(FormBuilder);

  protected readonly VITAL_UNITS = VITAL_UNITS;
  protected readonly types: VitalType[] = Object.keys(VITAL_LABELS) as VitalType[];

  protected readonly form = this.fb.nonNullable.group({
    type: ['bloodPressure' as VitalType, [Validators.required]],
    value: [null as number | null, [Validators.required, Validators.min(0)]],
    value2: [null as number | null],
  });

  ngOnInit(): void {
    this.store.load();
  }

  submit(): void {
    if (this.form.invalid || this.store.saving()) {
      return;
    }
    const raw = this.form.getRawValue();
    this.store
      .add({
        type: raw.type,
        value: raw.value!,
        value2: raw.type === 'bloodPressure' ? raw.value2 : null,
        measuredAtMs: Date.now(),
      })
      .subscribe((ok) => {
        if (ok) {
          this.form.controls.value.reset();
          this.form.controls.value2.reset();
        }
      });
  }

  trendVisible(type: VitalType): VitalReading[] | null {
    const trend = this.store.trend(type);
    return trend.length > 0 ? trend : null;
  }

  latest(type: VitalType): VitalReading | null {
    return this.store.latest(type);
  }

  label(type: VitalType): string {
    return VITAL_LABELS[type];
  }

  display(reading: VitalReading): string {
    return reading.type === 'bloodPressure' && reading.value2 !== null
      ? `${reading.value}/${reading.value2} ${VITAL_UNITS[reading.type]}`
      : `${reading.value} ${VITAL_UNITS[reading.type]}`;
  }

  rangeText(type: VitalType): string {
    return type === 'bloodPressure'
      ? '90–140/60–90 mmHg'
      : type === 'glucose'
        ? '70–180 mg/dL'
        : type === 'spo2'
          ? '≥95%'
          : type === 'temperature'
            ? '36–37.8 °C'
            : type === 'heartRate'
              ? '60–100 bpm'
              : '—';
  }

  outOfRange(reading: VitalReading): boolean {
    return isOutOfRange(reading);
  }

  formatDate(ms: number): string {
    return new Date(ms).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}