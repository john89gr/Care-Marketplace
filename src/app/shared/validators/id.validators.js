import { of, timer } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
/**
 * Greek ID validators (PLAN.md §1 — Typed Reactive Forms with async
 * validators). All checks are format-only client-side; definitive
 * verification stays server-side.
 */
/** AMKA: 11 digits — DDMMYY + 5 digits + checksum digit. */
export function amkaValidator() {
    return (control) => {
        const value = String(control.value ?? '').replace(/\s|-/g, '');
        if (value === '') {
            return of(null);
        }
        return timer(350).pipe(map(() => {
            if (!/^\d{11}$/.test(value)) {
                return { amkaFormat: true };
            }
            const day = Number(value.slice(0, 2));
            const month = Number(value.slice(2, 4));
            if (day < 1 || day > 31 || month < 1 || month > 12) {
                return { amkaDate: true };
            }
            return null;
        }));
    };
}
/** AFM: 9 digits with the standard Greek VAT checksum. */
export function afmValidator() {
    return (control) => {
        const value = String(control.value ?? '').replace(/\s/g, '');
        if (value === '') {
            return of(null);
        }
        return timer(350).pipe(map(() => {
            if (!/^\d{9}$/.test(value)) {
                return { afmFormat: true };
            }
            // Standard Greek AFM checksum: weights 256,128,...,2; P9 = (sum % 11) % 10
            const digits = value.split('').map(Number);
            let sum = 0;
            const weights = [256, 128, 64, 32, 16, 8, 4, 2];
            for (let i = 0; i < 8; i++) {
                sum += digits[i] * weights[i];
            }
            const check = (sum % 11) % 10;
            if (check !== digits[8]) {
                return { afmChecksum: true };
            }
            return null;
        }));
    };
}
/** Professional licence number: letters/digits/hyphens, 5–20 chars. */
export function licenceNumberValidator() {
    return (control) => {
        const value = String(control.value ?? '').trim();
        if (value === '') {
            return of(null);
        }
        return timer(300).pipe(switchMap(() => of(/^[A-Za-zΑ-Ωα-ω0-9-]{5,20}$/.test(value) ? null : { licenceFormat: true })));
    };
}
