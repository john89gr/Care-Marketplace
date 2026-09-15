import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CarePlanStore, CareGoal } from './care-plan.store';
import { I18n } from '../../core/i18n/i18n.service';

const NEXT_STATUS: Record<CareGoal['status'], CareGoal['status']> = {
  open: 'in-progress',
  'in-progress': 'done',
  done: 'open',
};

/** Goal status label keys (the raw status stays a machine token on the wire). */
const GOAL_STATUS_KEYS: Record<CareGoal['status'], string> = {
  open: 'carePlan.status.open',
  'in-progress': 'carePlan.status.inProgress',
  done: 'carePlan.status.done',
};

/** Badge tone per goal status (the label carries the meaning, not the colour). */
const GOAL_STATUS_TONES: Record<CareGoal['status'], string> = {
  open: 'info',
  'in-progress': 'warning',
  done: 'success',
};

@Component({
  selector: 'app-care-plan',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <section class="care-plan">
      <header class="page-header">
        <div>
          <h1 class="page-title">{{ i18n.t('carePlan.title') }}</h1>
        </div>
      </header>

      @if (store.loading()) {
        <div class="skeleton block" aria-hidden="true"></div>
      } @else if (!store.plan()) {
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">🧩</span>
          <p>{{ i18n.t('carePlan.empty') }}</p>
        </div>
      } @else {
        <div class="card plan-head">
          <span class="avatar lg" aria-hidden="true">{{ initials(store.plan()!.clientName) }}</span>
          <div>
            <h2 class="plan-client">{{ store.plan()!.clientName }}</h2>
            <p class="meta">
              {{
                i18n.t('carePlan.updated', {
                  date: formatDate(store.plan()!.updatedAtMs),
                  by: store.plan()!.updatedBy,
                })
              }}
            </p>
          </div>
        </div>

        <section class="section">
          <div class="section-header">
            <h2 class="section-title">{{ i18n.t('carePlan.goals') }}</h2>
          </div>
          <ul class="results">
            @for (goal of store.plan()!.goals; track goal.id) {
              <li class="card interactive goal">
                <div class="goal-body">
                  <span [class]="'badge ' + goalStatusTone(goal.status)">
                    <span class="dot"></span>{{ goalStatusLabel(goal.status) }}
                  </span>
                  <p class="goal-text">{{ goal.text }}</p>
                </div>
                <button type="button" class="btn secondary sm"
                  [disabled]="store.saving()"
                  (click)="advance(goal)">→ {{ goalStatusLabel(NEXT_STATUS[goal.status]) }}</button>
              </li>
            }
          </ul>

          <form class="add-form" [formGroup]="goalForm" (ngSubmit)="addGoal()">
            <label class="field goal-input">
              <span class="visually-hidden">{{ i18n.t('carePlan.newGoal') }}</span>
              <input type="text" formControlName="text"
                [attr.placeholder]="i18n.t('carePlan.newGoal')" />
            </label>
            <button type="submit" class="btn" [disabled]="store.saving() || goalForm.invalid">
              {{ i18n.t('common.add') }}
            </button>
          </form>
        </section>

        <section class="section">
          <div class="section-header">
            <h2 class="section-title">{{ i18n.t('carePlan.notes') }}</h2>
          </div>
          <div class="notes">
            @for (note of store.plan()!.notes; track note.id) {
              <article class="card note">
                <p class="meta">
                  <strong>{{ note.authorName }}</strong> · {{ note.authorRole }} ·
                  {{ formatDate(note.atMs) }}
                </p>
                <p>{{ note.text }}</p>
              </article>
            }
            @if (store.plan()!.notes.length === 0) {
              <div class="empty-state">
                <span class="empty-icon" aria-hidden="true">📝</span>
                <p>{{ i18n.t('carePlan.notesEmpty') }}</p>
              </div>
            }
          </div>

          <form class="card note-form" [formGroup]="noteForm" (ngSubmit)="addNote()">
            <label class="field">
              <span class="visually-hidden">{{ i18n.t('carePlan.addNote') }}</span>
              <textarea rows="2" formControlName="text"
                [attr.placeholder]="i18n.t('carePlan.notePlaceholder')"></textarea>
            </label>
            <div class="card-actions">
              <button type="submit" class="btn" [disabled]="store.saving() || noteForm.invalid">
                {{ i18n.t('carePlan.addNote') }}
              </button>
            </div>
          </form>
        </section>

        @if (store.error()) {
          <p class="error" role="alert">{{ i18n.message(store.errorSource(), store.error()) }}</p>
        }
      }
    </section>
  `,
  styles: `
    .plan-head {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      margin-bottom: var(--space-5);
      background: linear-gradient(160deg, var(--surface-raised), var(--surface));
    }
    .plan-client {
      margin: 0;
      font-size: var(--text-lg);
    }
    .plan-head .meta {
      margin: 0;
    }
    .goal {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      flex-wrap: wrap;
    }
    .goal-body {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      flex: 1 1 16rem;
      min-width: 0;
    }
    .goal-text {
      margin: 0;
      font-weight: var(--weight-medium);
    }
    .add-form {
      display: flex;
      gap: var(--space-2);
      align-items: flex-end;
      margin-top: var(--space-3);
      max-width: 34rem;
    }
    .goal-input {
      flex: 1;
    }
    .notes {
      display: grid;
      gap: var(--space-3);
      margin-bottom: var(--space-4);
    }
    .note .meta {
      margin: 0 0 var(--space-1);
    }
    .note p:last-child {
      margin: 0;
    }
    .note-form {
      max-width: 34rem;
      display: grid;
      gap: var(--space-2);
    }
    .note-form .card-actions {
      margin-top: 0;
    }
  `,
})
export class CarePlanPage implements OnInit {
  protected readonly i18n = inject(I18n);

  readonly store = inject(CarePlanStore);
  private readonly fb = inject(FormBuilder);

  protected readonly goalForm = this.fb.nonNullable.group({
    text: ['', [Validators.required, Validators.minLength(3)]],
  });
  protected readonly noteForm = this.fb.nonNullable.group({
    text: ['', [Validators.required, Validators.minLength(3)]],
  });

  protected readonly NEXT_STATUS = NEXT_STATUS;

  ngOnInit(): void {
    this.store.load();
  }

  addGoal(): void {
    if (this.goalForm.invalid) {
      return;
    }
    const text = this.goalForm.getRawValue().text;
    this.store.addGoal(text).subscribe((ok) => {
      if (ok) {
        this.goalForm.reset();
      }
    });
  }

  advance(goal: CareGoal): void {
    this.store.setGoalStatus(goal.id, NEXT_STATUS[goal.status]).subscribe();
  }

  addNote(): void {
    if (this.noteForm.invalid) {
      return;
    }
    const text = this.noteForm.getRawValue().text;
    this.store.addNote(text).subscribe((ok) => {
      if (ok) {
        this.noteForm.reset();
      }
    });
  }

  /** Goal status label in the active language. */
  goalStatusLabel(status: CareGoal['status']): string {
    return this.i18n.t(GOAL_STATUS_KEYS[status] ?? '');
  }

  goalStatusTone(status: CareGoal['status']): string {
    return GOAL_STATUS_TONES[status] ?? '';
  }

  /** Initials for the plan header avatar (decorative). */
  initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  formatDate(ms: number): string {
    return new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
}
