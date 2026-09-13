import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { I18n } from '../../core/i18n/i18n.service';
import {
  VitalsStore,
  VitalReading,
  VitalType,
  VITAL_LABELS,
  VITAL_LABELS_I18N,
  VITAL_UNITS,
  isOutOfRange,
} from './vitals.store';

/**
 * Vitals page (Phase 3): log a reading, surface threshold alerts and show the
 * per-type trend. Bilingual — labels follow the active locale, while the
 * display format (`132/86 mmHg`) and units stay locale-independent.
 */
@Component({
  selector: 'app-vitals',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <section class="vitals">
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('vitals.title') }}</h1>
          <p class="page-subtitle">{{ i18n.t('vitals.subtitle') }}</p>
        </div>
      </header>

      @if (store.alerts().length > 0) {
        <div class="card alerts" role="alert">
          <h2 class="card-title">{{ i18n.t('vitals.alerts') }}</h2>
          @for (reading of store.alerts(); track reading.id) {
            <p class="alert-line">
              {{
                i18n.t('vitals.alertText', {
                  label: i18nLabel(reading.type),
                  value: display(reading),
                  range: rangeText(reading.type),
                })
              }}
            </p>
          }
        </div>
      }

      @if (store.loading()) {
        <p class="meta">{{ i18n.t('common.loading') }}</p>
      } @else {
        <div class="grid-2">
          <section class="card">
            <h2 class="card-title">{{ i18n.t('vitals.logReading') }}</h2>
            <form [formGroup]="form" (ngSubmit)="submit()">
              <label class="field">
                <span class="field-label">{{ i18n.t('vitals.type') }}</span>
                <select formControlName="type">
                  @for (type of types; track type) {
                    <option [value]="type">{{ i18nLabel(type) }} ({{ VITAL_UNITS[type] }})</option>
                  }
                </select>
              </label>
              <label class="field">
                <span class="field-label">{{ i18nLabel(form.controls.type.value) }}</span>
                <input
                  type="number"
                  step="0.1"
                  formControlName="value"
                  [attr.aria-label]="i18n.t('vitals.valueIn', { unit: VITAL_UNITS[form.controls.type.value] })"
                />
              </label>
              @if (form.controls.type.value === 'bloodPressure') {
                <label class="field">
                  <span class="field-label">{{ i18n.t('vitals.diastolic') }}</span>
                  <input type="number" formControlName="value2" />
                </label>
              }
              <div class="card-actions">
                <button type="submit" class="btn" [disabled]="store.saving() || form.invalid">
                  {{ store.saving() ? i18n.t('common.saving') : i18n.t('vitals.saveReading') }}
                </button>
              </div>
            </form>
          </section>

          <section>
            <h2 class="section-title">{{ i18n.t('vitals.trends') }}</h2>
            @for (type of types; track type) {
              @if (trendVisible(type); as trend) {
                <div class="card trend">
                  <h3 class="card-title">{{ i18nLabel(type) }}</h3>
                  @if (latest(type); as latest) {
                    <p class="meta">
                      {{
                        i18n.t('vitals.latest', {
                          value: display(latest),
                          date: formatDate(latest.measuredAtMs)
                        })
                      }}
                    </p>
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
          </section>
        </div>

        @if (store.error()) {
          <p class="error" role="alert">{{ i18n.message(store.errorSource(), store.error()) }}</p>
        }
      }
    </section>
  `,
  styles: `
    .card.alerts {
      border-color: var(--danger);
      background: var(--danger-soft);
      color: var(--danger);
      margin-bottom: var(--space-4);
    }
    .card.alerts .card-title {
      color: var(--danger);
      margin-bottom: var(--space-1);
    }
    .alert-line {
      margin: 0.25rem 0;
    }
    .section-title {
      margin: 0 0 var(--space-3);
      font-size: var(--text-lg);
    }
    .trend {
      margin-bottom: var(--space-3);
    }
    .trend-list {
      list-style: none;
      margin: var(--space-2) 0 0;
      padding: 0;
      display: grid;
      gap: 0.2rem;
    }
    .trend-list li {
      display: flex;
      justify-content: space-between;
      gap: var(--space-3);
      font-variant-numeric: tabular-nums;
    }
    .trend-list li.alert {
      color: var(--danger);
      font-weight: var(--weight-semibold);
    }
    .date {
      color: var(--text-muted);
      font-size: var(--text-sm);
    }
  `,
})
export class VitalsPage implements OnInit {
  readonly store = inject(VitalsStore);
  protected readonly i18n = inject(I18n);
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

  /** Localized vital-type name. */
  i18nLabel(type: VitalType): string {
    return VITAL_LABELS_I18N[type][this.i18n.language()];
  }

  display(reading: VitalReading): string {
    return reading.type === 'bloodPressure' && reading.value2 !== null
      ? `${reading.value}/${reading.value2} ${VITAL_UNITS[reading.type]}`
      : `${reading.value} ${VITAL_UNITS[reading.type]}`;
  }

  rangeText(type: VitalType): string {
    return this.i18n.t(`vitals.range.${type}`);
  }

  outOfRange(reading: VitalReading): boolean {
    return isOutOfRange(reading);
  }

  formatDate(ms: number): string {
    return new Date(ms).toLocaleString(this.i18n.locale(), {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
