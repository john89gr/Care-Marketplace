import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, map, catchError, of } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';

/**
 * Shift calendar state (PLAN.md §5 Phase 2 — Shift calendar). Providers edit
 * a weekly availability grid and accept on-demand requests; upcoming shifts
 * are loaded from the backend.
 */
export interface AvailabilitySlot {
  id: string;
  weekday: number; // 0 = Monday … 6 = Sunday
  startMinutes: number; // minutes since midnight
  endMinutes: number;
}

export interface Shift {
  id: string;
  providerId: string;
  clientId: string;
  clientName: string;
  act: string;
  scheduledAtMs: number;
  durationMinutes: number;
  status: 'requested' | 'confirmed' | 'completed' | 'cancelled';
}

export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/** Preset availability segments shown in the grid. */
export const TIME_SEGMENTS = [
  { label: 'Morning', startMinutes: 8 * 60, endMinutes: 12 * 60 },
  { label: 'Afternoon', startMinutes: 12 * 60, endMinutes: 17 * 60 },
  { label: 'Evening', startMinutes: 17 * 60, endMinutes: 21 * 60 },
] as const;

@Injectable({ providedIn: 'root' })
export class ShiftsStore {
  // Default-parameter injection keeps `new ShiftsStore(api)` possible in
  // unit tests while remaining DI-friendly in the app.
  constructor(private readonly api: ApiClient = inject(ApiClient)) {}

  private readonly _availability = signal<AvailabilitySlot[]>([]);
  private readonly _onDemand = signal(false);
  private readonly _shifts = signal<Shift[]>([]);
  private readonly _loading = signal(false);
  private readonly _saving = signal(false);
  private readonly _saveError = signal('');

  readonly availability = this._availability.asReadonly();
  readonly onDemand = this._onDemand.asReadonly();
  readonly shifts = this._shifts.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly saving = this._saving.asReadonly();
  readonly saveError = this._saveError.asReadonly();

  /** Upcoming confirmed/requested shifts, soonest first. */
  readonly upcomingShifts = computed(() =>
    this._shifts()
      .filter((s) => s.status === 'requested' || s.status === 'confirmed')
      .sort((a, b) => a.scheduledAtMs - b.scheduledAtMs)
  );

  load(): void {
    this._loading.set(true);
    this.api.get<{ availability: AvailabilitySlot[]; onDemand: boolean; shifts: Shift[] }>(
      '/shifts/me'
    ).subscribe({
      next: (payload) => {
        this._availability.set(payload.availability ?? []);
        this._onDemand.set(payload.onDemand ?? false);
        this._shifts.set(payload.shifts ?? []);
        this._loading.set(false);
      },
      error: () => this._loading.set(false),
    });
  }

  /** Toggles a time segment for a weekday in the local grid. */
  toggleSegment(weekday: number, startMinutes: number, endMinutes: number): void {
    this._availability.update((slots) => {
      const existing = slots.find(
        (s) => s.weekday === weekday && s.startMinutes === startMinutes && s.endMinutes === endMinutes
      );
      if (existing) {
        return slots.filter((s) => s.id !== existing.id);
      }
      return [
        ...slots,
        { id: crypto.randomUUID(), weekday, startMinutes, endMinutes },
      ];
    });
  }

  hasSegment(weekday: number, startMinutes: number, endMinutes: number): boolean {
    return this._availability().some(
      (s) => s.weekday === weekday && s.startMinutes === startMinutes && s.endMinutes === endMinutes
    );
  }

  setOnDemand(onDemand: boolean): void {
    this._onDemand.set(onDemand);
  }

  save(): Observable<boolean> {
    this._saving.set(true);
    this._saveError.set('');
    return this.api
      .patch<{ availability: AvailabilitySlot[]; onDemand: boolean }>('/shifts/me', {
        availability: this._availability(),
        onDemand: this._onDemand(),
      })
      .pipe(
        map(() => {
          this._saving.set(false);
          return true;
        }),
        catchError((error) => {
          this._saving.set(false);
          this._saveError.set(
            (error as { error?: { message?: string } })?.error?.message ??
              'Could not save your availability. Please try again.'
          );
          return of(false);
        })
      );
  }
}
