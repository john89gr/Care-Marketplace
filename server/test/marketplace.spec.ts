import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { bootstrapDb, pool, query } from '../src/db';
import { createApp } from '../src/app';
import { seed } from '../src/seed';

/**
 * Marketplace trust surfaces (§1–§2) against the real Express app + Postgres:
 * saved searches, favorites and reviews. Requires the database to be up; the
 * suite seeds it fresh (rv-1 for booking b-1 included).
 */
let baseUrl: string;
let server: ReturnType<typeof createServer>;
let client: request.Agent;
let admin: request.Agent;

beforeAll(async () => {
  await bootstrapDb();
  await seed();
  await query(`DELETE FROM reviews WHERE booking_id IN ('b-review-test', 'b-cg-alias-test')`);
  await query(`DELETE FROM bookings WHERE id IN ('b-review-test', 'b-cg-alias-test')`);
  const app = createApp();
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;

  client = request.agent(baseUrl);
  await client
    .post('/api/auth/login')
    .send({ email: 'maria@example.com', password: 'demo1234' })
    .expect(200);

  admin = request.agent(baseUrl);
  await admin
    .post('/api/auth/login')
    .send({ email: 'admin@example.com', password: 'demo1234' })
    .expect(200);
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await pool.end();
});

describe('saved searches + favorites', () => {
  it('rejects unauthenticated access', async () => {
    await request(baseUrl).get('/api/me/saved-searches').expect(401);
  });

  it('returns the seeded search and favorite for the demo client', async () => {
    const res = await client.get('/api/me/saved-searches').expect(200);
    expect(res.body.savedSearches.map((s: { id: string }) => s.id)).toContain('ss-1');
    expect(res.body.favorites.map((f: { caregiverId: string }) => f.caregiverId)).toContain(
      'u-nurse'
    );
  });

  it('creates, renames and deletes a saved search', async () => {
    const created = await client
      .post('/api/me/saved-searches')
      .send({ name: 'Test search', filters: { query: 'test', roles: [] } })
      .expect(201);
    expect(created.body).toMatchObject({ name: 'Test search' });
    const id = created.body.id as string;

    const renamed = await client
      .patch(`/api/me/saved-searches/${id}`)
      .send({ name: 'Renamed' })
      .expect(200);
    expect(renamed.body.name).toBe('Renamed');

    await client.delete(`/api/me/saved-searches/${id}`).expect(200);
    await client.delete(`/api/me/saved-searches/${id}`).expect(404);
  });

  it('validates the save payload', async () => {
    await client.post('/api/me/saved-searches').send({ name: '', filters: {} }).expect(422);
    await client.post('/api/me/saved-searches').send({ name: 'x' }).expect(422);
  });

  it('toggles favorites idempotently', async () => {
    await client.post('/api/me/favorites').send({ caregiverId: 'nobody' }).expect(404);
    await client.post('/api/me/favorites').send({ caregiverId: 'u-physio' }).expect(201);
    // Second add is an upsert, not a duplicate.
    await client.post('/api/me/favorites').send({ caregiverId: 'u-physio' }).expect(201);
    const listed = await client.get('/api/me/saved-searches').expect(200);
    expect(
      listed.body.favorites.filter((f: { caregiverId: string }) => f.caregiverId === 'u-physio')
    ).toHaveLength(1);
    await client.delete('/api/me/favorites/u-physio').expect(200);
  });
});

describe('reviews', () => {
  it('lists the seeded published review publicly', async () => {
    const res = await request(baseUrl).get('/api/caregivers/u-nurse/reviews').expect(200);
    const found = res.body.find((r: { id: string }) => r.id === 'rv-1');
    expect(found).toMatchObject({ rating: 5, status: 'published', authorName: 'Maria Papadopoulou' });
  });

  it('rejects a second review for the same booking with 409', async () => {
    await client
      .post('/api/bookings/b-1/review')
      .send({ caregiverId: 'u-nurse', bookingId: 'b-1', rating: 5, comment: 'Again' })
      .expect(409);
  });

  it('validates rating range and booking state', async () => {
    // b-1 is completed + reviewed: an out-of-range rating still 422s first.
    await client
      .post('/api/bookings/b-1/review')
      .send({ caregiverId: 'u-nurse', bookingId: 'b-1', rating: 9, comment: '' })
      .expect(422);
    await client
      .post('/api/bookings/does-not-exist/review')
      .send({ caregiverId: 'u-nurse', bookingId: 'does-not-exist', rating: 5, comment: '' })
      .expect(404);
  });

  it('submits, flags and moderates a review end to end', async () => {
    // A fresh completed booking owned by the demo client.
    await query(
      `INSERT INTO bookings (id, caregiver_id, client_id, scheduled_at_ms, note, amount_cents, status, created_at_ms)
       VALUES ('b-review-test', 'u-physio', 'u-client', $1, 'test', 1000, 'completed', $1)
       ON CONFLICT (id) DO NOTHING`,
      [Date.now()]
    );
    await query(`DELETE FROM reviews WHERE booking_id = 'b-review-test'`);

    const created = await client
      .post('/api/bookings/b-review-test/review')
      .send({ caregiverId: 'u-physio', bookingId: 'b-review-test', rating: 4, comment: 'Good.' })
      .expect(201);
    expect(created.body).toMatchObject({ rating: 4, status: 'published' });
    const reviewId = created.body.id as string;

    const flagged = await client.post(`/api/reviews/${reviewId}/flag`).expect(200);
    expect(flagged.body.status).toBe('flagged');

    // Non-admins cannot moderate or list the queue.
    await client.post(`/api/reviews/${reviewId}/moderate`).send({ decision: 'published' }).expect(403);
    await client.get('/api/reviews').expect(403);

    const moderated = await admin
      .post(`/api/reviews/${reviewId}/moderate`)
      .send({ decision: 'published' })
      .expect(200);
    expect(moderated.body.status).toBe('published');

    const queue = await admin.get('/api/reviews').expect(200);
    expect(queue.body.map((r: { id: string }) => r.id)).toContain(reviewId);

    await query(`DELETE FROM reviews WHERE booking_id = 'b-review-test'`);
    await query(`DELETE FROM bookings WHERE id = 'b-review-test'`);
  });
});

describe('caregiver search & matching', () => {
  it('returns all rich fields matching CaregiverCard interface', async () => {
    const res = await request(baseUrl).get('/api/caregivers/search').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    const card = res.body.find((c: { id: string }) => c.id === 'u-nurse');
    expect(card).toBeDefined();
    expect(card).toMatchObject({
      id: 'u-nurse',
      displayName: 'Elena Papadaki',
      roles: ['nurse'],
      rating: 5, // dynamically calculated from published review rv-1
      hourlyRate: 25,
      availableNow: true,
      gender: 'female',
    });
    expect(card.reviewCount).toBeGreaterThanOrEqual(1);
    expect(typeof card.distanceKm).toBe('number');
    expect(Array.isArray(card.specialties)).toBe(true);
    expect(card.specialties.length).toBeGreaterThan(0);
    expect(typeof card.lat).toBe('number');
    expect(typeof card.lng).toBe('number');
    expect(typeof card.completedVisits).toBe('number');
    expect(typeof card.recentCancellations).toBe('number');
    expect(typeof card.bio).toBe('string');
    expect(Array.isArray(card.languages)).toBe(true);
    expect(typeof card.expiresAtMs).toBe('number');
  });

  it('filters by query across display_name, specialties, and bio', async () => {
    // Matching display name
    const byName = await request(baseUrl).get('/api/caregivers/search?query=Elena').expect(200);
    expect(byName.body.map((c: { id: string }) => c.id)).toContain('u-nurse');
    expect(byName.body.map((c: { id: string }) => c.id)).not.toContain('u-nikos');

    // Matching specialties
    const bySpec = await request(baseUrl).get('/api/caregivers/search?query=Ενέσεις').expect(200);
    expect(bySpec.body.map((c: { id: string }) => c.id)).toContain('u-nurse');
    expect(bySpec.body.map((c: { id: string }) => c.id)).not.toContain('u-nikos');

    // Matching bio
    const byBio = await request(baseUrl).get('/api/caregivers/search?query=Ευαγγελισμός').expect(200);
    expect(byBio.body.map((c: { id: string }) => c.id)).toContain('u-nurse');

    // Non-matching query
    const noMatch = await request(baseUrl).get('/api/caregivers/search?query=nonexistentqueryxyz').expect(200);
    expect(noMatch.body).toHaveLength(0);
  });

  it('filters by roles (single, comma-separated, and array)', async () => {
    const singleRole = await request(baseUrl).get('/api/caregivers/search?roles=nurse').expect(200);
    expect(singleRole.body.every((c: { roles: string[] }) => c.roles.includes('nurse'))).toBe(true);
    expect(singleRole.body.map((c: { id: string }) => c.id)).toContain('u-nurse');

    const multiRole = await request(baseUrl).get('/api/caregivers/search?roles=nurse,physio').expect(200);
    const ids = multiRole.body.map((c: { id: string }) => c.id);
    expect(ids).toContain('u-nurse');
    expect(ids).toContain('u-physio');
    expect(ids).not.toContain('u-nikos');

    const arrayRole = await request(baseUrl).get('/api/caregivers/search?roles[]=caregiver').expect(200);
    expect(arrayRole.body.map((c: { id: string }) => c.id)).toContain('u-nikos');
  });

  it('filters by maxHourlyRate', async () => {
    const res = await request(baseUrl).get('/api/caregivers/search?maxHourlyRate=20').expect(200);
    expect(res.body.every((c: { hourlyRate: number }) => c.hourlyRate <= 20)).toBe(true);
    expect(res.body.map((c: { id: string }) => c.id)).toContain('u-nikos');
    expect(res.body.map((c: { id: string }) => c.id)).not.toContain('u-nurse');
  });

  it('filters by minRating', async () => {
    const res = await request(baseUrl).get('/api/caregivers/search?minRating=4.85').expect(200);
    expect(res.body.every((c: { rating: number }) => c.rating >= 4.85)).toBe(true);
    expect(res.body.map((c: { id: string }) => c.id)).toContain('u-nurse');
    expect(res.body.map((c: { id: string }) => c.id)).not.toContain('u-caregiver-kostas');
  });

  it('filters by availableNowOnly', async () => {
    const res = await request(baseUrl).get('/api/caregivers/search?availableNowOnly=true').expect(200);
    expect(res.body.every((c: { availableNow: boolean }) => c.availableNow === true)).toBe(true);
    expect(res.body.map((c: { id: string }) => c.id)).toContain('u-nurse');
    expect(res.body.map((c: { id: string }) => c.id)).not.toContain('u-nurse-vasilis');
  });

  it('auto-filters expired caregivers unless explicitly requested', async () => {
    // Default: u-expired is excluded
    const defaultSearch = await request(baseUrl).get('/api/caregivers/search').expect(200);
    expect(defaultSearch.body.map((c: { id: string }) => c.id)).not.toContain('u-expired');

    // With includeExpired=true: u-expired is returned
    const withExpired = await request(baseUrl).get('/api/caregivers/search?includeExpired=true').expect(200);
    expect(withExpired.body.map((c: { id: string }) => c.id)).toContain('u-expired');
  });

  it('calculates haversine distance and filters by maxDistanceKm', async () => {
    // Elena is at Kolonaki (37.9779, 23.7436), Karras is at Kifisia (38.0742, 23.8118)
    const userLat = 37.9779;
    const userLng = 23.7436;

    const res = await request(baseUrl)
      .get(`/api/caregivers/search?lat=${userLat}&lng=${userLng}`)
      .expect(200);
    const elena = res.body.find((c: { id: string }) => c.id === 'u-nurse');
    const karras = res.body.find((c: { id: string }) => c.id === 'u-nurse-karras');

    expect(elena.distanceKm).toBe(0);
    expect(karras.distanceKm).toBeGreaterThan(8);

    // Filter by maxDistanceKm=3
    const nearRes = await request(baseUrl)
      .get(`/api/caregivers/search?lat=${userLat}&lng=${userLng}&maxDistanceKm=3`)
      .expect(200);
    const nearIds = nearRes.body.map((c: { id: string }) => c.id);
    expect(nearIds).toContain('u-nurse');
    expect(nearIds).not.toContain('u-nurse-karras');
  });

  it('sorts by rating, distance, price, and relevance', async () => {
    // By price (hourlyRate ASC)
    const byPrice = await request(baseUrl).get('/api/caregivers/search?sort=price').expect(200);
    const rates = byPrice.body.map((c: { hourlyRate: number }) => c.hourlyRate);
    for (let i = 0; i < rates.length - 1; i++) {
      expect(rates[i]).toBeLessThanOrEqual(rates[i + 1]);
    }

    // By rating (rating DESC)
    const byRating = await request(baseUrl).get('/api/caregivers/search?sort=rating').expect(200);
    const ratings = byRating.body.map((c: { rating: number }) => c.rating);
    for (let i = 0; i < ratings.length - 1; i++) {
      expect(ratings[i]).toBeGreaterThanOrEqual(ratings[i + 1]);
    }

    // By distance (distanceKm ASC with user coordinates)
    const byDist = await request(baseUrl)
      .get('/api/caregivers/search?lat=37.9838&lng=23.7275&sort=distance')
      .expect(200);
    const distances = byDist.body.map((c: { distanceKm: number }) => c.distanceKm);
    for (let i = 0; i < distances.length - 1; i++) {
      expect(distances[i]).toBeLessThanOrEqual(distances[i + 1]);
    }

    // By relevance (defaults to rating DESC)
    const byRelevance = await request(baseUrl).get('/api/caregivers/search?sort=relevance').expect(200);
    const relRatings = byRelevance.body.map((c: { rating: number }) => c.rating);
    for (let i = 0; i < relRatings.length - 1; i++) {
      expect(relRatings[i]).toBeGreaterThanOrEqual(relRatings[i + 1]);
    }
  });

  it('dynamically calculates average rating and reviewCount from reviews', async () => {
    // Caregiver with reviews has rating calculated from reviews (e.g. u-nurse has published reviews with rating 5)
    const res = await request(baseUrl).get('/api/caregivers/search?query=Elena').expect(200);
    const elena = res.body.find((c: { id: string }) => c.id === 'u-nurse');
    expect(elena.rating).toBe(5);
    expect(elena.reviewCount).toBeGreaterThanOrEqual(1);

    // Caregiver without reviews (u-expired) falls back to baseline rating 4.0, reviewCount 0
    const expRes = await request(baseUrl).get('/api/caregivers/search?includeExpired=true&query=Expired').expect(200);
    const expCard = expRes.body.find((c: { id: string }) => c.id === 'u-expired');
    expect(expCard.rating).toBe(4.0);
    expect(expCard.reviewCount).toBe(0);
  });
});

describe('caregiver profile retrieval (GET /api/caregivers/:id)', () => {
  it('returns 404 when caregiver does not exist', async () => {
    await request(baseUrl).get('/api/caregivers/non-existent-id').expect(404);
  });

  it('returns full caregiver details including profile, certifications, and rating breakdown', async () => {
    const res = await request(baseUrl).get('/api/caregivers/u-nurse').expect(200);
    expect(res.body).toMatchObject({
      id: 'u-nurse',
      displayName: 'Elena Papadaki',
      roles: ['nurse'],
      rating: 5,
      availableNow: true,
      hourlyRate: 25,
      profile: {
        licenceNumber: 'ΝΟΣ-2024-Α123',
        hourlyRate: 25,
      },
    });

    expect(res.body.reviewCount).toBeGreaterThanOrEqual(1);
    expect(res.body.ratingBreakdown[5]).toBeGreaterThanOrEqual(1);

    expect(Array.isArray(res.body.certifications)).toBe(true);
    expect(res.body.certifications.some((c: { name: string }) => c.name.includes('Nurse'))).toBe(true);

    expect(Array.isArray(res.body.reviews)).toBe(true);
    expect(res.body.reviews.length).toBeGreaterThanOrEqual(1);
    expect(res.body.reviews.some((r: { id: string }) => r.id === 'rv-1')).toBe(true);
  });

  it('serves the seed copy in the requested language, keeping the numbers identical', async () => {
    const en = await request(baseUrl).get('/api/caregivers/u-nurse?lang=en').expect(200);
    const el = await request(baseUrl).get('/api/caregivers/u-nurse?lang=el').expect(200);

    // Editorial copy follows `?lang=`…
    expect(en.body.specialties).toContain('Injections & blood draws');
    expect(el.body.specialties).toContain('Ενέσεις & Αιμοληψίες');
    expect(en.body.bio).toContain('Evangelismos');
    expect(el.body.bio).toContain('Ευαγγελισμός');

    // …including the detail-page fields behind /caregivers/:id.
    expect(en.body.city).toBe('Athens — Kolonaki');
    expect(el.body.city).toBe('Αθήνα — Κολωνάκι');
    expect(en.body.education).toContain('BSc Nursing');
    expect(el.body.education).toContain('Πτυχίο Νοσηλευτικής');
    expect(en.body.services.map((s: { name: string }) => s.name)).toContain('Injection at home');
    expect(el.body.services.map((s: { name: string }) => s.name)).toContain('Ένεση στο σπίτι');
    expect(en.body.experienceYears).toBe(10);
    expect(en.body.responseMinutes).toBeGreaterThan(0);
    expect(en.body.repeatClients).toBeGreaterThan(0);
    expect(en.body.verified).toBe(true);
    expect(typeof en.body.memberSinceMs).toBe('number');

    // Language names stay endonyms, so they read the same in both responses.
    expect(en.body.languages).toEqual(el.body.languages);

    // Only the copy differs — every number, id and flag is language-independent.
    for (const key of [
      'id',
      'displayName',
      'roles',
      'rating',
      'reviewCount',
      'distanceKm',
      'hourlyRate',
      'availableNow',
      'lat',
      'lng',
      'completedVisits',
      'recentCancellations',
      'expiresAtMs',
      'experienceYears',
      'responseMinutes',
      'repeatClients',
      'verified',
      'memberSinceMs',
      'languages',
    ]) {
      expect(en.body[key], key).toEqual(el.body[key]);
    }
  });

  it('serves seeded review comments in the requested language', async () => {
    const en = await request(baseUrl).get('/api/caregivers/u-nurse/reviews?lang=en').expect(200);
    const el = await request(baseUrl).get('/api/caregivers/u-nurse/reviews?lang=el').expect(200);

    const enReview = en.body.find((r: { id: string }) => r.id === 'rv-1');
    const elReview = el.body.find((r: { id: string }) => r.id === 'rv-1');
    expect(enReview.comment).toBe('Impeccable care, very reliable.');
    expect(elReview.comment).toBe('Άψογη φροντίδα, πολύ συνεπής.');
    expect(enReview.rating).toBe(elReview.rating);
  });

  it('matches free-text search in either language', async () => {
    const english = await request(baseUrl)
      .get('/api/caregivers/search?query=Injections')
      .expect(200);
    const greek = await request(baseUrl)
      .get('/api/caregivers/search?query=Ενέσεις')
      .expect(200);
    expect(english.body.map((c: { id: string }) => c.id)).toContain('u-nurse');
    expect(greek.body.map((c: { id: string }) => c.id)).toContain('u-nurse');
  });

  it('falls back to the other locale when a translation is missing', async () => {
    // `u-expired` is a fixture with no `profile` bundle, so its legacy
    // single-language columns have to carry both requests.
    await query(
      `INSERT INTO caregivers (id, display_name, roles, rating, distance_km, hourly_rate, available_now, specialties, lat, lng, completed_visits, recent_cancellations, expires_at_ms, bio, languages, gender)
       VALUES ('u-locale-fallback', 'Fallback Fixture', '{"caregiver"}', 4.0, 4, 19, TRUE, '{Companionship}', 37.98, 23.73, 1, 0, $1, 'Legacy bio only.', '{"Ελληνικά"}', '')
       ON CONFLICT (id) DO NOTHING`,
      [Date.now() + 30 * 24 * 60 * 60 * 1000]
    );
    const res = await request(baseUrl)
      .get('/api/caregivers/u-locale-fallback?lang=el')
      .expect(200);
    expect(res.body.bio).toBe('Legacy bio only.');
    expect(res.body.specialties).toEqual(['Companionship']);
    await query(`DELETE FROM caregivers WHERE id = 'u-locale-fallback'`);
  });
});

describe('caregiver review creation alias (POST /api/caregivers/:id/reviews)', () => {
  it('rejects unauthenticated review submission with 401', async () => {
    await request(baseUrl)
      .post('/api/caregivers/u-nurse/reviews')
      .send({ bookingId: 'b-1', rating: 5 })
      .expect(401);
  });

  it('rejects review submission for non-existent caregiver with 404', async () => {
    await client
      .post('/api/caregivers/unknown-caregiver/reviews')
      .send({ bookingId: 'b-1', rating: 5 })
      .expect(404);
  });

  it('validates booking requirements (missing, mismatched, or incomplete)', async () => {
    // Missing bookingId
    await client
      .post('/api/caregivers/u-nurse/reviews')
      .send({ rating: 5, comment: 'Good' })
      .expect(422);

    // Mismatched caregiver (b-1 belongs to u-nurse, not u-physio)
    await client
      .post('/api/caregivers/u-physio/reviews')
      .send({ bookingId: 'b-1', rating: 5 })
      .expect(404);

    // Incomplete booking: b-2 is 'requested', not 'completed'
    await client
      .post('/api/caregivers/u-nikos/reviews')
      .send({ bookingId: 'b-2', rating: 5 })
      .expect(422);
  });

  it('validates rating bounds and duplicate reviews', async () => {
    // Out-of-range ratings
    await client
      .post('/api/caregivers/u-nurse/reviews')
      .send({ bookingId: 'b-1', rating: 0 })
      .expect(422);

    await client
      .post('/api/caregivers/u-nurse/reviews')
      .send({ bookingId: 'b-1', rating: 6 })
      .expect(422);

    // b-1 already has rv-1 -> 409
    await client
      .post('/api/caregivers/u-nurse/reviews')
      .send({ bookingId: 'b-1', rating: 5 })
      .expect(409);
  });

  it('successfully creates review and updates caregiver ratings', async () => {
    // Create a fresh completed booking for u-physio
    const bookingId = 'b-cg-alias-test';
    await query(
      `INSERT INTO bookings (id, caregiver_id, client_id, scheduled_at_ms, note, amount_cents, status, created_at_ms)
       VALUES ($1, 'u-physio', 'u-client', $2, 'test alias', 2000, 'completed', $2)
       ON CONFLICT (id) DO NOTHING`,
      [bookingId, Date.now()]
    );
    await query(`DELETE FROM reviews WHERE booking_id = $1`, [bookingId]);

    const before = await request(baseUrl).get('/api/caregivers/u-physio').expect(200);
    const baseline = {
      reviewCount: before.body.reviewCount as number,
      ratingBreakdownFive: before.body.ratingBreakdown[5] as number,
    };

    const created = await client
      .post('/api/caregivers/u-physio/reviews')
      .send({ bookingId, rating: 5, comment: 'Excellent physiotherapy session!' })
      .expect(201);

    expect(created.body).toMatchObject({
      caregiverId: 'u-physio',
      bookingId,
      rating: 5,
      comment: 'Excellent physiotherapy session!',
      status: 'published',
    });

    // Profile detail now shows the newly added review and updated breakdown.
    // Asserted relative to the baseline, so the assertions stay true however
    // many reviews the seed ships for this caregiver.
    const detail = await request(baseUrl).get('/api/caregivers/u-physio').expect(200);
    expect(detail.body.rating).toBe(5);
    expect(detail.body.reviewCount).toBe(baseline.reviewCount + 1);
    expect(detail.body.ratingBreakdown[5]).toBe(baseline.ratingBreakdownFive + 1);
    expect(detail.body.reviews.some((r: { id: string }) => r.id === created.body.id)).toBe(true);

    // Clean up
    await query(`DELETE FROM reviews WHERE booking_id = $1`, [bookingId]);
    await query(`DELETE FROM bookings WHERE id = $1`, [bookingId]);
  });
});
