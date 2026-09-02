import { HttpClient, HttpContextToken, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { SessionStore } from './session';

/** Marks a request as already retried after a refresh. */
export const AUTH_RETRY = new HttpContextToken<boolean>(() => false);

/**
 * Cookie-session interceptor: auth lives in httpOnly cookies (`cm_access` /
 * `cm_refresh`) set by the backend, so no Authorization header is attached.
 * On a 401 from any non-auth endpoint, it silently calls /api/auth/refresh
 * (rotating the refresh cookie) and retries the original request once; if
 * refresh itself fails the session is cleared server-side and locally.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(SessionStore);
  const http = inject(HttpClient);

  const isAuthRequest = req.url.includes('/api/auth/');
  const retried = req.context.get(AUTH_RETRY);

  return next(req).pipe(
    catchError((error) => {
      const status = (error as { status?: number })?.status;
      if (status !== 401 || isAuthRequest || retried) {
        if (status === 401 && !isAuthRequest && !retried) {
          session.clear();
        }
        return throwError(() => error);
      }

      return http.post<unknown>('/api/auth/refresh', {}).pipe(
        switchMap(() => {
          const refreshed = req.clone({ context: req.context.set(AUTH_RETRY, true) });
          return next(refreshed);
        }),
        catchError((refreshError) => {
          session.clear();
          return throwError(() => refreshError);
        })
      );
    })
  );
};