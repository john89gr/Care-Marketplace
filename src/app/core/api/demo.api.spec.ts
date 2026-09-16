import '@angular/compiler';
import { HttpEvent, HttpRequest, HttpResponse } from '@angular/common/http';
import { catchError, firstValueFrom, map, of } from 'rxjs';
import { beforeAll, describe, expect, it } from 'vitest';
import { demoApi } from './demo.api';
import { parseDemoLang } from './demo-content';

/**
 * Bilingual content in the in-memory demo backend.
 *
 * The demo backend is what `?demo=1` and the Playwright suite run on, so it has
 * to localise *content* exactly like the real server: passports, bios,
 * specialities, service names, review comments, care-plan copy. These tests
 * drive the interceptor directly (no TestBed) and assert that switching
 * `?lang=` changes the words while leaving ids, prices and statuses alone.
 */

/** Drive the demo interceptor as if `GET {url}` had been issued. */
async function get<T>(url: string, method = 'GET', body: unknown = null): Promise<T> {
  const request = new HttpRequest<unknown>(method, url, body);
  const events = demoApi(request, (req) => of(new HttpResponse({ status: 200, body: 'PASSTHROUGH' })));
  const response = (await firstValueFrom(events)) as HttpEvent<unknown>;
  if (!(response instanceof HttpResponse)) {
    throw new Error('Demo backend did not answer with an HttpResponse.');
  }
  return response.body as T;
}

beforeAll(() => {
  // The interceptor is a no-op unless demo mode is on.
  localStorage.setItem('cm.demo.v1', '1');
});

describe('parseDemoLang', () => {
  it('reads the requested content language', () => {
    expect(parseDemoLang('lang=el')).toBe('el');
    expect(parseDemoLang('q=nurse&lang=el')).toBe('el');
    expect(parseDemoLang('lang=en')).toBe('en');
    // A regional or oddly-cased tag still resolves to its base language.
    expect(parseDemoLang('lang=EL-gr')).toBe('el');
  });

  it('falls back to English for anything it cannot use', () => {
    expect(parseDemoLang('')).toBe('en');
    expect(parseDemoLang('q=nurse')).toBe('en');
    expect(parseDemoLang('lang=de')).toBe('en');
  });
});

describe('demo backend content localisation', () => {
  it('renders a provider profile in the requested language', async () => {
    const en = await get<Record<string, unknown>>('/api/caregivers/cg-1');
    expect(String(en['bio'])).toContain('Registered nurse');
    expect(en['city']).toBe('Athens — Syntagma');
    expect(en['specialties']).toEqual(['Injections', 'Wound care', 'Insulin']);

    const el = await get<Record<string, unknown>>('/api/caregivers/cg-1?lang=el');
    expect(String(el['bio'])).toContain('Πιστοποιημένη νοσηλεύτρια');
    expect(el['city']).toBe('Αθήνα — Σύνταγμα');
    expect(el['specialties']).toEqual(['Ενέσεις', 'Φροντίδα τραυμάτων', 'Ινσουλίνη']);
  });

  it('keeps prices and durations language-independent', async () => {
    interface Service {
      name: string;
      price: number;
      durationMin: number;
    }
    const en = await get<{ services: Service[] }>('/api/caregivers/cg-1');
    const el = await get<{ services: Service[] }>('/api/caregivers/cg-1?lang=el');

    expect(el.services.map((s) => s.name)).toEqual([
      'Ένεση στο σπίτι',
      'Περιποίηση & φροντίδα τραύματος',
      'Ανασκόπηση φαρμακευτικής αγωγής',
    ]);
    // The cost of a visit is not a translation.
    expect(el.services.map((s) => [s.price, s.durationMin])).toEqual(
      en.services.map((s) => [s.price, s.durationMin])
    );
  });

  it('localises marketplace search cards without touching their identity', async () => {
    const el = await get<{ id: string; bio: string; specialties: string[] }[]>(
      '/api/caregivers/search?lang=el'
    );
    const card = el.find((entry) => entry.id === 'cg-3');
    expect(card).toBeDefined();
    expect(card!.specialties).toContain('Αποκατάσταση μετά από εγκεφαλικό');
    expect(card!.bio).toContain('Φυσικοθεραπεύτρια');
  });

  it('localises review comments but never the author or rating', async () => {
    interface Review {
      id: string;
      comment: string;
      authorName: string;
      rating: number;
      status: string;
    }
    const el = await get<Review[]>('/api/caregivers/cg-1/reviews?lang=el');
    const review = el.find((entry) => entry.id === 'rv-1');
    expect(review).toBeDefined();
    expect(review!.comment).toBe('Συνεπής, ευγενική και πολύ επαγγελματική στην περιποίηση του τραύματος.');
    // A review's author, rating and moderation state are facts, not copy.
    expect(review!.authorName).toBe('Maria Papadopoulou');
    expect(review!.rating).toBe(5);
    expect(review!.status).toBe('published');

    const en = await get<Review[]>('/api/caregivers/cg-1/reviews');
    expect(en.find((entry) => entry.id === 'rv-1')!.comment).toContain('Punctual, gentle');
  });

  it('localises care-plan goals and notes', async () => {
    interface Plan {
      id: string;
      goals: { id: string; text: string; status: string }[];
      notes: { id: string; text: string; authorName: string }[];
    }
    const el = await get<Plan[]>('/api/care-plans?lang=el');
    const plan = el.find((entry) => entry.id === 'cp-1');
    expect(plan).toBeDefined();
    expect(plan!.goals.map((goal) => goal.text)).toEqual([
      'Καθημερινή κινητοποίηση ώμου',
      'Σταθεροποίηση αρτηριακής πίεσης',
    ]);
    expect(plan!.notes[0].text).toBe('Η πίεση σταθερή στο 125/80, συνεχίζουμε την παρακολούθηση.');
    // Progress state travels with the goal, not with its wording.
    expect(plan!.goals[0].status).toBe('in-progress');
  });

  it('localises the short note on a booking', async () => {
    interface Booking {
      id: string;
      note: string;
      status: string;
    }
    const el = await get<Booking[]>('/api/bookings?lang=el');
    expect(el.find((entry) => entry.id === 'b-1')!.note).toBe('Πρωινή ένεση ινσουλίνης');
    expect(el.every((entry) => typeof entry.status === 'string' && entry.status.length > 0)).toBe(
      true
    );

    const en = await get<Booking[]>('/api/bookings');
    expect(en.find((entry) => entry.id === 'b-1')!.note).toBe('Morning insulin injection');
  });

  it('keeps ids stable across languages', async () => {
    const el = await get<{ id: string }[]>('/api/caregivers/search?lang=el');
    const en = await get<{ id: string }[]>('/api/caregivers/search');
    // Same providers, same order — only the words differ. Anything else would
    // break favourites, saved searches and deep links on a language switch.
    expect(el.map((card) => card.id)).toEqual(en.map((card) => card.id));
  });

  it('still 404s an unknown provider when a language was requested', async () => {
    const request = new HttpRequest<unknown>('GET', '/api/caregivers/nope?lang=el');
    // Demo failures arrive as real HTTP errors (never as a 2xx carrying an
    // error body), so a store's error handler sees the same thing it would
    // from the Express server.
    const status = await firstValueFrom(
      demoApi(request, (req) => of(new HttpResponse({ status: 200, body: 'PASSTHROUGH' }))).pipe(
        map(() => 200),
        catchError((error: { status?: number }) => of(error.status ?? 0))
      )
    );
    expect(status).toBe(404);
  });
});
