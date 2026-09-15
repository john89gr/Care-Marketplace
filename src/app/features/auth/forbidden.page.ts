import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n/i18n.service';

@Component({
  selector: 'app-forbidden',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="forbidden">
      <div class="card forbidden-card">
        <span class="icon-bubble lg forbidden-mark" aria-hidden="true">🔒</span>
        <h1 class="page-title">{{ i18n.t('auth.forbiddenTitle') }}</h1>
        <p class="page-subtitle">{{ i18n.t('auth.forbiddenBody') }}</p>
        <p class="forbidden-hint">{{ i18n.t('auth.forbiddenHint') }}</p>
        <a class="btn lg" routerLink="/marketplace">{{ i18n.t('auth.backToMarketplace') }}</a>
      </div>
    </section>
  `,
  styles: `
    .forbidden {
      display: flex;
      justify-content: center;
      padding: var(--space-6) 0;
    }
    .forbidden-card {
      position: relative;
      overflow: hidden;
      display: grid;
      justify-items: center;
      text-align: center;
      gap: var(--space-2);
      max-width: 28rem;
      padding: var(--space-7) var(--space-5);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-lg);
    }
    .forbidden-card::before {
      content: '';
      position: absolute;
      inset: 0 0 auto 0;
      height: 4px;
      background: var(--accent-grad);
    }
    .forbidden-mark {
      width: 3.5rem;
      height: 3.5rem;
      font-size: 1.6rem;
      margin-bottom: var(--space-2);
      background: var(--warning-soft);
      color: var(--warning);
    }
    .forbidden-card .page-title {
      font-size: var(--text-xl);
    }
    .forbidden-card .page-subtitle {
      margin: 0;
    }
    .forbidden-hint {
      color: var(--text-subtle);
      font-size: var(--text-sm);
      margin: 0 0 var(--space-3);
    }
  `,
})
export class ForbiddenPage {
  protected readonly i18n = inject(I18n);
}
