import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Card validators (FEATURE_PLAN.md §13.7, §13.15). Luhn is a pure local
 * checksum, so it uses a synchronous ValidatorFn rather than the async
 * validators in id.validators.ts.
 */

/** Luhn checksum + digit pattern for card numbers (spaces/dashes ignored). */
export function luhnValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = String(control.value ?? '').replace(/\s|-/g, '');
    if (value === '') {
      return null;
    }
    if (!/^\d{13,19}$/.test(value)) {
      return { cardNumberPattern: true };
    }
    return luhnCheck(value) ? null : { cardNumberLuhn: true };
  };
}

/** Luhn-10 checksum (https://en.wikipedia.org/wiki/Luhn_algorithm). */
export function luhnCheck(cardNumber: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = cardNumber.length - 1; i >= 0; i--) {
    let digit = Number(cardNumber[i]);
    if (alternate) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    sum += digit;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}
