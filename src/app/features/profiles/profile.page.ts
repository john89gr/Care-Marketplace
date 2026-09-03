import { Component, computed, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProfileStore } from './profile.store';
import { SessionStore } from '../../core/auth/session';
import { ROLES, isVisitProvider } from '../../core/auth/roles';
import { amkaValidator, afmValidator, licenceNumberValidator } from '../../shared/validators/id.validators';
import {
  NotificationsService,
  NotificationKind,
} from '../../core/services/notifications/notifications.service';

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
              <label>Date of birth (used for preventive-care reminders)
                <input type="date" formControlName="dateOfBirth" />
              </label>
              <label>Recorded sex (used for preventive-care reminders)
                <select formControlName="sex">
                  <option value="">Prefer not to say</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="other">Other</option>
                </select>
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

      <section class="notif-prefs" aria-labelledby="notif-prefs-h">
        <h2 id="notif-prefs-h">Notification preferences</h2>
        <p class="hint">Muted kinds stay in history but won't badge, toast or push.</p>
        @for (kind of allKinds; track kind) {
          <label class="mute-row">
            <input
              type="checkbox"
              [checked]="notifications.isMuted(kind)"
              (change)="notifications.toggleMute(kind)"
            />
            Mute {{ kind }}
          </label>
        }
        <label class="mute-row">
          <input
            type="checkbox"
            [checked]="pushGranted"
            (change)="requestPush()"
          />
          Browser push notifications
        </label>
      </section>
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
    .notif-prefs {
      margin-top: 2rem;
      display: grid;
      gap: 0.4rem;
    }
    .notif-prefs .hint {
      color: var(--text-muted);
      font-size: 0.85rem;
      margin: 0 0 0.4rem;
    }
    .mute-row {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      font-size: 0.9rem;
    }
  `,
})
export class ProfilePage implements OnInit {
  readonly store = inject(ProfileStore);
  private readonly session = inject(SessionStore);
  private readonly fb = inject(FormBuilder);
  readonly notifications = inject(NotificationsService);
  pushGranted = false;

  readonly allKinds: NotificationKind[] = [
    'booking.accepted',
    'booking.started',
    'booking.completed',
    'booking.cancelled',
    'booking.rescheduled',
    'booking.disputed',
    'review.submitted',
    'vitals.alert',
    'vetting.decision',
    'screening.due',
    'medication.missed',
    'system',
  ];

  readonly form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(2)]],
    phone: [''],
    amka: ['', [], [amkaValidator()]],
    afm: ['', [], [afmValidator()]],
    licenceNumber: ['', [], [licenceNumberValidator()]],
    hourlyRate: [null as number | null],
    dateOfBirth: [''],
    sex: ['' as '' | 'female' | 'male' | 'other'],
  });

  readonly isClient = computed(() => this.session.hasAnyRole([ROLES.CLIENT]));
  readonly isProvider = computed(() => isVisitProvider(this.session.roles()));

  ngOnInit(): void {
    void this.notifications.pushEnabled().then((granted) => {
      this.pushGranted = granted;
    });
    this.store.load().subscribe(() => {
      const p = this.store.profile();
      this.form.patchValue({
        displayName: p.displayName,
        phone: p.phone,
        amka: p.amka,
        afm: p.afm,
        licenceNumber: p.licenceNumber,
        hourlyRate: p.hourlyRate,
        dateOfBirth: p.dateOfBirth,
        sex: p.sex,
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
      dateOfBirth: this.isClient() ? raw.dateOfBirth : '',
      sex: this.isClient() ? raw.sex : '',
    }).subscribe();
  }

  async requestPush(): Promise<void> {
    const result = await this.notifications.enablePush();
    this.pushGranted = result === 'granted';
  }
}
