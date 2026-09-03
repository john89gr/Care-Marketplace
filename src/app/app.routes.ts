import { Routes } from '@angular/router';
import { roleGuard } from './core/auth/role.guard';
import { ROLES } from './core/auth/roles';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'marketplace' },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'profile',
    canActivate: [roleGuard([])],
    loadComponent: () => import('./features/profiles/profile.page').then((m) => m.ProfilePage),
  },
  {
    path: 'chat',
    canActivate: [roleGuard([])],
    loadComponent: () => import('./features/marketplace/chat.page').then((m) => m.ChatPage),
  },
  {
    path: 'forbidden',
    loadComponent: () => import('./features/auth/forbidden.page').then((m) => m.ForbiddenPage),
  },
  {
    path: 'marketplace',
    loadComponent: () => import('./features/marketplace/marketplace.page').then((m) => m.MarketplacePage),
  },
  {
    path: 'bookings',
    canActivate: [roleGuard([ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO])],
    loadComponent: () => import('./features/marketplace/booking.page').then((m) => m.BookingPage),
  },
  {
    path: 'review',
    canActivate: [roleGuard([ROLES.CLIENT])],
    loadComponent: () => import('./features/marketplace/review.page').then((m) => m.ReviewPage),
  },
  {
    path: 'onboarding',
    canActivate: [roleGuard([ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO])],
    loadComponent: () => import('./features/vetting/onboarding.page').then((m) => m.OnboardingPage),
  },
  {
    path: 'shifts',
    canActivate: [roleGuard([ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO])],
    loadComponent: () => import('./features/home-health/shifts.page').then((m) => m.ShiftsPage),
  },
  {
    path: 'visits',
    canActivate: [roleGuard([ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO])],
    loadComponent: () => import('./features/home-health/visits.page').then((m) => m.VisitsPage),
  },
  {
    path: 'live-visit',
    canActivate: [roleGuard([ROLES.CLIENT])],
    loadComponent: () => import('./features/home-health/live-visit.page').then((m) => m.LiveVisitPage),
  },
  {
    path: 'clinical-log',
    canActivate: [roleGuard([ROLES.NURSE, ROLES.PHYSIO])],
    loadComponent: () => import('./features/home-health/clinical-log.page').then((m) => m.ClinicalLogPage),
  },
  {
    path: 'care-plan',
    canActivate: [roleGuard([ROLES.CLIENT, ROLES.NURSE, ROLES.PHYSIO])],
    loadComponent: () => import('./features/home-health/care-plan.page').then((m) => m.CarePlanPage),
  },
  {
    path: 'payments',
    canActivate: [roleGuard([ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHYSIO])],
    loadComponent: () => import('./features/payments/payments.page').then((m) => m.PaymentsPage),
  },
  {
    path: 'wallet',
    canActivate: [roleGuard([ROLES.CLIENT])],
    loadComponent: () => import('./features/integrations/wallet.page').then((m) => m.WalletPage),
  },
  {
    path: 'gov-gr-auth',
    loadComponent: () =>
      import('./features/integrations/gov-gr-auth.page').then((m) => m.GovGrAuthPage),
  },
  {
    path: 'vitals',
    canActivate: [roleGuard([ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE])],
    loadComponent: () => import('./features/health-record/vitals.page').then((m) => m.VitalsPage),
  },
  {
    path: 'health-record',
    canActivate: [roleGuard([ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE])],
    loadComponent: () => import('./features/health-record/health-record.page').then((m) => m.HealthRecordPage),
  },
  {
    path: 'screenings',
    canActivate: [roleGuard([ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE])],
    loadComponent: () => import('./features/health-record/screening.page').then((m) => m.ScreeningPage),
  },
  {
    path: 'medications',
    canActivate: [roleGuard([ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE])],
    loadComponent: () => import('./features/health-record/medications.page').then((m) => m.MedicationsPage),
  },
  {
    path: 'reminders',
    canActivate: [roleGuard([ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE])],
    loadComponent: () =>
      import('./features/health-record/reminders-settings.component').then(
        (m) => m.ReminderSettingsComponent
      ),
  },
  {
    path: 'health-summary',
    canActivate: [roleGuard([ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE])],
    loadComponent: () =>
      import('./features/health-record/export.page').then((m) => m.HealthSummaryExportPage),
  },
  {
    path: 'prescriptions',
    canActivate: [roleGuard([ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE])],
    loadComponent: () => import('./features/pharmacy/prescriptions.page').then((m) => m.PrescriptionsPage),
  },
  {
    path: 'pharmacy-orders',
    canActivate: [roleGuard([ROLES.CLIENT, ROLES.CAREGIVER, ROLES.NURSE, ROLES.PHARMACY])],
    loadComponent: () => import('./features/pharmacy/orders.page').then((m) => m.OrdersPage),
  },
  {
    path: 'pharmacy',
    canActivate: [roleGuard([ROLES.PHARMACY])],
    loadComponent: () => import('./features/pharmacy/pharmacy.page').then((m) => m.PharmacyPage),
  },
  {
    path: 'admin',
    canActivate: [roleGuard([ROLES.ADMIN])],
    loadComponent: () => import('./features/admin/admin.page').then((m) => m.AdminPage),
  },
  { path: '**', redirectTo: 'marketplace' },
];
