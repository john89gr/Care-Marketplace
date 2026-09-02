import { HttpResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { isDemoMode } from './demo.mode';
const now = () => Date.now();
const hour = 60 * 60 * 1000;
const state = {
    users: [
        { userId: 'u-client', displayName: 'Maria Papadopoulou', email: 'maria@example.com', roles: ['client'] },
        { userId: 'u-nurse', displayName: 'Elena Papadaki', email: 'elena@example.com', roles: ['nurse'] },
        { userId: 'u-admin', displayName: 'Admin', email: 'admin@example.com', roles: ['admin'] },
    ],
    submissions: [
        {
            id: 'v-1',
            providerId: 'u-nurse',
            providerName: 'Elena Papadaki',
            licenceNumber: 'ΝΟΣ-2024-Α123',
            specialties: ['Injections', 'Wound care'],
            submittedAtMs: now() - 2 * 24 * hour,
            status: 'pending',
            reviewedAtMs: null,
            reviewedBy: null,
            note: '',
        },
    ],
    visits: [
        {
            id: 'visit-1',
            shiftId: 's-1',
            bookingId: 'b-1',
            providerId: 'u-nurse',
            clientId: 'u-client',
            clientName: 'Maria Papadopoulou',
            providerName: 'Elena Papadaki',
            act: 'Injection',
            scheduledAtMs: now() - 30 * 60 * 1000,
            status: 'in-progress',
            checkIn: { lat: 37.9838, lng: 23.7275, accuracyM: 12, atMs: now() - 30 * 60 * 1000 },
            checkOut: null,
        },
    ],
    escrow: [
        {
            id: 'e-1',
            bookingId: 'b-1',
            providerId: 'u-nurse',
            clientId: 'u-client',
            amountCents: 4500,
            status: 'held',
            createdAtMs: now() - 3 * 24 * hour,
            settledAtMs: null,
        },
    ],
    clinicalLog: [],
    vitals: [
        {
            id: 'vt-1',
            type: 'bloodPressure',
            value: 132,
            value2: 86,
            measuredAtMs: now() - 26 * hour,
            source: 'manual',
        },
        {
            id: 'vt-2',
            type: 'heartRate',
            value: 74,
            value2: null,
            measuredAtMs: now() - 26 * hour,
            source: 'manual',
        },
        {
            id: 'vt-3',
            type: 'spo2',
            value: 98,
            value2: null,
            measuredAtMs: now() - 25 * hour,
            source: 'manual',
        },
    ],
    carePlans: [
        {
            id: 'cp-1',
            clientId: 'u-client',
            clientName: 'Maria Papadopoulou',
            goals: [
                { id: 'g-1', text: 'Mobilise shoulder daily', status: 'in-progress' },
                { id: 'g-2', text: 'Stabilise blood pressure', status: 'open' },
            ],
            notes: [
                {
                    id: 'n-1',
                    authorId: 'u-nurse',
                    authorName: 'Elena Papadaki',
                    authorRole: 'nurse',
                    text: 'BP stable at 125/80, continue monitoring.',
                    atMs: now() - 2 * 24 * hour,
                },
            ],
            updatedAtMs: now() - 2 * 24 * hour,
            updatedBy: 'Elena Papadaki',
        },
    ],
    session: null,
};
const caregivers = [
    { id: 'cg-1', displayName: 'Elena Papadaki', roles: ['nurse'], rating: 4.8, distanceKm: 3, hourlyRate: 25, availableNow: true },
    { id: 'cg-2', displayName: 'Nikos Georgiou', roles: ['caregiver'], rating: 4.2, distanceKm: 12, hourlyRate: 15, availableNow: false },
    { id: 'cg-3', displayName: 'Anna Karakosta', roles: ['physio'], rating: 4.9, distanceKm: 5, hourlyRate: 30, availableNow: true },
];
function json(body) {
    return of(new HttpResponse({ status: 200, body }));
}
function shiftAvailability() {
    return {
        availability: [
            { id: 'a-1', weekday: 0, startMinutes: 8 * 60, endMinutes: 12 * 60 },
            { id: 'a-2', weekday: 2, startMinutes: 12 * 60, endMinutes: 17 * 60 },
        ],
        onDemand: true,
        shifts: [
            { id: 's-1', providerId: 'u-nurse', clientId: 'u-client', clientName: 'Maria Papadopoulou', act: 'Injection', scheduledAtMs: now() + hour, durationMinutes: 45, status: 'confirmed' },
        ],
    };
}
/** Demo API router. Returns null when the request is not handled. */
export const demoApi = (req, next) => {
    if (!isDemoMode() || !req.url.startsWith('/api/')) {
        return next(req);
    }
    const [path, query = ''] = req.url.slice('/api/'.length).split('?');
    const parts = path.split('/').filter(Boolean);
    const method = req.method;
    // ---- Auth ----
    if (method === 'POST' && parts[0] === 'auth' && parts[1] === 'login') {
        const body = req.body;
        const user = state.users.find((u) => u.email === body.email);
        if (!user) {
            return of(new HttpResponse({ status: 401, body: { message: 'Unknown email or password.' } }));
        }
        state.session = user;
        return json(sessionPayload(user));
    }
    if (method === 'POST' && parts[0] === 'auth' && parts[1] === 'register') {
        const body = req.body;
        const user = {
            userId: `u-${Math.random().toString(36).slice(2, 8)}`,
            displayName: body.displayName ?? 'New user',
            email: body.email ?? '',
            roles: body.roles ?? [body.role ?? 'client'],
        };
        state.users.push(user);
        state.session = user;
        return json(sessionPayload(user));
    }
    if (method === 'POST' && parts[0] === 'auth' && parts[1] === 'logout') {
        state.session = null;
        return json({ ok: true });
    }
    // ---- Marketplace ----
    if (method === 'GET' && parts[0] === 'caregivers' && parts[1] === 'search') {
        return json(caregivers);
    }
    // ---- Profile ----
    if (parts[0] === 'profiles' && parts[1] === 'me') {
        const me = state.session;
        const base = {
            userId: me?.userId ?? 'u-client',
            displayName: me?.displayName ?? 'Maria Papadopoulou',
            phone: '6940000000',
            amka: '01010112345',
            afm: '000000000',
            licenceNumber: me?.roles.includes('nurse') ? 'ΝΟΣ-2024-Α123' : '',
            hourlyRate: me?.roles.includes('nurse') ? 25 : null,
        };
        if (method === 'GET') {
            return json(base);
        }
        if (method === 'PATCH') {
            return json({ ...base, ...req.body });
        }
    }
    // ---- Vetting ----
    if (parts[0] === 'vetting' && parts[1] === 'submissions') {
        if (method === 'GET' && parts[2] === 'me') {
            const me = state.session;
            const mine = state.submissions.find((s) => s.providerId === me?.userId) ?? null;
            return json(mine);
        }
        if (method === 'GET') {
            return json(state.submissions);
        }
        if (method === 'POST' && parts.length === 2) {
            const body = req.body;
            const me = state.session;
            const submission = {
                id: `v-${Math.random().toString(36).slice(2, 8)}`,
                providerId: me?.userId ?? 'u-nurse',
                providerName: me?.displayName ?? 'Provider',
                licenceNumber: body.licenceNumber ?? '',
                specialties: body.specialties ?? [],
                submittedAtMs: now(),
                status: 'pending',
                reviewedAtMs: null,
                reviewedBy: null,
                note: body.note ?? '',
            };
            state.submissions.unshift(submission);
            return json(submission);
        }
        if (method === 'POST' && parts.length === 4 && parts[3] === 'review') {
            const id = parts[2];
            const body = req.body;
            const index = state.submissions.findIndex((s) => s.id === id);
            if (index === -1) {
                return of(new HttpResponse({ status: 404, body: { message: 'Submission not found.' } }));
            }
            const updated = {
                ...state.submissions[index],
                status: body.decision ?? 'approved',
                reviewedAtMs: now(),
                reviewedBy: state.session?.displayName ?? 'Admin',
                note: body.note ?? '',
            };
            state.submissions[index] = updated;
            return json(updated);
        }
    }
    // ---- Shifts ----
    if (parts[0] === 'shifts' && parts[1] === 'me') {
        if (method === 'GET') {
            return json(shiftAvailability());
        }
        if (method === 'PATCH') {
            return json(req.body ?? {});
        }
    }
    // ---- Bookings ----
    if (method === 'POST' && parts[0] === 'bookings') {
        const body = req.body;
        const bookingId = `b-${Math.random().toString(36).slice(2, 8)}`;
        const caregiver = caregivers.find((c) => c.id === body.caregiverId);
        const amountCents = (caregiver?.hourlyRate ?? 20) * 100 * 2; // 2 hours
        state.escrow.unshift({
            id: `e-${Math.random().toString(36).slice(2, 8)}`,
            bookingId,
            providerId: body.caregiverId ?? '',
            clientId: state.session?.userId ?? 'u-client',
            amountCents,
            status: 'held',
            createdAtMs: now(),
            settledAtMs: null,
        });
        return json({ id: bookingId, caregiverId: body.caregiverId, clientId: state.session?.userId ?? 'u-client', amountCents });
    }
    // ---- Visits ----
    if (parts[0] === 'visits' && parts[1] === 'me') {
        return json(state.visits);
    }
    if (method === 'POST' && parts[0] === 'visits' && parts.length === 3) {
        const visit = state.visits.find((v) => v.id === parts[1]);
        if (!visit) {
            return of(new HttpResponse({ status: 404, body: { message: 'Visit not found.' } }));
        }
        const position = req.body.position;
        if (parts[2] === 'check-in') {
            visit.status = 'in-progress';
            visit.checkIn = { ...(position ?? { lat: 37.9838, lng: 23.7275, accuracyM: 10 }), atMs: now() };
        }
        else if (parts[2] === 'check-out') {
            visit.status = 'completed';
            visit.checkOut = { ...(position ?? { lat: 37.9838, lng: 23.7275, accuracyM: 10 }), atMs: now() };
            // Escrow releases automatically on completion.
            const escrow = state.escrow.find((e) => e.bookingId === visit.bookingId && e.status === 'held');
            if (escrow) {
                escrow.status = 'released';
                escrow.settledAtMs = now();
            }
        }
        return json(visit);
    }
    // ---- Vitals ----
    if (parts[0] === 'vitals' && parts[1] === 'me') {
        if (method === 'GET') {
            return json(state.vitals);
        }
        if (method === 'POST') {
            const body = req.body;
            const reading = {
                id: `vt-${Math.random().toString(36).slice(2, 8)}`,
                type: body.type ?? 'heartRate',
                value: Number(body.value ?? 0),
                value2: body.value2 == null ? null : Number(body.value2),
                measuredAtMs: body.measuredAtMs ?? now(),
                source: body.source ?? 'manual',
            };
            state.vitals.unshift(reading);
            return json(reading);
        }
    }
    // ---- Clinical log ----
    if (parts[0] === 'clinical-log') {
        if (method === 'GET') {
            return json(state.clinicalLog);
        }
        if (method === 'POST') {
            const body = req.body;
            const entry = {
                id: `cl-${Math.random().toString(36).slice(2, 8)}`,
                visitId: String(body.visitId ?? ''),
                authorId: state.session?.userId ?? '',
                authorName: state.session?.displayName ?? '',
                specialty: body.specialty ?? 'nurse',
                observations: String(body.observations ?? ''),
                vitals: body.vitals ?? null,
                rehab: body.rehab ?? null,
                signatureDataUrl: typeof body.signatureDataUrl === 'string' ? body.signatureDataUrl : null,
                signedAtMs: body.signatureDataUrl ? now() : null,
            };
            state.clinicalLog.unshift(entry);
            return json(entry);
        }
    }
    // ---- Care plan ----
    if (parts[0] === 'care-plans') {
        if (method === 'GET') {
            return json(state.carePlans);
        }
        const plan = state.carePlans.find((p) => p.id === parts[1]);
        if (!plan) {
            return of(new HttpResponse({ status: 404, body: { message: 'Care plan not found.' } }));
        }
        const me = state.session;
        const touch = () => {
            plan.updatedAtMs = now();
            plan.updatedBy = me?.displayName ?? 'Care team';
            return plan;
        };
        if (method === 'POST' && parts[2] === 'goals') {
            const body = req.body;
            plan.goals.push({ id: `g-${Math.random().toString(36).slice(2, 8)}`, text: String(body.text ?? ''), status: 'open' });
            return json(touch());
        }
        if (method === 'PATCH' && parts[2] === 'goals') {
            const body = req.body;
            plan.goals = plan.goals.map((g) => g.id === parts[3] ? { ...g, status: body.status ?? g.status } : g);
            return json(touch());
        }
        if (method === 'POST' && parts[2] === 'notes') {
            const body = req.body;
            plan.notes.unshift({
                id: `n-${Math.random().toString(36).slice(2, 8)}`,
                authorId: String(body.authorId ?? me?.userId ?? ''),
                authorName: String(body.authorName ?? me?.displayName ?? ''),
                authorRole: String(body.authorRole ?? me?.roles[0] ?? ''),
                text: String(body.text ?? ''),
                atMs: now(),
            });
            return json(touch());
        }
        return of(new HttpResponse({ status: 404, body: { message: 'Unknown care-plan action.' } }));
    }
    // ---- Payments / escrow ----
    if (parts[0] === 'payments' && parts[1] === 'escrow') {
        if (method === 'GET') {
            return json(state.escrow);
        }
        if (method === 'POST' && parts.length === 2) {
            const body = req.body;
            const escrow = {
                id: `e-${Math.random().toString(36).slice(2, 8)}`,
                bookingId: body.bookingId ?? '',
                providerId: body.providerId ?? '',
                clientId: state.session?.userId ?? 'u-client',
                amountCents: body.amountCents ?? 0,
                status: 'held',
                createdAtMs: now(),
                settledAtMs: null,
            };
            state.escrow.unshift(escrow);
            return json(escrow);
        }
        if (method === 'POST' && parts.length === 4) {
            const id = parts[2];
            const escrow = state.escrow.find((e) => e.id === id);
            if (!escrow) {
                return of(new HttpResponse({ status: 404, body: { message: 'Transaction not found.' } }));
            }
            escrow.status = parts[3] === 'release' ? 'released' : 'refunded';
            escrow.settledAtMs = now();
            return json(escrow);
        }
    }
    // Unknown /api route — let it hit the real network (404 from the dev server).
    return next(req);
};
function sessionPayload(user) {
    return {
        userId: user.userId,
        displayName: user.displayName,
        roles: user.roles,
        expiresAtMs: now() + 12 * hour,
    };
}
