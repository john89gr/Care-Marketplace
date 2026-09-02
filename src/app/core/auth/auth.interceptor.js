import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { SessionStore } from './session';
/**
 * Attaches the bearer token (session id) to API requests and clears the
 * session on 401 responses (PLAN.md §1 Security & Auth).
 */
export const authInterceptor = (req, next) => {
    const session = inject(SessionStore);
    const current = session.session();
    const headers = current
        ? req.headers.set('Authorization', `Bearer ${current.userId}`)
        : req.headers;
    return next(req.clone({ headers })).pipe(tap({
        error: (error) => {
            const status = error?.status;
            if (status === 401) {
                session.clear();
            }
        },
    }));
};
