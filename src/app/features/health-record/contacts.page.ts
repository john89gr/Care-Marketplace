import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionStore } from '../../core/auth/session';
import { I18n } from '../../core/i18n/i18n.service';
import { ContactsStore } from './contacts.store';
import {
  CARE_ROLE_KEYS,
  CARE_ROLE_LABELS,
  CONTACT_KIND_LABELS,
  ContactDraft,
  ContactKind,
  MedicalContact,
  contactLabel,
  contactSummary,
  normalizePhone,
  telHref,
  validateContactDraft,
} from './contacts.models';

/**
 * Contact phone manager page (FEATURE_PLAN.md — contact phone manager):
 * an accessible directory with two groups — Emergency / ICE (tap-to-call,
 * feeds the health-summary export and FHIR `Patient.contact`) and the care
 * team. Add/edit/archive with a single primary per kind; family roles get a
 * read-only view (RBAC mirrors the other PHR pages).
 *
 * Bilingual: kind/role names come from the shared bilingual catalogs, UI copy
 * from i18n. The `article.contact` / `section.group` / `.badge` structure is
 * load-bearing for the E2E suite.
 */
@Component({
  selector: 'app-contacts',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <section class="contacts">
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('contacts.title') }}</h1>
          <p class="page-subtitle">{{ i18n.t('contacts.subtitle') }}</p>
        </div>
      </header>

      <p class="status" role="status" aria-live="polite">
        @if (store.actingKey()) {
          <span>{{ i18n.t('common.saving') }}</span>
        } @else if (store.error()) {
          <span class="error" role="alert">{{ i18n.message(store.errorSource(), store.error()) }}</span>
        } @else if (!canWrite()) {
          <span class="readonly">{{ i18n.t('contacts.readOnly') }}</span>
        }
      </p>

      @for (kind of kinds; track kind) {
        <section class="group" [attr.aria-labelledby]="'contacts-' + kind">
          <div class="group-head">
            <h2 [id]="'contacts-' + kind">{{ kindLabel(kind) }}</h2>
            @if (canWrite()) {
              <button type="button" class="btn secondary sm" (click)="toggleForm(kind)">
                {{ openForm() === kind ? i18n.t('common.close') : i18n.t('contacts.add') }}
              </button>
            }
          </div>

          @if (openForm() === kind) {
            <form class="card form" (submit)="save(kind, $event)">
              <div class="form-grid">
                <label class="field">
                  <span class="field-label">{{ i18n.t('contacts.nameLabel') }}</span>
                  <input
                    type="text"
                    required
                    [value]="form().name"
                    (input)="patch('name', $any($event.target).value)"
                  />
                </label>
                @if (kind === 'emergency') {
                  <label class="field">
                    <span class="field-label">{{ i18n.t('contacts.relationshipHint') }}</span>
                    <input
                      type="text"
                      [value]="form().relationship"
                      (input)="patch('relationship', $any($event.target).value)"
                    />
                  </label>
                } @else {
                  <label class="field">
                    <span class="field-label">{{ i18n.t('contacts.roleLabel') }}</span>
                    <select
                      [value]="form().careRole"
                      (change)="patch('careRole', $any($event.target).value)"
                    >
                      @for (role of careRoles; track role) {
                        <option [value]="role">{{ roleLabel(role) }}</option>
                      }
                    </select>
                  </label>
                }
                <label class="field">
                  <span class="field-label">{{ i18n.t('contacts.phoneLabel') }}</span>
                  <input
                    type="tel"
                    required
                    autocomplete="tel"
                    [value]="form().phone"
                    (input)="patch('phone', $any($event.target).value)"
                  />
                </label>
                <label class="field">
                  <span class="field-label">{{ i18n.t('contacts.altPhoneLabel') }}</span>
                  <input
                    type="tel"
                    [value]="form().altPhone"
                    (input)="patch('altPhone', $any($event.target).value)"
                  />
                </label>
                <label class="field">
                  <span class="field-label">{{ i18n.t('contacts.emailLabel') }}</span>
                  <input
                    type="email"
                    [value]="form().email"
                    (input)="patch('email', $any($event.target).value)"
                  />
                </label>
                <label class="field">
                  <span class="field-label">{{ i18n.t('contacts.addressLabel') }}</span>
                  <input
                    type="text"
                    [value]="form().address"
                    (input)="patch('address', $any($event.target).value)"
                  />
                </label>
                <label class="field">
                  <span class="field-label">{{ i18n.t('contacts.priorityLabel') }}</span>
                  <input
                    type="number"
                    min="0"
                    [value]="form().priority"
                    (input)="patch('priority', +$any($event.target).value)"
                  />
                </label>
                <label class="check">
                  <input
                    type="checkbox"
                    [checked]="form().isPrimary"
                    (change)="patch('isPrimary', $any($event.target).checked)"
                  />
                  {{ i18n.t('contacts.primaryLabel') }}
                </label>
                <label class="field wide">
                  <span class="field-label">{{ i18n.t('contacts.notesLabel') }}</span>
                  <input
                    type="text"
                    [value]="form().notes"
                    (input)="patch('notes', $any($event.target).value)"
                  />
                </label>
              </div>
              @if (formError()) {
                <p class="error" role="alert">{{ formError() }}</p>
              }
              <div class="card-actions">
                <button type="submit" class="btn" [disabled]="saving()">
                  {{ i18n.t('common.save') }}
                </button>
                <button type="button" class="btn secondary" (click)="cancelForm()">
                  {{ i18n.t('common.cancel') }}
                </button>
              </div>
            </form>
          }

          @for (contact of list(kind); track contact.id) {
            <article class="card contact" [class.primary]="contact.isPrimary">
              <div class="info">
                <h3 class="contact-name">
                  {{ contactSummary(contact) }}
                  @if (contact.isPrimary) {
                    <span class="badge accent">{{ i18n.t('contacts.primaryBadge') }}</span>
                  }
                </h3>
                <p class="phones">
                  <a [href]="telHref(contact.phone)">📞 {{ contact.phone }}</a>
                  @if (contact.altPhone) {
                    <a [href]="telHref(contact.altPhone)">📞 {{ contact.altPhone }}</a>
                  }
                  @if (contact.email) {
                    <a [href]="'mailto:' + contact.email">✉️ {{ contact.email }}</a>
                  }
                </p>
                @if (contact.address) {
                  <p class="meta">{{ contact.address }}</p>
                }
                @if (contact.notes) {
                  <p class="meta">{{ contact.notes }}</p>
                }
              </div>
              @if (canWrite()) {
                <div class="contact-actions">
                  @if (!contact.isPrimary) {
                    <button type="button" class="link" (click)="setPrimary(contact.id)">
                      {{ i18n.t('contacts.setPrimary') }}
                    </button>
                  }
                  <button type="button" class="link" (click)="edit(contact)">
                    {{ i18n.t('contacts.edit') }}
                  </button>
                  <button type="button" class="link danger" (click)="archive(contact.id)">
                    {{ i18n.t('contacts.archive') }}
                  </button>
                </div>
              }
            </article>
          }

          @if (list(kind).length === 0) {
            <p class="empty-state">
              {{
                kind === 'emergency'
                  ? i18n.t('contacts.emptyEmergency')
                  : i18n.t('contacts.emptyCare')
              }}
            </p>
          }
        </section>
      }

      <p class="meta">
        {{ i18n.t('contacts.footerLead') }}<a routerLink="/profile">{{
          i18n.t('contacts.footerProfile')
        }}</a
        >{{ i18n.t('contacts.footerMid') }}<a routerLink="/reminders">{{
          i18n.t('contacts.footerReminders')
        }}</a
        >.
      </p>
    </section>
  `,
  styles: `
    .contacts {
      max-width: 62rem;
    }
    .group {
      margin: var(--space-5) 0;
    }
    .group-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-4);
      margin-bottom: var(--space-3);
    }
    .contact {
      display: flex;
      justify-content: space-between;
      gap: var(--space-4);
      flex-wrap: wrap;
      margin-bottom: var(--space-3);
    }
    .contact.primary {
      border-left: 3px solid var(--accent);
    }
    .contact-name {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
      margin: 0 0 var(--space-1);
      font-size: var(--text-md);
    }
    .phones {
      display: flex;
      gap: var(--space-4);
      flex-wrap: wrap;
      margin: var(--space-1) 0;
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
      gap: var(--space-3);
    }
    .form-grid .wide {
      grid-column: 1 / -1;
    }
    .check {
      flex-direction: row;
      align-items: center;
      gap: var(--space-2);
      color: var(--text);
    }
    .check input {
      width: auto;
    }
    .contact-actions {
      display: flex;
      gap: var(--space-3);
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .readonly {
      color: var(--text-muted);
    }
  `,
})
export class ContactsPage {
  readonly store = inject(ContactsStore);
  protected readonly i18n = inject(I18n);
  private readonly session = inject(SessionStore);

  readonly kinds: ContactKind[] = ['emergency', 'care'];
  readonly careRoles = CARE_ROLE_KEYS;

  readonly openForm = signal<ContactKind | null>(null);
  readonly form = signal<ContactForm>(emptyForm());
  readonly formError = signal('');
  private readonly editingId = signal<string | null>(null);

  /** RBAC: only the client owns the directory; family roles read-only. */
  readonly canWrite = computed(() => {
    const roles = this.session.roles();
    return roles.length === 0 || roles.includes('client');
  });

  readonly saving = computed(() => this.store.actingKey() !== null);

  constructor() {
    this.store.load().subscribe();
    this.store.setReadOnly(!this.canWrite());
  }

  list(kind: ContactKind): MedicalContact[] {
    return this.store.list(kind);
  }

  kindLabel(kind: ContactKind): string {
    return contactLabel(CONTACT_KIND_LABELS, kind, this.i18n.language());
  }

  roleLabel(role: string): string {
    return contactLabel(CARE_ROLE_LABELS, role, this.i18n.language());
  }

  readonly contactSummary = contactSummary;
  readonly telHref = telHref;

  patch<K extends keyof ContactForm>(key: K, value: ContactForm[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  toggleForm(kind: ContactKind): void {
    if (this.openForm() === kind) {
      this.cancelForm();
      return;
    }
    this.editingId.set(null);
    this.form.set(emptyForm());
    this.formError.set('');
    this.openForm.set(kind);
  }

  edit(contact: MedicalContact): void {
    this.editingId.set(contact.id);
    this.form.set({
      name: contact.name,
      relationship: contact.relationship,
      careRole: CARE_ROLE_LABELS[contact.relationship as keyof typeof CARE_ROLE_LABELS]
        ? contact.relationship
        : 'other',
      phone: contact.phone,
      altPhone: contact.altPhone ?? '',
      email: contact.email ?? '',
      address: contact.address ?? '',
      notes: contact.notes ?? '',
      priority: contact.priority,
      isPrimary: contact.isPrimary,
    });
    this.formError.set('');
    this.openForm.set(contact.kind);
  }

  cancelForm(): void {
    this.openForm.set(null);
    this.editingId.set(null);
    this.form.set(emptyForm());
    this.formError.set('');
  }

  save(kind: ContactKind, event: Event): void {
    event.preventDefault();
    const f = this.form();
    const draft: ContactDraft = {
      kind,
      name: f.name.trim(),
      relationship: (kind === 'care' ? f.careRole : f.relationship).trim(),
      phone: normalizePhone(f.phone) || f.phone.trim(),
      altPhone: normalizePhone(f.altPhone) || undefined,
      email: f.email.trim() || undefined,
      address: f.address.trim() || undefined,
      notes: f.notes.trim() || undefined,
      isPrimary: f.isPrimary,
      priority: Number.isFinite(f.priority) ? Math.max(0, Math.round(f.priority)) : 0,
    };
    const errorKey = validateContactDraft(draft);
    if (errorKey) {
      this.formError.set(this.validationMessage(errorKey));
      return;
    }
    this.formError.set('');
    const id = this.editingId();
    const done = () => this.cancelForm();
    if (id) {
      this.store.update(id, draft).subscribe((ok) => ok && done());
    } else {
      this.store.add(draft).subscribe((ok) => ok && done());
    }
  }

  setPrimary(id: string): void {
    this.store.setPrimary(id).subscribe();
  }

  archive(id: string): void {
    this.store.archive(id).subscribe();
  }

  /** Validation keys are raw codes from `validateContactDraft`. */
  private validationMessage(errorKey: string): string {
    const known = ['unknown_kind', 'name_required', 'phone_invalid', 'email_invalid'];
    return known.includes(errorKey)
      ? this.i18n.t(`contacts.validation.${errorKey}`)
      : this.i18n.t('contacts.validation.generic');
  }
}

interface ContactForm {
  name: string;
  relationship: string;
  careRole: string;
  phone: string;
  altPhone: string;
  email: string;
  address: string;
  notes: string;
  priority: number;
  isPrimary: boolean;
}

function emptyForm(): ContactForm {
  return {
    name: '',
    relationship: '',
    careRole: 'doctor',
    phone: '',
    altPhone: '',
    email: '',
    address: '',
    notes: '',
    priority: 0,
    isPrimary: false,
  };
}
