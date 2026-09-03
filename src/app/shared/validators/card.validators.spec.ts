import { describe, it, expect } from 'vitest';
import { AbstractControl } from '@angular/forms';
import { luhnValidator, luhnCheck } from './card.validators';

function control(value: unknown): AbstractControl {
  return { value } as AbstractControl;
}

describe('luhnValidator', () => {
  it('accepts a valid Visa number', () => {
    expect(luhnValidator()(control('4242424242424242'))).toBeNull();
  });

  it('accepts a valid Mastercard number', () => {
    expect(luhnValidator()(control('5555555555554444'))).toBeNull();
  });

  it('accepts a valid Amex number', () => {
    expect(luhnValidator()(control('378282246310005'))).toBeNull();
  });

  it('accepts empty value (optional field)', () => {
    expect(luhnValidator()(control(''))).toBeNull();
  });

  it('normalises spaces and dashes before checking', () => {
    expect(luhnValidator()(control('4242 4242 4242 4242'))).toBeNull();
    expect(luhnValidator()(control('4242-4242-4242-4242'))).toBeNull();
  });

  it('rejects a number that fails the Luhn checksum', () => {
    expect(luhnValidator()(control('4242424242424241'))).toEqual({ cardNumberLuhn: true });
  });

  it('rejects a number that is too short', () => {
    expect(luhnValidator()(control('4242424242'))).toEqual({ cardNumberPattern: true });
  });

  it('rejects a number that is too long', () => {
    expect(luhnValidator()(control('4242424242424242424'))).toEqual({ cardNumberPattern: true });
  });

  it('rejects a number with non-digit characters after stripping', () => {
    expect(luhnValidator()(control('4242abcd4242424242'))).toEqual({ cardNumberPattern: true });
  });
});

describe('luhnCheck', () => {
  it('returns true for a valid Visa number', () => {
    expect(luhnCheck('4242424242424242')).toBe(true);
  });

  it('returns false for an invalid checksum', () => {
    expect(luhnCheck('4242424242424241')).toBe(false);
  });
});
