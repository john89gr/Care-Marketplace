import { Component, inject, OnInit } from '@angular/core';
import { EscrowStore, EscrowTransaction } from './escrow.store';

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

@Component({
  selector: 'app-payments',
  standalone: true,
  imports: [],
  template: `
    <section class="payments">
      <h1>Payments & escrow</h1>

      <p class="meta">
        Held balance: <strong>{{ (store.heldTotalCents() / 100).toFixed(2) }} €</strong>
      </p>

      @if (store.loading()) {
        <p>Loading…</p>
      } @else if (store.transactions().length === 0) {
        <p>No escrow transactions yet.</p>
      } @else {
        <ul class="results">
          @for (tx of store.transactions(); track tx.id) {
            <li class="card">
              <div class="row">
                <h3>{{ (tx.amountCents / 100).toFixed(2) }} €</h3>
                <span class="chip" [class.ok]="tx.status === 'released'"
                  [class.bad]="tx.status === 'refunded'">
                  {{ tx.status }}
                </span>
              </div>
              <p class="meta">Booking {{ tx.bookingId }} · {{ formatDate(tx.createdAtMs) }}</p>
              @if (tx.status === 'held') {
                <p class="actions">
                  <button type="button"
                    [disabled]="store.actingId() === tx.id"
                    (click)="release(tx)">Release</button>
                  <button type="button" class="secondary"
                    [disabled]="store.actingId() === tx.id"
                    (click)="refund(tx)">Refund</button>
                </p>
              }
            </li>
          }
        </ul>
      }

      @if (store.error()) {
        <p class="error" role="alert">{{ store.error() }}</p>
      }
    </section>
  `,
  styles: `
    .row { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .chip.ok { background: var(--success); color: #fff; }
    .chip.bad { background: var(--danger); color: #fff; }
    .actions { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
  `,
})
export class PaymentsPage implements OnInit {
  readonly store = inject(EscrowStore);

  ngOnInit(): void {
    this.store.load();
  }

  release(tx: EscrowTransaction): void {
    this.store.release(tx.id).subscribe();
  }

  refund(tx: EscrowTransaction): void {
    this.store.refund(tx.id).subscribe();
  }

  formatDate(ms: number): string {
    return formatDate(ms);
  }
}
