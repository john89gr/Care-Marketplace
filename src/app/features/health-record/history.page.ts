import { Component, computed, effect, inject, signal } from '@angular/core';
import { SessionStore } from '../../core/auth/session';
import { HistoryStore } from './history.store';
import { PrescriptionsStore } from '../pharmacy/prescriptions.store';
import { VisitStore } from '../home-health/visit.store';
import { CareRecipient, pickRecipient } from './history.recipient';
import type {
  Allergy,
  AllergyDraft,
  AllergyKind,
  AllergySeverity,
  ConditionDraft,
  ConditionStatus,
  HistoryKind,
  Immunization,
  ImmunizationDraft,
  MedicalCondition,
  MedicalEvent,
  MedicalEventDraft,
  MedicalEventKind,
  PrescriptionDraft,
  PrescriptionRecord,
  Symptom,
  SymptomDraft,
  SymptomSeverity,
} from './history.models';
import {
  ALLERGY_KIND_LABELS,
  ALLERGY_SEVERITY_LABELS,
  CONDITION_STATUS_LABELS,
  EVENT_KIND_LABELS,
  HISTORY_KIND_LABELS,
  PRESCRIPTION_STATUS_LABELS,
  SYMPTOM_SEVERITY_LABELS,
  SYMPTOM_STATUS_LABELS,
  historyLabel,
} from './history.models';
import {
  ICD11_CATALOG,
  ICD11_CATEGORY_LABELS,
  icd11ByCode,
  icd11Label,
  isIcd11Code,
  searchIcd11,
} from './icd11';
import {
  buildTimeline,
  filterTimeline,
  groupTimelineByYear,
  TIMELINE_KIND_ICONS,
} from './history.timeline';
import { PrescriptionReminderComponent } from './prescription-reminder.component';

type Tab = HistoryKind | 'timeline';
type TabKey = Tab;

/** UI-level form state (date strings for <input type="date">). */
interface ConditionForm {
  name: string;
  icd11Code: string;
  status: ConditionStatus;
  diagnosedDate: string;
  notes: string;
}
interface AllergyForm {
  substance: string;
  kind: AllergyKind;
  reaction: string;
  severity: AllergySeverity;
  confirmedDate: string;
  notes: string;
}
interface ImmunizationForm {
  vaccine: string;
  doseNumber: string;
  administeredDate: string;
  notes: string;
}
interface EventForm {
  kind: MedicalEventKind;
  name: string;
  facility: string;
  occurredDate: string;
  notes: string;
}
interface SymptomForm {
  name: string;
  severity: SymptomSeverity;
  onsetDate: string;
  notes: string;
}
interface PrescriptionForm {
  drug: string;
  dose: string;
  instructions: string;
  prescriber: string;
  issuedDate: string;
  durationDays: string;
}

const today = (): string => {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const toMs = (date: string): number => {
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(ms) ? Date.now() : ms;
};

const emptyForms = (): {
  conditions: ConditionForm;
  allergies: AllergyForm;
  immunizations: ImmunizationForm;
  events: EventForm;
  symptoms: SymptomForm;
  prescriptions: PrescriptionForm;
} => ({
  conditions: { name: '', icd11Code: '', status: 'active', diagnosedDate: today(), notes: '' },
  allergies: { substance: '', kind: 'drug', reaction: '', severity: 'moderate', confirmedDate: today(), notes: '' },
  immunizations: { vaccine: '', doseNumber: '', administeredDate: today(), notes: '' },
  events: { kind: 'procedure', name: '', facility: '', occurredDate: today(), notes: '' },
  symptoms: { name: '', severity: 'moderate', onsetDate: today(), notes: '' },
  prescriptions: { drug: '', dose: '', instructions: '', prescriber: '', issuedDate: today(), durationDays: '' },
});

/**
 * Medical-history page (FEATURE_PLAN.md §21 subtasks 8–10, 17, 20): category
 * tabs (Conditions / Allergies / Immunizations / Events / Symptoms /
 * Prescriptions), inline add forms with an ICD-11 (Greek) code picker, soft
 * archive, prescription status actions + the §7 medications bridge, and a
 * chronological timeline with filter chips. Family roles (caregiver/nurse)
 * view read-only.
 */
@Component({
  selector: 'app-history',
  standalone: true,
  imports: [PrescriptionReminderComponent],
  template: `
    <section class="history">
      <h1>Ιατρικό ιστορικό</h1>
      <p class="disclaimer" role="note">
        Καταγράψτε διαγνώσεις, αλλεργίες, εμβολιασμούς, ιατρικά συμβάντα,
        συμπτώματα και συνταγές. Το ιστορικό σας είναι <strong>προσωπικό
        αρχείο</strong> — μοιράζεται μόνο όταν το επιτρέψετε. Οι κωδικοί
        ICD-11 είναι ενδεικτικό υποσύνολο, όχι ιατρική συμβουλή.
      </p>

      @if (store.error()) {
        <p class="error" role="alert">{{ store.error() }}</p>
      }
      @if (!canWrite()) {
        <p class="meta" role="note">
          @if (recipient(); as r) {
            Προβολή ιστορικού της <strong>{{ r.name }}</strong> — πρόσβαση
            οικογένειας, μόνο για ανάγνωση.
          } @else {
            Προβολή μόνο για ανάγνωση (πρόσβαση οικογένειας).
          }
        </p>
      }

      <div class="tabs" role="tablist" aria-label="Κατηγορίες ιστορικού">
        @for (tabKey of tabs; track tabKey) {
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="tab() === tabKey"
            [class.active]="tab() === tabKey"
            (click)="openTab(tabKey)"
          >
            {{ tabLabel(tabKey) }}
          </button>
        }
      </div>

      <p class="sr-only" aria-live="polite">{{ saveStatus() }}</p>

      @if (tab() === 'conditions') {
        @if (canWrite()) {
          <button type="button" class="secondary" (click)="toggleForm('conditions')">
            {{ showForm().conditions ? 'Κλείσιμο φόρμας' : '+ Προσθήκη πάθησης' }}
          </button>
        }
        @if (showForm().conditions) {
          <form class="card-form" (submit)="submitCondition($event)">
            <label>
              Όνομα
              <input type="text" required [value]="form().conditions.name"
                (input)="form().conditions.name = $any($event.target).value" />
            </label>
            <label>
              Κωδικός ICD-11 (αναζήτηση στα ελληνικά)
              <input type="text" list="icd11-options" placeholder="π.χ. BA00 ή «διαβήτης»"
                [value]="form().conditions.icd11Code"
                (input)="onIcd11Input($any($event.target).value)" />
              <datalist id="icd11-options">
                @for (entry of icd11Options(); track entry.code) {
                  <option [value]="entry.code + ' · ' + entry.labelEl">{{ entry.categoryLabel }}</option>
                }
              </datalist>
            </label>
            @if (icd11Hint()) {
              <p class="meta">{{ icd11Hint() }}</p>
            }
            <label>
              Κατάσταση
              <select [value]="form().conditions.status"
                (change)="form().conditions.status = $any($event.target).value">
                @for (key of conditionStatusKeys; track key) {
                  <option [value]="key">{{ enumLabel(CONDITION_STATUS_LABELS, key) }}</option>
                }
              </select>
            </label>
            <label>
              Ημερομηνία διάγνωσης
              <input type="date" required [value]="form().conditions.diagnosedDate"
                (input)="form().conditions.diagnosedDate = $any($event.target).value" />
            </label>
            <label>
              Σημειώσεις
              <input type="text" [value]="form().conditions.notes"
                (input)="form().conditions.notes = $any($event.target).value" />
            </label>
            <button type="submit" [disabled]="saving('conditions')">Αποθήκευση</button>
            <button type="button" class="secondary" (click)="toggleForm('conditions')">Ακύρωση</button>
          </form>
        }
        <ul class="items">
          @for (item of conditions(); track item.id) {
            <li>
              <div class="row">
                <div>
                  <h3>{{ item.name }}</h3>
                  <p class="meta">
                    @if (item.icd11Code) { {{ icd11Label(item.icd11Code) }} · }
                    {{ enumLabel(CONDITION_STATUS_LABELS, item.status) }} ·
                    {{ date(item.diagnosedAtMs) }}
                  </p>
                </div>
                @if (canWrite()) {
                  <div class="actions">
                    @if (item.status !== 'resolved') {
                      <button type="button" class="secondary" (click)="markResolved(item)">Ολοκληρώθηκε</button>
                    }
                    <button type="button" class="link" (click)="archive('conditions', item.id)">Αρχειοθέτηση</button>
                  </div>
                }
              </div>
            </li>
          }
        </ul>
        @if (conditions().length === 0) {
          <p class="meta">Καμία καταγεγραμμένη πάθηση.</p>
        }
      }

      @if (tab() === 'allergies') {
        @if (canWrite()) {
          <button type="button" class="secondary" (click)="toggleForm('allergies')">
            {{ showForm().allergies ? 'Κλείσιμο φόρμας' : '+ Προσθήκη αλλεργίας' }}
          </button>
        }
        @if (showForm().allergies) {
          <form class="card-form" (submit)="submitAllergy($event)">
            <label>
              Αλλεργιογόνο
              <input type="text" required [value]="form().allergies.substance"
                (input)="form().allergies.substance = $any($event.target).value" />
            </label>
            <label>
              Τύπος
              <select [value]="form().allergies.kind"
                (change)="form().allergies.kind = $any($event.target).value">
                @for (key of allergyKindKeys; track key) {
                  <option [value]="key">{{ enumLabel(ALLERGY_KIND_LABELS, key) }}</option>
                }
              </select>
            </label>
            <label>
              Σοβαρότητα
              <select [value]="form().allergies.severity"
                (change)="form().allergies.severity = $any($event.target).value">
                @for (key of allergySeverityKeys; track key) {
                  <option [value]="key">{{ enumLabel(ALLERGY_SEVERITY_LABELS, key) }}</option>
                }
              </select>
            </label>
            <label>
              Αντίδραση
              <input type="text" [value]="form().allergies.reaction"
                (input)="form().allergies.reaction = $any($event.target).value" />
            </label>
            <label>
              Ημερομηνία επιβεβαίωσης
              <input type="date" required [value]="form().allergies.confirmedDate"
                (input)="form().allergies.confirmedDate = $any($event.target).value" />
            </label>
            <label>
              Σημειώσεις
              <input type="text" [value]="form().allergies.notes"
                (input)="form().allergies.notes = $any($event.target).value" />
            </label>
            <button type="submit" [disabled]="saving('allergies')">Αποθήκευση</button>
            <button type="button" class="secondary" (click)="toggleForm('allergies')">Ακύρωση</button>
          </form>
        }
        <ul class="items">
          @for (item of allergies(); track item.id) {
            <li [class.severe]="item.severity === 'severe'">
              <div class="row">
                <div>
                  <h3>{{ item.substance }}</h3>
                  <p class="meta">
                    {{ enumLabel(ALLERGY_KIND_LABELS, item.kind) }} ·
                    {{ enumLabel(ALLERGY_SEVERITY_LABELS, item.severity) }} ·
                    {{ date(item.confirmedAtMs) }}
                    @if (item.reaction) { · {{ item.reaction }} }
                  </p>
                </div>
                @if (canWrite()) {
                  <div class="actions">
                    <button type="button" class="link" (click)="archive('allergies', item.id)">Αρχειοθέτηση</button>
                  </div>
                }
              </div>
            </li>
          }
        </ul>
        @if (allergies().length === 0) {
          <p class="meta">Καμία καταγεγραμμένη αλλεργία.</p>
        }
      }

      @if (tab() === 'immunizations') {
        @if (canWrite()) {
          <button type="button" class="secondary" (click)="toggleForm('immunizations')">
            {{ showForm().immunizations ? 'Κλείσιμο φόρμας' : '+ Προσθήκη εμβολιασμού' }}
          </button>
        }
        @if (showForm().immunizations) {
          <form class="card-form" (submit)="submitImmunization($event)">
            <label>
              Εμβόλιο
              <input type="text" required [value]="form().immunizations.vaccine"
                (input)="form().immunizations.vaccine = $any($event.target).value" />
            </label>
            <label>
              Δόση
              <input type="number" min="1" placeholder="1" [value]="form().immunizations.doseNumber"
                (input)="form().immunizations.doseNumber = $any($event.target).value" />
            </label>
            <label>
              Ημερομηνία χορήγησης
              <input type="date" required [value]="form().immunizations.administeredDate"
                (input)="form().immunizations.administeredDate = $any($event.target).value" />
            </label>
            <label>
              Σημειώσεις
              <input type="text" [value]="form().immunizations.notes"
                (input)="form().immunizations.notes = $any($event.target).value" />
            </label>
            <button type="submit" [disabled]="saving('immunizations')">Αποθήκευση</button>
            <button type="button" class="secondary" (click)="toggleForm('immunizations')">Ακύρωση</button>
          </form>
        }
        <ul class="items">
          @for (item of immunizations(); track item.id) {
            <li>
              <div class="row">
                <div>
                  <h3>{{ item.vaccine }}</h3>
                  <p class="meta">
                    {{ date(item.administeredAtMs) }}
                    @if (item.doseNumber) { · Δόση {{ item.doseNumber }} }
                    @if (item.source === 'wallet') { · από Gov.gr Wallet }
                  </p>
                </div>
                @if (canWrite()) {
                  <div class="actions">
                    <button type="button" class="link" (click)="archive('immunizations', item.id)">Αρχειοθέτηση</button>
                  </div>
                }
              </div>
            </li>
          }
        </ul>
        @if (immunizations().length === 0) {
          <p class="meta">Κανένας καταγεγραμμένος εμβολιασμός.</p>
        }
      }

      @if (tab() === 'events') {
        @if (canWrite()) {
          <button type="button" class="secondary" (click)="toggleForm('events')">
            {{ showForm().events ? 'Κλείσιμο φόρμας' : '+ Προσθήκη συμβάντος' }}
          </button>
        }
        @if (showForm().events) {
          <form class="card-form" (submit)="submitEvent($event)">
            <label>
              Τύπος
              <select [value]="form().events.kind"
                (change)="form().events.kind = $any($event.target).value">
                @for (key of eventKindKeys; track key) {
                  <option [value]="key">{{ enumLabel(EVENT_KIND_LABELS, key) }}</option>
                }
              </select>
            </label>
            <label>
              Περιγραφή
              <input type="text" required [value]="form().events.name"
                (input)="form().events.name = $any($event.target).value" />
            </label>
            <label>
              Φορέας / Νοσοκομείο
              <input type="text" [value]="form().events.facility"
                (input)="form().events.facility = $any($event.target).value" />
            </label>
            <label>
              Ημερομηνία
              <input type="date" required [value]="form().events.occurredDate"
                (input)="form().events.occurredDate = $any($event.target).value" />
            </label>
            <label>
              Σημειώσεις
              <input type="text" [value]="form().events.notes"
                (input)="form().events.notes = $any($event.target).value" />
            </label>
            <button type="submit" [disabled]="saving('events')">Αποθήκευση</button>
            <button type="button" class="secondary" (click)="toggleForm('events')">Ακύρωση</button>
          </form>
        }
        <ul class="items">
          @for (item of events(); track item.id) {
            <li>
              <div class="row">
                <div>
                  <h3>{{ item.name }}</h3>
                  <p class="meta">
                    {{ enumLabel(EVENT_KIND_LABELS, item.kind) }} ·
                    {{ date(item.occurredAtMs) }}
                    @if (item.facility) { · {{ item.facility }} }
                  </p>
                </div>
                @if (canWrite()) {
                  <div class="actions">
                    <button type="button" class="link" (click)="archive('events', item.id)">Αρχειοθέτηση</button>
                  </div>
                }
              </div>
            </li>
          }
        </ul>
        @if (events().length === 0) {
          <p class="meta">Κανένα καταγεγραμμένο ιατρικό συμβάν.</p>
        }
      }

      @if (tab() === 'symptoms') {
        @if (canWrite()) {
          <button type="button" class="secondary" (click)="toggleForm('symptoms')">
            {{ showForm().symptoms ? 'Κλείσιμο φόρμας' : '+ Προσθήκη συμπτώματος' }}
          </button>
        }
        @if (showForm().symptoms) {
          <form class="card-form" (submit)="submitSymptom($event)">
            <label>
              Σύμπτωμα
              <input type="text" required [value]="form().symptoms.name"
                (input)="form().symptoms.name = $any($event.target).value" />
            </label>
            <label>
              Ένταση
              <select [value]="form().symptoms.severity"
                (change)="form().symptoms.severity = $any($event.target).value">
                @for (key of symptomSeverityKeys; track key) {
                  <option [value]="key">{{ enumLabel(SYMPTOM_SEVERITY_LABELS, key) }}</option>
                }
              </select>
            </label>
            <label>
              Έναρξη
              <input type="date" required [value]="form().symptoms.onsetDate"
                (input)="form().symptoms.onsetDate = $any($event.target).value" />
            </label>
            <label>
              Σημειώσεις
              <input type="text" [value]="form().symptoms.notes"
                (input)="form().symptoms.notes = $any($event.target).value" />
            </label>
            <button type="submit" [disabled]="saving('symptoms')">Αποθήκευση</button>
            <button type="button" class="secondary" (click)="toggleForm('symptoms')">Ακύρωση</button>
          </form>
        }
        <ul class="items">
          @for (item of symptoms(); track item.id) {
            <li [class.severe]="item.severity === 'severe'">
              <div class="row">
                <div>
                  <h3>{{ item.name }}</h3>
                  <p class="meta">
                    {{ enumLabel(SYMPTOM_SEVERITY_LABELS, item.severity) }} ·
                    {{ enumLabel(SYMPTOM_STATUS_LABELS, item.status) }} ·
                    {{ date(item.onsetAtMs) }}
                  </p>
                </div>
                @if (canWrite()) {
                  <div class="actions">
                    @if (item.status === 'ongoing') {
                      <button type="button" class="secondary" (click)="resolveSymptom(item)">Υποχώρησε</button>
                    }
                    <button type="button" class="link" (click)="archive('symptoms', item.id)">Αρχειοθέτηση</button>
                  </div>
                }
              </div>
            </li>
          }
        </ul>
        @if (symptoms().length === 0) {
          <p class="meta">Κανένα καταγεγραμμένο σύμπτωμα.</p>
        }
      }

      @if (tab() === 'prescriptions') {
        @if (canWrite()) {
          <button type="button" class="secondary" (click)="toggleForm('prescriptions')">
            {{ showForm().prescriptions ? 'Κλείσιμο φόρμας' : '+ Προσθήκη συνταγής' }}
          </button>
        }
        @if (showForm().prescriptions) {
          <form class="card-form" (submit)="submitPrescription($event)">
            <label>
              Φάρμακο
              <input type="text" required [value]="form().prescriptions.drug"
                (input)="form().prescriptions.drug = $any($event.target).value" />
            </label>
            <label>
              Δοσολογία
              <input type="text" placeholder="π.χ. 500mg ×2" [value]="form().prescriptions.dose"
                (input)="form().prescriptions.dose = $any($event.target).value" />
            </label>
            <label>
              Οδηγίες
              <input type="text" placeholder="π.χ. πρωί και βράδυ" [value]="form().prescriptions.instructions"
                (input)="form().prescriptions.instructions = $any($event.target).value" />
            </label>
            <label>
              Συνταγογράφος
              <input type="text" [value]="form().prescriptions.prescriber"
                (input)="form().prescriptions.prescriber = $any($event.target).value" />
            </label>
            <label>
              Ημερομηνία έκδοσης
              <input type="date" required [value]="form().prescriptions.issuedDate"
                (input)="form().prescriptions.issuedDate = $any($event.target).value" />
            </label>
            <label>
              Διάρκεια (ημέρες)
              <input type="number" min="1" [value]="form().prescriptions.durationDays"
                (input)="form().prescriptions.durationDays = $any($event.target).value" />
            </label>
            <button type="submit" [disabled]="saving('prescriptions')">Αποθήκευση</button>
            <button type="button" class="secondary" (click)="toggleForm('prescriptions')">Ακύρωση</button>
          </form>
        }
        <ul class="items">
          @for (item of prescriptions(); track item.id) {
            <li>
              <div class="row">
                <div>
                  <h3>{{ item.drug }}</h3>
                  <p class="meta">
                    {{ date(item.issuedAtMs) }} ·
                    {{ enumLabel(PRESCRIPTION_STATUS_LABELS, item.status) }}
                    @if (item.dose) { · {{ item.dose }} }
                    @if (item.prescriber) { · {{ item.prescriber }} }
                    @if (item.medicationId) { · ✓ στο πρόγραμμα φαρμάκων }
                  </p>
                  @if (item.instructions) {
                    <p class="meta">{{ item.instructions }}</p>
                  }
                </div>
                @if (canWrite()) {
                  <div class="actions">
                    @if (item.status === 'active' && !item.medicationId) {
                      <button type="button" [disabled]="saving('prescriptions')"
                        (click)="toMedications(item)">+ Στα φάρμακα</button>
                      <button type="button" class="secondary" [disabled]="saving('prescriptions')"
                        (click)="openReminderWizard(item)">+ Υπενθύμιση από συνταγή</button>
                    }
                    @if (item.status === 'active') {
                      <button type="button" class="secondary" (click)="complete(item)">Ολοκληρώθηκε</button>
                      <button type="button" class="secondary" (click)="cancel(item)">Ακύρωση</button>
                    }
                    @if (!item.pharmacyPrescriptionId && scannedPrescriptions().length > 0) {
                      <label class="link-pharmacy">
                        <span class="sr-only">Σύνδεση με σκαναρισμένη συνταγή</span>
                        <select
                          aria-label="Σκαναρισμένη συνταγή"
                          [value]="linkSelections()[item.id] ?? ''"
                          (change)="setLinkSelection(item.id, $any($event.target).value)"
                        >
                          <option value="">Σύνδεση με σκαναρισμένη συνταγή…</option>
                          @for (scanned of scannedPrescriptions(); track scanned.id) {
                            <option [value]="scanned.id">#{{ scanned.id }} · {{ scannedMedLabel(scanned) }}</option>
                          }
                        </select>
                        @if (linkSelections()[item.id]) {
                          <button type="button" class="secondary" [disabled]="saving('prescriptions')"
                            (click)="linkScanned(item, linkSelections()[item.id])">Σύνδεση</button>
                        }
                      </label>
                    }
                    <button type="button" class="link" (click)="archive('prescriptions', item.id)">Αρχειοθέτηση</button>
                  </div>
                }
              </div>
            </li>
          }
        </ul>
        @if (prescriptions().length === 0) {
          <p class="meta">Καμία καταγεγραμμένη συνταγή.</p>
        }
        @if (reminderCandidate(); as candidate) {
          <app-prescription-reminder
            [prescription]="candidate"
            (closed)="closeReminderWizard()"
          />
        }
      }

      @if (tab() === 'timeline') {
        <div class="tabs secondary-tabs" role="group" aria-label="Φίλτρα χρονολογίου">
          <button type="button" [class.active]="timelineFilter() === ''" (click)="timelineFilter.set('')">Όλα</button>
          @for (tabKey of recordTabs; track tabKey) {
            <button type="button" [class.active]="timelineFilter() === tabKey"
              (click)="timelineFilter.set(tabKey)">
              {{ tabLabel(tabKey) }}
            </button>
          }
        </div>
        @if (timelineGroups().length === 0) {
          <p class="meta">Το χρονολόγιο θα γεμίσει όταν προσθέσετε τις πρώτες εγγραφές.</p>
        }
        @for (group of timelineGroups(); track group.year) {
          <h2 class="year">{{ group.year }}</h2>
          <ul class="items timeline">
            @for (entry of group.entries; track entry.key) {
              <li [class.archived]="entry.archived">
                <div class="row">
                  <div>
                    <h3>{{ TIMELINE_KIND_ICONS[entry.kind] }} {{ entry.title }}</h3>
                    <p class="meta">{{ entry.detail }} · {{ date(entry.atMs) }}</p>
                  </div>
                </div>
              </li>
            }
          </ul>
        }
      }
    </section>
  `,
  styles: `
    .disclaimer {
      background: var(--surface-2, #eef1f6);
      border-radius: 0.5rem;
      padding: 0.6rem 0.9rem;
      font-size: 0.9rem;
    }
    .tabs { display: flex; gap: 0.4rem; margin: 1rem 0; flex-wrap: wrap; }
    .tabs button { border: 1px solid var(--border, #d9dee7); background: none; padding: 0.4rem 0.9rem; border-radius: 999px; cursor: pointer; }
    .tabs button.active { background: var(--accent, #4f7cff); color: #fff; }
    .secondary-tabs { margin-top: 0; }
    .card-form {
      border: 1px solid var(--border, #d9dee7);
      border-radius: 0.6rem;
      padding: 1rem;
      margin: 1rem 0;
      display: grid;
      gap: 0.6rem;
      max-width: 34rem;
    }
    .card-form label { display: grid; gap: 0.25rem; font-size: 0.9rem; }
    .card-form input, .card-form select {
      padding: 0.45rem 0.6rem;
      border: 1px solid var(--border, #d9dee7);
      border-radius: 0.4rem;
      font: inherit;
    }
    .items { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
    .items li { border: 1px solid var(--border, #d9dee7); border-radius: 0.6rem; padding: 0.75rem 1rem; }
    .items li.severe { border-color: var(--danger, #c62828); }
    .items li.archived { opacity: 0.55; }
    .row { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; align-items: start; }
    .row h3 { margin: 0 0 0.25rem; font-size: 1rem; }
    .actions { display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; }
    .link-pharmacy { display: inline-flex; gap: 0.4rem; align-items: center; }
    .link-pharmacy select { padding: 0.3rem 0.5rem; border: 1px solid var(--border, #d9dee7); border-radius: 0.4rem; max-width: 16rem; }
    .link { background: none; border: none; color: var(--accent, #4f7cff); cursor: pointer; padding: 0; font: inherit; text-decoration: underline; }
    .year { font-size: 1.1rem; margin: 1.2rem 0 0.4rem; }
    .error { color: var(--danger, #c62828); }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  `,
})
export class HistoryPage {
  readonly store = inject(HistoryStore);
  readonly pharmacy = inject(PrescriptionsStore);
  private readonly session = inject(SessionStore);
  private readonly visits = inject(VisitStore);

  /**
   * The client whose record a family role is viewing (§21 subtask 16); null
   * for the owner (client), who reads their own record via the /me routes.
   */
  readonly recipient = signal<CareRecipient | null>(null);
  private _recipientResolving = false;

  readonly tabs: TabKey[] = ['conditions', 'allergies', 'immunizations', 'events', 'symptoms', 'prescriptions', 'timeline'];
  readonly recordTabs: HistoryKind[] = ['conditions', 'allergies', 'immunizations', 'events', 'symptoms', 'prescriptions'];

  readonly tab = signal<Tab>('conditions');
  readonly timelineFilter = signal<HistoryKind | ''>('');
  /** Per-register-entry selected scanned pharmacy prescription (link control). */
  readonly linkSelections = signal<Record<string, string>>({});

  readonly showForm = signal({
    conditions: false,
    allergies: false,
    immunizations: false,
    events: false,
    symptoms: false,
    prescriptions: false,
  });
  readonly form = signal(emptyForms());

  readonly TIMELINE_KIND_ICONS = TIMELINE_KIND_ICONS;
  readonly icd11Label = icd11Label;
  readonly CONDITION_STATUS_LABELS = CONDITION_STATUS_LABELS;
  readonly ALLERGY_KIND_LABELS = ALLERGY_KIND_LABELS;
  readonly ALLERGY_SEVERITY_LABELS = ALLERGY_SEVERITY_LABELS;
  readonly EVENT_KIND_LABELS = EVENT_KIND_LABELS;
  readonly SYMPTOM_SEVERITY_LABELS = SYMPTOM_SEVERITY_LABELS;
  readonly SYMPTOM_STATUS_LABELS = SYMPTOM_STATUS_LABELS;
  readonly PRESCRIPTION_STATUS_LABELS = PRESCRIPTION_STATUS_LABELS;

  readonly conditionStatusKeys = Object.keys(CONDITION_STATUS_LABELS);
  readonly allergyKindKeys = Object.keys(ALLERGY_KIND_LABELS);
  readonly allergySeverityKeys = Object.keys(ALLERGY_SEVERITY_LABELS);
  readonly eventKindKeys = Object.keys(EVENT_KIND_LABELS);
  readonly symptomSeverityKeys = Object.keys(SYMPTOM_SEVERITY_LABELS);

  /** RBAC (subtask 7): only the client owns the record; family roles read-only. */
  readonly canWrite = computed(() => {
    const roles = this.session.roles();
    return roles.length === 0 || roles.includes('client');
  });

  readonly conditions = computed(() =>
    [...this.store.records('conditions')].sort((a, b) => b.diagnosedAtMs - a.diagnosedAtMs)
  );
  readonly allergies = computed(() =>
    [...this.store.records('allergies')].sort((a, b) => b.confirmedAtMs - a.confirmedAtMs)
  );
  readonly immunizations = computed(() =>
    [...this.store.records('immunizations')].sort((a, b) => b.administeredAtMs - a.administeredAtMs)
  );
  readonly events = computed(() =>
    [...this.store.records('events')].sort((a, b) => b.occurredAtMs - a.occurredAtMs)
  );
  readonly symptoms = computed(() =>
    [...this.store.records('symptoms')].sort((a, b) => b.onsetAtMs - a.onsetAtMs)
  );
  readonly prescriptions = computed(() =>
    [...this.store.records('prescriptions')].sort((a, b) => b.issuedAtMs - a.issuedAtMs)
  );

  readonly icd11Options = computed(() =>
    searchIcd11(this.form().conditions.icd11Code).map((e) => ({
      ...e,
      categoryLabel: ICD11_CATEGORY_LABELS[e.category].el,
    }))
  );

  readonly icd11Hint = computed(() => {
    const code = this.form().conditions.icd11Code.trim();
    if (!code) {
      return '';
    }
    return isIcd11Code(code) ? icd11Label(code) : '';
  });

  readonly saveStatus = computed(() => {
    const acting = this.store.actingKey();
    return acting ? 'Αποθήκευση…' : this.store.error() ? this.store.error() : '';
  });

  readonly timelineGroups = computed(() => {
    const entries = filterTimeline(
      buildTimeline({
        conditions: this.store.records('conditions'),
        allergies: this.store.records('allergies'),
        immunizations: this.store.records('immunizations'),
        events: this.store.records('events'),
        symptoms: this.store.records('symptoms'),
        prescriptions: this.store.records('prescriptions'),
      }),
      this.timelineFilter()
    );
    return groupTimelineByYear(entries);
  });

  constructor() {
    this.store.setReadOnly(!this.canWrite());
    if (this.canWrite()) {
      // Owner: the client's own record via /me/history/:kind. Pin the target
      // explicitly so a family read from an earlier session can never leak in.
      this.store.setRecipient(null);
      for (const kind of this.recordTabs) {
        this.store.load(kind).subscribe();
      }
    } else {
      // Family roles (caregiver/nurse) view a care recipient's record.
      this.resolveRecipient();
    }
  }

  /**
   * Family view (§21 subtask 16): the caregiver/nurse has no register of their
   * own, so resolve *whose* record to open from the clients on their visits
   * (fallback: the demo client) and load every kind through
   * `/history/:userId/:kind`. The server refuses unless the recipient granted
   * `family_sharing` — a 403 surfaces through `store.error()`.
   */
  private resolveRecipient(): void {
    if (this._recipientResolving) {
      return;
    }
    this._recipientResolving = true;
    this.visits.load();
    effect(() => {
      if (this.recipient() || this.visits.loading()) {
        return;
      }
      // Demo fallback mirrors the seeded nurse/caregiver accounts (Maria).
      const picked = pickRecipient(this.visits.visits(), {
        userId: 'u-client',
        name: 'Maria Papadopoulou',
      });
      if (!picked) {
        return;
      }
      this.recipient.set(picked);
      this.store.setRecipient(picked.userId);
      for (const kind of this.recordTabs) {
        this.store.load(kind).subscribe();
      }
    });
  }

  openTab(tabKey: TabKey): void {
    this.tab.set(tabKey);
    if (tabKey !== 'timeline') {
      this.store.load(tabKey).subscribe();
    }
  }

  toggleForm(kind: HistoryKind): void {
    this.showForm.update((s) => ({ ...s, [kind]: !s[kind] }));
  }

  saving(kind: HistoryKind): boolean {
    return this.store.actingKey()?.startsWith(`${kind}:`) === true || this.store.actingKey() === kind;
  }

  // ---- Condition form ----

  onIcd11Input(value: string): void {
    // Picker options render as "CODE · Greek label"; keep only the code.
    const code = value.trim().split(/\s/)[0] ?? '';
    const form = this.form();
    form.conditions.icd11Code = code;
    // Auto-fill the name from the Greek label when a curated code is chosen.
    if (isIcd11Code(code) && !form.conditions.name.trim()) {
      const entry = icd11ByCode(code);
      if (entry) {
        form.conditions.name = entry.labelEl;
      }
    }
    this.form.set({ ...form });
  }

  submitCondition(event: Event): void {
    event.preventDefault();
    if (!this.canWrite()) return;
    const f = this.form().conditions;
    const draft: ConditionDraft = {
      name: f.name.trim(),
      icd11Code: f.icd11Code.trim() || undefined,
      status: f.status,
      diagnosedAtMs: toMs(f.diagnosedDate),
      notes: f.notes.trim(),
    };
    this.store.add('conditions', draft).subscribe((ok) => {
      if (ok) this.resetForm('conditions');
    });
  }

  markResolved(item: MedicalCondition): void {
    this.store.update('conditions', item.id, { status: 'resolved', resolvedAtMs: Date.now() }).subscribe();
  }

  // ---- Allergy form ----

  submitAllergy(event: Event): void {
    event.preventDefault();
    if (!this.canWrite()) return;
    const f = this.form().allergies;
    const draft: AllergyDraft = {
      substance: f.substance.trim(),
      kind: f.kind,
      reaction: f.reaction.trim() || undefined,
      severity: f.severity,
      confirmedAtMs: toMs(f.confirmedDate),
      notes: f.notes.trim(),
    };
    this.store.add('allergies', draft).subscribe((ok) => {
      if (ok) this.resetForm('allergies');
    });
  }

  // ---- Immunization form ----

  submitImmunization(event: Event): void {
    event.preventDefault();
    if (!this.canWrite()) return;
    const f = this.form().immunizations;
    const dose = Number(f.doseNumber);
    const draft: ImmunizationDraft = {
      vaccine: f.vaccine.trim(),
      doseNumber: f.doseNumber.trim() && dose > 0 ? dose : undefined,
      administeredAtMs: toMs(f.administeredDate),
      source: 'manual',
      notes: f.notes.trim(),
    };
    this.store.add('immunizations', draft).subscribe((ok) => {
      if (ok) this.resetForm('immunizations');
    });
  }

  // ---- Event form ----

  submitEvent(event: Event): void {
    event.preventDefault();
    if (!this.canWrite()) return;
    const f = this.form().events;
    const draft: MedicalEventDraft = {
      kind: f.kind,
      name: f.name.trim(),
      facility: f.facility.trim() || undefined,
      occurredAtMs: toMs(f.occurredDate),
      notes: f.notes.trim(),
    };
    this.store.add('events', draft).subscribe((ok) => {
      if (ok) this.resetForm('events');
    });
  }

  // ---- Symptom form ----

  submitSymptom(event: Event): void {
    event.preventDefault();
    if (!this.canWrite()) return;
    const f = this.form().symptoms;
    const draft: SymptomDraft = {
      name: f.name.trim(),
      severity: f.severity,
      onsetAtMs: toMs(f.onsetDate),
      status: 'ongoing',
      notes: f.notes.trim(),
    };
    this.store.add('symptoms', draft).subscribe((ok) => {
      if (ok) this.resetForm('symptoms');
    });
  }

  resolveSymptom(item: Symptom): void {
    this.store.update('symptoms', item.id, { status: 'resolved' }).subscribe();
  }

  // ---- Prescription form + actions ----

  submitPrescription(event: Event): void {
    event.preventDefault();
    if (!this.canWrite()) return;
    const f = this.form().prescriptions;
    const days = Number(f.durationDays);
    const draft: PrescriptionDraft = {
      drug: f.drug.trim(),
      dose: f.dose.trim() || undefined,
      instructions: f.instructions.trim() || undefined,
      prescriber: f.prescriber.trim() || undefined,
      issuedAtMs: toMs(f.issuedDate),
      durationDays: f.durationDays.trim() && days > 0 ? days : undefined,
      status: 'active',
    };
    this.store.add('prescriptions', draft).subscribe((ok) => {
      if (ok) this.resetForm('prescriptions');
    });
  }

  complete(item: PrescriptionRecord): void {
    this.store.completePrescription(item.id).subscribe();
  }

  /** Scanned pharmacy prescriptions available for linking (§21 subtask 12). */
  readonly scannedPrescriptions = computed(() => this.pharmacy.items());

  scannedMedLabel(scanned: { id: string; meds: { name: string }[] }): string {
    return scanned.meds.map((m) => m.name).join(', ') || '—';
  }

  setLinkSelection(id: string, pharmacyPrescriptionId: string): void {
    this.linkSelections.update((map) => ({ ...map, [id]: pharmacyPrescriptionId }));
  }

  linkScanned(item: PrescriptionRecord, pharmacyPrescriptionId: string): void {
    if (!pharmacyPrescriptionId) {
      return;
    }
    this.store.linkPharmacyPrescription(item.id, pharmacyPrescriptionId).subscribe((ok) => {
      if (ok) {
        this.linkSelections.update((map) => {
          const next = { ...map };
          delete next[item.id];
          return next;
        });
      }
    });
  }

  cancel(item: PrescriptionRecord): void {
    this.store.cancelPrescription(item.id).subscribe();
  }

  toMedications(item: PrescriptionRecord): void {
    this.store.addPrescriptionToMedications(item.id).subscribe();
  }

  /** Track 3: prescription → pill-reminder wizard. */
  readonly reminderCandidate = signal<PrescriptionRecord | null>(null);

  openReminderWizard(item: PrescriptionRecord): void {
    this.reminderCandidate.set(item);
  }

  closeReminderWizard(): void {
    this.reminderCandidate.set(null);
  }

  // ---- Shared ----

  archive(kind: HistoryKind, id: string): void {
    this.store.archive(kind, id).subscribe();
  }

  resetForm(kind: HistoryKind): void {
    const next = emptyForms();
    const current = this.form();
    // Keep every other tab's in-progress values intact.
    this.form.set({ ...current, [kind]: next[kind] });
    this.showForm.update((s) => ({ ...s, [kind]: false }));
  }

  enumLabel(map: Record<string, { el: string; en: string }>, key: string): string {
    return historyLabel(map, key);
  }

  tabLabel(tabKey: TabKey): string {
    if (tabKey === 'timeline') {
      return 'Χρονολόγιο';
    }
    return HISTORY_KIND_LABELS[tabKey].el;
  }

  date(ms: number): string {
    if (!ms) return '—';
    return new Date(ms).toLocaleDateString('el-GR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
}