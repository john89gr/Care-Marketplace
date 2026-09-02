import { Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CarePlanStore, CareGoal, careGoalStatusLabel } from './care-plan.store';

const NEXT_STATUS: Record<CareGoal['status'], CareGoal['status']> = {
  open: 'in-progress',
  'in-progress': 'done',
  done: 'open',
};

@Component({
  selector: 'app-care-plan',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <section class="care-plan">
      <h1>Care plan</h1>

      @if (store.loading()) {
        <p>Loading…</p>
      } @else if (!store.plan()) {
        <p>No care plan yet for this user.</p>
      } @else {
        <h2>{{ store.plan()!.clientName }}</h2>
        <p class="meta">
          Updated {{ formatDate(store.plan()!.updatedAtMs) }} by {{ store.plan()!.updatedBy }}
        </p>

        <h3>Goals</h3>
        <ul class="results">
          @for (goal of store.plan()!.goals; track goal.id) {
            <li class="card goal">
              <span class="chip"
                [class.ok]="goal.status === 'done'"
                [class.now]="goal.status === 'in-progress'">
                {{ careGoalStatusLabel(goal.status) }}
              </span>
              <p>{{ goal.text }}</p>
              <button type="button" class="secondary"
                [disabled]="store.saving()"
                (click)="advance(goal)">→ {{ careGoalStatusLabel(NEXT_STATUS[goal.status]) }}</button>
            </li>
          }
        </ul>

        <form [formGroup]="goalForm" (ngSubmit)="addGoal()">
          <div class="row">
            <input type="text" formControlName="text" placeholder="New goal…" />
            <button type="submit" [disabled]="store.saving() || goalForm.invalid">Add</button>
          </div>
        </form>

        <h3>Care notes</h3>
        <div class="notes">
          @for (note of store.plan()!.notes; track note.id) {
            <article class="card note">
              <p class="meta">{{ note.authorName }} · {{ note.authorRole }} · {{ formatDate(note.atMs) }}</p>
              <p>{{ note.text }}</p>
            </article>
          }
          @if (store.plan()!.notes.length === 0) {
            <p class="meta">No notes yet — nurses and physios can add updates here.</p>
          }
        </div>

        <form [formGroup]="noteForm" (ngSubmit)="addNote()">
          <textarea rows="2" formControlName="text"
            placeholder="Update for the care team (nurses & physios)…"></textarea>
          <button type="submit" [disabled]="store.saving() || noteForm.invalid">Add note</button>
        </form>

        @if (store.error()) {
          <p class="error" role="alert">{{ store.error() }}</p>
        }
      }
    </section>
  `,
  styles: `
    h3 { margin: 1.5rem 0 0.5rem; font-size: 1.1rem; }
    .goal { display: flex; align-items: center; gap: 0.75rem; }
    .goal p { flex: 1; margin: 0; }
    .chip.ok { background: var(--success); color: #fff; }
    .notes { display: grid; gap: 0.6rem; margin-bottom: 1rem; }
    .row { display: flex; gap: 0.5rem; max-width: none; }
    .row input { flex: 1; }
  `,
})
export class CarePlanPage implements OnInit {
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

  careGoalStatusLabel(status: CareGoal['status']): string {
    return careGoalStatusLabel(status);
  }

  formatDate(ms: number): string {
    return new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
}