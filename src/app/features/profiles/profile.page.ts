import { Component, computed, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProfileStore } from './profile.store';
import { SessionStore } from '../../core/auth/session';
import { ROLES, isVisitProvider } from '../../core/auth/roles';
import { amkaValidator, afmValidator, licenceNumberValidator } from '../../shared/validators/id.validators';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <section class="profile">
      <h1>My profile</h1>

      @if (store.loading()) {
        <p>Loading…</p>
      } @else {
        <form [formGroup]="form" (ngSubmit)="submit()">
          <label>Full name
            <input type="text" formControlName="displayName" autocomplete="name" />
          </label>
          <label>Phone
            <input type="tel" formControlName="phone" autocomplete="tel" />
          </label>

          @if (isClient()) {
            <fieldset>
              <legend>Greek identifiers (used for vetting)</legend>
              <label>AMKA
                <input type="text" inputmode="numeric" formControlName="amka"
                  placeholder="11 digits" aria-describedby="amka-hint" />
                @if (form.controls.amka.dirty && form.controls.amka.errors) {
                  <span class="error" id="amka-hint">AMKA must be 11 digits with a valid date.</span>
                }
              </label>
              <label>AFM (tax number)
                <input type="text" inputmode="numeric" formControlName="afm"
                  placeholder="9 digits" aria-describedby="afm-hint" />
                @if (form.controls.afm.dirty && form.controls.afm.errors) {
                  <span class="error" id="afm-hint">AFM must be 9 digits with a valid checksum.</span>
                }
              </label>
            </fieldset>
          }

          @if (isProvider()) {
            <fieldset>
              <legend>Professional details</legend>
              <label>Licence number
                <input type="text" formControlName="licenceNumber"
                  placeholder="e.g. ΝΟΣ-2024-Α123" aria-describedby="licence-hint" />
                @if (form.controls.licenceNumber.dirty && form.controls.licenceNumber.errors) {
                  <span class="error" id="licence-hint">Licence: 5–20 letters, digits or hyphens.</span>
                }
              </label>
              <label>Hourly rate (€)
                <input type="number" min="0" step="1" formControlName="hourlyRate" />
              </label>
            </fieldset>
          }

          <button type="submit" [disabled]="store.saving() || form.invalid">
            {{ store.saving() ? 'Saving…' : 'Save profile' }}
          </button>

          @if (store.saved()) {
            <p class="saved" role="status">Profile saved.</p>
          }
          @if (store.saveError()) {
            <p class="error" role="alert">{{ store.saveError() }}</p>
          }
        </form>
      }
    </section>
  `,
  styles: `
    fieldset {
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 0.75rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
    }
    legend {
      color: var(--text-muted);
      font-size: 0.85rem;
      padding-inline: 0.25rem;
    }
    .saved {
      color: var(--success);
      margin: 0;
    }
  `,
})
export class ProfilePage implements OnInit {
  readonly store = inject(ProfileStore);
  private readonly session = inject(SessionStore);
  private readonly fb = inject(FormBuilder);

  readonly form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(2)]],
    phone: [''],
    amka: ['', [], [amkaValidator()]],
    afm: ['', [], [afmValidator()]],
    licenceNumber: ['', [], [licenceNumberValidator()]],
    hourlyRate: [null as number | null],
  });

  readonly isClient = computed(() => this.session.hasAnyRole([ROLES.CLIENT]));
  readonly isProvider = computed(() => isVisitProvider(this.session.roles()));

  ngOnInit(): void {
    this.store.load().subscribe(() => {
      const p = this.store.profile();
      this.form.patchValue({
        displayName: p.displayName,
        phone: p.phone,
        amka: p.amka,
        afm: p.afm,
        licenceNumber: p.licenceNumber,
        hourlyRate: p.hourlyRate,
      });
    });
  }

  submit(): void {
    if (this.form.invalid || this.store.saving()) {
      return;
    }
    const raw = this.form.getRawValue();
    this.store.save({
      displayName: raw.displayName,
      phone: raw.phone,
      amka: this.isClient() ? raw.amka : '',
      afm: this.isClient() ? raw.afm : '',
      licenceNumber: this.isProvider() ? raw.licenceNumber : '',
      hourlyRate: this.isProvider() ? raw.hourlyRate : null,
    }).subscribe();
  }
}
