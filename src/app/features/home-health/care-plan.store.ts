import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import { SessionStore } from '../../core/auth/session';

/**
 * Shared care plan (PLAN.md §3.A / §5 Phase 2 — Care plan): a client-level
 * plan with goals and a note timeline that nurses and physiotherapists
 * cross-update. Every note records author + role so the collaboration is
 * auditable.
 */
export type CareGoalStatus = 'open' | 'in-progress' | 'done';

export interface CareGoal {
  id: string;
  text: string;
  status: CareGoalStatus;
}

export interface CarePlanNote {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  text: string;
  atMs: number;
}

export interface CarePlan {
  id: string;
  clientId: string;
  clientName: string;
  goals: CareGoal[];
  notes: CarePlanNote[];
  updatedAtMs: number;
  updatedBy: string;
}

@Injectable({ providedIn: 'root' })
export class CarePlanStore {
  // Default-parameter injection keeps `new CarePlanStore(api, session)`
  // possible in unit tests while remaining DI-friendly in the app.
  constructor(
    private readonly api: ApiClient = inject(ApiClient),
    private readonly session: SessionStore = inject(SessionStore)
  ) {}

  private readonly _plan = signal<CarePlan | null>(null);
  private readonly _loading = signal(false);
  private readonly _saving = signal(false);
  private readonly _error = signal('');

  readonly plan = this._plan.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly error = this._error.asReadonly();

  load(): void {
    this._loading.set(true);
    this.api.get<CarePlan[]>('/care-plans').subscribe({
      next: (plans) => {
        const me = this.session.session();
        this._plan.set(me ? plans.find((p) => p.clientId === me.userId) ?? plans[0] ?? null : null);
        this._loading.set(false);
      },
      error: () => this._loading.set(false),
    });
  }

  addGoal(text: string): Observable<boolean> {
    const id = this._plan()?.id;
    if (!id) {
      return of(false);
    }
    return this.mutate(this.api.post<CarePlan>(`/care-plans/${id}/goals`, { text }));
  }

  setGoalStatus(goalId: string, status: CareGoalStatus): Observable<boolean> {
    const id = this._plan()?.id;
    if (!id) {
      return of(false);
    }
    return this.mutate(this.api.patch<CarePlan>(`/care-plans/${id}/goals/${goalId}`, { status }));
  }

  addNote(text: string): Observable<boolean> {
    const id = this._plan()?.id;
    if (!id) {
      return of(false);
    }
    const me = this.session.session();
    return this.mutate(
      this.api.post<CarePlan>(`/care-plans/${id}/notes`, {
        text,
        authorId: me?.userId ?? '',
        authorName: me?.displayName ?? '',
        authorRole: me?.roles[0] ?? '',
      })
    );
  }

  private mutate(request: Observable<CarePlan>): Observable<boolean> {
    this._saving.set(true);
    this._error.set('');
    return request.pipe(
      map((plan) => {
        this._plan.set(plan);
        this._saving.set(false);
        return true;
      }),
      catchError((error) => {
        this._saving.set(false);
        this._error.set(
          (error as { error?: { message?: string } })?.error?.message ??
            'Could not update the care plan. Please try again.'
        );
        return of(false);
      })
    );
  }
}

export function careGoalStatusLabel(status: CareGoalStatus): string {
  return status.replace('-', ' ');
}