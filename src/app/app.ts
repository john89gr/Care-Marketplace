import {
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { SessionStore } from './core/auth/session';
import { AuthApi } from './core/auth/auth.api';
import { ROLES, Role } from './core/auth/roles';
import { WebSocketClient } from './core/services/ws/websocket.client';
import { OfflineQueueService } from './core/services/offline/offline-queue.service';
import { isDemoMode } from './core/api/demo.mode';
import { I18n } from './core/i18n/i18n.service';
import { Language } from './core/i18n/translations';
import {
  NotificationsService,
  AppNotification,
  AppToast,
  NotificationKind,
  PANEL_MAX_ITEMS,
} from './core/services/notifications/notifications.service';

/**
 * A sidebar entry. `key` is an i18n key rather than a label so the nav
 * re-renders in whichever language is active, and `icon` is an aria-hidden
 * glyph (swap for an icon set without touching the nav model).
 */
interface NavItem {
  key: string;
  href: string;
  exact: boolean;
  /** Empty = visible to everyone; otherwise any-of these roles. */
  roles: readonly Role[];
  /** Requires a session (public pages leave this unset). */
  auth?: boolean;
  icon: string;
}

interface NavSection {
  key: string;
  items: NavItem[];
}

const CARE = [ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO];
const PROVIDERS = [ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO];
const CLINICAL = [ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE];

/** Grouped navigation — the sidebar renders one block per section. */
const NAV_SECTIONS: NavSection[] = [
  {
    key: 'nav.group.care',
    items: [
      { key: 'nav.marketplace', href: '/marketplace', exact: true, roles: [], icon: '🔎' },
      { key: 'nav.bookings', href: '/bookings', exact: false, roles: CARE, icon: '📅' },
      { key: 'nav.liveVisit', href: '/live-visit', exact: false, roles: [ROLES.CLIENT], icon: '📍' },
      { key: 'nav.visits', href: '/visits', exact: false, roles: PROVIDERS, icon: '🏠' },
      { key: 'nav.shifts', href: '/shifts', exact: false, roles: PROVIDERS, icon: '🗓️' },
      { key: 'nav.carePlan', href: '/care-plan', exact: false, roles: CARE, icon: '🧩' },
      { key: 'nav.clinicalLog', href: '/clinical-log', exact: false, roles: [ROLES.NURSE, ROLES.PHYSIO], icon: '📝' },
      { key: 'nav.onboarding', href: '/onboarding', exact: false, roles: PROVIDERS, icon: '✅' },
    ],
  },
  {
    key: 'nav.group.health',
    items: [
      { key: 'nav.healthRecord', href: '/health-record', exact: false, roles: CLINICAL, icon: '🗂️' },
      { key: 'nav.vitals', href: '/vitals', exact: false, roles: CLINICAL, icon: '❤️' },
      { key: 'nav.screenings', href: '/screenings', exact: false, roles: CLINICAL, icon: '🛡️' },
      { key: 'nav.medications', href: '/medications', exact: false, roles: CLINICAL, icon: '💊' },
      { key: 'nav.prescriptions', href: '/prescriptions', exact: false, roles: CLINICAL, icon: '📄' },
      { key: 'nav.pharmacyOrders', href: '/pharmacy-orders', exact: false, roles: [...CLINICAL, ROLES.PHARMACY], icon: '📦' },
      { key: 'nav.consents', href: '/consents', exact: false, roles: CLINICAL, icon: '🔏' },
    ],
  },
  {
    key: 'nav.group.finance',
    items: [
      { key: 'nav.payments', href: '/payments', exact: false, roles: CARE, icon: '💳' },
      { key: 'nav.disputes', href: '/disputes', exact: false, roles: [...CARE, ROLES.ADMIN], icon: '⚖️' },
    ],
  },
  {
    key: 'nav.group.account',
    items: [
      { key: 'nav.chat', href: '/chat', exact: false, roles: [], auth: true, icon: '💬' },
      { key: 'nav.profile', href: '/profile', exact: false, roles: [], auth: true, icon: '👤' },
      { key: 'nav.pharmacy', href: '/pharmacy', exact: false, roles: [ROLES.PHARMACY], icon: '🏥' },
    ],
  },
  {
    key: 'nav.group.admin',
    items: [{ key: 'nav.admin', href: '/admin', exact: false, roles: [ROLES.ADMIN], icon: '⚙️' }],
  },
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
  /** Runtime i18n — templates call `i18n.t(key)` so they re-render on switch. */
  protected readonly i18n = inject(I18n);
  /** Offline banner + outbox indicators (§20 subtask 4). */
  protected readonly offline = inject(OfflineQueueService);
  /** PWA update prompt — only present in production (SW-enabled) builds. */
  private readonly swUpdate = inject(SwUpdate, { optional: true });
  protected readonly updateAvailable = signal(false);

  /**
   * True only when the in-memory demo backend is answering requests. Surfaced
   * in the shell so a demo session is never mistaken for the real API.
   */
  protected readonly demoActive = isDemoMode();

  protected toastTone(t: AppToast): string {
    return `toast ${t.tone}`;
  }

  /** Sidebar sections filtered by role/session; empty sections are dropped. */
  protected readonly navSections = computed<NavSection[]>(() =>
    NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          (!item.auth || this.session.isLoggedIn()) &&
          (item.roles.length === 0 || this.session.hasAnyRole(item.roles))
      ),
    })).filter((section) => section.items.length > 0)
  );

  /** Current URL, kept in a signal so `currentNavKey` recomputes on navigation. */
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url)
    ),
    { initialValue: this.router.url }
  );

  /**
   * i18n key of the section the user is in, for the topbar breadcrumb.
   * Longest matching href wins so /pharmacy-orders beats /pharmacy.
   */
  protected readonly currentNavKey = computed<string | null>(() => {
    const url = this.currentUrl().split('?')[0].split('#')[0];
    let best: NavItem | null = null;
    for (const section of this.navSections()) {
      for (const item of section.items) {
        const matches = item.exact
          ? url === item.href
          : url === item.href || url.startsWith(`${item.href}/`);
        if (matches && (!best || item.href.length > best.href.length)) {
          best = item;
        }
      }
    }
    return best?.key ?? null;
  });

  /** Off-canvas sidebar state (mobile only). */
  protected readonly menuOpen = signal(false);

  protected readonly theme = signal<'light' | 'dark'>(this.loadTheme());

  /** Notification panel state. */
  protected readonly panelOpen = signal(false);
  protected readonly mutesOpen = signal(false);
  protected readonly pushRequested = signal(false);

  /** Initials for the sidebar avatar. */
  protected readonly initials = computed(() => {
    const name = this.session.displayName().trim();
    if (!name) {
      return '?';
    }
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  });

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
    // New-version prompt (§20 subtask 10): when the SW has downloaded a new
    // build, offer a one-click reload instead of silently swapping.
    this.swUpdate?.versionUpdates.subscribe((event) => {
      if ((event as VersionReadyEvent).type === 'VERSION_READY') {
        this.updateAvailable.set(true);
      }
    });
    // Collapse the mobile drawer once a navigation completes.
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => this.menuOpen.set(false));
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

  // --- Language -------------------------------------------------------------

  protected setLanguage(language: Language): void {
    this.i18n.setLanguage(language);
  }

  // --- Navigation drawer ----------------------------------------------------

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  // --- Notification panel ---------------------------------------------------

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
    this.closeMenu();
  }

  /** Minimal focus trap: keep Tab cycling inside the open panel (subtask 16). */
  @HostListener('document:keydown.tab', ['$event'])
  onTab(event: Event): void {
    const keyEvent = event as KeyboardEvent;
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
    if (keyEvent.shiftKey && document.activeElement === first) {
      last.focus();
      keyEvent.preventDefault();
    } else if (!keyEvent.shiftKey && document.activeElement === last) {
      first.focus();
      keyEvent.preventDefault();
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
      return this.i18n.t('notifications.today');
    }
    if (sameDay(date, yesterday)) {
      return this.i18n.t('notifications.yesterday');
    }
    return date.toLocaleDateString(this.i18n.locale(), {
      day: 'numeric',
      month: 'short',
    });
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

  /** Retry any failed/queued outbox entries (offline banner "Retry now"). */
  retrySync(): void {
    this.offline.retryFailed();
    void this.offline.retryAll();
  }

  /** Activate the newly downloaded build and reload (subtask 10). */
  async reloadForUpdate(): Promise<void> {
    const ok = this.swUpdate ? await this.swUpdate.activateUpdate() : false;
    if (ok) {
      location.reload();
    }
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
