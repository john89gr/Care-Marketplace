import { Component, computed, inject, input, signal } from '@angular/core';
import { SessionStore } from '../../core/auth/session';
import { MedicationsStore } from './medications.store';
import type { Medication } from './medications.logic';
import {
  FOOD_RELATION_KEYS,
  FOOD_RELATION_LABELS,
  MAX_WARNINGS,
  MEDICINE_ROUTE_KEYS,
  MEDICINE_ROUTE_LABELS,
  MedicineInstructions,
  emptyInstructions,
  hasInstructions,
  medicineLabel,
  normalizeInstructions,
} from './medicine.info';
import { applyCatalog, findMedicineInfo } from './medicine.catalog';

/**
 * Structured medicine instructions editor (FEATURE_PLAN.md — medicine
 * instructions manager): a per-pill "how to take it" sheet (dose form, route,
 * food relation, max daily doses, warnings, side effects, storage, special
 * instructions) with a curated catalog auto-fill. Saves through the
 * MedicationStore (optimistic, rolled back on failure).
 *
 * Informational convenience only — never medical advice; the copy says so.
 * A11y: fieldset/legend, labelled fields, `aria-live` save status.
 */
@Component({
  selector: 'app-medicine-instructions',
  standalone: true,
  imports: [],
  template: `
    @if (medication(); as med) {
      <div class="instr">
        <button
          type="button"
          class="toggle"
          [attr.aria-expanded]="open()"
          (click)="toggle()"
        >
          💊 How to take {{ med.name }}
          <span class="meta">{{ summaryText(med) }}</span>
        </button>

        @if (open()) {
          <div class="sheet">
            @if (catalogHit(med); as hit) {
              <p class="catalog" role="note">
                Catalog suggestion available ({{ hit }}). This is general
                information, not medical advice — check with your doctor or
                pharmacist.
              </p>
              @if (confirmAutofill()) {
                <button type="button" class="danger" (click)="autofill(med)">
                  Replace my sheet with the catalog suggestion
                </button>
                <button type="button" class="secondary" (click)="cancelAutofill()">
                  Keep my edits
                </button>
              } @else {
                <button type="button" class="secondary" (click)="autofill(med)">
                  Auto-fill from catalog
                </button>
              }
            }

            <fieldset [disabled]="!canWrite()">
              <legend>Instructions for {{ med.name }}</legend>

              <div class="grid">
                <label>
                  Dose form
                  <input
                    type="text"
                    placeholder="e.g. Tablet / Σιρόπι"
                    [value]="form().doseForm ?? ''"
                    (input)="patch('doseForm', $any($event.target).value)"
                  />
                </label>

                <label>
                  Route
                  <select
                    [value]="form().route ?? 'oral'"
                    (change)="patch('route', $any($event.target).value)"
                  >
                    @for (r of routes; track r) {
                      <option [value]="r">{{ routeLabel(r) }}</option>
                    }
                  </select>
                </label>

                <label>
                  Food
                  <select
                    [value]="form().foodRelation"
                    (change)="patch('foodRelation', $any($event.target).value)"
                  >
                    @for (f of foodRelations; track f) {
                      <option [value]="f">{{ foodLabel(f) }}</option>
                    }
                  </select>
                </label>

                <label>
                  Max doses per day
                  <input
                    type="number"
                    min="1"
                    max="24"
                    [value]="form().maxDailyDoses ?? ''"
                    (input)="patch('maxDailyDoses', $any($event.target).value)"
                  />
                </label>

                <label class="wide">
                  Warnings (one per line)
                  <textarea
                    rows="3"
                    [value]="warningsText()"
                    (input)="patchWarnings($any($event.target).value)"
                  ></textarea>
                </label>

                <label class="wide">
                  Possible side effects
                  <input
                    type="text"
                    [value]="form().sideEffects ?? ''"
                    (input)="patch('sideEffects', $any($event.target).value)"
                  />
                </label>

                <label class="wide">
                  Storage
                  <input
                    type="text"
                    [value]="form().storage ?? ''"
                    (input)="patch('storage', $any($event.target).value)"
                  />
                </label>

                <label class="wide">
                  Special instructions
                  <input
                    type="text"
                    [value]="form().specialInstructions ?? ''"
                    (input)="patch('specialInstructions', $any($event.target).value)"
                  />
                </label>
              </div>

              <div class="actions">
                <button type="button" [disabled]="saving()" (click)="save(med)">
                  Save instructions
                </button>
                <button type="button" class="secondary" (click)="clear(med)">
                  Clear sheet
                </button>
              </div>
              <p class="meta" role="status" aria-live="polite">{{ status() }}</p>
            </fieldset>

            @if (form().warnings.length > 0) {
              <ul class="warnings" aria-label="Warnings">
                @for (w of form().warnings; track w) {
                  <li>⚠️ {{ w }}</li>
                }
              </ul>
            }
          </div>
        }
      </div>
    }
  `,
  styles: `
    .instr { margin-top: 0.4rem; }
    .toggle {
      background: none;
      border: none;
      color: var(--accent, #4f7cff);
      cursor: pointer;
      font: inherit;
      font-weight: 600;
      text-align: left;
      padding: 0.35rem 0;
      min-height: 44px;
    }
    .toggle .meta { font-weight: 400; margin-left: 0.4rem; }
    .sheet { border: 1px solid var(--border, #d9dee7); border-radius: 0.6rem; padding: 0.7rem 1rem; }
    .catalog { background: var(--surface-2, #eef1f6); border-radius: 0.5rem; padding: 0.5rem 0.7rem; }
    fieldset { border: none; padding: 0; margin: 0.4rem 0 0; }
    legend { font-weight: 600; padding: 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 0.6rem; }
    .grid label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.9rem; }
    .grid .wide { grid-column: 1 / -1; }
    input, select, textarea { min-height: 44px; font: inherit; }
    .actions { display: flex; gap: 0.6rem; margin-top: 0.6rem; }
    button { min-height: 44px; padding: 0.4rem 0.9rem; cursor: pointer; }
    .secondary { background: var(--surface-2, #eef1f6); }
    .danger { background: var(--danger, #c62828); color: #fff; }
    .meta { color: var(--text-muted); }
    .warnings { margin: 0.6rem 0 0; padding-left: 1.1rem; color: var(--danger, #c62828); }
  `,
})
export class MedicineInstructionsComponent {
  readonly medication = input<Medication>();
  private readonly store = inject(MedicationsStore);
  private readonly session = inject(SessionStore);

  readonly routes = MEDICINE_ROUTE_KEYS;
  readonly foodRelations = FOOD_RELATION_KEYS;

  readonly open = signal(false);
  readonly form = signal<MedicineInstructions>(emptyInstructions());
  readonly status = signal('');
  /** Armed only when auto-fill would discard an existing sheet. */
  readonly confirmAutofill = signal(false);

  /** RBAC: only the client edits; family roles see the sheet read-only. */
  readonly canWrite = computed(() => {
    const roles = this.session.roles();
    return roles.length === 0 || roles.includes('client');
  });

  readonly saving = computed(() => this.store.actingId() === this.medication()?.id);

  readonly warningsText = computed(() => this.form().warnings.join('\n'));

  readonly routeLabel = (route: string): string =>
    medicineLabel(MEDICINE_ROUTE_LABELS, route);
  readonly foodLabel = (relation: string): string =>
    medicineLabel(FOOD_RELATION_LABELS, relation);

  /** Name of the catalog entry that matches, or '' when there is none. */
  catalogHit(med: Medication): string {
    return findMedicineInfo(med.name)?.name ?? '';
  }

  summaryText(med: Medication): string {
    const saved = med.instructions;
    if (saved && hasInstructions(saved)) {
      const summary = summaryOf(normalizeInstructions(saved));
      return summary || '';
    }
    const suggestion = applyCatalog(med.name);
    return suggestion ? `suggested: ${summaryOf(suggestion)}` : '';
  }

  toggle(): void {
    const med = this.medication();
    if (!med) {
      return;
    }
    const next = !this.open();
    this.open.set(next);
    if (next) {
      this.form.set(
        med.instructions
          ? normalizeInstructions(med.instructions)
          : (applyCatalog(med.name) ?? emptyInstructions())
      );
      this.status.set('');
      this.confirmAutofill.set(false);
    }
  }

  /**
   * Load the catalog suggestion. When it would replace a sheet the user has
   * (saved or edited), arm a confirmation first so nothing is discarded
   * silently (acceptance criterion); an empty sheet loads directly.
   */
  autofill(med: Medication): void {
    const suggestion = applyCatalog(med.name);
    if (!suggestion) {
      this.status.set('No catalog entry for this medicine.');
      return;
    }
    const current = normalizeInstructions(this.form());
    const replacesSheet =
      hasInstructions(current) && JSON.stringify(current) !== JSON.stringify(suggestion);
    if (replacesSheet && !this.confirmAutofill()) {
      this.confirmAutofill.set(true);
      this.status.set(
        'Your current sheet will be replaced. Confirm to load the catalog suggestion.'
      );
      return;
    }
    this.confirmAutofill.set(false);
    this.form.set(suggestion);
    this.status.set('Catalog suggestion loaded — review and save.');
  }

  cancelAutofill(): void {
    this.confirmAutofill.set(false);
    this.status.set('Kept your edits.');
  }

  patch<K extends keyof MedicineInstructions>(
    key: K,
    value: unknown
  ): void {
    if (key === 'maxDailyDoses') {
      const num = Number(value);
      this.form.update((f) => ({
        ...f,
        maxDailyDoses: value === '' || !Number.isFinite(num) || num <= 0 ? null : Math.min(24, Math.round(num)),
      }));
      return;
    }
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  patchWarnings(raw: string): void {
    const warnings = raw
      .split('\n')
      .map((w) => w.trim())
      .filter((w) => w.length > 0)
      .slice(0, MAX_WARNINGS);
    this.form.update((f) => ({ ...f, warnings }));
  }

  save(med: Medication): void {
    if (!this.canWrite()) {
      return;
    }
    this.status.set('Saving…');
    this.store.saveInstructions(med.id, this.form()).subscribe((ok) => {
      this.status.set(ok ? 'Instructions saved.' : 'Could not save the instructions.');
    });
  }

  clear(med: Medication): void {
    if (!this.canWrite()) {
      return;
    }
    this.form.set(emptyInstructions());
    this.store.saveInstructions(med.id, null).subscribe((ok) => {
      this.status.set(ok ? 'Sheet cleared.' : 'Could not clear the sheet.');
    });
  }
}

/** Local one-line summary (keeps the component free of extra imports). */
function summaryOf(instructions: MedicineInstructions): string {
  const parts: string[] = [];
  if (instructions.route && instructions.route !== 'oral') {
    parts.push(medicineLabel(MEDICINE_ROUTE_LABELS, instructions.route));
  }
  if (instructions.foodRelation !== 'any') {
    parts.push(medicineLabel(FOOD_RELATION_LABELS, instructions.foodRelation));
  }
  if ((instructions.maxDailyDoses ?? null) !== null) {
    parts.push(`έως ${instructions.maxDailyDoses}/ημέρα`);
  }
  return parts.join(' · ');
}
