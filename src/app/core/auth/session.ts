import { Injectable, inject, signal, computed } from '@angular/core';
import { Role, rolesFrom } from './roles';

/**
 * Minimal session model. The API contract is intentionally narrow:
 * everything the guards and stores need lives here.
 */
export interface Session {
  userId: string;
  displayName: string;
  roles: Role[];
  expiresAtMs: number;
}

const SESSION_KEY = 'cm.session.v1';

@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly _session = signal<Session | null>(this._load());

  readonly session = this._session.asReadonly();
  readonly isLoggedIn = computed(() => this._session() !== null);
  readonly roles = computed<Role[]>(() => this._session()?.roles ?? []);
  readonly displayName = computed(() => this._session()?.displayName ?? '');

  setSession(session: Session): void {
    this._session.set(session);
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // Storage unavailable (private mode) — session stays in memory only.
    }
  }

  clear(): void {
    this._session.set(null);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // Ignore storage failures on logout.
    }
  }

  hasAnyRole(required: readonly Role[]): boolean {
    const current = this.roles();
    return required.some((role) => current.includes(role));
  }

  private _load(): Session | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as Partial<Session>;
      if (!parsed || typeof parsed.userId !== 'string' || !Array.isArray(parsed.roles)) {
        return null;
      }
      if (typeof parsed.expiresAtMs === 'number' && parsed.expiresAtMs < Date.now()) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return {
        userId: parsed.userId,
        displayName: typeof parsed.displayName === 'string' ? parsed.displayName : '',
        roles: rolesFrom(parsed.roles),
        expiresAtMs: typeof parsed.expiresAtMs === 'number' ? parsed.expiresAtMs : 0,
      };
    } catch {
      return null;
    }
  }
}
