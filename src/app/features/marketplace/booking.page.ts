import { Component, inject } from '@angular/core';
import { BookingStore } from './booking.store';

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [],
  template: `
    <section class="booking">
      <h1>Booking request</h1>
      <form (submit)="submit($event)">
        <label>Date & time
          <input
            type="datetime-local"
            [value]="isoValue()"
            (change)="onDate($any($event.target).value)"
          />
        </label>
        <label>Note
          <textarea rows="3" [value]="store.draft().note"
            (input)="store.updateDraft({ note: $any($event.target).value })"></textarea>
        </label>
        <button type="submit" [disabled]="store.submitting() || !store.draft().scheduledAtMs">
          {{ store.submitting() ? 'Sending…' : 'Send request' }}
        </button>
        @if (store.lastError()) {
          <p class="error" role="alert">{{ store.lastError() }}</p>
        }
      </form>
    </section>
  `,
})
export class BookingPage {
  readonly store = inject(BookingStore);

  isoValue(): string {
    const ms = this.store.draft().scheduledAtMs;
    return ms === null ? '' : new Date(ms).toISOString().slice(0, 16);
  }

  onDate(value: string): void {
    const ms = value ? new Date(value).getTime() : null;
    this.store.updateDraft({ scheduledAtMs: Number.isNaN(ms) ? null : ms });
  }

  submit(event: Event): void {
    event.preventDefault();
    void this.store.submit();
  }
}
