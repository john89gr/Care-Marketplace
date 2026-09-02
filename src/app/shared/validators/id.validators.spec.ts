import { describe, it, expect } from 'vitest';
import { AbstractControl, AsyncValidatorFn, ValidationErrors } from '@angular/forms';
import { from, firstValueFrom } from 'rxjs';
import {
  amkaValidator,
  afmValidator,
  licenceNumberValidator,
} from './id.validators';

function control(value: unknown): AbstractControl {
  return { value } as AbstractControl;
}

/**
 * AsyncValidatorFn returns Observable | Promise; firstValueFrom only accepts
 * Observable, so normalize with from() before resolving.
 */
function run(validator: AsyncValidatorFn, value: unknown): Promise<ValidationErrors | null> {
  return firstValueFrom(from(validator(control(value))));
}

describe('amkaValidator', () => {
  it('accepts a valid 11-digit AMKA with a plausible date', async () => {
    const result = await run(amkaValidator(), '01010112345');
    expect(result).toBeNull();
  });

  it('accepts empty value (optional field)', async () => {
    const result = await run(amkaValidator(), '');
    expect(result).toBeNull();
  });

  it('rejects a value that is not 11 digits', async () => {
    const result = await run(amkaValidator(), '0101011234');
    expect(result).toEqual({ amkaFormat: true });
  });

  it('rejects an AMKA with an impossible month', async () => {
    const result = await run(amkaValidator(), '01130112345');
    expect(result).toEqual({ amkaDate: true });
  });

  it('rejects an AMKA with an impossible day', async () => {
    const result = await run(amkaValidator(), '32010112345');
    expect(result).toEqual({ amkaDate: true });
  });

  it('normalises spaces and dashes before checking', async () => {
    const result = await run(amkaValidator(), '01-01-01 12345');
    expect(result).toBeNull();
  });
});

describe('afmValidator', () => {
  it('accepts a valid AFM checksum (000000000 is the classic test case)', async () => {
    const result = await run(afmValidator(), '000000000');
    expect(result).toBeNull();
  });

  it('accepts a valid real-format AFM', async () => {
    // weights 256..2 on the first 8 digits: sum = 1004; 1004 % 11 = 3 -> check digit 3
    const result = await run(afmValidator(), '123456783');
    expect(result).toBeNull();
  });

  it('rejects a wrong checksum digit', async () => {
    const result = await run(afmValidator(), '123456781');
    expect(result).toEqual({ afmChecksum: true });
  });

  it('rejects a value that is not 9 digits', async () => {
    const result = await run(afmValidator(), '12345678');
    expect(result).toEqual({ afmFormat: true });
  });

  it('accepts empty value (optional field)', async () => {
    const result = await run(afmValidator(), '');
    expect(result).toBeNull();
  });
});

describe('licenceNumberValidator', () => {
  it('accepts a numeric licence of 5+ chars', async () => {
    const result = await run(licenceNumberValidator(), '12345');
    expect(result).toBeNull();
  });

  it('accepts an alphanumeric licence with hyphens and Greek letters', async () => {
    const result = await run(licenceNumberValidator(), 'ΝΟΣ-2024-Α123');
    expect(result).toBeNull();
  });

  it('rejects a licence shorter than 5 chars', async () => {
    const result = await run(licenceNumberValidator(), 'AB12');
    expect(result).toEqual({ licenceFormat: true });
  });

  it('rejects a licence with special characters', async () => {
    const result = await run(licenceNumberValidator(), 'NURSE#2024');
    expect(result).toEqual({ licenceFormat: true });
  });

  it('rejects a licence longer than 20 chars', async () => {
    const result = await run(licenceNumberValidator(), 'A123456789B123456789X');
    expect(result).toEqual({ licenceFormat: true });
  });

  it('accepts empty value (optional field)', async () => {
    const result = await run(licenceNumberValidator(), '');
    expect(result).toBeNull();
  });
});
