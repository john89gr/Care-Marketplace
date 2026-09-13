import { Component, computed, inject, input, signal } from '@angular/core';
import { SessionStore } from '../../core/auth/session';
import { I18n } from '../../core/i18n/i18n.service';
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
 *
 * Bilingual. Load-bearing for the E2E suite: `.toggle` (the per-drug sheet
 * button, whose accessible name carries "How to take <drug>") and `.sheet`.
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
          {{ i18n.t('medicine.toggle', { name: med.name }) }}
          <span class="meta">{{ summaryText(med) }}</span>
        </button>

        @if (open()) {
          <div class="sheet">
            @if (catalogHit(med); as hit) {
              <p class="catalog" role="note">
                {{ i18n.t('medicine.catalogAvailable', { name: hit }) }}
              </p>
              @if (confirmAutofill()) {
                <button type="button" class="btn danger" (click)="autofill(med)">
                  {{ i18n.t('medicine.replaceWithCatalog') }}
                </button>
                <button type="button" class="btn secondary" (click)="cancelAutofill()">
                  {{ i18n.t('medicine.keepEdits') }}
                </button>
              } @else {
                <button type="button" class="btn secondary" (click)="autofill(med)">
                  {{ i18n.t('medicine.autofill') }}
                </button>
              }
            }

            <fieldset [disabled]="!canWrite()">
              <legend>{{ i18n.t('medicine.legend', { name: med.name }) }}</legend>

              <div class="grid">
                <label class="field">
                  <span class="field-label">{{ i18n.t('medicine.doseForm') }}</span>
                  <input
                    type="text"
                    [attr.placeholder]="i18n.t('medicine.doseFormPlaceholder')"
                    [value]="form().doseForm ?? ''"
                    (input)="patch('doseForm', $any($event.target).value)"
                  />
                </label>

                <label class="field">
                  <span class="field-label">{{ i18n.t('medicine.route') }}</span>
                  <select
                    [value]="form().route ?? 'oral'"
                    (change)="patch('route', $any($event.target).value)"
                  >
                    @for (r of routes; track r) {
                      <option [value]="r">{{ routeLabel(r) }}</option>
                    }
                  </select>
                </label>

                <label class="field">
                  <span class="field-label">{{ i18n.t('medicine.food') }}</span>
                  <select
                    [value]="form().foodRelation"
                    (change)="patch('foodRelation', $any($event.target).value)"
                  >
                    @for (f of foodRelations; track f) {
                      <option [value]="f">{{ foodLabel(f) }}</option>
                    }
                  </select>
                </label>

                <label class="field">
                  <span class="field-label">{{ i18n.t('medicine.maxDaily') }}</span>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    [value]="form().maxDailyDoses ?? ''"
                    (input)="patch('maxDailyDoses', $any($event.target).value)"
                  />
                </label>

                <label class="field wide">
                  <span class="field-label">{{ i18n.t('medicine.warnings') }}</span>
                  <textarea
                    rows="3"
                    [value]="warningsText()"
                    (input)="patchWarnings($any($event.target).value)"
                  ></textarea>
                </label>

                <label class="field wide">
                  <span class="field-label">{{ i18n.t('medicine.sideEffects') }}</span>
                  <input
                    type="text"
                    [value]="form().sideEffects ?? ''"
                    (input)="patch('sideEffects', $any($event.target).value)"
                  />
                </label>

                <label class="field wide">
                  <span class="field-label">{{ i18n.t('medicine.storage') }}</span>
                  <input
                    type="text"
                    [value]="form().storage ?? ''"
                    (input)="patch('storage', $any($event.target).value)"
                  />
                </label>

                <label class="field wide">
                  <span class="field-label">{{ i18n.t('medicine.special') }}</span>
                  <input
                    type="text"
                    [value]="form().specialInstructions ?? ''"
                    (input)="patch('specialInstructions', $any($event.target).value)"
                  />
                </label>
              </div>

              <div class="actions">
                <button type="button" class="btn" [disabled]="saving()" (click)="save(med)">
                  {{ i18n.t('medicine.save') }}
                </button>
                <button type="button" class="btn secondary" (click)="clear(med)">
                  {{ i18n.t('medicine.clear') }}
                </button>
              </div>
              <p class="meta" role="status" aria-live="polite">{{ status() }}</p>
            </fieldset>

            @if (form().warnings.length > 0) {
              <ul class="warnings" [attr.aria-label]="i18n.t('medicine.warningsAria')">
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
    .instr {
      margin-top: var(--space-1);
    }
    .toggle {
      display: block;
      background: none;
      border: none;
      color: var(--accent);
      cursor: pointer;
      font: inherit;
      font-weight: var(--weight-semibold);
      text-align: left;
      padding: 0.35rem 0;
      min-height: 44px;
    }
    .toggle:hover:not(:disabled) {
      background: none;
      color: var(--accent-hover);
    }
    .toggle .meta {
      font-weight: var(--weight-normal);
      margin-left: 0.4rem;
    }
    .sheet {
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: var(--space-3) var(--space-4);
      margin-top: var(--space-2);
    }
    .catalog {
      background: var(--surface-raised);
      border-radius: var(--radius-sm);
      padding: 0.5rem 0.7rem;
      color: var(--text-muted);
      font-size: var(--text-sm);
    }
    fieldset {
      border: none;
      padding: 0;
      margin: var(--space-2) 0 0;
    }
    legend {
      font-weight: var(--weight-semibold);
      padding: 0;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
      gap: var(--space-3);
      margin-top: var(--space-2);
    }
    .grid .wide {
      grid-column: 1 / -1;
    }
    .actions {
      display: flex;
      gap: var(--space-3);
      margin-top: var(--space-3);
    }
    .warnings {
      margin: var(--space-3) 0 0;
      padding-left: 1.1rem;
      color: var(--danger);
    }
  `,
})
export class MedicineInstructionsComponent {
  readonly medication = input<Medication>();
  protected readonly i18n = inject(I18n);
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
    medicineLabel(MEDICINE_ROUTE_LABELS, route, this.i18n.language());
  readonly foodLabel = (relation: string): string =>
    medicineLabel(FOOD_RELATION_LABELS, relation, this.i18n.language());

  /** Name of the catalog entry that matches, or '' when there is none. */
  catalogHit(med: Medication): string {
    return findMedicineInfo(med.name)?.name ?? '';
  }

  summaryText(med: Medication): string {
    const saved = med.instructions;
    if (saved && hasInstructions(saved)) {
      return this.summaryOf(normalizeInstructions(saved));
    }
    const suggestion = applyCatalog(med.name);
    if (!suggestion) {
      return '';
    }
    return this.i18n.t('medicine.suggested', { summary: this.summaryOf(suggestion) });
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
      this.status.set(this.i18n.t('medicine.status.noCatalog'));
      return;
    }
    const current = normalizeInstructions(this.form());
    const replacesSheet =
      hasInstructions(current) && JSON.stringify(current) !== JSON.stringify(suggestion);
    if (replacesSheet && !this.confirmAutofill()) {
      this.confirmAutofill.set(true);
      this.status.set(this.i18n.t('medicine.status.willReplace'));
      return;
    }
    this.confirmAutofill.set(false);
    this.form.set(suggestion);
    this.status.set(this.i18n.t('medicine.status.loaded'));
  }

  cancelAutofill(): void {
    this.confirmAutofill.set(false);
    this.status.set(this.i18n.t('medicine.status.kept'));
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
    this.status.set(this.i18n.t('common.saving'));
    this.store.saveInstructions(med.id, this.form()).subscribe((ok) => {
      this.status.set(
        ok ? this.i18n.t('medicine.status.saved') : this.i18n.t('medicine.status.saveFailed')
      );
    });
  }

  clear(med: Medication): void {
    if (!this.canWrite()) {
      return;
    }
    this.form.set(emptyInstructions());
    this.store.saveInstructions(med.id, null).subscribe((ok) => {
      this.status.set(
        ok ? this.i18n.t('medicine.status.cleared') : this.i18n.t('medicine.status.clearFailed')
      );
    });
  }

  /** One-line summary in the active locale. */
  private summaryOf(instructions: MedicineInstructions): string {
    const locale = this.i18n.language();
    const parts: string[] = [];
    if (instructions.route && instructions.route !== 'oral') {
      parts.push(medicineLabel(MEDICINE_ROUTE_LABELS, instructions.route, locale));
    }
    if (instructions.foodRelation !== 'any') {
      parts.push(medicineLabel(FOOD_RELATION_LABELS, instructions.foodRelation, locale));
    }
    if ((instructions.maxDailyDoses ?? null) !== null) {
      parts.push(
        this.i18n.t('medicine.maxDailySummary', { count: instructions.maxDailyDoses! })
      );
    }
    return parts.join(' · ');
  }
}
