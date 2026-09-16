import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { query, queryOne, Row } from './db';
import { AuthedUser, requireAuth, requireRole } from './auth';
import {
  asBundle,
  DEFAULT_LANG,
  Lang,
  pick,
  pickList,
  requestLang,
  searchableText,
} from './locale';

/**
 * Marketplace trust surfaces (FEATURE_PLAN.md §1–§2): saved searches,
 * favorite caregivers and reviews & ratings. Every record is scoped to the
 * session user (`/me/*`); caregiver review lists are public. Validation
 * failures are 422, missing own-resources are 404, a second review for the
 * same booking is 409 — matching the contracts the frontend stores document.
 *
 * Content is served per request language (`?lang=en|el`, see ./locale): the
 * `caregivers.profile` JSONB bundle holds the bilingual editorial copy (bio,
 * city, education, specialities, services, stats) and `reviews.comment_i18n`
 * the translated review text. Free-text search deliberately spans *both*
 * locales, so «Ενέσεις» and "Injections" find the same provider.
 */

export const REVIEW_STATUSES = ['published', 'flagged', 'removed'] as const;

const id = (prefix: string) => `${prefix}-${randomBytes(6).toString('hex')}`;
const now = () => Date.now();

/** BIGINT-ms `num()` coercion convention (pg returns BIGINT as strings). */
const num = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * A review in the requested language. The plain `comment` column is what a
 * user actually typed; seeded reviews additionally carry `comment_i18n` with
 * both locales. A user-authored review has an empty bundle, so `pick()` falls
 * straight through to the stored text.
 */
function reviewFromRow(row: Row, lang: Lang = DEFAULT_LANG) {
  return {
    id: String(row.id),
    caregiverId: String(row.caregiver_id),
    bookingId: String(row.booking_id),
    authorId: String(row.author_id),
    authorName: String(row.author_name ?? ''),
    rating: Number(row.rating),
    comment: pick(asBundle(row.comment_i18n), lang) || String(row.comment ?? ''),
    createdAtMs: num(row.created_at_ms) ?? 0,
    status: String(row.status),
  };
}

/** A priced service from the profile bundle, in the requested language. */
interface PricedService {
  name: string;
  price: number;
  durationMin: number;
}

function servicesFromProfile(value: unknown, lang: Lang): PricedService[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const services: PricedService[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const name = pick(record['name'], lang);
    if (!name) {
      continue;
    }
    services.push({
      name,
      price: Number(record['price']) || 0,
      durationMin: Number(record['durationMin']) || 0,
    });
  }
  return services;
}

function savedSearchFromRow(row: Row) {
  return {
    id: String(row.id),
    name: String(row.name),
    filters: (row.filters ?? {}) as Record<string, unknown>,
    createdAtMs: num(row.created_at_ms) ?? 0,
  };
}

function favoriteFromRow(row: Row) {
  return {
    caregiverId: String(row.caregiver_id),
    savedAtMs: num(row.saved_at_ms) ?? 0,
  };
}

/** Haversine great-circle distance in kilometers between two lat/lng coordinates */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * A provider card in one language. Editorial copy comes from the `profile`
 * JSONB bundle, falling back to the legacy single-language columns, so a row
 * that predates localisation still renders.
 */
export function caregiverCardFromRow(
  row: Row,
  lang: Lang = DEFAULT_LANG,
  distanceKmOverride?: number
) {
  const dynamicRating = Number(row.dynamic_rating ?? row.rating);
  const rating = Math.round(dynamicRating * 10) / 10;
  const profile = asBundle(row.profile);
  const specialties = pickList(profile['specialties'], lang);
  // Language names stay endonyms ("Ελληνικά", "English") — self-describing in
  // any locale — so they are stored once rather than per language.
  const languages = pickList(profile['languages'], lang);
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    roles: (row.roles as string[]) ?? [],
    rating,
    reviewCount: Number(row.review_count) || 0,
    distanceKm: distanceKmOverride !== undefined ? distanceKmOverride : Number(row.distance_km),
    hourlyRate: Number(row.hourly_rate),
    availableNow: Boolean(row.available_now),
    specialties: specialties.length > 0 ? specialties : pickList(row.specialties, lang),
    lat: num(row.lat),
    lng: num(row.lng),
    completedVisits: Number(row.completed_visits) || 0,
    recentCancellations: Number(row.recent_cancellations) || 0,
    expiresAtMs: num(row.expires_at_ms),
    bio: pick(profile['bio'], lang) || String(row.bio ?? ''),
    languages: languages.length > 0 ? languages : pickList(row.languages, lang),
    gender: String(row.gender ?? ''),
    // Detail-page fields (the public profile at /caregivers/:id).
    city: pick(profile['city'], lang),
    education: pick(profile['education'], lang),
    experienceYears: Number(profile['experienceYears']) || 0,
    responseMinutes: Number(profile['responseMinutes']) || 0,
    repeatClients: Number(profile['repeatClients']) || 0,
    verified: profile['verified'] === true,
    memberSinceMs: num(profile['memberSinceMs']),
    services: servicesFromProfile(profile['services'], lang),
  };
}

export const marketplaceRouter = Router();

// ---- Saved searches + favorites (one round-trip, §2) ----

marketplaceRouter.get('/me/saved-searches', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const searches = await query<Row>(
      `SELECT * FROM saved_searches WHERE user_id = $1 ORDER BY created_at_ms DESC`,
      [me.userId]
    );
    const favorites = await query<Row>(
      `SELECT * FROM favorites WHERE user_id = $1 ORDER BY saved_at_ms DESC`,
      [me.userId]
    );
    res.json({
      savedSearches: searches.map(savedSearchFromRow),
      favorites: favorites.map(favoriteFromRow),
    });
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.post('/me/saved-searches', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const body = req.body as { name?: unknown; filters?: unknown };
    const name = str(body.name);
    if (!name) {
      res.status(422).json({ message: 'A search name is required.' });
      return;
    }
    if (!body.filters || typeof body.filters !== 'object') {
      res.status(422).json({ message: 'Search filters are required.' });
      return;
    }
    const row = {
      id: id('ss'),
      user_id: me.userId,
      name,
      filters: body.filters as Record<string, unknown>,
      created_at_ms: now(),
    };
    await query(
      `INSERT INTO saved_searches (id, user_id, name, filters, created_at_ms)
       VALUES ($1, $2, $3, $4, $5)`,
      [row.id, row.user_id, row.name, JSON.stringify(row.filters), row.created_at_ms]
    );
    res.status(201).json(savedSearchFromRow({ ...row, filters: row.filters }));
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.patch('/me/saved-searches/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const name = str((req.body as { name?: unknown })?.name);
    if (!name) {
      res.status(422).json({ message: 'A search name is required.' });
      return;
    }
    const rows = await query<Row>(
      `UPDATE saved_searches SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
      [name, req.params.id, me.userId]
    );
    if (rows.length === 0) {
      res.status(404).json({ message: 'Saved search not found.' });
      return;
    }
    res.json(savedSearchFromRow(rows[0]));
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.delete('/me/saved-searches/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const rows = await query<Row>(
      `DELETE FROM saved_searches WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, me.userId]
    );
    if (rows.length === 0) {
      res.status(404).json({ message: 'Saved search not found.' });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.post('/me/favorites', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const caregiverId = str((req.body as { caregiverId?: unknown })?.caregiverId);
    if (!caregiverId) {
      res.status(422).json({ message: 'A caregiver id is required.' });
      return;
    }
    const caregiver = await queryOne<Row>(`SELECT id FROM caregivers WHERE id = $1`, [caregiverId]);
    if (!caregiver) {
      res.status(404).json({ message: 'Caregiver not found.' });
      return;
    }
    const at = now();
    await query(
      `INSERT INTO favorites (user_id, caregiver_id, saved_at_ms)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, caregiver_id) DO UPDATE SET saved_at_ms = EXCLUDED.saved_at_ms`,
      [me.userId, caregiverId, at]
    );
    res.status(201).json({ caregiverId, savedAtMs: at });
  } catch (error) {
    next(error);
  }
});

marketplaceRouter.delete('/me/favorites/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    await query(`DELETE FROM favorites WHERE user_id = $1 AND caregiver_id = $2`, [
      me.userId,
      req.params.id,
    ]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// ---- Caregiver Search & Profile ----

/**
 * Advanced search & matching: text query, roles, haversine distance / maxDistanceKm,
 * minRating, availableNowOnly, maxHourlyRate, sorting, auto-filtering expired caregivers,
 * and dynamic rating/reviewCount aggregated from published reviews.
 */
marketplaceRouter.get('/caregivers/search', async (req: Request, res: Response, next) => {
  try {
    const rows = await query<Row>(
      `SELECT
        c.*,
        COALESCE(AVG(r.rating) FILTER (WHERE r.status = 'published'), c.rating) AS dynamic_rating,
        COUNT(r.id) FILTER (WHERE r.status = 'published') AS review_count
       FROM caregivers c
       LEFT JOIN reviews r ON r.caregiver_id = c.id
       GROUP BY c.id`
    );

    const nowMs = now();
    const includeExpired = req.query.includeExpired === 'true' || req.query.includeExpired === true;

    const latQuery = req.query.lat !== undefined && req.query.lat !== '' ? Number(req.query.lat) : NaN;
    const lngQuery = req.query.lng !== undefined && req.query.lng !== '' ? Number(req.query.lng) : NaN;
    const hasUserCoords = !Number.isNaN(latQuery) && !Number.isNaN(lngQuery);

    const maxDistanceKm =
      req.query.maxDistanceKm !== undefined && req.query.maxDistanceKm !== '' && req.query.maxDistanceKm !== 'null'
        ? Number(req.query.maxDistanceKm)
        : NaN;

    const minRating =
      req.query.minRating !== undefined && req.query.minRating !== '' && req.query.minRating !== 'null'
        ? Number(req.query.minRating)
        : NaN;

    const availableNowOnly = req.query.availableNowOnly === 'true' || req.query.availableNowOnly === true;

    const maxHourlyRate =
      req.query.maxHourlyRate !== undefined && req.query.maxHourlyRate !== '' && req.query.maxHourlyRate !== 'null'
        ? Number(req.query.maxHourlyRate)
        : NaN;

    let rolesFilter: string[] = [];
    if (Array.isArray(req.query.roles)) {
      rolesFilter = req.query.roles
        .flatMap((r) => String(r).split(',').map((s) => s.trim().toLowerCase()))
        .filter(Boolean);
    } else if (typeof req.query.roles === 'string' && req.query.roles.trim()) {
      rolesFilter = req.query.roles
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    }

    const queryText = typeof req.query.query === 'string' ? req.query.query.trim().toLowerCase() : '';

    const lang = requestLang(req);

    const candidates = rows.map((row) => {
      let distanceKm = Number(row.distance_km);
      if (hasUserCoords && row.lat !== null && row.lng !== null) {
        const cardLat = Number(row.lat);
        const cardLng = Number(row.lng);
        if (!Number.isNaN(cardLat) && !Number.isNaN(cardLng)) {
          const dist = haversineKm({ lat: latQuery, lng: lngQuery }, { lat: cardLat, lng: cardLng });
          distanceKm = Math.round(dist * 10) / 10;
        }
      }
      const profile = asBundle(row.profile);
      // A bilingual marketplace has to match in *both* languages: a Greek
      // client searching «Ενέσεις» must find the provider listed as
      // "Injections" in the English catalogue.
      const haystack = [
        String(row.display_name ?? '').toLowerCase(),
        searchableText(profile['bio'] ?? row.bio),
        searchableText(profile['specialties'] ?? row.specialties),
        searchableText(profile['city']),
        searchableText(profile['education']),
      ].join(' \u0000 ');
      return { card: caregiverCardFromRow(row, lang, distanceKm), haystack };
    });

    const filtered = candidates.filter(({ card, haystack }) => {
      // Auto-filter expired caregivers: exclude caregivers where expires_at_ms IS NOT NULL AND expires_at_ms < now()
      if (!includeExpired && card.expiresAtMs !== null && card.expiresAtMs < nowMs) {
        return false;
      }

      // availableNowOnly
      if (availableNowOnly && !card.availableNow) {
        return false;
      }

      // minRating
      if (!Number.isNaN(minRating) && card.rating < minRating) {
        return false;
      }

      // maxHourlyRate
      if (!Number.isNaN(maxHourlyRate) && card.hourlyRate > maxHourlyRate) {
        return false;
      }

      // maxDistanceKm
      if (!Number.isNaN(maxDistanceKm) && card.distanceKm > maxDistanceKm) {
        return false;
      }

      // roles
      if (rolesFilter.length > 0) {
        const cardRoles = card.roles.map((r) => r.toLowerCase());
        if (!cardRoles.some((r) => rolesFilter.includes(r))) {
          return false;
        }
      }

      // query: text search across name, bio, specialities, city and education
      // in every locale (case-insensitive).
      if (queryText && !haystack.includes(queryText)) {
        return false;
      }

      return true;
    });

    // sort: 'rating' (rating DESC), 'distance' (distanceKm ASC), 'price' (hourlyRate ASC), 'relevance' (rating DESC)
    const sort = typeof req.query.sort === 'string' ? req.query.sort : 'rating';
    filtered.sort((a, b) => {
      if (sort === 'distance') {
        return a.card.distanceKm - b.card.distanceKm || a.card.id.localeCompare(b.card.id);
      }
      if (sort === 'price') {
        return a.card.hourlyRate - b.card.hourlyRate || a.card.id.localeCompare(b.card.id);
      }
      return b.card.rating - a.card.rating || a.card.id.localeCompare(b.card.id);
    });

    res.json(filtered.map((entry) => entry.card));
  } catch (error) {
    next(error);
  }
});

/** Full caregiver details: profile, specialties, certifications, rating breakdown, recent published reviews. */
marketplaceRouter.get('/caregivers/:id', async (req: Request, res: Response, next) => {
  try {
    const caregiverId = req.params.id;
    const caregiver = await queryOne<Row>(
      `SELECT
        c.*,
        COALESCE(AVG(r.rating) FILTER (WHERE r.status = 'published'), c.rating) AS dynamic_rating,
        COUNT(r.id) FILTER (WHERE r.status = 'published') AS review_count
       FROM caregivers c
       LEFT JOIN reviews r ON r.caregiver_id = c.id
       WHERE c.id = $1
       GROUP BY c.id`,
      [caregiverId]
    );

    if (!caregiver) {
      res.status(404).json({ message: 'Caregiver not found.' });
      return;
    }

    const profile = await queryOne<Row>(
      `SELECT phone, amka, afm, licence_number, hourly_rate, date_of_birth, sex, address
       FROM profiles WHERE user_id = $1`,
      [caregiverId]
    );

    const certRows = await query<Row>(
      `SELECT id, name, licence_number, expires_at_ms, created_at_ms
       FROM certifications WHERE provider_id = $1 ORDER BY expires_at_ms ASC`,
      [caregiverId]
    );

    const publishedReviews = await query<Row>(
      `SELECT * FROM reviews
       WHERE caregiver_id = $1 AND status = 'published'
       ORDER BY created_at_ms DESC`,
      [caregiverId]
    );

    const ratingBreakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of publishedReviews) {
      const star = Number(r.rating);
      if (star >= 1 && star <= 5) {
        ratingBreakdown[star] = (ratingBreakdown[star] || 0) + 1;
      }
    }

    const lang = requestLang(req);
    const baseCard = caregiverCardFromRow(caregiver, lang);

    res.json({
      ...baseCard,
      profile: profile
        ? {
            phone: String(profile.phone ?? ''),
            amka: String(profile.amka ?? ''),
            afm: String(profile.afm ?? ''),
            licenceNumber: String(profile.licence_number ?? ''),
            hourlyRate: num(profile.hourly_rate),
            dateOfBirth: String(profile.date_of_birth ?? ''),
            sex: String(profile.sex ?? ''),
            address: String(profile.address ?? ''),
          }
        : null,
      certifications: certRows.map((c) => ({
        id: String(c.id),
        name: String(c.name),
        licenceNumber: String(c.licence_number ?? ''),
        expiresAtMs: num(c.expires_at_ms) ?? 0,
        createdAtMs: num(c.created_at_ms) ?? 0,
      })),
      ratingBreakdown,
      reviews: publishedReviews.map((r) => reviewFromRow(r, lang)),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Contract alias: POST /api/caregivers/:id/reviews.
 * Requires auth; validates caregiverId, completed booking, rating 1-5, comment.
 */
marketplaceRouter.post('/caregivers/:id/reviews', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const caregiverId = req.params.id;
    const body = req.body as { bookingId?: unknown; rating?: unknown; comment?: unknown };

    const caregiver = await queryOne<Row>(`SELECT id FROM caregivers WHERE id = $1`, [caregiverId]);
    if (!caregiver) {
      res.status(404).json({ message: 'Caregiver not found.' });
      return;
    }

    const bookingId = str(body.bookingId);
    if (!bookingId) {
      res.status(422).json({ message: 'Booking ID is required.' });
      return;
    }

    const booking = await queryOne<Row>(`SELECT * FROM bookings WHERE id = $1`, [bookingId]);
    if (!booking || String(booking.caregiver_id) !== caregiverId) {
      res.status(404).json({ message: 'Booking not found for this caregiver.' });
      return;
    }

    if (booking.client_id !== me.userId) {
      res.status(403).json({ message: 'Only the booking client can review it.' });
      return;
    }

    if (booking.status !== 'completed') {
      res.status(422).json({ message: 'Only completed bookings can be reviewed.' });
      return;
    }

    const rating = body.rating;
    if (!Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 5) {
      res.status(422).json({ message: 'Rating must be an integer from 1 to 5.' });
      return;
    }

    const existing = await queryOne<Row>(`SELECT id FROM reviews WHERE booking_id = $1`, [bookingId]);
    if (existing) {
      res.status(409).json({ message: 'This booking already has a review.' });
      return;
    }

    const account = await queryOne<Row>(`SELECT display_name FROM user_accounts WHERE id = $1`, [me.userId]);
    const row = {
      id: id('rv'),
      caregiver_id: caregiverId,
      booking_id: bookingId,
      author_id: me.userId,
      author_name: me.displayName || String(account?.display_name ?? ''),
      rating: rating as number,
      comment: str(body.comment).slice(0, 500),
      status: 'published',
      created_at_ms: now(),
    };

    await query(
      `INSERT INTO reviews (id, caregiver_id, booking_id, author_id, author_name, rating, comment, status, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        row.id,
        row.caregiver_id,
        row.booking_id,
        row.author_id,
        row.author_name,
        row.rating,
        row.comment,
        row.status,
        row.created_at_ms,
      ]
    );

    res.status(201).json(reviewFromRow(row));
  } catch (error) {
    next(error);
  }
});

// ---- Reviews & ratings (§1) ----

/** Public: one caregiver's visible reviews (removed stay hidden), newest first. */
marketplaceRouter.get('/caregivers/:id/reviews', async (req: Request, res: Response, next) => {
  try {
    const rows = await query<Row>(
      `SELECT * FROM reviews
        WHERE caregiver_id = $1 AND status <> 'removed'
        ORDER BY created_at_ms DESC`,
      [req.params.id]
    );
    const lang = requestLang(req);
    res.json(rows.map((row) => reviewFromRow(row, lang)));
  } catch (error) {
    next(error);
  }
});

/** Admin moderation queue: every review including removed ones. */
marketplaceRouter.get('/reviews', requireAuth, requireRole('admin'), async (req: Request, res: Response, next) => {
  try {
    const rows = await query<Row>(`SELECT * FROM reviews ORDER BY created_at_ms DESC`);
    const lang = requestLang(req);
    res.json(rows.map((row) => reviewFromRow(row, lang)));
  } catch (error) {
    next(error);
  }
});

/**
 * Client reviews one completed booking, once. The store pre-checks the same
 * rule client-side; the UNIQUE(booking_id) + this lookup enforce it here —
 * a duplicate surfaces as 409 so the UI can render `alreadyRated`.
 */
marketplaceRouter.post('/bookings/:id/review', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const me = req.user as AuthedUser;
    const body = req.body as { caregiverId?: unknown; rating?: unknown; comment?: unknown };
    const booking = await queryOne<Row>(`SELECT * FROM bookings WHERE id = $1`, [req.params.id]);
    if (!booking) {
      res.status(404).json({ message: 'Booking not found.' });
      return;
    }
    if (booking.client_id !== me.userId) {
      res.status(403).json({ message: 'Only the booking client can review it.' });
      return;
    }
    if (booking.status !== 'completed') {
      res.status(422).json({ message: 'Only completed bookings can be reviewed.' });
      return;
    }
    const rating = body.rating;
    if (!Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 5) {
      res.status(422).json({ message: 'Rating must be an integer from 1 to 5.' });
      return;
    }
    const existing = await queryOne<Row>(`SELECT id FROM reviews WHERE booking_id = $1`, [req.params.id]);
    if (existing) {
      res.status(409).json({ message: 'This booking already has a review.' });
      return;
    }
    const account = await queryOne<Row>(`SELECT display_name FROM user_accounts WHERE id = $1`, [me.userId]);
    const row = {
      id: id('rv'),
      caregiver_id: str(body.caregiverId) || String(booking.caregiver_id),
      booking_id: String(booking.id),
      author_id: me.userId,
      author_name: me.displayName || String(account?.display_name ?? ''),
      rating: rating as number,
      comment: str(body.comment).slice(0, 500),
      status: 'published',
      created_at_ms: now(),
    };
    await query(
      `INSERT INTO reviews (id, caregiver_id, booking_id, author_id, author_name, rating, comment, status, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [row.id, row.caregiver_id, row.booking_id, row.author_id, row.author_name, row.rating, row.comment, row.status, row.created_at_ms]
    );
    res.status(201).json(reviewFromRow(row));
  } catch (error) {
    next(error);
  }
});

/** Client flags a review for moderation; flagging is idempotent. */
marketplaceRouter.post('/reviews/:id/flag', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const rows = await query<Row>(
      `UPDATE reviews SET status = 'flagged' WHERE id = $1 AND status = 'published' RETURNING *`,
      [req.params.id]
    );
    const lang = requestLang(req);
    if (rows.length === 0) {
      const existing = await queryOne<Row>(`SELECT * FROM reviews WHERE id = $1`, [req.params.id]);
      if (!existing) {
        res.status(404).json({ message: 'Review not found.' });
        return;
      }
      res.json(reviewFromRow(existing, lang));
      return;
    }
    res.json(reviewFromRow(rows[0], lang));
  } catch (error) {
    next(error);
  }
});

/** Admin publishes or removes a flagged review. */
marketplaceRouter.post(
  '/reviews/:id/moderate',
  requireAuth,
  requireRole('admin'),
  async (req: Request, res: Response, next) => {
    try {
      const decision = (req.body as { decision?: unknown })?.decision;
      if (decision !== 'published' && decision !== 'removed') {
        res.status(422).json({ message: 'Decision must be published or removed.' });
        return;
      }
      const rows = await query<Row>(`UPDATE reviews SET status = $1 WHERE id = $2 RETURNING *`, [
        decision,
        req.params.id,
      ]);
      if (rows.length === 0) {
        res.status(404).json({ message: 'Review not found.' });
        return;
      }
      res.json(reviewFromRow(rows[0], requestLang(req)));
    } catch (error) {
      next(error);
    }
  }
);
