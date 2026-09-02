import { roleGuard } from './core/auth/role.guard';
import { ROLES } from './core/auth/roles';
export const routes = [
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
        canActivate: [roleGuard([ROLES.CLIENT])],
        loadComponent: () => import('./features/marketplace/booking.page').then((m) => m.BookingPage),
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
        path: 'admin',
        canActivate: [roleGuard([ROLES.ADMIN])],
        loadComponent: () => import('./features/admin/admin.page').then((m) => m.AdminPage),
    },
    { path: '**', redirectTo: 'marketplace' },
];
