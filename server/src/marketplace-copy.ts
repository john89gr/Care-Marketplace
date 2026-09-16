import type { LocalizedText } from './locale';

/**
 * Bilingual marketplace copy.
 *
 * `greek-health-data.ts` holds the Greek-authored seed (bios, specialities,
 * review text). This module supplies the English side plus the detail-page
 * fields the public profile needs, and is the single place where marketplace
 * copy is written in both locales.
 *
 * Shape notes:
 *  - `specialties.el` is *not* repeated here — the seed pairs the English list
 *    with the Greek list already on `GREEK_CAREGIVERS` (same order), so the two
 *    can never drift apart silently.
 *  - `memberSinceMonthsAgo` is turned into an absolute timestamp by the seed.
 *  - `languages` is a single list of endonyms ("Ελληνικά", "English"), which
 *    read correctly in either locale and so are not translated.
 */

export interface ServiceCopy {
  name: LocalizedText;
  /** Euro per session. */
  price: number;
  durationMin: number;
}

export interface CaregiverProfileCopy {
  bio: LocalizedText;
  city: LocalizedText;
  education: LocalizedText;
  specialtiesEn: string[];
  languages: string[];
  services: ServiceCopy[];
  experienceYears: number;
  /** Typical first-response time, in minutes. */
  responseMinutes: number;
  /** Clients who booked more than once. */
  repeatClients: number;
  verified: boolean;
  memberSinceMonthsAgo: number;
}

export const CAREGIVER_PROFILES: Record<string, CaregiverProfileCopy> = {
  'u-nurse': {
    bio: {
      en: 'Nursing graduate of the National and Kapodistrian University of Athens with 10 years in the intensive care unit of Evangelismos Hospital. I specialise in chronic patient management, home nursing and post-operative care.',
      el: 'Πτυχιούχος Νοσηλευτικής ΕΚΠΑ με 10ετή εμπειρία στη Μονάδα Εντατικής Θεραπείας του ΓΝΑ «Ο Ευαγγελισμός». Εξειδίκευση στη διαχείριση χρόνιων ασθενών, κατ\u2019 οίκον νοσηλεία και μετεγχειρητική φροντίδα.',
    },
    city: { en: 'Athens — Kolonaki', el: 'Αθήνα — Κολωνάκι' },
    education: {
      en: 'BSc Nursing, National and Kapodistrian University of Athens',
      el: 'Πτυχίο Νοσηλευτικής, Εθνικό και Καποδιστριακό Πανεπιστήμιο Αθηνών',
    },
    specialtiesEn: [
      'Injections & blood draws',
      'Wound & pressure-sore care',
      'IV fluid administration',
      'Post-operative monitoring',
      'Vital signs monitoring',
    ],
    languages: ['Ελληνικά', 'English'],
    services: [
      { name: { en: 'Injection at home', el: 'Ένεση στο σπίτι' }, price: 25, durationMin: 30 },
      {
        name: { en: 'Wound dressing & care', el: 'Περιποίηση & φροντίδα τραύματος' },
        price: 30,
        durationMin: 45,
      },
      {
        name: { en: 'Vital signs & monitoring visit', el: 'Επίσκεψη μέτρησης ζωτικών σημείων' },
        price: 20,
        durationMin: 25,
      },
    ],
    experienceYears: 10,
    responseMinutes: 12,
    repeatClients: 96,
    verified: true,
    memberSinceMonthsAgo: 34,
  },

  'u-nurse-karras': {
    bio: {
      en: 'Registered nurse with an MSc in Gerontology and 8 years at Sismanogleio Hospital. Certified in stoma care and diabetic foot management.',
      el: 'Νοσηλεύτρια ΠΕ με μεταπτυχιακό στη Γεροντολογία. 8 χρόνια προϋπηρεσίας στο Σισμανόγλειο Νοσοκομείο. Πιστοποιημένη στη φροντίδα στομιών και διαβητικού ποδιού.',
    },
    city: { en: 'Athens — Kifisia', el: 'Αθήνα — Κηφισιά' },
    education: {
      en: 'MSc Gerontology, National and Kapodistrian University of Athens',
      el: 'Μεταπτυχιακό Γεροντολογίας, Εθνικό και Καποδιστριακό Πανεπιστήμιο Αθηνών',
    },
    specialtiesEn: [
      'Diabetic foot care',
      'Intravenous therapy',
      'Urinary catheterisation',
      'Home blood draws',
      'Geriatric nursing',
    ],
    languages: ['Ελληνικά', 'English', 'Français'],
    services: [
      {
        name: { en: 'Diabetic foot care', el: 'Φροντίδα διαβητικού ποδιού' },
        price: 32,
        durationMin: 40,
      },
      {
        name: { en: 'Catheter change at home', el: 'Αλλαγή καθετήρα στο σπίτι' },
        price: 35,
        durationMin: 45,
      },
      { name: { en: 'Home blood draw', el: 'Αιμοληψία κατ\u2019 οίκον' }, price: 22, durationMin: 20 },
    ],
    experienceYears: 8,
    responseMinutes: 20,
    repeatClients: 71,
    verified: true,
    memberSinceMonthsAgo: 26,
  },

  'u-nurse-vasilis': {
    bio: {
      en: 'Nursing graduate of the University of West Attica, long-serving at Tzaneio Hospital in Piraeus. I focus on home recovery and the care of surgical incisions.',
      el: 'Απόφοιτος Νοσηλευτικής Πανεπιστημίου Δυτικής Αττικής με πολυετή θητεία στο Τζάνειο Νοσοκομείο Πειραιά. Εξειδικευμένος στην κατ\u2019 οίκον αποκατάσταση και περιποίηση χειρουργικών τομών.',
    },
    city: { en: 'Piraeus', el: 'Πειραιάς' },
    education: {
      en: 'BSc Nursing, University of West Attica',
      el: 'Πτυχίο Νοσηλευτικής, Πανεπιστήμιο Δυτικής Αττικής',
    },
    specialtiesEn: [
      'Trauma care',
      'Palliative care',
      'Wound care',
      'Subcutaneous injections',
      'Pain management',
    ],
    languages: ['Ελληνικά', 'English'],
    services: [
      {
        name: { en: 'Wound care & dressing change', el: 'Περιποίηση τραύματος & αλλαγή επιδέσμων' },
        price: 28,
        durationMin: 40,
      },
      {
        name: { en: 'Post-operative home visit', el: 'Μετεγχειρητική επίσκεψη στο σπίτι' },
        price: 30,
        durationMin: 45,
      },
    ],
    experienceYears: 9,
    responseMinutes: 30,
    repeatClients: 52,
    verified: true,
    memberSinceMonthsAgo: 22,
  },

  'u-physio': {
    bio: {
      en: 'Physiotherapist specialising in musculoskeletal and orthopaedic rehabilitation (Cert. OMT). 12 years of clinical experience at KAT Hospital and in private rehabilitation centres.',
      el: 'Φυσικοθεραπεύτρια με εξειδίκευση στην μυοσκελετική και ορθοπεδική αποκατάσταση (Cert. OMT). 12 χρόνια κλινικής εμπειρίας στο ΓΝΑ ΚΑΤ και σε ιδιωτικά κέντρα αποκατάστασης.',
    },
    city: { en: 'Athens — Chalandri', el: 'Αθήνα — Χαλάνδρι' },
    education: {
      en: 'BSc Physiotherapy + OMT certification, KAT Hospital training programme',
      el: 'Πτυχίο Φυσικοθεραπείας & πιστοποίηση OMT, πρόγραμμα εκπαίδευσης ΓΝΑ ΚΑΤ',
    },
    specialtiesEn: [
      'Orthopaedic rehabilitation',
      'Hip & knee arthroplasty rehab',
      'Kinesiotherapy',
      'Manual therapy',
      'Respiratory physiotherapy',
    ],
    languages: ['Ελληνικά', 'English'],
    services: [
      {
        name: { en: 'Orthopaedic rehabilitation session', el: 'Συνεδρία ορθοπεδικής αποκατάστασης' },
        price: 30,
        durationMin: 45,
      },
      {
        name: { en: 'Manual therapy & kinesiotherapy', el: 'Χειροπρακτική & κινησιοθεραπεία' },
        price: 32,
        durationMin: 45,
      },
    ],
    experienceYears: 12,
    responseMinutes: 18,
    repeatClients: 118,
    verified: true,
    memberSinceMonthsAgo: 40,
  },

  'u-physio-dimitris': {
    bio: {
      en: 'Physiotherapist with an MSc in Neurological Rehabilitation. I work with patients after ischaemic or haemorrhagic stroke and with movement disorders, and I am a certified Bobath therapist.',
      el: 'Φυσικοθεραπευτής MSc στη Νευρολογική Αποκατάσταση. Εξειδίκευση σε ασθενείς μετά από ισχαιμικό/αιμορραγικό εγκεφαλικό και κινητικές διαταραχές. Επίσημος θεραπευτής μεθόδου Bobath.',
    },
    city: { en: 'Athens — Marousi', el: 'Αθήνα — Μαρούσι' },
    education: {
      en: 'MSc Neurological Rehabilitation, certified Bobath therapist',
      el: 'Μεταπτυχιακό Νευρολογικής Αποκατάστασης, πιστοποιημένος θεραπευτής Bobath',
    },
    specialtiesEn: [
      'Neurological rehabilitation (Bobath)',
      'Stroke recovery (CVA)',
      "Parkinson's disease",
      'Gait re-education',
      'Acupuncture',
    ],
    languages: ['Ελληνικά', 'English', 'Deutsch'],
    services: [
      {
        name: { en: 'Neurological rehabilitation session', el: 'Συνεδρία νευρολογικής αποκατάστασης' },
        price: 35,
        durationMin: 50,
      },
      {
        name: { en: 'Gait & balance retraining', el: 'Επανεκπαίδευση βάδισης & ισορροπίας' },
        price: 33,
        durationMin: 45,
      },
    ],
    experienceYears: 11,
    responseMinutes: 24,
    repeatClients: 88,
    verified: true,
    memberSinceMonthsAgo: 30,
  },

  'u-nikos': {
    bio: {
      en: 'Experienced companion for older adults, first-aid certified by the Hellenic Red Cross. Seven years of steady, patient presence with third-age clients.',
      el: 'Έμπειρος φροντιστής ηλικιωμένων με πιστοποίηση πρώτων βοηθειών από τον Ελληνικό Ερυθρό Σταυρό. 7 χρόνια συνεχούς παρουσίας δίπλα σε άτομα τρίτης ηλικίας με υπομονή και ενσυναίσθηση.',
    },
    city: { en: 'Athens — Kypseli', el: 'Αθήνα — Κυψέλη' },
    education: {
      en: 'First-aid certification, Hellenic Red Cross',
      el: 'Πιστοποίηση πρώτων βοηθειών, Ελληνικός Ερυθρός Σταυρός',
    },
    specialtiesEn: [
      'Personal hygiene assistance',
      'Accompaniment to medical appointments',
      'Meal preparation',
      'Medication reminders',
      'Overnight care',
    ],
    languages: ['Ελληνικά'],
    services: [
      { name: { en: 'Companionship visit', el: 'Επίσκεψη συντροφικότητας' }, price: 15, durationMin: 60 },
      {
        name: { en: 'Personal care & hygiene', el: 'Ατομική φροντίδα & υγιεινή' },
        price: 18,
        durationMin: 60,
      },
      { name: { en: 'Errands & shopping', el: 'Θέματα & ψώνια' }, price: 12, durationMin: 45 },
    ],
    experienceYears: 7,
    responseMinutes: 35,
    repeatClients: 63,
    verified: true,
    memberSinceMonthsAgo: 20,
  },

  'u-caregiver-maria': {
    bio: {
      en: 'Certified nursing assistant and companion with dedicated training in dementia and Alzheimer\u2019s disease. I am committed to dignified, warm day-to-day care.',
      el: 'Πιστοποιημένη βοηθός νοσηλευτή & συνοδός ηλικιωμένων με ειδική επιμόρφωση στην άνοια και νόσο Alzheimer. Αφοσιωμένη στην αξιοπρεπή και ζεστή καθημερινή φροντίδα.',
    },
    city: { en: 'Athens — Glyfada', el: 'Αθήνα — Γλυφάδα' },
    education: {
      en: 'Certified nursing assistant + dementia care training, Alzheimer Hellas',
      el: 'Πιστοποίηση βοηθού νοσηλευτή & επιμόρφωση άνοιας, Alzheimer Hellas',
    },
    specialtiesEn: [
      'Dementia & Alzheimer\u2019s care',
      'Emotional support',
      'Mobility assistance',
      'Household care management',
      'Companionship',
    ],
    languages: ['Ελληνικά', 'English'],
    services: [
      {
        name: { en: 'Dementia companionship', el: 'Συντροφικότητα σε άνοια' },
        price: 18,
        durationMin: 60,
      },
      {
        name: { en: 'Daily care & household support', el: 'Καθημερινή φροντίδα & οικιακή υποστήριξη' },
        price: 20,
        durationMin: 60,
      },
    ],
    experienceYears: 8,
    responseMinutes: 22,
    repeatClients: 104,
    verified: true,
    memberSinceMonthsAgo: 28,
  },

  'u-caregiver-kostas': {
    bio: {
      en: 'Caregiver experienced with limited-mobility clients and post-operative bed rest. Trained in safe lifting techniques and fall prevention.',
      el: 'Φροντιστής με εμπειρία σε άτομα με κινητικά προβλήματα και μετεγχειρητική κατάκλιση. Εκπαιδευμένος σε τεχνικές ασφαλούς ανύψωσης και πρόληψης πτώσεων.',
    },
    city: { en: 'Piraeus', el: 'Πειραιάς' },
    education: {
      en: 'Safe patient handling & fall-prevention training',
      el: 'Εκπαίδευση ασφαλούς μετακίνησης & πρόληψης πτώσεων',
    },
    specialtiesEn: [
      'Bedridden patient support',
      'Incontinence care & hygiene',
      'Transfer & safe lifting',
      'Light exercise',
      'Shopping & prescriptions',
    ],
    languages: ['Ελληνικά'],
    services: [
      {
        name: { en: 'Bedridden patient care', el: 'Φροντίδα κατάκοιτου ασθενή' },
        price: 16,
        durationMin: 60,
      },
      {
        name: { en: 'Transfer & mobilisation support', el: 'Υποστήριξη μετακίνησης & κινητοποίησης' },
        price: 17,
        durationMin: 45,
      },
    ],
    experienceYears: 6,
    responseMinutes: 40,
    repeatClients: 47,
    verified: false,
    memberSinceMonthsAgo: 16,
  },
};

/**
 * English renderings of the seeded Greek review comments, keyed by review id.
 * The seed pairs these with the Greek `comment` already on `GREEK_REVIEWS`, so
 * each comment is written in both locales without duplicating the Greek text
 * here.
 */
export const REVIEW_I18N: Record<string, LocalizedText> = {
  'rv-1': { en: 'Impeccable care, very reliable.' },
  'rv-elena-2': {
    en: 'Mrs Papadaki is an outstanding professional. She arrived on time, was very kind, and the blood draw was completely painless. I recommend her without reservation!',
  },
  'rv-elena-3': {
    en: 'Exemplary care of the surgical wound. Meticulous about antiseptic procedure and flawless communication with our treating doctor.',
  },
  'rv-elena-4': {
    en: 'A very well-trained and patient nurse. She explained everything about the subcutaneous medication and left us feeling confident.',
  },
  'rv-karras-1': {
    en: 'Eleni has rare experience in diabetic foot care. She spotted an early lesion in time and saved us from complications. An excellent clinician!',
  },
  'rv-karras-2': {
    en: 'Very careful and responsible with catheterisation. Calm, humane and thoroughly professional. We felt completely safe.',
  },
  'rv-karras-3': {
    en: 'Extremely punctual, gentle with an elderly patient, and excellent technique with intravenous infusions.',
  },
  'rv-vasilis-1': {
    en: 'Vasilis was flawless with the dressing changes and pressure-sore care. He earned our trust in the first minute.',
  },
  'rv-vasilis-2': {
    en: 'A very willing, helpful and experienced nurse. The visit happened exactly on time, with no delay at all.',
  },
  'rv-vasilis-3': {
    en: 'High-level professionalism. A calm strength, and a wonderful way with the patient.',
  },
  'rv-anna-1': {
    en: 'Mrs Karakosta helped my father get back on his feet after hip replacement surgery. Outstanding clinical training and incredible patience!',
  },
  'rv-anna-2': {
    en: 'A wonderful physiotherapist! The kinesiotherapy for my knee showed dramatic results within two weeks.',
  },
  'rv-anna-3': {
    en: 'My chronic lower-back pain eased immediately thanks to the targeted exercises and stretches. Very kind and genuinely encouraging.',
  },
  'rv-vlachos-1': {
    en: 'Mr Vlachos is outstanding at neurological rehabilitation. After the ischaemic stroke, the improvement in walking and balance was remarkable.',
  },
  'rv-vlachos-2': {
    en: 'Methodical, focused and with deep knowledge of his field. He adapted the exercise programme precisely to my mother\u2019s capacity.',
  },
  'rv-vlachos-3': {
    en: 'An excellent therapist. Gait retraining was done safely and with constant encouragement.',
  },
  'rv-nikos-1': {
    en: 'Nikos is a real support for the household. He accompanied my father to hospital and waited patiently for hours. A gem of a person.',
  },
  'rv-nikos-2': {
    en: 'A very dependable caregiver, punctual, and he helped with personal hygiene with great respect and tact.',
  },
  'rv-nikos-3': {
    en: 'Kind, hard-working and very discreet. He helped us enormously with daily transfers and household care.',
  },
  'rv-c-maria-1': {
    en: 'Maria is an angel for our mother, who has dementia. She has a unique way of calming her, singing to her and keeping her company with a smile.',
  },
  'rv-c-maria-2': {
    en: 'A dedicated and warm person. She managed diet and medication with absolute order and precision. We feel completely safe with her.',
  },
  'rv-c-maria-3': {
    en: 'A wonderful presence. Kind, tidy, and always willing to help with whatever came up.',
  },
  'rv-kostas-1': {
    en: 'Kostas has excellent strength and the right techniques for safely moving a bedridden patient. He prevented falls and taught us how to help.',
  },
  'rv-kostas-2': {
    en: 'A very good professional — willing and careful. His help with the morning routine and hygiene was invaluable.',
  },
  'rv-kostas-3': {
    en: 'Extremely reliable, kind and very attentive in his care. We thank him warmly for the support.',
  },
};
