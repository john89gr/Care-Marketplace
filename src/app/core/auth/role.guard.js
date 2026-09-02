import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionStore } from './session';
/**
 * Route guard factory: allows the route only when the user carries at least
 * one of the required roles (PLAN.md §2 RBAC). Redirects to /login when
 * unauthenticated, /forbidden when authenticated but lacking the role.
 */
export function roleGuard(requiredRoles) {
    return () => {
        const session = inject(SessionStore);
        const router = inject(Router);
        if (!session.isLoggedIn()) {
            return router.createUrlTree(['/login']);
        }
        if (requiredRoles.length === 0 || session.hasAnyRole(requiredRoles)) {
            return true;
        }
        return router.createUrlTree(['/forbidden']);
    };
}
