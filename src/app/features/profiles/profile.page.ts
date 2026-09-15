import { Component, computed, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ProfileStore } from './profile.store';
import { SessionStore } from '../../core/auth/session';
import { ROLES, isVisitProvider } from '../../core/auth/roles';
import { amkaValidator, afmValidator, licenceNumberValidator } from '../../shared/validators/id.validators';
import {
  NotificationsService,
  NotificationKind,
} from '../../core/services/notifications/notifications.service';
import { I18n } from '../../core/i18n/i18n.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section class="profile">
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('profile.title') }}</h1>
          <p class="page-subtitle">{{ i18n.t('profile.subtitle') }}</p>
        </div>
        <div class="page-actions">
          <span class="avatar lg" aria-hidden="true">{{ initials() }}</span>
        </div>
      </header>

      @if (store.loading()) {
        <div class="card skeleton block" aria-hidden="true"></div>
      } @else {
        <div class="grid profile-grid">
          <form class="card profile-form" [formGroup]="form" (ngSubmit)="submit()">
            <h2 class="section-title">{{ i18n.t('profile.detailsTitle') }}</h2>

            <label class="field">
              <span class="field-label">{{ i18n.t('auth.fullName') }}</span>
              <input type="text" formControlName="displayName" autocomplete="name" />
            </label>
            <label class="field">
              <span class="field-label">{{ i18n.t('profile.phone') }}</span>
              <input type="tel" formControlName="phone" autocomplete="tel" />
              <span class="hint">
                {{ i18n.t('profile.phoneHint') }}
                <a routerLink="/contacts">{{ i18n.t('phr.contactsLabel') }}</a>.
              </span>
            </label>

            @if (isClient()) {
              <fieldset>
                <legend>{{ i18n.t('profile.identifiersLegend') }}</legend>
                <label class="field">
                  <span class="field-label">{{ i18n.t('profile.amka') }}</span>
                  <input type="text" inputmode="numeric" formControlName="amka"
                    [attr.placeholder]="i18n.t('profile.amkaPlaceholder')"
                    aria-describedby="amka-hint" />
                  @if (form.controls.amka.dirty && form.controls.amka.errors) {
                    <span class="field-error" id="amka-hint">{{ i18n.t('profile.amkaError') }}</span>
                  }
                </label>
                <label class="field">
                  <span class="field-label">{{ i18n.t('profile.afm') }}</span>
                  <input type="text" inputmode="numeric" formControlName="afm"
                    [attr.placeholder]="i18n.t('profile.afmPlaceholder')"
                    aria-describedby="afm-hint" />
                  @if (form.controls.afm.dirty && form.controls.afm.errors) {
                    <span class="field-error" id="afm-hint">{{ i18n.t('profile.afmError') }}</span>
                  }
                </label>
                <label class="field">
                  <span class="field-label">{{ i18n.t('profile.dateOfBirth') }}</span>
                  <input type="date" formControlName="dateOfBirth" />
                </label>
                <label class="field">
                  <span class="field-label">{{ i18n.t('profile.sex') }}</span>
                  <select formControlName="sex">
                    <option value="">{{ i18n.t('profile.sexPreferNotToSay') }}</option>
                    <option value="female">{{ i18n.t('profile.sexFemale') }}</option>
                    <option value="male">{{ i18n.t('profile.sexMale') }}</option>
                    <option value="other">{{ i18n.t('profile.sexOther') }}</option>
                  </select>
                </label>
              </fieldset>
            }

            @if (isProvider()) {
              <fieldset>
                <legend>{{ i18n.t('profile.professionalLegend') }}</legend>
                <label class="field">
                  <span class="field-label">{{ i18n.t('profile.licenceNumber') }}</span>
                  <!-- Placeholder is a licence-format example: it is not prose. -->
                  <input type="text" formControlName="licenceNumber"
                    placeholder="e.g. ΝΟΣ-2024-Α123" aria-describedby="licence-hint" />
                  @if (form.controls.licenceNumber.dirty && form.controls.licenceNumber.errors) {
                    <span class="field-error" id="licence-hint">{{ i18n.t('profile.licenceError') }}</span>
                  }
                </label>
                <label class="field">
                  <span class="field-label">{{ i18n.t('profile.hourlyRate') }}</span>
                  <input type="number" min="0" step="1" formControlName="hourlyRate" />
                </label>
              </fieldset>
            }

            <div class="card-actions">
              <button type="submit" class="btn" [disabled]="store.saving() || form.invalid">
                {{ store.saving() ? i18n.t('common.saving') : i18n.t('profile.save') }}
              </button>
              @if (store.saved()) {
                <span class="badge success" role="status">
                  <span class="dot"></span>{{ i18n.t('profile.saved') }}
                </span>
              }
            </div>

            @if (store.saveError()) {
              <p class="error" role="alert">{{ i18n.message(store.saveErrorSource(), store.saveError()) }}</p>
            }
          </form>

          <section class="card notif-prefs" aria-labelledby="notif-prefs-h">
            <h2 class="section-title" id="notif-prefs-h">{{ i18n.t('profile.notifTitle') }}</h2>
            <p class="section-hint">{{ i18n.t('profile.notifHint') }}</p>
            <div class="pref-list">
              @for (kind of allKinds; track kind) {
                <label class="pref-row">
                  <input
                    type="checkbox"
                    [checked]="notifications.isMuted(kind)"
                    (change)="notifications.toggleMute(kind)"
                  />
                  <span>{{ i18n.t('profile.muteKind', { kind }) }}</span>
                </label>
              }
              <label class="pref-row">
                <input type="checkbox" [checked]="pushGranted" (change)="requestPush()" />
                <span>{{ i18n.t('notifications.browserPush') }}</span>
              </label>
            </div>
          </section>
        </div>
      }
    </section>
  `,
  styles: `
    .profile-grid {
      grid-template-columns: repeat(auto-fit, minmax(21rem, 1fr));
      align-items: start;
    }
    .profile-form {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      max-width: none;
    }
    .profile-form .section-title {
      margin: 0;
      padding-bottom: var(--space-3);
      border-bottom: 1px solid var(--border);
    }
    fieldset {
      gap: var(--space-3);
      display: flex;
      flex-direction: column;
    }
    .card-actions {
      margin-top: 0;
      align-items: center;
      padding-top: var(--space-3);
      border-top: 1px solid var(--border);
    }
    .notif-prefs {
      display: grid;
      gap: var(--space-2);
      position: sticky;
      top: calc(var(--topbar-height) + var(--space-4));
    }
    .notif-prefs .section-title {
      margin: 0;
    }
    .pref-list {
      display: grid;
      gap: var(--space-1);
      margin-top: var(--space-2);
    }
    .pref-row {
      flex-direction: row;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2);
      border-radius: var(--radius-sm);
      color: var(--text);
      font-size: var(--text-sm);
      cursor: pointer;
      transition: background-color var(--dur-fast) ease;
    }
    .pref-row:hover {
      background: var(--surface-raised);
    }
  `,
})
export class ProfilePage implements OnInit {
  protected readonly i18n = inject(I18n);

  readonly store = inject(ProfileStore);
  private readonly session = inject(SessionStore);
  private readonly fb = inject(FormBuilder);
  readonly notifications = inject(NotificationsService);
  pushGranted = false;

  readonly initials = computed(() => {
    const name = this.session.displayName().trim();
    if (!name) {
      return '?';
    }
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  });

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
