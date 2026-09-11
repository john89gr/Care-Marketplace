import { describe, expect, it } from 'vitest';
import {
  defaultTimesFor,
  everyNHoursTimes,
  parseFoodRelation,
  parseFrequency,
  planFromPrescription,
  scheduleFromEditor,
  toMedicationBody,
} from './prescription.schedule';
import { emptyInstructions } from './medicine.info';

/**
 * Track 3 parser tests: Greek + English frequency phrases, PRN/SOS handling,
 * food-relation detection and the plan payload. Table-driven so adding a
 * phrasing is a one-line change.
 */

describe('defaultTimesFor / everyNHoursTimes', () => {
  it('gives clinically sensible default dose times per count', () => {
    expect(defaultTimesFor(1)).toEqual([480]);
    expect(defaultTimesFor(3)).toEqual([480, 840, 1200]);
    expect(defaultTimesFor(0)).toEqual([480]); // clamped
    expect(defaultTimesFor(20).length).toBe(6); // clamped
  });

  it('spreads hourly doses from 08:00 and sorts them', () => {
    expect(everyNHoursTimes(8)).toEqual([0, 480, 960]);
    expect(everyNHoursTimes(12)).toEqual([480, 1200]);
  });
});

describe('parseFrequency', () => {
  it.each([
    ['1x3', { kind: 'daily', timesMinutes: [480, 840, 1200] }, 'parsed'],
    ['3 φορές την ημέρα', { kind: 'daily', timesMinutes: [480, 840, 1200] }, 'parsed'],
    ['3 times a day', { kind: 'daily', timesMinutes: [480, 840, 1200] }, 'parsed'],
    ['μία φορά την ημέρα', { kind: 'daily', timesMinutes: [480] }, 'parsed'],
    ['once daily', { kind: 'daily', timesMinutes: [480] }, 'parsed'],
    ['κάθε 8 ώρες', { kind: 'daily', timesMinutes: [0, 480, 960] }, 'parsed'],
    // 08:00 + 6h steps, wrapped and sorted: 02:00, 08:00, 14:00, 20:00.
    ['every 6 hours', { kind: 'daily', timesMinutes: [120, 480, 840, 1200] }, 'parsed'],
    ['πρωί και βράδυ', { kind: 'daily', timesMinutes: [480, 1200] }, 'parsed'],
    ['morning and evening', { kind: 'daily', timesMinutes: [480, 1200] }, 'parsed'],
    ['κάθε 2 ημέρες', { kind: 'interval', everyDays: 2, timeMinutes: 480 }, 'parsed'],
    ['μία φορά την εβδομάδα', { kind: 'weekly', weekdays: [1], timeMinutes: 480 }, 'defaulted'],
  ])('parses "%s"', (raw, schedule, confidence) => {
    const parsed = parseFrequency(raw);
    expect(parsed.schedule).toEqual(schedule);
    expect(parsed.confidence).toBe(confidence);
    expect(parsed.isPrn).toBe(false);
    expect(parsed.note).not.toBe('');
  });

  it.each(['SOS', 'όταν χρειαστεί', 'as needed', 'PRN'])('flags "%s" as PRN with no schedule', (raw) => {
    const parsed = parseFrequency(raw);
    expect(parsed.isPrn).toBe(true);
    expect(parsed.schedule).toBeNull();
    expect(parsed.note).toContain('SOS');
  });

  it('degrades to a flagged default when the text is empty or unrecognized', () => {
    expect(parseFrequency('').schedule).toBeNull();
    expect(parseFrequency('').confidence).toBe('defaulted');

    const unknown = parseFrequency('όπως σας είπε ο γιατρός');
    expect(unknown.schedule).toBeNull();
    expect(unknown.confidence).toBe('defaulted');
    expect(unknown.note).toContain('όπως σας είπε ο γιατρός');
  });
});

describe('parseFoodRelation', () => {
  it.each([
    ['μετά το φαγητό', 'after'],
    ['after meals', 'after'],
    ['με το φαγητό', 'with'],
    ['with food', 'with'],
    ['πριν το φαγητό', 'before'],
    ['empty stomach', 'before'],
    ['', 'any'],
    ['μία φορά την ημέρα', 'any'],
  ])('maps "%s" → %s', (raw, expected) => {
    expect(parseFoodRelation(raw)).toBe(expected);
  });
});

describe('planFromPrescription', () => {
  it('builds a parsed plan with the catalog sheet and the Rx text as special instructions', () => {
    const plan = planFromPrescription({
      drug: 'Atorvastatin',
      dose: '20mg',
      instructions: '1x3 μετά το φαγητό',
    });
    expect(plan.schedule).toEqual({ kind: 'daily', timesMinutes: [480, 840, 1200] });
    expect(plan.confidence).toBe('parsed');
    expect(plan.isPrn).toBe(false);
    expect(plan.channels).toEqual(['inapp', 'push']);
    // Catalog fills the sheet; the parsed food relation overrides 'any'.
    expect(plan.instructions.maxDailyDoses).toBe(1);
    expect(plan.instructions.foodRelation).toBe('after');
    expect(plan.instructions.specialInstructions).toBe('1x3 μετά το φαγητό');
    expect(plan.parsedFrom).toBe('1x3 μετά το φαγητό');
  });

  it('keeps PRN prescriptions schedule-less for the wizard to fill in', () => {
    const plan = planFromPrescription({ drug: 'Paracetamol', dose: '500mg', instructions: 'SOS' });
    expect(plan.schedule).toBeNull();
    expect(plan.isPrn).toBe(true);
    expect(plan.confidence).toBe('defaulted');
  });

  it('honours a channel override and falls back to the defaults', () => {
    const rx = { drug: 'Unknownium', dose: '', instructions: '' };
    expect(planFromPrescription(rx, { channels: ['inapp', 'sms'] }).channels).toEqual(['inapp', 'sms']);
    // Unsupported channels are dropped, then the default pair is used.
    expect(planFromPrescription(rx, { channels: ['telepathy' as never] }).channels).toEqual([
      'inapp',
      'push',
    ]);
  });

  it('pre-fills an empty sheet for an unknown drug with a default-morning schedule', () => {
    const plan = planFromPrescription({ drug: 'Unknownium', dose: '', instructions: '' });
    expect(plan.instructions).toEqual({ ...emptyInstructions(), specialInstructions: '' });
    expect(plan.schedule).toEqual({ kind: 'daily', timesMinutes: [480] });
    expect(plan.confidence).toBe('defaulted');
  });
});

describe('scheduleFromEditor (wizard confirm payload)', () => {
  it('sorts daily times and rejects an empty daily list', () => {
    expect(
      scheduleFromEditor({
        kind: 'daily',
        timesMinutes: [1200, 480, 840],
        everyDays: 2,
        singleTimeMinutes: 480,
        weekdays: [1],
      })
    ).toEqual({ kind: 'daily', timesMinutes: [480, 840, 1200] });
    expect(
      scheduleFromEditor({
        kind: 'daily',
        timesMinutes: [],
        everyDays: 2,
        singleTimeMinutes: 480,
        weekdays: [1],
      })
    ).toBeNull();
  });

  it('clamps every-N-days to at least one day', () => {
    expect(
      scheduleFromEditor({
        kind: 'interval',
        timesMinutes: [],
        everyDays: 0,
        singleTimeMinutes: 540,
        weekdays: [],
      })
    ).toEqual({ kind: 'interval', everyDays: 1, timeMinutes: 540 });
  });

  it('de-duplicates/orders weekdays and rejects an empty selection', () => {
    expect(
      scheduleFromEditor({
        kind: 'weekly',
        timesMinutes: [],
        everyDays: 2,
        singleTimeMinutes: 600,
        weekdays: [5, 1, 5, 3],
      })
    ).toEqual({ kind: 'weekly', weekdays: [1, 3, 5], timeMinutes: 600 });
    expect(
      scheduleFromEditor({
        kind: 'weekly',
        timesMinutes: [],
        everyDays: 2,
        singleTimeMinutes: 600,
        weekdays: [],
      })
    ).toBeNull();
  });

  it('produces the request body the wizard sends on confirm', () => {
    const plan = planFromPrescription({ drug: 'Atorvastatin', dose: '', instructions: '1x3' });
    const edited = scheduleFromEditor({
      kind: 'daily',
      timesMinutes: [540, 1260],
      everyDays: 2,
      singleTimeMinutes: 480,
      weekdays: [1],
    });
    expect(toMedicationBody({ ...plan, schedule: edited })).toEqual({
      schedule: { kind: 'daily', timesMinutes: [540, 1260] },
      instructions: plan.instructions,
    });
  });
});

describe('toMedicationBody', () => {
  it('includes the schedule when there is one', () => {
    const plan = planFromPrescription({ drug: 'Atorvastatin', dose: '', instructions: '1x3' });
    const body = toMedicationBody(plan);
    expect(body.schedule).toEqual({ kind: 'daily', timesMinutes: [480, 840, 1200] });
    expect(body.instructions).toBeDefined();
  });

  it('omits the schedule for a PRN plan', () => {
    const plan = planFromPrescription({ drug: 'Paracetamol', dose: '', instructions: 'SOS' });
    expect(toMedicationBody(plan)).toEqual({ instructions: plan.instructions });
  });
});
