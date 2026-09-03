import { HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { isDemoMode } from './demo.mode';

/**
 * In-memory demo backend (PLAN.md §6 / §7 Open Question 1: no real backend
 * yet). Answers /api/** requests with canned-but-mutable state so the whole
 * Phase 1 + Phase 2 loop works in the browser: register/login → search →
 * book (escrow hold) → vetting → shift availability → visit check-in/out
 * (escrow release).
 */

interface DemoUser {
  userId: string;
  displayName: string;
  email: string;
  roles: string[];
}

interface DemoSubmission {
  id: string;
  providerId: string;
  providerName: string;
  licenceNumber: string;
  specialties: string[];
  submittedAtMs: number;
  status: 'pending' | 'approved' | 'rejected';
  reviewedAtMs: number | null;
  reviewedBy: string | null;
  note: string;
}

interface DemoVisit {
  id: string;
  shiftId: string;
  bookingId: string;
  providerId: string;
  clientId: string;
  clientName: string;
  providerName: string;
  act: string;
  scheduledAtMs: number;
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled';
  checkIn: { lat: number; lng: number; accuracyM: number; atMs: number } | null;
  checkOut: { lat: number; lng: number; accuracyM: number; atMs: number } | null;
}

interface DemoEscrow {
  id: string;
  bookingId: string;
  providerId: string;
  clientId: string;
  amountCents: number;
  status: 'held' | 'released' | 'refunded' | 'frozen';
  createdAtMs: number;
  settledAtMs: number | null;
  refundedCents: number | null;
}

type DisputeReason = 'not_delivered' | 'quality' | 'overcharged' | 'other';
type DisputeState = 'open' | 'under_review' | 'resolved_client' | 'resolved_provider' | 'rejected';
type DisputeResolution = 'release' | 'partial_refund' | 'full_refund';

interface DemoDisputeEvidence {
  id: string;
  disputeId: string;
  authorId: string;
  authorName: string;
  kind: 'message' | 'photo' | 'visit_gps';
  body?: string;
  url?: string;
  createdAtMs: number;
}

interface DemoDispute {
  id: string;
  bookingId: string;
  clientId: string;
  clientName: string;
  providerId: string;
  providerName: string;
  openedBy: string;
  openedByName: string;
  reason: DisputeReason;
  description: string;
  state: DisputeState;
  resolution: DisputeResolution | null;
  refundCents: number | null;
  escrowTransactionId: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  evidence: DemoDisputeEvidence[];
}

const DISPUTE_TRANSITIONS: Record<DisputeState, DisputeState[]> = {
  open: ['under_review', 'rejected'],
  under_review: ['resolved_client', 'resolved_provider', 'rejected'],
  resolved_client: [],
  resolved_provider: [],
  rejected: [],
};

interface DemoBooking {
  id: string;
  caregiverId: string;
  caregiverName: string;
  clientId: string;
  clientName: string;
  /** Demo marketplace caregiver id (matches escrow.providerId). */
  providerUserId: string;
  scheduledAtMs: number;
  note: string;
  status:
    | 'requested'
    | 'accepted'
    | 'in_progress'
    | 'completed'
    | 'cancelled'
    | 'disputed';
  createdAtMs: number;
  /** Pending reschedule proposal awaiting both parties' confirmation. */
  pendingReschedule: {
    scheduledAtMs: number;
    note?: string;
    proposedBy: 'client' | 'provider';
    clientConfirmed: boolean;
    providerConfirmed: boolean;
  } | null;
}

interface DemoBookingEvent {
  id: string;
  bookingId: string;
  kind: 'created' | 'accepted' | 'started' | 'completed' | 'cancelled' | 'rescheduled' | 'disputed';
  atMs: number;
  byUserId: string;
  byName: string;
  detail: string;
}

interface DemoReview {
  id: string;
  caregiverId: string;
  bookingId: string;
  authorId: string;
  authorName: string;
  rating: number;
  comment: string;
  createdAtMs: number;
  status: 'published' | 'flagged' | 'removed';
}

interface DemoSavedFilters {
  query: string;
  roles: string[];
  maxDistanceKm: number | null;
  minRating: number | null;
  availableNowOnly: boolean;
  /** v2 ranking fields (FEATURE_PLAN.md §5 subtask 15); optional for old saves. */
  sort?: string | null;
  maxHourlyRate?: number | null;
}

interface DemoSavedSearch {
  id: string;
  userId: string;
  name: string;
  filters: DemoSavedFilters;
  createdAtMs: number;
}

interface DemoFavorite {
  userId: string;
  caregiverId: string;
  savedAtMs: number;
}

interface DemoMedication {
  id: string;
  name: string;
  dose: string;
  schedule:
    | { kind: 'daily'; timesMinutes: number[] }
    | { kind: 'interval'; everyDays: number; timeMinutes: number }
    | { kind: 'weekly'; weekdays: number[]; timeMinutes: number };
  critical: boolean;
  prescriber?: string;
  refillDueDate?: string | null;
  supplyDays?: number | null;
  archived?: boolean;
  createdAtMs: number;
}

interface DemoAdherenceLog {
  id: string;
  medicationId: string;
  date: string;
  timeMinutes: number;
  action: 'taken' | 'skipped';
  atMs: number;
  loggedBy: string;
}

/** Smart-reminder channel prefs, one record per user (FEATURE_PLAN.md §8). */
interface DemoReminderPreferences {
  userId: string;
  channelsByMedication: Record<string, string[]>;
  quietHours: { startMinutes: number; endMinutes: number } | null;
  timezone: string;
  phone: string;
  consents: { sms: boolean; voice: boolean; consentedAtMs: number | null };
  caregiverCopy: { enabled: boolean; relationship: string };
  pushEnabled: boolean;
  updatedAtMs: number;
}

interface DemoScreening {
  id: string;
  type:
    | 'mammography'
    | 'cardioCheck'
    | 'cervicalSmear'
    | 'colorectalScreening'
    | 'fluVaccine'
    | 'boneDensity';
  status: 'done' | 'waived';
  atMs: number;
  reason?: string;
  snoozeUntilMs?: number | null;
  scheduledAtMs?: number | null;
  snoozeCount?: number;
}

interface DemoNotification {  id: string;
  userId: string;
  kind:
    | 'booking.accepted'
    | 'booking.started'
    | 'booking.completed'
    | 'booking.cancelled'
    | 'booking.rescheduled'
    | 'booking.disputed'
    | 'dispute.opened'
    | 'dispute.resolved'
    | 'dispute.rejected'
    | 'review.submitted'
    | 'vitals.alert'
    | 'vetting.decision'
    | 'medication.missed'
    | 'system';
  title: string;
  body: string;
  link?: string;
  createdAtMs: number;
  readAtMs: number | null;
}

interface DemoPharmacy {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  /** Mock stock flag: only in-stock partners are routing candidates. */
  inStock: boolean;
}

interface DemoRxMed {
  name: string;
  dose: string;
  qty: number;
}

interface DemoPrescription {
  id: string;
  barcodePayload: string;
  meds: DemoRxMed[];
  prescriber: string;
  state: 'parsed' | 'confirmed' | 'failed';
  createdAtMs: number;
}

type DemoOrderStatus =
  | 'uploaded'
  | 'routed'
  | 'accepted'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'failed';

interface DemoPharmacyOrder {
  id: string;
  prescriptionId: string;
  clientId: string;
  pharmacyId: string | null;
  pharmacyName: string | null;
  meds: DemoRxMed[];
  prescriber: string;
  status: DemoOrderStatus;
  deliveryAddress: string;
  timeline: { status: DemoOrderStatus; atMs: number; note?: string }[];
  createdAtMs: number;
  updatedAtMs: number;
}

const now = () => Date.now();
const hour = 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

/** Local yyyy-mm-dd key for a timestamp (medication dates + refill estimates). */
function demoDateKey(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const state: {
  users: DemoUser[];
  submissions: DemoSubmission[];
  visits: DemoVisit[];
  escrow: DemoEscrow[];
  disputes: DemoDispute[];
  clinicalLog: DemoClinicalEntry[];
  carePlans: DemoCarePlan[];
  vitals: DemoVitalReading[];
  bookings: DemoBooking[];
  bookingEvents: DemoBookingEvent[];
  reviews: DemoReview[];
  savedSearches: DemoSavedSearch[];
  favorites: DemoFavorite[];
  notifications: DemoNotification[];
  screenings: DemoScreening[];
  screeningProfile: { dateOfBirth: string; sex: 'female' | 'male' | 'other' };
  medications: DemoMedication[];
  medLogs: DemoAdherenceLog[];
  reminderPreferences: Record<string, DemoReminderPreferences>;
  pharmacies: DemoPharmacy[];
  prescriptions: DemoPrescription[];
  pharmacyOrders: DemoPharmacyOrder[];
  audit: { id: string; actorId: string; action: string; resourceType: string; resourceId: string; atMs: number; meta?: Record<string, unknown> }[];
  session: DemoUser | null;
} = {
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
      refundedCents: null,
    },
    {
      id: 'e-disputed',
      bookingId: 'b-disputed',
      providerId: 'u-nurse',
      clientId: 'u-client',
      amountCents: 4500,
      status: 'frozen',
      createdAtMs: now() - 3 * 24 * hour,
      settledAtMs: null,
      refundedCents: null,
    },
  ],
  disputes: [
    {
      id: 'd-1',
      bookingId: 'b-disputed',
      clientId: 'u-client',
      clientName: 'Maria Papadopoulou',
      providerId: 'u-nurse',
      providerName: 'Elena Papadaki',
      openedBy: 'u-client',
      openedByName: 'Maria Papadopoulou',
      reason: 'quality',
      description: 'Provider arrived 20 minutes late and the session was cut short.',
      state: 'under_review',
      resolution: null,
      refundCents: null,
      escrowTransactionId: 'e-disputed',
      createdAtMs: now() - 24 * hour,
      updatedAtMs: now() - 24 * hour,
      evidence: [
        {
          id: 'ev-1',
          disputeId: 'd-1',
          authorId: 'u-client',
          authorName: 'Maria Papadopoulou',
          kind: 'message',
          body: 'I waited outside for 20 minutes and the provider only stayed for 15 of the 60 minutes.',
          createdAtMs: now() - 23 * hour,
        },
      ],
    },
  ],
  clinicalLog: [],
  bookings: [
    {
      id: 'b-1',
      caregiverId: 'cg-1',
      caregiverName: 'Elena Papadaki',
      clientId: 'u-client',
      clientName: 'Maria Papadopoulou',
      providerUserId: 'cg-1',
      scheduledAtMs: now() + 2 * 24 * hour,
      note: 'Morning insulin injection',
      status: 'accepted',
      createdAtMs: now() - 3 * 24 * hour,
      pendingReschedule: null,
    },
    {
      id: 'b-done',
      caregiverId: 'cg-3',
      caregiverName: 'Anna Karakosta',
      clientId: 'u-client',
      clientName: 'Maria Papadopoulou',
      providerUserId: 'cg-3',
      scheduledAtMs: now() - 5 * 24 * hour,
      note: 'Post-stroke rehab session',
      status: 'completed',
      createdAtMs: now() - 7 * 24 * hour,
      pendingReschedule: null,
    },
    {
      id: 'b-reviewed',
      caregiverId: 'cg-1',
      caregiverName: 'Elena Papadaki',
      clientId: 'u-client',
      clientName: 'Maria Papadopoulou',
      providerUserId: 'cg-1',
      scheduledAtMs: now() - 9 * 24 * hour,
      note: 'Wound dressing',
      status: 'completed',
      createdAtMs: now() - 11 * 24 * hour,
      pendingReschedule: null,
    },
    {
      id: 'b-disputed',
      caregiverId: 'cg-1',
      caregiverName: 'Elena Papadaki',
      clientId: 'u-client',
      clientName: 'Maria Papadopoulou',
      providerUserId: 'u-nurse',
      scheduledAtMs: now() - 30 * 24 * hour,
      note: 'Wound dressing',
      status: 'disputed',
      createdAtMs: now() - 3 * 24 * hour,
      pendingReschedule: null,
    },
  ],
  bookingEvents: [
    {
      id: 'be-1',
      bookingId: 'b-1',
      kind: 'created',
      atMs: now() - 3 * 24 * hour,
      byUserId: 'u-client',
      byName: 'Maria Papadopoulou',
      detail: 'Booking requested',
    },
    {
      id: 'be-2',
      bookingId: 'b-1',
      kind: 'accepted',
      atMs: now() - 2 * 24 * hour,
      byUserId: 'cg-1',
      byName: 'Elena Papadaki',
      detail: 'Accepted by the provider',
    },
  ],
  reviews: [
    {
      id: 'rv-1',
      caregiverId: 'cg-1',
      bookingId: 'b-reviewed',
      authorId: 'u-client',
      authorName: 'Maria Papadopoulou',
      rating: 5,
      comment: 'Punctual, gentle and very professional with the dressing.',
      createdAtMs: now() - 8 * 24 * hour,
      status: 'published',
    },
  ],
  savedSearches: [
    {
      id: 'ss-1',
      userId: 'u-client',
      name: 'Nurses near me',
      filters: {
        query: '',
        roles: ['nurse'],
        maxDistanceKm: 10,
        minRating: 4,
        availableNowOnly: false,
        sort: 'relevance',
        maxHourlyRate: null,
      },
      createdAtMs: now() - 2 * 24 * hour,
    },
    {
      id: 'ss-2',
      userId: 'u-client',
      name: 'Physio under €35',
      filters: {
        query: '',
        roles: ['physio'],
        maxDistanceKm: null,
        minRating: 4.5,
        availableNowOnly: true,
        sort: 'price',
        maxHourlyRate: 35,
      },
      createdAtMs: now() - 5 * 24 * hour,
    },
  ],
  favorites: [
    { userId: 'u-client', caregiverId: 'cg-3', savedAtMs: now() - 24 * hour },
  ],
  screenings: [
    // Overdue cardio (done ~14 months ago, 12-month interval) + due
    // mammography (no record → due for a 58-year-old woman).
    {
      id: 'scr-1',
      type: 'cardioCheck',
      status: 'done',
      atMs: now() - 14 * 30.44 * 24 * 60 * 60 * 1000,
    },
  ],
  screeningProfile: { dateOfBirth: '1968-03-14', sex: 'female' },
  medications: [
    {
      id: 'med-1',
      name: 'Insulin glargine',
      dose: '10 units',
      schedule: { kind: 'daily', timesMinutes: [8 * 60] },
      critical: true,
      prescriber: 'Dr. Stavrou',
      refillDueDate: demoDateKey(now() + 12 * dayMs),
      supplyDays: 30,
      archived: false,
      createdAtMs: now() - 30 * dayMs,
    },
    {
      id: 'med-2',
      name: 'Atorvastatin',
      dose: '20 mg',
      schedule: { kind: 'daily', timesMinutes: [21 * 60] },
      critical: false,
      prescriber: 'Dr. Stavrou',
      // Low-supply demo (subtask 14): refill due within the warning window.
      refillDueDate: demoDateKey(now() + 3 * dayMs),
      supplyDays: 30,
      archived: false,
      createdAtMs: now() - 60 * dayMs,
    },
    {
      id: 'med-3',
      name: 'Vitamin D3',
      dose: '1 tablet',
      schedule: { kind: 'weekly', weekdays: [1], timeMinutes: 9 * 60 },
      critical: false,
      prescriber: 'Dr. Stavrou',
      refillDueDate: demoDateKey(now() + 40 * dayMs),
      supplyDays: 90,
      archived: false,
      createdAtMs: now() - 60 * dayMs,
    },
  ],
  // Yesterday's critical dose was taken; today's is still open, so past the
  // grace window it reads as a missed critical dose (subtask 6 demo).
  medLogs: [
    {
      id: 'ml-seed-1',
      medicationId: 'med-1',
      date: demoDateKey(now() - dayMs),
      timeMinutes: 8 * 60,
      action: 'taken',
      atMs: now() - dayMs,
      loggedBy: 'me',
    },
  ],
  // Append-only audit ledger (FEATURE_PLAN.md §10 subtask 11; viewer in §16).
  audit: [],
  // Smart-reminder channel prefs per user (FEATURE_PLAN.md §8 subtask 3).
  reminderPreferences: {},
  notifications: [
    {
      id: 'ntf-1',
      userId: 'u-client',
      kind: 'booking.accepted',
      title: 'Booking accepted',
      body: 'Elena Papadaki accepted your visit request.',
      link: '/bookings',
      createdAtMs: now() - 2 * 24 * hour,
      readAtMs: null,
    },
    {
      id: 'ntf-2',
      userId: 'u-client',
      kind: 'vitals.alert',
      title: 'Blood pressure above range',
      body: 'Latest reading 132/86 mmHg — check the trends view.',
      link: '/vitals',
      createdAtMs: now() - 26 * hour,
      readAtMs: null,
    },
    {
      id: 'ntf-3',
      userId: 'u-client',
      kind: 'system',
      title: 'Welcome to CareMarketplace',
      body: 'Your account is ready. Complete your profile to get started.',
      createdAtMs: now() - 3 * 24 * hour,
      readAtMs: now() - 2 * 24 * hour,
    },
  ],
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
  pharmacies: [
    {
      id: 'ph-1',
      name: 'Syntagma Central Pharmacy',
      address: 'Pl. Syntagmatos 1, Athens',
      lat: 37.9756,
      lng: 23.7332,
      inStock: true,
    },
    {
      id: 'ph-2',
      name: 'Kolonaki Care Pharmacy',
      address: 'Skoufa 12, Athens',
      lat: 37.979,
      lng: 23.741,
      inStock: false,
    },
    {
      id: 'ph-3',
      name: 'Piraeus Port Pharmacy',
      address: 'Akti Miaouli 45, Piraeus',
      lat: 37.9415,
      lng: 23.6465,
      inStock: true,
    },
  ],
  prescriptions: [
    {
      id: 'rx-seed',
      barcodePayload: '{"prescriber":"Dr. Stavrou","meds":[{"name":"Atorvastatin","dose":"20 mg","qty":30}]}',
      meds: [{ name: 'Atorvastatin', dose: '20 mg', qty: 30 }],
      prescriber: 'Dr. Stavrou',
      state: 'confirmed',
      createdAtMs: now() - 2 * 24 * hour,
    },
  ],
  pharmacyOrders: [
    {
      id: 'po-seed',
      prescriptionId: 'rx-seed',
      clientId: 'u-client',
      pharmacyId: 'ph-1',
      pharmacyName: 'Syntagma Central Pharmacy',
      meds: [{ name: 'Atorvastatin', dose: '20 mg', qty: 30 }],
      prescriber: 'Dr. Stavrou',
      status: 'preparing',
      deliveryAddress: 'Mitropoleos 12, Athens',
      timeline: [
        { status: 'uploaded', atMs: now() - 2 * 24 * hour },
        { status: 'routed', atMs: now() - 2 * 24 * hour + 60 * 1000, note: 'Routed to Syntagma Central Pharmacy (1.1 km)' },
        { status: 'accepted', atMs: now() - 2 * 24 * hour + 30 * 60 * 1000 },
        { status: 'preparing', atMs: now() - 26 * hour },
      ],
      createdAtMs: now() - 2 * 24 * hour,
      updatedAtMs: now() - 26 * hour,
    },
  ],
  session: null,
};

interface DemoClinicalEntry {
  id: string;
  visitId: string;
  authorId: string;
  authorName: string;
  specialty: 'nurse' | 'physio';
  observations: string;
  vitals: { systolic: number | null; diastolic: number | null; heartRate: number | null; spo2: number | null } | null;
  rehab: { rangeOfMotion: string; painLevel: number | null; exercisesPrescribed: string } | null;
  signatureDataUrl: string | null;
  signedAtMs: number | null;
}

interface DemoVitalReading {
  id: string;
  type: 'bloodPressure' | 'glucose' | 'spo2' | 'weight' | 'temperature' | 'heartRate';
  value: number;
  value2: number | null;
  measuredAtMs: number;
  source: 'manual' | 'bluetooth';
}

interface DemoCarePlan {
  id: string;
  clientId: string;
  clientName: string;
  goals: { id: string; text: string; status: 'open' | 'in-progress' | 'done' }[];
  notes: {
    id: string;
    authorId: string;
    authorName: string;
    authorRole: string;
    text: string;
    atMs: number;
  }[];
  updatedAtMs: number;
  updatedBy: string;
}

const caregivers = [
  {
    id: 'cg-1', displayName: 'Elena Papadaki', roles: ['nurse'], rating: 4.8, distanceKm: 3, hourlyRate: 25, availableNow: true,
    specialties: ['Injections', 'Wound care', 'Insulin'], lat: 37.9838, lng: 23.7275, completedVisits: 34, recentCancellations: 0,
  },
  {
    id: 'cg-2', displayName: 'Nikos Georgiou', roles: ['caregiver'], rating: 4.2, distanceKm: 12, hourlyRate: 15, availableNow: false,
    specialties: ['Companionship', 'Personal care'], lat: 37.9420, lng: 23.6460, completedVisits: 6, recentCancellations: 2,
  },
  {
    id: 'cg-3', displayName: 'Anna Karakosta', roles: ['physio'], rating: 4.9, distanceKm: 5, hourlyRate: 30, availableNow: true,
    specialties: ['Post-stroke rehab', 'Mobility'], lat: 37.9755, lng: 23.7348, completedVisits: 21, recentCancellations: 0,
  },
];

function json<T>(body: T): Observable<HttpEvent<T>> {
  return of(new HttpResponse({ status: 200, body }));
}

/** Defaults mirror the client DEFAULT_PREFERENCES (kept in sync manually). */
function defaultReminderPreferences(userId: string): DemoReminderPreferences {
  return {
    userId,
    channelsByMedication: {},
    quietHours: { startMinutes: 22 * 60, endMinutes: 7 * 60 },
    timezone: 'Europe/Athens',
    phone: '',
    consents: { sms: false, voice: false, consentedAtMs: null },
    caregiverCopy: { enabled: false, relationship: '' },
    pushEnabled: false,
    updatedAtMs: now(),
  };
}

// ---- e-Prescription & pharmacy routing (FEATURE_PLAN.md §9) ----
// Compact server mirrors of the pure client helpers in
// features/pharmacy/{barcode,routing,order-machine}.ts (duplicated so the
// demo backend stays dependency-free).

function pharmHaversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function nearestPharmacyWithStock(lat: number, lng: number): { pharmacy: DemoPharmacy; distanceKm: number } | null {
  let best: { pharmacy: DemoPharmacy; distanceKm: number } | null = null;
  for (const pharmacy of state.pharmacies) {
    if (!pharmacy.inStock) {
      continue;
    }
    const distanceKm = pharmHaversineKm(lat, lng, pharmacy.lat, pharmacy.lng);
    if (!best || distanceKm < best.distanceKm) {
      best = { pharmacy, distanceKm };
    }
  }
  return best;
}

const PHARM_TRANSITIONS: Record<DemoOrderStatus, readonly DemoOrderStatus[]> = {
  uploaded: ['routed', 'failed'],
  routed: ['accepted', 'failed'],
  accepted: ['preparing', 'failed'],
  preparing: ['out_for_delivery', 'failed'],
  out_for_delivery: ['delivered', 'failed'],
  delivered: [],
  failed: ['routed'],
};

/** Server-side barcode parse: JSON e-prescription first, line fallback after. */
function parseRxPayload(raw: string): { prescriber: string; meds: DemoRxMed[] } | null {
  const text = (raw ?? '').trim();
  if (!text) {
    return null;
  }
  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    const list = data['meds'] ?? data['medications'];
    if (Array.isArray(list) && list.length > 0) {
      const meds: DemoRxMed[] = [];
      for (const entry of list) {
        if (entry && typeof entry === 'object') {
          const rec = entry as Record<string, unknown>;
          const name = typeof rec['name'] === 'string' ? rec['name'].trim() : '';
          if (name) {
            const qty = Math.floor(Number(rec['qty'] ?? 1));
            meds.push({
              name,
              dose: typeof rec['dose'] === 'string' ? rec['dose'].trim() : '',
              qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
            });
          }
        }
      }
      if (meds.length > 0) {
        const prescriber = typeof data['prescriber'] === 'string' && data['prescriber'].trim()
          ? (data['prescriber'] as string).trim()
          : 'Unknown prescriber';
        return { prescriber, meds };
      }
    }
    // JSON-shaped but with no usable meds — unreadable, not a med name.
    return null;
  } catch {
    // Fall through to the line parser.
  }
  const meds: DemoRxMed[] = [];
  for (const chunk of text.split(/[\n;]+/)) {
    const parts = chunk
      .split(chunk.includes('|') ? '|' : ',')
      .map((p) => p.trim())
      .filter((p) => p !== '');
    if (parts.length === 0 || !parts[0]) {
      continue;
    }
    let dose = '';
    let qty = 1;
    for (const part of parts.slice(1)) {
      // Qty only with an explicit marker (x30, qty: 30), a bare count, or a
      // pack noun — dose units (mg, units, IU, …) never count as quantities.
      const q =
        /^(?:qty\s*[:=]\s*|x\s*)(\d+)\s*(tablets?|tabs?|capsules?|caps?|pcs?|packs?|bottles?|vials?)?$/i.exec(
          part
        ) ?? /^(\d+)\s*(tablets?|tabs?|capsules?|caps?|pcs?|packs?|bottles?|vials?)$/i.exec(part) ??
        (/^\d+$/.test(part) ? ['', part] : null);
      if (q) {
        const n = parseInt(q[1] ?? '1', 10);
        qty = Number.isFinite(n) && n > 0 ? n : 1;
      } else if (!dose) {
        dose = part.replace(/^dose\s*[:=]\s*/i, '');
      }
    }
    meds.push({ name: parts[0].replace(/^(med|name)\s*[:=]\s*/i, ''), dose, qty });
  }
  return meds.length > 0 ? { prescriber: 'Unknown prescriber', meds } : null;
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
export const demoApi: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  if (!isDemoMode() || !req.url.startsWith('/api/')) {
    return next(req);
  }

  const [path, query = ''] = req.url.slice('/api/'.length).split('?');
  const parts = path.split('/').filter(Boolean);
  const method = req.method;

  // ---- Auth ----
  if (method === 'POST' && parts[0] === 'auth' && parts[1] === 'login') {
    const body = req.body as { email?: string; password?: string };
    const user = state.users.find((u) => u.email === body.email);
    if (!user) {
      return of(new HttpResponse({ status: 401, body: { message: 'Unknown email or password.' } }));
    }
    state.session = user;
    return json(sessionPayload(user));
  }

  if (method === 'POST' && parts[0] === 'auth' && parts[1] === 'register') {
    const body = req.body as { displayName?: string; email?: string; roles?: string[]; role?: string };
    const user: DemoUser = {
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
    // Attach the published-review count computed from the review ledger.
    const cards = caregivers.map((c) => ({
      ...c,
      reviewCount: state.reviews.filter(
        (r) => r.caregiverId === c.id && r.status === 'published'
      ).length,
    }));
    return json(cards);
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
      // Screening hook (Feature 6 §5): DOB/sex feed the rule engine.
      dateOfBirth: '1968-03-14',
      sex: 'female',
    };
    if (method === 'GET') {
      return json(base);
    }
    if (method === 'PATCH') {
      return json({ ...base, ...(req.body as object) });
    }
  }

  // ---- Saved searches & favorites ----
  if (parts[0] === 'me' && parts[1] === 'saved-searches') {
    const me = state.session;
    const userId = me?.userId ?? 'u-client';
    const mine = () => state.savedSearches.filter((s) => s.userId === userId);

    if (method === 'GET' && parts.length === 2) {
      return json({
        savedSearches: mine(),
        favorites: state.favorites.filter((f) => f.userId === userId),
      });
    }
    if (method === 'POST' && parts.length === 2) {
      const body = req.body as { name?: string; filters?: DemoSavedFilters };
      const sortRaw = String(body.filters?.sort ?? 'relevance');
      const maxRateRaw = body.filters?.maxHourlyRate ?? null;
      const saved: DemoSavedSearch = {
        id: `ss-${Math.random().toString(36).slice(2, 8)}`,
        userId,
        name: String(body.name ?? 'Search').slice(0, 80),
        filters: {
          query: String(body.filters?.query ?? ''),
          roles: Array.isArray(body.filters?.roles) ? body.filters!.roles : [],
          maxDistanceKm: body.filters?.maxDistanceKm ?? null,
          minRating: body.filters?.minRating ?? null,
          availableNowOnly: Boolean(body.filters?.availableNowOnly),
          sort: ['relevance', 'distance', 'rating', 'price'].includes(sortRaw) ? sortRaw : 'relevance',
          maxHourlyRate:
            typeof maxRateRaw === 'number' && Number.isFinite(maxRateRaw) && maxRateRaw > 0
              ? maxRateRaw
              : null,
        },
        createdAtMs: now(),
      };
      state.savedSearches.unshift(saved);
      return json(saved);
    }
    if (parts.length === 3 && state.savedSearches.some((s) => s.id === parts[2] && s.userId === userId)) {
      const saved = state.savedSearches.find((s) => s.id === parts[2])!;
      if (method === 'PATCH') {
        const body = req.body as { name?: string };
        saved.name = String(body.name ?? saved.name).slice(0, 80);
        return json(saved);
      }
      if (method === 'DELETE') {
        state.savedSearches = state.savedSearches.filter((s) => s.id !== parts[2]);
        return json({ ok: true });
      }
    }
  }
  if (parts[0] === 'me' && parts[1] === 'favorites') {
    const userId = state.session?.userId ?? 'u-client';
    if (method === 'GET' && parts.length === 2) {
      return json(state.favorites.filter((f) => f.userId === userId));
    }
    if (method === 'POST' && parts.length === 2) {
      const body = req.body as { caregiverId?: string };
      const caregiverId = String(body.caregiverId ?? '');
      if (!state.favorites.some((f) => f.userId === userId && f.caregiverId === caregiverId)) {
        state.favorites.unshift({ userId, caregiverId, savedAtMs: now() });
      }
      return json({ ok: true });
    }
    if (method === 'DELETE' && parts.length === 3) {
      state.favorites = state.favorites.filter(
        (f) => !(f.userId === userId && f.caregiverId === parts[2])
      );
      return json({ ok: true });
    }
  }

  // ---- Screenings (preventive care) ----
  if (parts[0] === 'me' && parts[1] === 'screenings') {
    const me = state.session;
    const canRead =
      !me || me.roles.includes('client') || me.roles.includes('caregiver') || me.roles.includes('nurse');
    if (!canRead) {
      return of(new HttpResponse({ status: 403, body: { message: 'Not allowed.' } }));
    }
    // GET: profile (from the demo client) + persisted records.
    if (method === 'GET' && parts.length === 2) {
      return json({ profile: state.screeningProfile, records: state.screenings });
    }
    // Mutations are owner-only (subtask 10 RBAC): family roles are read-only.
    const canWrite = !me || me.roles.includes('client');
    if (method === 'POST' && parts.length === 4) {
      if (!canWrite) {
        return of(new HttpResponse({ status: 403, body: { message: 'This view is read-only for your role.' } }));
      }
      const type = parts[2] as DemoScreening['type'];
      const action = parts[3];
      const body = (req.body ?? {}) as { reason?: string; snoozeUntilMs?: number; snoozeCount?: number; scheduledAtMs?: number };
      if (action === 'waive' && !body.reason?.trim()) {
        return of(
          new HttpResponse({ status: 422, body: { message: 'A reason is required to waive a screening.' } })
        );
      }
      if (action === 'schedule' && typeof body.scheduledAtMs !== 'number') {
        return of(
          new HttpResponse({ status: 422, body: { message: 'Choose a valid date to schedule this screening.' } })
        );
      }
      const existing = state.screenings.find((s) => s.type === type);
      const record: DemoScreening = {
        id: existing?.id ?? `scr-${Math.random().toString(36).slice(2, 8)}`,
        type,
        status: action === 'waive' ? 'waived' : action === 'done' ? 'done' : (existing?.status ?? 'done'),
        atMs: action === 'done' ? now() : (existing?.atMs ?? now()),
        reason: action === 'waive' ? body.reason : existing?.reason,
        snoozeUntilMs: action === 'snooze' ? (body.snoozeUntilMs ?? now() + 30 * 24 * hour) : existing?.snoozeUntilMs ?? null,
        scheduledAtMs: action === 'schedule' ? body.scheduledAtMs : existing?.scheduledAtMs ?? null,
        snoozeCount: action === 'snooze' ? (body.snoozeCount ?? 0) : existing?.snoozeCount ?? 0,
      };
      state.screenings = [...state.screenings.filter((s) => s.type !== type), record];
      return json(record);
    }
  }

  // ---- Medications & adherence (FEATURE_PLAN.md §7) ----
  if (parts[0] === 'me' && parts[1] === 'medications') {
    const me = state.session;
    const isOwner =
      !me || me.roles.includes('client') || me.roles.includes('caregiver') || me.roles.includes('nurse');
    if (!isOwner) {
      return of(new HttpResponse({ status: 403, body: { message: 'Not allowed.' } }));
    }
    if (method === 'GET' && parts.length === 2) {
      return json({ medications: state.medications, logs: state.medLogs });
    }
    // POST /me/medications — add a medication (subtask 2).
    if (method === 'POST' && parts.length === 2) {
      const body = req.body as {
        name?: string;
        dose?: string;
        schedule?: DemoMedication['schedule'];
        critical?: boolean;
        prescriber?: string;
      };
      if (!String(body.name ?? '').trim() || !String(body.dose ?? '').trim() || !body.schedule) {
        return of(
          new HttpResponse({ status: 422, body: { message: 'Name, dose and schedule are required.' } })
        );
      }
      const created: DemoMedication = {
        id: `med-${Math.random().toString(36).slice(2, 8)}`,
        name: String(body.name).slice(0, 120),
        dose: String(body.dose).slice(0, 120),
        schedule: body.schedule,
        critical: Boolean(body.critical),
        prescriber: body.prescriber ? String(body.prescriber).slice(0, 120) : undefined,
        refillDueDate: null,
        supplyDays: 30,
        archived: false,
        createdAtMs: now(),
      };
      state.medications.unshift(created);
      return json(created);
    }
  }

  if (parts[0] === 'medications' && parts.length >= 3) {
    const medId = parts[1];
    const med = state.medications.find((m) => m.id === medId);
    if (!med) {
      return of(new HttpResponse({ status: 404, body: { message: 'Unknown medication.' } }));
    }
    // POST /medications/:id/log — one log per dose slot (upsert). Clients log
    // for themselves; caregivers/nurses may log on behalf (subtask 11).
    if (method === 'POST' && parts[2] === 'log') {
      const me = state.session;
      const allowed =
        !me || me.roles.includes('client') || me.roles.includes('caregiver') || me.roles.includes('nurse');
      if (!allowed) {
        return of(new HttpResponse({ status: 403, body: { message: 'Not allowed.' } }));
      }
      const body = req.body as { date?: string; timeMinutes?: number; action?: string; loggedBy?: string };
      if (!body.date || typeof body.timeMinutes !== 'number' || (body.action !== 'taken' && body.action !== 'skipped')) {
        return of(new HttpResponse({ status: 422, body: { message: 'Invalid dose log payload.' } }));
      }
      const entry: DemoAdherenceLog = {
        id: `ml-${Math.random().toString(36).slice(2, 8)}`,
        medicationId: medId,
        date: body.date,
        timeMinutes: body.timeMinutes,
        action: body.action,
        atMs: now(),
        loggedBy: body.loggedBy ?? me?.displayName ?? 'me',
      };
      state.medLogs = [
        ...state.medLogs.filter(
          (l) => !(l.medicationId === medId && l.date === entry.date && l.timeMinutes === entry.timeMinutes)
        ),
        entry,
      ];
      // Family alert (subtask 9): a skipped critical dose notifies the family
      // inbox; the client store raises the matching in-app + WS alert.
      if (med.critical && entry.action === 'skipped') {
        state.notifications.unshift({
          id: `ntf-${Math.random().toString(36).slice(2, 8)}`,
          userId: 'u-client',
          kind: 'medication.missed',
          title: `Missed dose: ${med.name}`,
          body: `A critical medication dose was skipped by ${entry.loggedBy} — please check in.`,
          link: '/medications',
          createdAtMs: now(),
          readAtMs: null,
        });
      }
      return json(entry);
    }
    // POST /medications/:id/archive — soft delete.
    if (method === 'POST' && parts[2] === 'archive') {
      med.archived = true;
      return json(med);
    }
    // GET /medications/:id/interactions — placeholder (subtask 12).
    if (method === 'GET' && parts[2] === 'interactions') {
      return json({ medicationId: medId, severity: 'none', message: 'No known interactions (demo).' });
    }
  }

  // ---- Smart-reminder channel preferences (FEATURE_PLAN.md §8 subtask 3) ----
  // Demo persists the full preferences resource in memory, keyed by user.
  if (parts[0] === 'me' && parts[1] === 'reminders' && parts[2] === 'preferences' && parts.length === 3) {
    const userId = state.session?.userId ?? 'u-client';
    if (method === 'GET') {
      return json(state.reminderPreferences[userId] ?? defaultReminderPreferences(userId));
    }
    if (method === 'PUT' || method === 'PATCH') {
      const body = (req.body ?? {}) as Partial<DemoReminderPreferences>;
      const current = state.reminderPreferences[userId] ?? defaultReminderPreferences(userId);
      const updated: DemoReminderPreferences = {
        ...current,
        ...(body as Omit<Partial<DemoReminderPreferences>, 'userId'>),
        userId,
        updatedAtMs: now(),
      };
      state.reminderPreferences[userId] = updated;
      return json(updated);
    }
  }

  // ---- e-Prescriptions & pharmacy orders (FEATURE_PLAN.md §9) ----
  if (method === 'POST' && parts[0] === 'prescriptions' && parts[1] === 'scan') {
    const body = (req.body ?? {}) as {
      barcode?: string;
      manualCode?: string;
      prescriber?: string;
      deliveryAddress?: string;
      lat?: number;
      lng?: number;
    };
    const raw = String(body.barcode ?? body.manualCode ?? '');
    const parsed = parseRxPayload(raw);
    if (!parsed) {
      return of(
        new HttpResponse({
          status: 422,
          body: { message: 'The barcode could not be read. Please check the code or enter the details manually.' },
        })
      );
    }
    const me = state.session;
    const prescriber = String(body.prescriber ?? '').trim() || parsed.prescriber;
    const prescription: DemoPrescription = {
      id: `rx-${Math.random().toString(36).slice(2, 8)}`,
      barcodePayload: raw,
      meds: parsed.meds,
      prescriber,
      state: 'confirmed',
      createdAtMs: now(),
    };
    state.prescriptions.unshift(prescription);
    const origin =
      typeof body.lat === 'number' && typeof body.lng === 'number'
        ? { lat: body.lat, lng: body.lng }
        : { lat: 37.9838, lng: 23.7275 }; // Athens centre fallback
    const routed = nearestPharmacyWithStock(origin.lat, origin.lng);
    const orderId = `po-${Math.random().toString(36).slice(2, 8)}`;
    const order: DemoPharmacyOrder = {
      id: orderId,
      prescriptionId: prescription.id,
      clientId: me?.userId ?? 'u-client',
      pharmacyId: routed?.pharmacy.id ?? null,
      pharmacyName: routed?.pharmacy.name ?? null,
      meds: parsed.meds,
      prescriber,
      status: routed ? 'routed' : 'failed',
      deliveryAddress: String(body.deliveryAddress ?? ''),
      timeline: [
        { status: 'uploaded', atMs: now() },
        routed
          ? {
              status: 'routed',
              atMs: now(),
              note: `Routed to ${routed.pharmacy.name} (${routed.distanceKm.toFixed(1)} km)`,
            }
          : { status: 'failed', atMs: now(), note: 'No partner pharmacy with stock — retry later' },
      ],
      createdAtMs: now(),
      updatedAtMs: now(),
    };
    state.pharmacyOrders.unshift(order);
    return json({ prescription, order });
  }

  if (method === 'GET' && parts[0] === 'me' && parts[1] === 'pharmacy-orders') {
    const me = state.session;
    const list = me?.roles.includes('pharmacy')
      ? [...state.pharmacyOrders]
      : state.pharmacyOrders.filter((o) => o.clientId === (me?.userId ?? 'u-client'));
    return json(list.sort((a, b) => b.createdAtMs - a.createdAtMs));
  }

  if (method === 'POST' && parts[0] === 'pharmacy-orders' && parts.length === 3 && parts[2] === 'status') {
    const order = state.pharmacyOrders.find((o) => o.id === parts[1]);
    if (!order) {
      return of(new HttpResponse({ status: 404, body: { message: 'Order not found.' } }));
    }
    const to = (req.body as { to?: string } | null)?.to as DemoOrderStatus | undefined;
    if (!to || !(PHARM_TRANSITIONS[order.status] ?? []).includes(to)) {
      return of(
        new HttpResponse({
          status: 409,
          body: { message: `Illegal transition ${order.status} → ${String(to ?? '?')}.` },
        })
      );
    }
    // Retry edge (failed → routed): re-run nearest-with-stock routing in case
    // a partner restocked.
    if (order.status === 'failed' && to === 'routed') {
      const routed = nearestPharmacyWithStock(37.9838, 23.7275);
      if (!routed) {
        return of(
          new HttpResponse({
            status: 409,
            body: { message: 'Still no partner pharmacy with stock. Please try again later.' },
          })
        );
      }
      order.pharmacyId = routed.pharmacy.id;
      order.pharmacyName = routed.pharmacy.name;
      order.timeline.push({
        status: 'routed',
        atMs: now(),
        note: `Re-routed to ${routed.pharmacy.name} (${routed.distanceKm.toFixed(1)} km)`,
      });
    } else {
      order.timeline.push({ status: to, atMs: now() });
    }
    order.status = to;
    order.updatedAtMs = now();
    return json(order);
  }

  // ---- Audit ledger (FEATURE_PLAN.md §10 subtask 11; append-only) ----
  if (method === 'POST' && parts[0] === 'audit' && parts.length === 1) {
    const body = (req.body ?? {}) as {
      id?: string;
      actorId?: string;
      action?: string;
      resourceType?: string;
      resourceId?: string;
      atMs?: number;
      meta?: Record<string, unknown>;
    };
    const entry = {
      id: String(body.id ?? `audit-${Math.random().toString(36).slice(2, 8)}`),
      actorId: String(body.actorId ?? state.session?.userId ?? 'me'),
      action: String(body.action ?? 'unknown'),
      resourceType: String(body.resourceType ?? ''),
      resourceId: String(body.resourceId ?? ''),
      atMs: typeof body.atMs === 'number' ? body.atMs : now(),
      meta: body.meta,
    };
    state.audit.push(entry);
    return json({ ok: true, id: entry.id });
  }

  // ---- Notifications ----
  if (parts[0] === 'me' && parts[1] === 'notifications') {
    const userId = state.session?.userId ?? 'u-client';
    if (method === 'GET' && parts.length === 2) {
      const items = state.notifications
        .filter((n) => n.userId === userId)
        .sort((a, b) => b.createdAtMs - a.createdAtMs);
      return json({ items, unread: items.filter((n) => n.readAtMs === null).length });
    }
    if (method === 'POST' && parts.length === 4 && parts[3] === 'read') {
      const n = state.notifications.find((x) => x.id === parts[2] && x.userId === userId);
      if (!n) {
        return of(new HttpResponse({ status: 404, body: { message: 'Notification not found.' } }));
      }
      n.readAtMs = now();
      return json({ ok: true });
    }
    if (method === 'POST' && parts.length === 3 && parts[2] === 'read-all') {
      for (const n of state.notifications) {
        if (n.userId === userId) {
          n.readAtMs = n.readAtMs ?? now();
        }
      }
      return json({ ok: true });
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
      const body = req.body as { licenceNumber?: string; specialties?: string[]; note?: string };
      const me = state.session;
      const submission: DemoSubmission = {
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
      const body = req.body as { decision?: 'approved' | 'rejected'; note?: string };
      const index = state.submissions.findIndex((s) => s.id === id);
      if (index === -1) {
        return of(new HttpResponse({ status: 404, body: { message: 'Submission not found.' } }));
      }
      const updated: DemoSubmission = {
        ...state.submissions[index],
        status: body.decision ?? 'approved',
        reviewedAtMs: now(),
        reviewedBy: state.session?.displayName ?? 'Admin',
        note: body.note ?? '',
      };
      state.submissions[index] = updated;
      // Notify the provider about the vetting decision (FEATURE_PLAN.md §4).
      state.notifications.unshift({
        id: `ntf-${Math.random().toString(36).slice(2, 8)}`,
        userId: updated.providerId,
        kind: 'vetting.decision',
        title: `Licence ${updated.status}`,
        body: `Your licence submission was ${updated.status} by ${updated.reviewedBy}.`,
        link: '/onboarding',
        createdAtMs: now(),
        readAtMs: null,
      });
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
  if (method === 'GET' && parts[0] === 'bookings' && parts.length === 1) {
    const me = state.session;
    const mine = me
      ? state.bookings.filter(
          (b) =>
            b.clientId === me.userId ||
            b.providerUserId === me.userId ||
            (me.roles.includes('nurse') && b.caregiverId === 'cg-1')
          // Note: demo simplification — nurse session maps to card cg-1.
        )
      : state.bookings;
    return json(mine);
  }
  if (method === 'GET' && parts[0] === 'bookings' && parts.length === 3 && parts[2] === 'events') {
    const bookingId = parts[1];
    return json(state.bookingEvents.filter((e) => e.bookingId === bookingId));
  }

  /**
   * Shared review creation (FEATURE_PLAN.md §1 contract): one review per
   * completed booking, rating 1–5, no self-reviews. Returns the review or an
   * error response with the exact status/message the store maps to UI copy.
   */
  const createReviewForBooking = (
    booking: DemoBooking,
    body: { rating?: number; comment?: string }
  ): { review: DemoReview } | { failure: HttpResponse<unknown> } => {
    if (booking.status !== 'completed') {
      return {
        failure: new HttpResponse({ status: 422, body: { message: 'You can rate this visit once it is completed.' } }),
      };
    }
    if (state.reviews.some((r) => r.bookingId === booking.id)) {
      return {
        failure: new HttpResponse({ status: 409, body: { message: 'You already rated this visit.' } }),
      };
    }
    const me = state.session;
    if (me && me.userId === booking.caregiverId) {
      return {
        failure: new HttpResponse({ status: 422, body: { message: 'Caregivers cannot review themselves.' } }),
      };
    }
    const rating = Math.round(Number(body.rating ?? 0));
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return {
        failure: new HttpResponse({ status: 422, body: { message: 'Choose a rating between 1 and 5 stars.' } }),
      };
    }
    const review: DemoReview = {
      id: `rv-${Math.random().toString(36).slice(2, 8)}`,
      caregiverId: booking.caregiverId,
      bookingId: booking.id,
      authorId: me?.userId ?? 'u-client',
      authorName: me?.displayName ?? 'Client',
      rating,
      comment: String(body.comment ?? '').slice(0, 500),
      createdAtMs: now(),
      status: 'published',
    };
    state.reviews.unshift(review);
    return { review };
  };

  /** Shared transition handler (mirrors the client-side state machine). */
  const transitionBooking = (
    booking: DemoBooking,
    to: DemoBooking['status'],
    detail: string,
    kind: DemoBookingEvent['kind']
  ): HttpResponse<unknown> | null => {
    const matrix: Record<string, string[]> = {
      requested: ['accepted', 'cancelled'],
      accepted: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'disputed'],
      completed: ['disputed'],
      cancelled: [],
      disputed: [],
    };
    if (!(matrix[booking.status] ?? []).includes(to)) {
      return new HttpResponse({
        status: 409,
        body: { message: `Illegal transition ${booking.status} → ${to}.` },
      });
    }
    booking.status = to;
    state.bookingEvents.unshift({
      id: `be-${Math.random().toString(36).slice(2, 8)}`,
      bookingId: booking.id,
      kind,
      atMs: now(),
      byUserId: state.session?.userId ?? '',
      byName: state.session?.displayName ?? 'System',
      detail,
    });
    if (to === 'completed') {
      const escrow = state.escrow.find(
        (e) => e.bookingId === booking.id && e.status === 'held'
      );
      if (escrow) {
        escrow.status = 'released';
        escrow.settledAtMs = now();
      }
      // A completed visit prompts the client to leave a review (§1): the
      // notification deep-links straight to the review form.
      state.notifications.unshift({
        id: `ntf-${Math.random().toString(36).slice(2, 8)}`,
        userId: booking.clientId,
        kind: 'booking.completed',
        title: 'Visit completed',
        body: `How was your visit with ${booking.caregiverName}? Rate it now.`,
        link: `/review?booking=${booking.id}`,
        createdAtMs: now(),
        readAtMs: null,
      });
    }
    if (to === 'cancelled') {
      const escrow = state.escrow.find(
        (e) => e.bookingId === booking.id && e.status === 'held'
      );
      if (escrow) {
        escrow.status = 'refunded';
        escrow.settledAtMs = now();
      }
      // Cancel the linked visit too (demo visit uses status 'cancelled').
      const visit = state.visits.find(
        (v) => v.bookingId === booking.id && v.status !== 'completed'
      );
      if (visit) {
        visit.status = 'cancelled';
      }
    }
    return null;
  };

  if (method === 'POST' && parts[0] === 'bookings' && parts.length === 4 && parts[3] === 'confirm' && parts[2] === 'reschedule') {
    const booking = state.bookings.find((b) => b.id === parts[1]);
    if (!booking) {
      return of(new HttpResponse({ status: 404, body: { message: 'Booking not found.' } }));
    }
    if (!booking.pendingReschedule) {
      return of(new HttpResponse({ status: 409, body: { message: 'There is no reschedule proposal to confirm.' } }));
    }
    // The confirmer is whoever is not the proposer (derived from the session;
    // unknown sessions confirm as the non-proposing side).
    if (state.session && state.session.userId === booking.clientId) {
      booking.pendingReschedule.clientConfirmed = true;
    } else {
      booking.pendingReschedule.providerConfirmed = true;
    }
    const both = booking.pendingReschedule.clientConfirmed && booking.pendingReschedule.providerConfirmed;
    state.bookingEvents.unshift({
      id: `be-${Math.random().toString(36).slice(2, 8)}`,
      bookingId: booking.id,
      kind: 'rescheduled',
      atMs: now(),
      byUserId: state.session?.userId ?? '',
      byName: state.session?.displayName ?? 'System',
      detail: both
        ? `Reschedule confirmed by both parties for ${new Date(booking.scheduledAtMs).toLocaleString()}`
        : 'Reschedule proposal confirmed (awaiting the other party)',
    });
    return json(booking);
  }
  if (method === 'POST' && parts[0] === 'bookings' && parts.length === 3) {
    const booking = state.bookings.find((b) => b.id === parts[1]);
    if (!booking) {
      return of(new HttpResponse({ status: 404, body: { message: 'Booking not found.' } }));
    }
    const action = parts[2];
    if (action === 'accept') {
      // Role guard (subtask 14): only providers accept. Leniency for null
      // sessions keeps anonymous demo browsing working.
      const roles = state.session?.roles ?? [];
      const isProvider =
        roles.length === 0 ||
        roles.some((r) => r === 'caregiver' || r === 'nurse' || r === 'physio');
      if (!isProvider) {
        return of(new HttpResponse({ status: 403, body: { message: 'Only the provider can accept this booking.' } }));
      }
      const conflict = transitionBooking(booking, 'accepted', 'Accepted by the provider', 'accepted');
      if (conflict) return of(conflict);
      return json(booking);
    }
    if (action === 'start') {
      const conflict = transitionBooking(booking, 'in_progress', 'Visit started', 'started');
      if (conflict) return of(conflict);
      // Keep the linked visit in sync (check-in flow also does this).
      const visit = state.visits.find(
        (v) => v.bookingId === booking.id && v.status === 'scheduled'
      );
      if (visit) {
        visit.status = 'in-progress';
      }
      return json(booking);
    }
    if (action === 'complete') {
      const conflict = transitionBooking(booking, 'completed', 'Visit completed — escrow released', 'completed');
      if (conflict) return of(conflict);
      return json(booking);
    }
    if (action === 'cancel') {
      // Role guard (subtask 14): only an involved party cancels (lenient
      // when no session is set, as in anonymous demo browsing).
      const me = state.session;
      const involved =
        !me || me.userId === booking.clientId || me.userId === booking.providerUserId;
      if (!involved) {
        return of(new HttpResponse({ status: 403, body: { message: 'Only the client or provider of this booking can cancel it.' } }));
      }
      const conflict = transitionBooking(booking, 'cancelled', 'Cancelled', 'cancelled');
      if (conflict) return of(conflict);
      return json(booking);
    }
     if (action === 'dispute') {
         const conflict = transitionBooking(booking, 'disputed', 'Dispute opened', 'disputed');
         if (conflict) return of(conflict);
         const escrow = state.escrow.find(
           (e) => e.bookingId === booking.id && e.status === 'held'
         );
         if (escrow) {
           escrow.status = 'frozen';
         }
         state.notifications.unshift({
           id: `ntf-${Math.random().toString(36).slice(2, 8)}`,
           userId: booking.clientId,
           kind: 'dispute.opened',
           title: 'Dispute opened',
           body: `A dispute has been opened for booking ${booking.id}. An administrator will review it.`,
           link: '/disputes',
           createdAtMs: now(),
           readAtMs: null,
         });
         return json(booking);
       }
    if (action === 'reschedule') {
      const body = req.body as { scheduledAtMs?: number; note?: string };
      if (typeof body.scheduledAtMs === 'number' && Number.isFinite(body.scheduledAtMs)) {
        booking.scheduledAtMs = body.scheduledAtMs;
      }
      // Dual-confirmation (subtask 6): the proposer counts as confirmed, the
      // other party confirms via `reschedule/confirm`.
      const proposedBy: 'client' | 'provider' =
        state.session && state.session.userId === booking.clientId ? 'client' : 'provider';
      booking.pendingReschedule = {
        scheduledAtMs: booking.scheduledAtMs,
        note: typeof body.note === 'string' ? body.note : undefined,
        proposedBy,
        clientConfirmed: proposedBy === 'client',
        providerConfirmed: proposedBy === 'provider',
      };
      state.bookingEvents.unshift({
        id: `be-${Math.random().toString(36).slice(2, 8)}`,
        bookingId: booking.id,
        kind: 'rescheduled',
        atMs: now(),
        byUserId: state.session?.userId ?? '',
        byName: state.session?.displayName ?? 'System',
        detail: `Rescheduled to ${new Date(booking.scheduledAtMs).toLocaleString()} (awaiting confirmation)`,
      });
      return json(booking);
    }
  }
  if (method === 'POST' && parts[0] === 'bookings' && parts.length === 3 && parts[2] === 'review') {
    const body = req.body as {
      caregiverId?: string;
      rating?: number;
      comment?: string;
    };
    const booking = state.bookings.find((b) => b.id === parts[1]);
    if (!booking) {
      return of(new HttpResponse({ status: 404, body: { message: 'Booking not found.' } }));
    }
    const result = createReviewForBooking(booking, body);
    return 'failure' in result ? of(result.failure) : json(result.review);
  }
  if (method === 'POST' && parts[0] === 'bookings') {
    const body = req.body as { caregiverId?: string; note?: string; scheduledAtMs?: number };
    const bookingId = `b-${Math.random().toString(36).slice(2, 8)}`;
    const caregiver = caregivers.find((c) => c.id === body.caregiverId);
    const amountCents = (caregiver?.hourlyRate ?? 20) * 100 * 2; // 2 hours
    const me = state.session;
    state.bookings.unshift({
      id: bookingId,
      caregiverId: body.caregiverId ?? '',
      caregiverName: caregiver?.displayName ?? 'Caregiver',
      clientId: me?.userId ?? 'u-client',
      clientName: me?.displayName ?? 'Client',
      providerUserId: body.caregiverId ?? '',
      scheduledAtMs: body.scheduledAtMs ?? now(),
      note: String(body.note ?? ''),
      status: 'requested',
      createdAtMs: now(),
      pendingReschedule: null,
    });
    state.bookingEvents.unshift({
      id: `be-${Math.random().toString(36).slice(2, 8)}`,
      bookingId,
      kind: 'created',
      atMs: now(),
      byUserId: me?.userId ?? 'u-client',
      byName: me?.displayName ?? 'Client',
      detail: 'Booking requested',
    });
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

  // ---- Reviews (public list + create + moderation) ----
  if (parts[0] === 'caregivers' && parts[2] === 'reviews') {
    const caregiverId = parts[1];
    if (method === 'GET' && parts.length === 3) {
      return json(state.reviews.filter((r) => r.caregiverId === caregiverId));
    }
    // POST /caregivers/:id/reviews — contract alias for the booking-scoped
    // review endpoint (author, bookingId, rating 1–5, comment, createdAtMs).
    if (method === 'POST' && parts.length === 3) {
      const body = req.body as { bookingId?: string; rating?: number; comment?: string };
      const booking = state.bookings.find(
        (b) => b.id === body.bookingId && b.caregiverId === caregiverId
      );
      if (!booking) {
        return of(
          new HttpResponse({ status: 404, body: { message: 'Booking not found for this caregiver.' } })
        );
      }
      const result = createReviewForBooking(booking, body);
      return 'failure' in result ? of(result.failure) : json(result.review);
    }
  }
  if (method === 'GET' && parts[0] === 'reviews' && parts.length === 1) {
    return json(state.reviews);
  }
  if (method === 'POST' && parts[0] === 'reviews' && parts.length === 3) {
    const review = state.reviews.find((r) => r.id === parts[1]);
    if (!review) {
      return of(new HttpResponse({ status: 404, body: { message: 'Review not found.' } }));
    }
    if (parts[2] === 'flag') {
      review.status = 'flagged';
      return json(review);
    }
    if (parts[2] === 'moderate') {
      const decision = (req.body as { decision?: 'published' | 'removed' }).decision;
      review.status = decision === 'removed' ? 'removed' : 'published';
      return json(review);
    }
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
    const position = (req.body as { position?: { lat: number; lng: number; accuracyM: number } }).position;
    if (parts[2] === 'check-in') {
      visit.status = 'in-progress';
      visit.checkIn = { ...(position ?? { lat: 37.9838, lng: 23.7275, accuracyM: 10 }), atMs: now() };
      // Booking lifecycle (subtask 11): GPS check-in moves the linked booking
      // to `in_progress` (mirrors the client-side auto-transition; illegal
      // transitions are left untouched).
      const linked = state.bookings.find((b) => b.id === visit.bookingId);
      if (linked) {
        transitionBooking(linked, 'in_progress', 'Visit started (GPS check-in)', 'started');
      }
    } else if (parts[2] === 'check-out') {
      visit.status = 'completed';
      visit.checkOut = { ...(position ?? { lat: 37.9838, lng: 23.7275, accuracyM: 10 }), atMs: now() };
      // Escrow releases automatically on completion.
      const escrow = state.escrow.find((e) => e.bookingId === visit.bookingId && e.status === 'held');
      if (escrow) {
        escrow.status = 'released';
        escrow.settledAtMs = now();
      }
      // A completed visit prompts the client to leave a review (§1).
      state.notifications.unshift({
        id: `ntf-${Math.random().toString(36).slice(2, 8)}`,
        userId: visit.clientId,
        kind: 'booking.completed',
        title: 'Visit completed',
        body: `How was your visit with ${visit.providerName}? Rate it now.`,
        link: `/review?booking=${visit.bookingId}`,
        createdAtMs: now(),
        readAtMs: null,
      });
    }
    return json(visit);
  }

  // ---- Vitals ----
  if (parts[0] === 'vitals' && parts[1] === 'me') {
    if (method === 'GET') {
      return json(state.vitals);
    }
    if (method === 'POST') {
      const body = req.body as Partial<DemoVitalReading>;
      const reading: DemoVitalReading = {
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
      const body = req.body as Partial<DemoClinicalEntry>;
      const entry: DemoClinicalEntry = {
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
    const touch = (): DemoCarePlan => {
      plan.updatedAtMs = now();
      plan.updatedBy = me?.displayName ?? 'Care team';
      return plan;
    };
    if (method === 'POST' && parts[2] === 'goals') {
      const body = req.body as { text?: string };
      plan.goals.push({ id: `g-${Math.random().toString(36).slice(2, 8)}`, text: String(body.text ?? ''), status: 'open' });
      return json(touch());
    }
    if (method === 'PATCH' && parts[2] === 'goals') {
      const body = req.body as { status?: 'open' | 'in-progress' | 'done' };
      plan.goals = plan.goals.map((g) =>
        g.id === parts[3] ? { ...g, status: body.status ?? g.status } : g
      );
      return json(touch());
    }
    if (method === 'POST' && parts[2] === 'notes') {
      const body = req.body as { text?: string; authorId?: string; authorName?: string; authorRole?: string };
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
      const body = req.body as { bookingId?: string; providerId?: string; amountCents?: number };
      const escrow: DemoEscrow = {
        id: `e-${Math.random().toString(36).slice(2, 8)}`,
        bookingId: body.bookingId ?? '',
        providerId: body.providerId ?? '',
        clientId: state.session?.userId ?? 'u-client',
        amountCents: body.amountCents ?? 0,
        status: 'held',
        createdAtMs: now(),
        settledAtMs: null,
        refundedCents: null,
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
       if (parts[3] === 'release') {
         escrow.status = 'released';
         escrow.settledAtMs = now();
       } else if (parts[3] === 'refund') {
         escrow.status = 'refunded';
         escrow.settledAtMs = now();
       } else if (parts[3] === 'freeze') {
         // Funds are held but cannot be released or refunded until the dispute resolves.
         escrow.status = 'frozen';
       } else if (parts[3] === 'partial-refund') {
         const amount = (req.body as { amountCents?: number })?.amountCents ?? 0;
         if (
           !Number.isInteger(amount) ||
           amount < 0 ||
           amount > escrow.amountCents
         ) {
           return of(
             new HttpResponse({ status: 422, body: { message: 'Refund amount must be a non-negative integer not exceeding the held amount (cents).' } })
           );
         }
         escrow.refundedCents = amount;
         escrow.status = 'released';
         escrow.settledAtMs = now();
       } else {
         return of(new HttpResponse({ status: 404, body: { message: 'Unknown escrow action.' } }));
       }
       return json(escrow);
     }
   }

   // ---- Disputes (FEATURE_PLAN.md §17) ----
   // GET /me/disputes — current user's disputes (as client or provider).
   if (parts[0] === 'me' && parts[1] === 'disputes' && method === 'GET') {
     const me = state.session;
     const userId = me?.userId ?? 'u-client';
     return json(
       state.disputes.filter((d) => d.clientId === userId || d.providerId === userId)
     );
   }

   if (parts[0] === 'disputes') {
     const dispute = parts.length >= 3 ? state.disputes.find((d) => d.id === parts[1]) : null;
     if (parts.length >= 3 && !dispute) {
       return of(new HttpResponse({ status: 404, body: { message: 'Dispute not found.' } }));
     }

     // GET /disputes — admin queue (all disputes, open ones first).
     if (method === 'GET' && parts.length === 1) {
       const me = state.session;
       if (!me || !me.roles.includes('admin')) {
         return of(new HttpResponse({ status: 403, body: { message: 'Admin access required.' } }));
       }
       return json(
         [...state.disputes].sort((a, b) => {
           const aOpen = a.state === 'open' || a.state === 'under_review';
           const bOpen = b.state === 'open' || b.state === 'under_review';
           if (aOpen && !bOpen) {
             return -1;
           }
           if (!aOpen && bOpen) {
             return 1;
           }
           return b.createdAtMs - a.createdAtMs;
         })
       );
     }

     // POST /disputes — open a new dispute (freezes the held escrow).
     if (method === 'POST' && parts.length === 1) {
       const body = req.body as { bookingId?: string; reason?: DisputeReason; description?: string };
       const booking = state.bookings.find((b) => b.id === body.bookingId);
       if (!booking) {
         return of(new HttpResponse({ status: 404, body: { message: 'Booking not found.' } }));
       }
       if (
         state.disputes.some(
           (d) => d.bookingId === body.bookingId && (d.state === 'open' || d.state === 'under_review')
         )
       ) {
         return of(
           new HttpResponse({ status: 409, body: { message: 'A dispute is already open for this booking.' } })
         );
       }
       const escrow = state.escrow.find(
         (e) => e.bookingId === body.bookingId && e.status === 'held'
       );
       if (escrow) {
         escrow.status = 'frozen';
       }
       const me = state.session;
       const created: DemoDispute = {
         id: `d-${Math.random().toString(36).slice(2, 8)}`,
         bookingId: body.bookingId,
         clientId: booking.clientId,
         clientName: booking.clientName,
         providerId: booking.providerUserId,
         providerName: booking.caregiverName,
         openedBy: me?.userId ?? booking.clientId,
         openedByName: me?.displayName ?? booking.clientName,
         reason: (body.reason ?? 'other') as DisputeReason,
         description: String(body.description ?? '').slice(0, 1000),
         state: 'open',
         resolution: null,
         refundCents: null,
         escrowTransactionId: escrow?.id ?? null,
         createdAtMs: now(),
         updatedAtMs: now(),
         evidence: [],
       };
       state.disputes.unshift(created);
       // Notify the other party.
       state.notifications.unshift({
         id: `ntf-${Math.random().toString(36).slice(2, 8)}`,
         userId: booking.providerUserId,
         kind: 'dispute.opened',
         title: 'Dispute opened',
         body: `A dispute has been opened for booking ${body.bookingId}.`,
         link: '/disputes',
         createdAtMs: now(),
         readAtMs: null,
       });
       return json(created);
     }

     // POST /disputes/:id/state — transition state + resolve escrow.
     if (method === 'POST' && parts.length === 4 && parts[2] === 'state') {
       const body = req.body as {
         state?: DisputeState;
         resolution?: DisputeResolution;
         refundCents?: number;
       };
       const to = body.state;
       if (!to || !(DISPUTE_TRANSITIONS[dispute!.state] ?? []).includes(to)) {
         return of(
           new HttpResponse({ status: 409, body: { message: `Illegal transition ${dispute!.state} → ${String(to ?? '?')}.` } })
         );
       }
       dispute!.state = to;
       dispute!.updatedAtMs = now();
       if (body.resolution) {
         dispute!.resolution = body.resolution;
       }
       if (body.resolution === 'partial_refund') {
         const refundCents = body.refundCents ?? 0;
         const escrowAmount = dispute!.escrowTransactionId
           ? state.escrow.find((e) => e.id === dispute!.escrowTransactionId)?.amountCents ?? 0
           : 0;
         if (!Number.isInteger(refundCents) || refundCents < 0 || refundCents > escrowAmount) {
           return of(
             new HttpResponse({ status: 422, body: { message: 'Refund amount must be a non-negative integer not exceeding the held amount (cents).' } })
           );
         }
         dispute!.refundCents = refundCents;
       }
       // Resolve the escrow transaction.
       if (dispute!.escrowTransactionId) {
         const escrow = state.escrow.find((e) => e.id === dispute!.escrowTransactionId);
         if (escrow && escrow.status === 'frozen') {
           if (dispute!.resolution === 'release') {
             escrow.status = 'released';
             escrow.settledAtMs = now();
           } else if (dispute!.resolution === 'full_refund') {
             escrow.status = 'refunded';
             escrow.settledAtMs = now();
           } else if (dispute!.resolution === 'partial_refund') {
             escrow.refundedCents = dispute!.refundCents;
             escrow.status = 'released';
             escrow.settledAtMs = now();
           }
         }
       }
       // Notify both parties.
       const title =
         dispute!.state === 'resolved_client'
           ? 'Dispute resolved in your favour'
           : dispute!.state === 'resolved_provider'
             ? 'Dispute resolved in favour of the provider'
             : 'Dispute rejected';
       const bodyText =
         dispute!.resolution === 'partial_refund'
           ? `Partial refund of ${(dispute!.refundCents ?? 0) / 100}€ processed.`
           : dispute!.resolution === 'full_refund'
             ? 'Full refund processed.'
             : 'Escrow released to the provider.';
       state.notifications.unshift({
         id: `ntf-${Math.random().toString(36).slice(2, 8)}`,
         userId: dispute!.clientId,
         kind: dispute!.state === 'rejected' ? 'dispute.rejected' : 'dispute.resolved',
         title,
         body: bodyText,
         link: '/disputes',
         createdAtMs: now(),
         readAtMs: null,
       });
       state.notifications.unshift({
         id: `ntf-${Math.random().toString(36).slice(2, 8)}`,
         userId: dispute!.providerId,
         kind: dispute!.state === 'rejected' ? 'dispute.rejected' : 'dispute.resolved',
         title,
         body: bodyText,
         link: '/disputes',
         createdAtMs: now(),
         readAtMs: null,
       });
       return json(dispute);
     }

     // POST /disputes/:id/evidence — stub upload of evidence.
     if (method === 'POST' && parts.length === 3 && parts[2] === 'evidence') {
       const me = state.session;
       const body = req.body as { kind?: 'message' | 'photo' | 'visit_gps'; body?: string; url?: string };
       const evidence: DemoDisputeEvidence = {
         id: `ev-${Math.random().toString(36).slice(2, 8)}`,
         disputeId: dispute!.id,
         authorId: me?.userId ?? 'u-client',
         authorName: me?.displayName ?? 'Client',
         kind: body.kind ?? 'message',
         body: body.body,
         url: body.url,
         createdAtMs: now(),
       };
       dispute!.evidence.push(evidence);
       dispute!.updatedAtMs = now();
       state.notifications.unshift({
         id: `ntf-${Math.random().toString(36).slice(2, 8)}`,
         userId: dispute!.state === 'open' ? dispute!.providerId : dispute!.openedBy,
         kind: 'dispute.opened',
         title: 'New evidence added',
         body: `Evidence ${evidence.kind} added to dispute ${dispute!.id}.`,
         link: '/disputes',
         createdAtMs: now(),
         readAtMs: null,
       });
       return json(evidence);
     }
   }
  return next(req);
};

function sessionPayload(user: DemoUser) {
  return {
    userId: user.userId,
    displayName: user.displayName,
    roles: user.roles,
    expiresAtMs: now() + 12 * hour,
  };
}
