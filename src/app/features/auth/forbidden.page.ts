import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-forbidden',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="forbidden">
      <h1>Accès refusé</h1>
      <p>Votre rôle ne permet pas d'ouvrir cette page.</p>
      <a routerLink="/marketplace">Retour au marketplace</a>
    </section>
  `,
})
export class ForbiddenPage {}
