import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { VettingStore } from './vetting.store';
import { SessionStore } from '../../core/auth/session';
import { ROLES, Role } from '../../core/auth/roles';
import { licenceNumberValidator } from '../../shared/validators/id.validators';
import { daysUntilExpiry } from '../../core/services/integrations/certification-status';

/** Specialty options per provider role (PLAN.md §3.A home health services). */
const SPECIALTIES: Record<string, string[]> = {
  [ROLES.CAREGIVER]: ['Elderly care', 'Childcare', 'Meal preparation', 'Mobility support'],
  [ROLES.NURSE]: ['Injections', 'Wound care', 'IV therapy', 'Pressure ulcer care'],
  [ROLES.PHYSIO]: ['Post-stroke rehab', 'Respiratory physio', 'Mobility training', 'Sports massage'],
};

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <section class="onboarding">
      <h1>Professional onboarding</h1>

      @if (store.certificationStatus() === 'expiring_soon') {
        <p class="banner warning" role="status">
          ⚠️ Your licence expires in {{ expiryDays() }} days. Renew it to stay visible in the marketplace.
        </p>
      } @else if (store.certificationStatus() === 'expired') {
        <p class="banner bad" role="alert">
          ❌ Your licence has expired. You are temporarily hidden from the marketplace until you renew and re-submit for review.
        </p>
      }

      @if (store.loading()) {
        <p>Loading…</p>
      } @else if (store.isApproved()) {
        <p class="status ok" role="status">
          ✅ Licence approved — you are fully onboarded and visible in the marketplace.
        </p>
      } @else if (store.isPending()) {
        <p class="status" role="status">
          ⏳ Licence under review — an administrator is vetting your submission.
        </p>
      } @else {
        @if (store.isRejected()) {
          <p class="status bad" role="alert">
            ❌ Your previous submission was rejected:
            {{ store.mine()?.note || 'no reason given' }}. Correct it and resubmit.
          </p>
        }

        <form [formGroup]="form" (ngSubmit)="submit()">
          <label>Licence number
            <input
              type="text"
              formControlName="licenceNumber"
              placeholder="e.g. ΝΟΣ-2024-Α123"
              aria-describedby="licence-hint"
            />
            @if (form.controls.licenceNumber.dirty && form.controls.licenceNumber.errors) {
              <span class="error" id="licence-hint">Licence: 5–20 letters, digits or hyphens.</span>
            }
          </label>

          <fieldset>
            <legend>Specialties</legend>
            @for (specialty of specialties(); track specialty) {
              <label class="check">
                <input
                  type="checkbox"
                  [checked]="selected().includes(specialty)"
                  (change)="toggleSpecialty(specialty)"
                />
                {{ specialty }}
              </label>
            }
            @if (selected().length === 0) {
              <span class="error">Pick at least one specialty.</span>
            }
          </fieldset>

          <label>Note (optional)
            <textarea rows="3" formControlName="note"
              placeholder="Certifications, experience, languages…"></textarea>
          </label>

          <button type="submit" [disabled]="store.submitting() || form.invalid || selected().length === 0">
            {{ store.submitting() ? 'Submitting…' : (store.isRejected() ? 'Resubmit' : 'Submit for review') }}
          </button>

          @if (store.error()) {
            <p class="error" role="alert">{{ store.error() }}</p>
          }
        </form>
      }
    </section>
  `,
  styles: `
    .status {
      border-radius: 0.75rem;
      padding: 0.75rem 1rem;
      background: var(--accent-soft);
      margin: 0 0 1rem;
    }
    .status.ok { background: color-mix(in srgb, var(--success) 12%, transparent); }
    .status.bad { background: var(--danger-soft); color: var(--danger); }
    .banner {
      border-radius: 0.75rem;
      padding: 0.75rem 1rem;
      margin: 0 0 1rem;
      border: 1px solid var(--border);
    }
    .banner.warning { background: color-mix(in srgb, var(--warning, #b8860b) 12%, transparent); color: var(--warning, #8a6d00); }
    .banner.bad { background: var(--danger-soft); color: var(--danger); }
    fieldset {
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 0.75rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    legend { color: var(--text-muted); font-size: 0.85rem; padding-inline: 0.25rem; }
    label.check { flex-direction: row; align-items: center; gap: 0.5rem; color: var(--text); }
    label.check input { width: auto; }
  `,
})
export class OnboardingPage implements OnInit {
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
