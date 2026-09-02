import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionStore } from './core/auth/session';
import { AuthApi } from './core/auth/auth.api';
import { ROLES, Role } from './core/auth/roles';

interface NavItem {
  label: string;
  href: string;
  exact: boolean;
  roles: readonly Role[]; // empty = any authenticated user
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Marketplace', href: '/marketplace', exact: true, roles: [] },
  { label: 'Bookings', href: '/bookings', exact: false, roles: [ROLES.CLIENT] },
  { label: 'Live visit', href: '/live-visit', exact: false, roles: [ROLES.CLIENT] },
  { label: 'Onboarding', href: '/onboarding', exact: false, roles: [ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO] },
  { label: 'Shifts', href: '/shifts', exact: false, roles: [ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO] },
  { label: 'Visits', href: '/visits', exact: false, roles: [ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO] },
  { label: 'Clinical log', href: '/clinical-log', exact: false, roles: [ROLES.NURSE, ROLES.PHYSIO] },
  { label: 'Care plan', href: '/care-plan', exact: false, roles: [ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO] },
  { label: 'Vitals', href: '/vitals', exact: false, roles: [ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE] },
  { label: 'Payments', href: '/payments', exact: false, roles: [ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO] },
  { label: 'Health record', href: '/health-record', exact: false, roles: [ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE] },
  { label: 'Chat', href: '/chat', exact: false, roles: [] },
  { label: 'Admin', href: '/admin', exact: false, roles: [ROLES.ADMIN] },
];

const THEME_KEY = 'cm.theme.v1';

@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly session = inject(SessionStore);
  private readonly auth = inject(AuthApi);
  private readonly router = inject(Router);

  protected readonly navItems = computed(() =>
    NAV_ITEMS.filter((item) => item.roles.length === 0 || this.session.hasAnyRole(item.roles))
  );

  protected readonly theme = signal<'light' | 'dark'>(this.loadTheme());

  constructor() {
    this.applyTheme(this.theme());
  }

  toggleTheme(): void {
    this.theme.update((current) => (current === 'dark' ? 'light' : 'dark'));
    this.applyTheme(this.theme());
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/marketplace');
  }

  private loadTheme(): 'light' | 'dark' {
    try {
      return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }

  private applyTheme(theme: 'light' | 'dark'): void {
    document.documentElement.dataset['theme'] = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Theme stays in memory when storage is unavailable.
    }
  }
}
