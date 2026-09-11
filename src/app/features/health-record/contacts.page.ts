import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SessionStore } from '../../core/auth/session';
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
 */

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

const VALIDATION_MESSAGES: Record<string, string> = {
  unknown_kind: 'Άγνωστη κατηγορία επαφής.',
  name_required: 'Το όνομα είναι υποχρεωτικό.',
  phone_invalid: 'Το τηλέφωνο πρέπει να έχει τουλάχιστον 6 ψηφία.',
  email_invalid: 'Το email δεν είναι έγκυρο.',
};

@Component({
  selector: 'app-contacts',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <section class="contacts">
      <h1>Επαφές &amp; Τηλέφωνα</h1>
      <p class="meta">
        Οι επαφές έκτακτης ανάγκης (ICE) εμφανίζονται στη σύνοψη υγείας και στην εξαγωγή
        FHIR. Η ομάδα φροντίδας κρατά τα τηλέφωνα γιατρών, φαρμακείων και φροντιστών.
      </p>

      <p class="status" role="status" aria-live="polite">
        @if (store.actingKey()) {
          <span>Αποθήκευση…</span>
        } @else if (store.error()) {
          <span class="error" role="alert">{{ store.error() }}</span>
        } @else if (!canWrite()) {
          <span class="readonly">Προβολή μόνο — δεν έχετε δικαίωμα επεξεργασίας.</span>
        }
      </p>

      @for (kind of kinds; track kind) {
        <section class="group" [attr.aria-labelledby]="'contacts-' + kind">
          <div class="group-head">
            <h2 [id]="'contacts-' + kind">{{ kindLabel(kind) }}</h2>
            @if (canWrite()) {
              <button type="button" class="secondary" (click)="toggleForm(kind)">
                {{ openForm() === kind ? 'Κλείσιμο' : '+ Προσθήκη' }}
              </button>
            }
          </div>

          @if (openForm() === kind) {
            <form class="card form" (submit)="save(kind, $event)">
              <div class="grid">
                <label>
                  Όνομα *
                  <input type="text" required [value]="form().name"
                    (input)="patch('name', $any($event.target).value)" />
                </label>
                @if (kind === 'emergency') {
                  <label>
                    Σχέση (π.χ. κόρη, σύζυγος)
                    <input type="text" [value]="form().relationship"
                      (input)="patch('relationship', $any($event.target).value)" />
                  </label>
                } @else {
                  <label>
                    Ρόλος
                    <select [value]="form().careRole"
                      (change)="patch('careRole', $any($event.target).value)">
                      @for (role of careRoles; track role) {
                        <option [value]="role">{{ roleLabel(role) }}</option>
                      }
                    </select>
                  </label>
                }
                <label>
                  Τηλέφωνο *
                  <input type="tel" required autocomplete="tel" [value]="form().phone"
                    (input)="patch('phone', $any($event.target).value)" />
                </label>
                <label>
                  Δεύτερο τηλέφωνο
                  <input type="tel" [value]="form().altPhone"
                    (input)="patch('altPhone', $any($event.target).value)" />
                </label>
                <label>
                  Email
                  <input type="email" [value]="form().email"
                    (input)="patch('email', $any($event.target).value)" />
                </label>
                <label>
                  Διεύθυνση
                  <input type="text" [value]="form().address"
                    (input)="patch('address', $any($event.target).value)" />
                </label>
                <label>
                  Προτεραιότητα
                  <input type="number" min="0" [value]="form().priority"
                    (input)="patch('priority', +$any($event.target).value)" />
                </label>
                <label class="check">
                  <input type="checkbox" [checked]="form().isPrimary"
                    (change)="patch('isPrimary', $any($event.target).checked)" />
                  Κύρια επαφή
                </label>
                <label class="wide">
                  Σημειώσεις
                  <input type="text" [value]="form().notes"
                    (input)="patch('notes', $any($event.target).value)" />
                </label>
              </div>
              @if (formError()) {
                <p class="error" role="alert">{{ formError() }}</p>
              }
              <div class="actions">
                <button type="submit" [disabled]="saving()">Αποθήκευση</button>
                <button type="button" class="secondary" (click)="cancelForm()">Ακύρωση</button>
              </div>
            </form>
          }

          @for (contact of list(kind); track contact.id) {
            <article class="card contact" [class.primary]="contact.isPrimary">
              <div class="info">
                <h3>
                  {{ contactSummary(contact) }}
                  @if (contact.isPrimary) {
                    <span class="badge">Κύρια</span>
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
                  <p class="line">{{ contact.address }}</p>
                }
                @if (contact.notes) {
                  <p class="line">{{ contact.notes }}</p>
                }
              </div>
              @if (canWrite()) {
                <div class="contact-actions">
                  @if (!contact.isPrimary) {
                    <button type="button" class="link" (click)="setPrimary(contact.id)">Ορισμός ως κύρια</button>
                  }
                  <button type="button" class="link" (click)="edit(contact)">Επεξεργασία</button>
                  <button type="button" class="link danger" (click)="archive(contact.id)">Αρχειοθέτηση</button>
                </div>
              }
            </article>
          }

          @if (list(kind).length === 0) {
            <p class="empty">
              {{ kind === 'emergency'
                ? 'Δεν έχετε καταχωρήσει επαφή έκτακτης ανάγκης. Προσθέστε τουλάχιστον μία.'
                : 'Δεν έχετε καταχωρήσει επαφή στην ομάδα φροντίδας.' }}
            </p>
          }
        </section>
      }

      <p class="meta">
        Η προσωπική σας τηλέφωνο βρίσκεται στο
        <a routerLink="/profile">προφίλ</a>. Οι αριθμοί χρησιμοποιούνται και για
        ειδοποιήσεις SMS/φωνής στις <a routerLink="/reminders">υπενθυμίσεις</a>.
      </p>
    </section>
  `,
  styles: `
    .contacts { max-width: 60rem; }
    .group { margin: 1.2rem 0; }
    .group-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
    .card {
      border: 1px solid var(--border, #d8dde5);
      border-radius: 0.6rem;
      padding: 0.8rem 1rem;
      margin: 0.6rem 0;
      background: var(--surface, #fff);
    }
    .contact { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
    .contact.primary { border-left: 4px solid var(--accent, #4f7cff); }
    .card h3 { margin: 0 0 0.3rem; }
    .badge {
      display: inline-block;
      margin-left: 0.4rem;
      background: var(--accent, #4f7cff);
      color: #fff;
      border-radius: 999px;
      padding: 0.05rem 0.55rem;
      font-size: 0.75rem;
    }
    .phones { display: flex; gap: 0.9rem; flex-wrap: wrap; margin: 0.2rem 0; }
    .line { margin: 0.15rem 0; color: var(--text-muted); }
    .meta { color: var(--text-muted); }
    .empty { color: var(--text-muted); font-style: italic; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 0.6rem; }
    .grid label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.9rem; }
    .grid .wide { grid-column: 1 / -1; }
    .grid .check { flex-direction: row; align-items: center; gap: 0.4rem; }
    .actions { display: flex; gap: 0.6rem; margin-top: 0.6rem; }
    .contact-actions { display: flex; gap: 0.6rem; align-items: flex-start; flex-wrap: wrap; }
    button { min-height: 44px; padding: 0.4rem 0.9rem; cursor: pointer; }
    .link { background: none; border: none; color: var(--accent, #4f7cff); text-decoration: underline; min-height: auto; padding: 0.2rem; }
    .link.danger { color: var(--danger, #c62828); }
    .error { color: var(--danger, #c62828); }
    .readonly { color: var(--text-muted); }
  `,
})
export class ContactsPage {
  readonly store = inject(ContactsStore);
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
    return contactLabel(CONTACT_KIND_LABELS, kind);
  }

  roleLabel(role: string): string {
    return contactLabel(CARE_ROLE_LABELS, role);
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
      this.formError.set(VALIDATION_MESSAGES[errorKey] ?? 'Ελέγξτε τα στοιχεία.');
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
}
