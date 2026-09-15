import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { VettingStore } from './vetting.store';
import { SessionStore } from '../../core/auth/session';
import { ROLES, Role } from '../../core/auth/roles';
import { licenceNumberValidator } from '../../shared/validators/id.validators';
import { daysUntilExpiry } from '../../core/services/integrations/certification-status';
import { I18n } from '../../core/i18n/i18n.service';

/** Specialty options per provider role (PLAN.md §3.A home health services). */
const SPECIALTIES: Record<string, string[]> = {
  [ROLES.CAREGIVER]: ['Elderly care', 'Childcare', 'Meal preparation', 'Mobility support'],
  [ROLES.NURSE]: ['Injections', 'Wound care', 'IV therapy', 'Pressure ulcer care'],
  [ROLES.PHYSIO]: ['Post-stroke rehab', 'Respiratory physio', 'Mobility training', 'Sports massage'],
};

/**
 * Specialty name → dictionary key. The English name is what the API stores
 * (it is submitted with the submission), so only the *label* translates.
 */
const SPECIALTY_KEYS: Record<string, string> = {
  'Elderly care': 'vetting.specialty.elderlyCare',
  Childcare: 'vetting.specialty.childcare',
  'Meal preparation': 'vetting.specialty.mealPreparation',
  'Mobility support': 'vetting.specialty.mobilitySupport',
  Injections: 'vetting.specialty.injections',
  'Wound care': 'vetting.specialty.woundCare',
  'IV therapy': 'vetting.specialty.ivTherapy',
  'Pressure ulcer care': 'vetting.specialty.pressureUlcer',
  'Post-stroke rehab': 'vetting.specialty.postStrokeRehab',
  'Respiratory physio': 'vetting.specialty.respiratoryPhysio',
  'Mobility training': 'vetting.specialty.mobilityTraining',
  'Sports massage': 'vetting.specialty.sportsMassage',
};

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <section class="onboarding">
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('vetting.title') }}</h1>
        </div>
      </header>

      @if (store.certificationStatus() === 'expiring_soon') {
        <p class="alert warning" role="status">
          <span class="alert-icon" aria-hidden="true">⏳</span>
          <span>{{ i18n.t('vetting.expiringSoon', { days: expiryDays() ?? 0 }) }}</span>
        </p>
      } @else if (store.certificationStatus() === 'expired') {
        <p class="alert danger" role="alert">
          <span class="alert-icon" aria-hidden="true">⚠️</span>
          <span>{{ i18n.t('vetting.expired') }}</span>
        </p>
      }

      @if (store.loading()) {
        <div class="skeleton block" aria-hidden="true"></div>
      } @else if (store.isApproved()) {
        <p class="alert success" role="status">
          <span class="alert-icon" aria-hidden="true">✅</span>
          <span>{{ i18n.t('vetting.approved') }}</span>
        </p>
      } @else if (store.isPending()) {
        <p class="alert info" role="status">
          <span class="alert-icon" aria-hidden="true">🕓</span>
          <span>{{ i18n.t('vetting.pending') }}</span>
        </p>
      } @else {
        @if (store.isRejected()) {
          <p class="alert danger" role="alert">
            <span class="alert-icon" aria-hidden="true">⚠️</span>
            <span>
              {{ i18n.t('vetting.rejected', { note: store.mine()?.note || i18n.t('vetting.noReason') }) }}
            </span>
          </p>
        }

        <form class="card vetting-form" [formGroup]="form" (ngSubmit)="submit()">
          <label class="field">
            <span class="field-label">{{ i18n.t('profile.licenceNumber') }}</span>
            <!-- Placeholder is a licence-format example: it is not prose. -->
            <input
              type="text"
              formControlName="licenceNumber"
              placeholder="e.g. ΝΟΣ-2024-Α123"
              aria-describedby="licence-hint"
            />
            @if (form.controls.licenceNumber.dirty && form.controls.licenceNumber.errors) {
              <span class="field-error" id="licence-hint">{{ i18n.t('profile.licenceError') }}</span>
            }
          </label>

          <fieldset>
            <legend>{{ i18n.t('vetting.specialties') }}</legend>
            <div class="specialty-grid">
              @for (specialty of specialties(); track specialty) {
                <label class="specialty">
                  <input
                    type="checkbox"
                    [checked]="selected().includes(specialty)"
                    (change)="toggleSpecialty(specialty)"
                  />
                  <span>{{ specialtyLabel(specialty) }}</span>
                </label>
              }
            </div>
            @if (selected().length === 0) {
              <span class="field-error">{{ i18n.t('vetting.pickSpecialty') }}</span>
            }
          </fieldset>

          <label class="field">
            <span class="field-label">{{ i18n.t('vetting.note') }}</span>
            <textarea rows="3" formControlName="note"
              [attr.placeholder]="i18n.t('vetting.notePlaceholder')"></textarea>
          </label>

          <div class="card-actions">
            <button
              type="submit"
              class="btn"
              [disabled]="store.submitting() || form.invalid || selected().length === 0"
            >
              {{
                store.submitting()
                  ? i18n.t('vetting.submitting')
                  : store.isRejected()
                    ? i18n.t('vetting.resubmit')
                    : i18n.t('vetting.submit')
              }}
            </button>
          </div>

          @if (store.error()) {
            <p class="error" role="alert">{{ i18n.message(store.errorSource(), store.error()) }}</p>
          }
        </form>
      }
    </section>
  `,
  styles: `
    .alert {
      margin-bottom: var(--space-4);
    }
    .vetting-form {
      display: grid;
      gap: var(--space-4);
      max-width: 38rem;
    }
    fieldset {
      display: grid;
      gap: var(--space-3);
    }
    .specialty-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
      gap: var(--space-2);
    }
    .specialty {
      flex-direction: row;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      color: var(--text);
      cursor: pointer;
      transition:
        background-color var(--dur-fast) ease,
        border-color var(--dur-fast) ease;
    }
    .specialty:hover {
      background: var(--surface-raised);
      border-color: var(--border-strong);
    }
    .specialty:has(input:checked) {
      background: var(--accent-soft);
      border-color: var(--accent);
      font-weight: var(--weight-medium);
    }
    .card-actions {
      margin-top: 0;
      padding-top: var(--space-3);
      border-top: 1px solid var(--border);
    }
  `,
})
export class OnboardingPage implements OnInit {
  protected readonly i18n = inject(I18n);

  readonly store = inject(VettingStore);
  private readonly session = inject(SessionStore);
  private readonly fb = inject(FormBuilder);

  protected readonly form = this.fb.nonNullable.group({
    licenceNumber: ['', [Validators.required], [licenceNumberValidator()]],
    note: [''],
  });

  protected readonly selected = signal<string[]>([]);

  readonly specialties = computed(() => {
    const role = this.providerRole();
    return SPECIALTIES[role] ?? [];
  });

  /** §14: whole days until the provider's licence expires (null = no expiry). */
  readonly expiryDays = computed(() => daysUntilExpiry(this.store.mine()?.expiresAtMs ?? null));

  ngOnInit(): void {
    this.store.loadMine();
  }

  /** Specialty label for the active language (the stored value stays English). */
  specialtyLabel(specialty: string): string {
    return this.i18n.t(SPECIALTY_KEYS[specialty] ?? specialty);
  }

  toggleSpecialty(specialty: string): void {
    this.selected.update((current) =>
      current.includes(specialty)
        ? current.filter((s) => s !== specialty)
        : [...current, specialty]
    );
  }

  submit(): void {
    if (this.form.invalid || this.selected().length === 0 || this.store.submitting()) {
      return;
    }
    this.store
      .submit({
        licenceNumber: this.form.getRawValue().licenceNumber,
        specialties: this.selected(),
        note: this.form.getRawValue().note,
      })
      .subscribe();
  }

  private providerRole(): Role {
    const roles = this.session.roles();
    if (roles.includes(ROLES.NURSE)) {
      return ROLES.NURSE;
    }
    if (roles.includes(ROLES.PHYSIO)) {
      return ROLES.PHYSIO;
    }
    return ROLES.CAREGIVER;
  }
}
