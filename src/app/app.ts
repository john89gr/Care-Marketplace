import {
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SessionStore } from './core/auth/session';
import { AuthApi } from './core/auth/auth.api';
import { ROLES, Role } from './core/auth/roles';
import { WebSocketClient } from './core/services/ws/websocket.client';
import {
  NotificationsService,
  AppNotification,
  AppToast,
  NotificationKind,
  PANEL_MAX_ITEMS,
} from './core/services/notifications/notifications.service';

interface NavItem {
  label: string;
  href: string;
  exact: boolean;
  roles: readonly Role[]; // empty = any authenticated user
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Marketplace', href: '/marketplace', exact: true, roles: [] },
  { label: 'Bookings', href: '/bookings', exact: false, roles: [ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO] },
  { label: 'Live visit', href: '/live-visit', exact: false, roles: [ROLES.CLIENT] },
  { label: 'Onboarding', href: '/onboarding', exact: false, roles: [ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO] },
  { label: 'Shifts', href: '/shifts', exact: false, roles: [ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO] },
  { label: 'Visits', href: '/visits', exact: false, roles: [ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO] },
  { label: 'Clinical log', href: '/clinical-log', exact: false, roles: [ROLES.NURSE, ROLES.PHYSIO] },
  { label: 'Care plan', href: '/care-plan', exact: false, roles: [ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO] },
  { label: 'Vitals', href: '/vitals', exact: false, roles: [ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE] },
  { label: 'Payments', href: '/payments', exact: false, roles: [ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO] },
  { label: 'Health record', href: '/health-record', exact: false, roles: [ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE] },
  { label: 'Preventive care', href: '/screenings', exact: false, roles: [ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE] },
  { label: 'Medications', href: '/medications', exact: false, roles: [ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE] },
  { label: 'Prescriptions', href: '/prescriptions', exact: false, roles: [ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE] },
  { label: 'Pharmacy orders', href: '/pharmacy-orders', exact: false, roles: [ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHARMACY] },
  { label: 'Pharmacy', href: '/pharmacy', exact: false, roles: [ROLES.PHARMACY] },
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
  protected readonly notifications = inject(NotificationsService);
  private readonly ws = inject(WebSocketClient);
  private readonly host = inject(ElementRef);

  protected toastTone(t: AppToast): string {
    return `toast ${t.tone}`;
  }

  protected readonly navItems = computed(() =>
    NAV_ITEMS.filter((item) => item.roles.length === 0 || this.session.hasAnyRole(item.roles))
  );

  protected readonly theme = signal<'light' | 'dark'>(this.loadTheme());

  /** Notification panel state. */
  protected readonly panelOpen = signal(false);
  protected readonly mutesOpen = signal(false);
  protected readonly pushRequested = signal(false);

  /** All notification kinds, for the mute preferences list. */
  protected readonly allKinds: NotificationKind[] = [
    'booking.accepted',
    'booking.started',
    'booking.completed',
    'booking.cancelled',
    'booking.rescheduled',
    'booking.disputed',
    'review.submitted',
    'vitals.alert',
    'vetting.decision',
    'screening.due',
    'medication.missed',
    'system',
  ];

  constructor() {
    this.applyTheme(this.theme());
    // Badge sync: initial load when logged in; the service also reloads on
    // window focus and on panel open (subtask 11).
    if (this.session.isLoggedIn()) {
      this.notifications.load();
      // Connect the shared socket for live pushes (demo mode echoes a
      // sample notification on notification.poll).
      this.ws.connect(
        `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws/visits`
      );
    }
  }

  /** Toggle the panel; load on first open (badge syncs on focus too). */
  togglePanel(): void {
    this.panelOpen.update((open) => !open);
    if (this.panelOpen()) {
      this.notifications.load();
      // Ask the backend for a live push (server decides; demo socket echoes
      // a sample notification so the WS path is exercised).
      this.ws.send({ type: 'notification.poll', payload: {} });
      this.mutesOpen.set(false);
      // Move focus into the dialog for keyboard/screen-reader users.
      setTimeout(() => {
        const panel = this.panelElement();
        panel?.focus();
      }, 0);
    }
  }

  closePanel(): void {
    this.panelOpen.set(false);
    this.mutesOpen.set(false);
  }

  open(item: AppNotification): void {
    this.notifications.activate(item.id);
    this.closePanel();
  }

  markAllRead(): void {
    this.notifications.markAllRead();
  }

  loadMore(): void {
    this.notifications.panelLimit.update((limit) =>
      Math.min(limit + 15, PANEL_MAX_ITEMS)
    );
  }

  retryLoad(): void {
    this.notifications.load();
  }

  async requestPush(): Promise<void> {
    const result = await this.notifications.enablePush();
    this.pushRequested.set(result === 'granted');
  }

  /** Escape closes the panel (subtask 16). */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closePanel();
  }

  /** Minimal focus trap: keep Tab cycling inside the open panel (subtask 16). */
  @HostListener('document:keydown.tab', ['$event'])
  onTab(event: KeyboardEvent): void {
    if (!this.panelOpen()) {
      return;
    }
    const panel = this.panelElement();
    if (!panel || !panel.contains(document.activeElement)) {
      return;
    }
    const focusable = [...panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )].filter((el) => !el.hasAttribute('disabled'));
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      last.focus();
      event.preventDefault();
    } else if (!event.shiftKey && document.activeElement === last) {
      first.focus();
      event.preventDefault();
    }
  }

  private panelElement(): HTMLElement | null {
    try {
      return this.host.nativeElement.querySelector('.panel');
    } catch {
      return null;
    }
  }

  /** Day-group label for the panel (subtask 7). */
  dayLabel(ms: number): string {
    const date = new Date(ms);
    const today = new Date();
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
    if (sameDay(date, today)) {
      return 'Today';
    }
    if (sameDay(date, yesterday)) {
      return 'Yesterday';
    }
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  /** Group the panel items by day (items arrive newest-first). */
  groupByDay(items: AppNotification[]): { label: string; items: AppNotification[] }[] {
    const groups: { label: string; items: AppNotification[] }[] = [];
    for (const item of items) {
      const label = this.dayLabel(item.createdAtMs);
      const last = groups[groups.length - 1];
      if (last && last.label === label) {
        last.items.push(item);
      } else {
        groups.push({ label, items: [item] });
      }
    }
    return groups;
  }

  toggleTheme(): void {
    this.theme.update((current) => (current === 'dark' ? 'light' : 'dark'));
    this.applyTheme(this.theme());
  }

  logout(): void {
    this.auth.logout();
    this.closePanel();
    this.notifications.clear();
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
