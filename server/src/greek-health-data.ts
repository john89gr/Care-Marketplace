import type { MedicineInstructions, MedicationSchedule } from './medications';
import type { ScreeningType } from './screenings';

export interface GreekUser {
  id: string;
  displayName: string;
  email: string;
  roles: string[];
  phone: string;
  amka: string;
  afm: string;
  address: string;
  dateOfBirth: string;
  sex: 'female' | 'male' | '';
  licenceNumber?: string;
  hourlyRate?: number | null;
}

export interface GreekMedication {
  id: string;
  userId: string;
  name: string;
  dose: string;
  eofCode: string;
  critical: boolean;
  prescriber: string;
  schedule: MedicationSchedule;
  instructions: MedicineInstructions;
  prescriptionId?: string;
  durationDays?: number;
}

export interface GreekCondition {
  id: string;
  userId: string;
  name: string;
  icd11Code: string;
  status: 'active' | 'chronic' | 'resolved';
  diagnosedAgoYears: number;
  notes: string;
}

export interface GreekAllergy {
  id: string;
  userId: string;
  substance: string;
  kind: 'drug' | 'food' | 'environmental';
  reaction: string;
  severity: 'mild' | 'moderate' | 'severe';
  confirmedAgoYears: number;
  notes: string;
}

export interface GreekImmunization {
  id: string;
  userId: string;
  vaccine: string;
  doseNumber: number;
  administeredAgoMonths: number;
  source: 'manual' | 'wallet';
  notes: string;
}

export interface GreekMedicalEvent {
  id: string;
  userId: string;
  kind: 'procedure' | 'hospitalization' | 'surgery' | 'other';
  name: string;
  facility: string;
  occurredAgoMonths: number;
  notes: string;
}

export interface GreekSymptom {
  id: string;
  userId: string;
  name: string;
  severity: 'mild' | 'moderate' | 'severe';
  onsetAgoDays: number;
  status: 'ongoing' | 'resolved';
  notes: string;
}

export interface GreekScreening {
  id: string;
  userId: string;
  type: ScreeningType;
  status: 'done' | 'waived';
  atAgoMonths: number;
  reason: string;
}

export interface GreekCaregiver {
  id: string;
  displayName: string;
  roles: string[];
  rating: number;
  distanceKm: number;
  hourlyRate: number;
  availableNow: boolean;
  specialties: string[];
  lat: number;
  lng: number;
  completedVisits: number;
  recentCancellations: number;
  bio: string;
  languages: string[];
  gender: string;
}

export interface GreekReview {
  id: string;
  caregiverId: string;
  bookingId: string;
  authorId: string;
  authorName: string;
  rating: number;
  comment: string;
  status: 'published' | 'flagged' | 'removed';
  agoDays: number;
}

export interface GreekPartnerPharmacy {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  inStock: boolean;
  phone: string;
  workingHours: string;
  stockItems: Array<{
    name: string;
    eof: string;
    qty: number;
    priceEur: number;
  }>;
}

export interface GreekWalletDoc {
  id: string;
  userId: string;
  category: 'vaccinations' | 'prescriptions' | 'exams' | 'kepa_certificates';
  title: string;
  issuer: string;
  issuedAgoDays: number;
  expiresInDays?: number | null;
  docType: 'pdf' | 'image';
  dataUrl: string;
  verified: boolean;
}

// --------------------------------------------------------------------------
// 1. Authentic Greek Users (16+ Users: Clients, Nurses, Physios, Caregivers, Pharmacists, Admin)
// --------------------------------------------------------------------------

export const GREEK_USERS: GreekUser[] = [
  // Clients
  {
    id: 'u-client',
    displayName: 'Maria Papadopoulou',
    email: 'maria@example.com',
    roles: ['client'],
    phone: '6940000000',
    amka: '14036801234',
    afm: '094123456',
    address: 'Βασιλίσσης Σοφίας 45, Αθήνα 10676',
    dateOfBirth: '1968-03-14',
    sex: 'female',
    hourlyRate: null,
  },
  {
    id: 'u-giorgos',
    displayName: 'Giorgos Dimitriadis',
    email: 'giorgos@example.com',
    roles: ['client'],
    phone: '6941234567',
    amka: '22075502345',
    afm: '082345678',
    address: 'Κηφισίας 124, Μαρούσι 15125',
    dateOfBirth: '1955-07-22',
    sex: 'male',
    hourlyRate: null,
  },
  {
    id: 'u-sofia',
    displayName: 'Sofia Oikonomou',
    email: 'sofia@example.com',
    roles: ['client'],
    phone: '6942345678',
    amka: '18096203456',
    afm: '073456789',
    address: 'Ηρώων Πολυτεχνείου 18, Πειραιάς 18535',
    dateOfBirth: '1962-09-18',
    sex: 'female',
    hourlyRate: null,
  },
  {
    id: 'u-giannis',
    displayName: 'Giannis Karagiannis',
    email: 'giannis@example.com',
    roles: ['client'],
    phone: '6943456789',
    amka: '05045004567',
    afm: '064567890',
    address: 'Αγίας Παρασκευής 77, Χαλάνδρι 15234',
    dateOfBirth: '1950-04-05',
    sex: 'male',
    hourlyRate: null,
  },
  {
    id: 'u-aikaterini',
    displayName: 'Aikaterini Alexiou',
    email: 'aikaterini@example.com',
    roles: ['client'],
    phone: '6944567890',
    amka: '30117005678',
    afm: '055678901',
    address: 'Πανδώρας 12, Γλυφάδα 16674',
    dateOfBirth: '1970-11-30',
    sex: 'female',
    hourlyRate: null,
  },

  // Nurses
  {
    id: 'u-nurse',
    displayName: 'Elena Papadaki',
    email: 'elena@example.com',
    roles: ['nurse'],
    phone: '6950000000',
    amka: '15068801235',
    afm: '099123451',
    address: 'Πατριάρχου Ιωακείμ 28, Κολωνάκι 10675',
    dateOfBirth: '1988-06-15',
    sex: 'female',
    licenceNumber: 'ΝΟΣ-2024-Α123',
    hourlyRate: 25,
  },
  {
    id: 'u-nurse-karras',
    displayName: 'Eleni Karras',
    email: 'eleni.karras@example.com',
    roles: ['nurse'],
    phone: '6951234567',
    amka: '08128502346',
    afm: '098234562',
    address: 'Χαριλάου Τρικούπη 64, Κηφισιά 14562',
    dateOfBirth: '1985-12-08',
    sex: 'female',
    licenceNumber: 'ΝΟΣ-2022-Β456',
    hourlyRate: 28,
  },
  {
    id: 'u-nurse-vasilis',
    displayName: 'Vasilis Christopoulos',
    email: 'vasilis@example.com',
    roles: ['nurse'],
    phone: '6952345678',
    amka: '25038203457',
    afm: '097345673',
    address: 'Γρ. Λαμπράκη 142, Πειραιάς 18535',
    dateOfBirth: '1982-03-25',
    sex: 'male',
    licenceNumber: 'ΝΟΣ-2023-Γ789',
    hourlyRate: 26,
  },

  // Physiotherapists
  {
    id: 'u-physio',
    displayName: 'Anna Karakosta',
    email: 'anna@example.com',
    roles: ['physio'],
    phone: '6960000000',
    amka: '12048901236',
    afm: '096123454',
    address: 'Λεωφόρος Πεντέλης 42, Χαλάνδρι 15234',
    dateOfBirth: '1989-04-12',
    sex: 'female',
    licenceNumber: 'ΦΘ-2023-Β456',
    hourlyRate: 30,
  },
  {
    id: 'u-physio-dimitris',
    displayName: 'Dimitris Vlachos',
    email: 'dimitris.vlachos@example.com',
    roles: ['physio'],
    phone: '6961234567',
    amka: '19088402347',
    afm: '095234565',
    address: 'Λεωφόρος Κηφισίας 220, Μαρούσι 15124',
    dateOfBirth: '1984-08-19',
    sex: 'male',
    licenceNumber: 'ΦΘ-2021-Α112',
    hourlyRate: 35,
  },

  // Caregivers
  {
    id: 'u-nikos',
    displayName: 'Nikos Georgiou',
    email: 'nikos@example.com',
    roles: ['caregiver'],
    phone: '6971112233',
    amka: '05097901237',
    afm: '094234566',
    address: 'Αχαρνών 210, Αθήνα 10446',
    dateOfBirth: '1979-09-05',
    sex: 'male',
    hourlyRate: 15,
  },
  {
    id: 'u-caregiver-maria',
    displayName: 'Maria Spyropoulou',
    email: 'maria.spyropoulou@example.com',
    roles: ['caregiver'],
    phone: '6972223344',
    amka: '14028102348',
    afm: '093345677',
    address: 'Μεταξά 33, Γλυφάδα 16674',
    dateOfBirth: '1981-02-14',
    sex: 'female',
    hourlyRate: 18,
  },
  {
    id: 'u-caregiver-kostas',
    displayName: 'Kostas Papantoniou',
    email: 'kostas@example.com',
    roles: ['caregiver'],
    phone: '6973334455',
    amka: '27057703459',
    afm: '092456788',
    address: 'Κολοκοτρώνη 88, Πειραιάς 18535',
    dateOfBirth: '1977-05-27',
    sex: 'male',
    hourlyRate: 16,
  },

  // Pharmacists
  {
    id: 'u-pharm-raptis',
    displayName: 'Panagiotis Raptis',
    email: 'panagiotis.raptis@example.com',
    roles: ['pharmacist'],
    phone: '2103221100',
    amka: '11107501238',
    afm: '091567899',
    address: 'Πλατεία Συντάγματος 1, Αθήνα 10563',
    dateOfBirth: '1975-10-11',
    sex: 'male',
    hourlyRate: null,
  },
  {
    id: 'u-pharm-nikolaou',
    displayName: 'Despoina Nikolaou',
    email: 'despoina.nikolaou@example.com',
    roles: ['pharmacist'],
    phone: '2103632200',
    amka: '03038002349',
    afm: '090678900',
    address: 'Σκουφά 12, Κολωνάκι 10673',
    dateOfBirth: '1980-03-03',
    sex: 'female',
    hourlyRate: null,
  },

  // Super Admin
  {
    id: 'u-admin',
    displayName: 'Admin',
    email: 'admin@example.com',
    roles: ['admin'],
    phone: '2107788990',
    amka: '01017009999',
    afm: '099999999',
    address: 'Ακαδημίας 60, Αθήνα 10679',
    dateOfBirth: '1970-01-01',
    sex: 'male',
    hourlyRate: null,
  },
];

// --------------------------------------------------------------------------
// 2. 34 Authentic Greek Medications with realistic EOF codes & instructions
// --------------------------------------------------------------------------

export const GREEK_MEDICATIONS: GreekMedication[] = [
  {
    id: 'med-1',
    userId: 'u-client',
    name: 'Insulin glargine (Lantus)',
    dose: '10 units',
    eofCode: '22870.01.01',
    critical: true,
    prescriber: 'Δρ. Δημήτριος Σταύρου (Καρδιολόγος)',
    schedule: { kind: 'daily', timesMinutes: [8 * 60] },
    instructions: {
      doseForm: 'Πένα ένεσης',
      route: 'injection',
      foodRelation: 'any',
      maxDailyDoses: 1,
      warnings: [
        'Ελέγχετε το σάκχαρο πριν από τη δόση.',
        'Αλλάζετε σημείο ένεσης κάθε φορά.',
      ],
      sideEffects: 'Υπογλυκαιμία, αντίδραση στο σημείο της ένεσης.',
      storage: 'Στο ψυγείο πριν το άνοιγμα (2-8°C).',
      specialInstructions: 'Χορήγηση αυστηρά υποδορίως, ποτέ ενδοφλεβίως.',
    },
    durationDays: 90,
  },
  {
    id: 'med-2',
    userId: 'u-client',
    name: 'Atorvastatin (Lipitor)',
    dose: '20 mg',
    eofCode: '21903.01.02',
    critical: false,
    prescriber: 'Δρ. Δημήτριος Σταύρου (Καρδιολόγος)',
    schedule: { kind: 'daily', timesMinutes: [21 * 60] },
    instructions: {
      doseForm: 'Επικαλυμμένο δισκίο',
      route: 'oral',
      foodRelation: 'any',
      maxDailyDoses: 1,
      warnings: [
        'Αποφύγετε τον χυμό γκρέιπφρουτ.',
        'Αναφέρετε ανεξήγητο μυϊκό πόνο ή αδυναμία.',
      ],
      sideEffects: 'Μυϊκός πόνος, κεφαλαλγία, δυσπεψία.',
      storage: 'Σε ξηρό, δροσερό μέρος κάτω των 25°C.',
      specialInstructions: 'Λαμβάνεται το βράδυ, την ίδια ώρα.',
    },
    durationDays: 90,
  },
  {
    id: 'med-augmentin',
    userId: 'u-client',
    name: 'Augmentin (Amoxicillin / Clavulanate)',
    dose: '875/125 mg',
    eofCode: '23412.01.01',
    critical: false,
    prescriber: 'Δρ. Γεώργιος Νικολάου (Παθολόγος)',
    schedule: { kind: 'daily', timesMinutes: [8 * 60, 20 * 60] },
    instructions: {
      doseForm: 'Επικαλυμμένο με λεπτό υμένιο δισκίο',
      route: 'oral',
      foodRelation: 'before',
      maxDailyDoses: 2,
      warnings: [
        'Λήψη στην αρχή γεύματος για αποφυγή γαστρεντερικών διαταραχών.',
        'Ολοκληρώστε πλήρως τη συνιστώμενη θεραπεία (7 ημέρες).',
        'Διακόψτε άμεσα σε εμφάνιση κνησμού ή δερματικού εξανθήματος.',
      ],
      sideEffects: 'Διάρροια, ναυτία, έμετος, καντιντίαση.',
      storage: 'Σε θερμοκρασία κάτω των 25°C, προστατευμένο από υγρασία.',
      specialInstructions: 'Λαμβάνεται ανά 12ωρο με ένα γεμάτο ποτήρι νερό.',
    },
    durationDays: 7,
  },
  {
    id: 'med-salospir',
    userId: 'u-giorgos',
    name: 'Salospir (Acetylsalicylic acid)',
    dose: '100 mg',
    eofCode: '02319.01.01',
    critical: true,
    prescriber: 'Δρ. Δημήτριος Σταύρου (Καρδιολόγος)',
    schedule: { kind: 'daily', timesMinutes: [13 * 60] },
    instructions: {
      doseForm: 'Γαστροανθεκτικό δισκίο',
      route: 'oral',
      foodRelation: 'after',
      maxDailyDoses: 1,
      warnings: [
        'Λαμβάνεται πάντα μετά το μεσημεριανό φαγητό.',
        'Αποφύγετε ταυτόχρονη λήψη με άλλα αντιφλεγμονώδη (ΜΣΑΦ).',
        'Ενημερώστε τον ιατρό σε περίπτωση μαύρων κοπράνων ή αιμορραγίας.',
      ],
      sideEffects: 'Γαστρική δυσφορία, ναυτία, παράταση χρόνου ροής αίματος.',
      storage: 'Σε ξηρό μέρος κάτω των 25°C.',
      specialInstructions: 'Κατάποση ολόκληρου του δισκίου χωρίς μάσηση.',
    },
    durationDays: 180,
  },
  {
    id: 'med-glucophage',
    userId: 'u-giannis',
    name: 'Glucophage (Metformin HCl)',
    dose: '850 mg',
    eofCode: '14820.02.01',
    critical: true,
    prescriber: 'Δρ. Αικατερίνη Κοντού (Ενδοκρινολόγος)',
    schedule: { kind: 'daily', timesMinutes: [8 * 60, 20 * 60] },
    instructions: {
      doseForm: 'Επικαλυμμένο δισκίο',
      route: 'oral',
      foodRelation: 'with',
      maxDailyDoses: 3,
      warnings: [
        'Λήψη κατά τη διάρκεια ή αμέσως μετά το γεύμα.',
        'Διακοπή 48 ώρες πριν από αξονική με σκιαγραφικό.',
        'Αποφύγετε την υπερβολική κατανάλωση αλκοόλ.',
      ],
      sideEffects: 'Μεταλλική γεύση, μετεωρισμός, διάρροια, κοιλιακό άλγος.',
      storage: 'Σε θερμοκρασία περιβάλλοντος (15-30°C).',
      specialInstructions: 'Βοηθά στη μείωση των στομαχικών ενοχλήσεων η σταδιακή έναρξη.',
    },
    durationDays: 90,
  },
  {
    id: 'med-sintrom',
    userId: 'u-giorgos',
    name: 'Sintrom (Acenocoumarol)',
    dose: '4 mg',
    eofCode: '05432.01.01',
    critical: true,
    prescriber: 'Δρ. Δημήτριος Σταύρου (Καρδιολόγος)',
    schedule: { kind: 'daily', timesMinutes: [18 * 60] },
    instructions: {
      doseForm: 'Δισκίο με σταυροειδή χαραγή',
      route: 'oral',
      foodRelation: 'any',
      maxDailyDoses: 1,
      warnings: [
        'Υποχρεωτικός τακτικός έλεγχος INR στο βιβλιάριο πήξης.',
        'Σταθερή κατανάλωση τροφών πλούσιων σε βιταμίνη K (μπρόκολο, σπανάκι).',
        'Αποφυγή ενδομυϊκών ενέσεων και έντονων τραυματισμών.',
      ],
      sideEffects: 'Αιμορραγία ούλων, ρινορραγία, αυτόματοι μώλωπες.',
      storage: 'Προστατευμένο από υγρασία και έντονο φως.',
      specialInstructions: 'Η δόση αναπροσαρμόζεται μόνο βάσει οδηγίας καρδιολόγου.',
    },
    durationDays: 60,
  },
  {
    id: 'med-t4',
    userId: 'u-sofia',
    name: 'T4 (Levothyroxine sodium)',
    dose: '100 mcg',
    eofCode: '11204.01.03',
    critical: true,
    prescriber: 'Δρ. Αικατερίνη Κοντού (Ενδοκρινολόγος)',
    schedule: { kind: 'daily', timesMinutes: [7 * 60] },
    instructions: {
      doseForm: 'Δισκίο',
      route: 'oral',
      foodRelation: 'before',
      maxDailyDoses: 1,
      warnings: [
        'Λήψη το πρωί νηστική, 30-60 λεπτά πριν το πρωινό.',
        'Δεν λαμβάνεται μαζί με ασβέστιο ή σίδηρο (διαφορά 4 ωρών).',
      ],
      sideEffects: 'Αίσθημα παλμών, εφίδρωση, ανησυχία (σε υπερδοσολογία).',
      storage: 'Σε δροσερό και ξηρό περιβάλλον κάτω των 25°C.',
      specialInstructions: 'Κατάποση μόνο με σκέτο νερό (όχι γάλα, τσάι ή καφέ).',
    },
    durationDays: 90,
  },
  {
    id: 'med-nexium',
    userId: 'u-sofia',
    name: 'Nexium (Esomeprazole)',
    dose: '40 mg',
    eofCode: '23984.01.02',
    critical: false,
    prescriber: 'Δρ. Ευάγγελος Μανώλης (Γαστρεντερολόγος)',
    schedule: { kind: 'daily', timesMinutes: [7 * 60 + 30] },
    instructions: {
      doseForm: 'Γαστροανθεκτικό καψάκιο',
      route: 'oral',
      foodRelation: 'before',
      maxDailyDoses: 1,
      warnings: [
        'Λήψη 30 λεπτά πριν από το πρωινό γεύμα.',
        'Μην μασάτε ή σπάτε τα κοκκία του καψακίου.',
      ],
      sideEffects: 'Κεφαλαλγία, κοιλιακός μετεωρισμός, δυσκοιλιότητα.',
      storage: 'Στην αρχική συσκευασία για προστασία από υγρασία.',
      specialInstructions: 'Συνεχίστε για όλη τη διάρκεια που καθόρισε ο γαστρεντερολόγος.',
    },
    durationDays: 30,
  },
  {
    id: 'med-norvasc',
    userId: 'u-client',
    name: 'Norvasc (Amlodipine besylate)',
    dose: '5 mg',
    eofCode: '19502.01.01',
    critical: true,
    prescriber: 'Δρ. Δημήτριος Σταύρου (Καρδιολόγος)',
    schedule: { kind: 'daily', timesMinutes: [9 * 60] },
    instructions: {
      doseForm: 'Δισκίο',
      route: 'oral',
      foodRelation: 'any',
      maxDailyDoses: 2,
      warnings: [
        'Τακτική καταγραφή αρτηριακής πίεσης.',
        'Αναφέρετε τυχόν πρήξιμο στους αστραγάλους (οίδημα σφυρών).',
      ],
      sideEffects: 'Οίδημα κάτω άκρων, εξάψεις, ζάλη, αίσθημα κόπωσης.',
      storage: 'Σε θερμοκρασία κάτω των 30°C.',
      specialInstructions: 'Μπορεί να ληφθεί με ή χωρίς τροφή, κατά προτίμηση το πρωί.',
    },
    durationDays: 90,
  },
  {
    id: 'med-xanax',
    userId: 'u-aikaterini',
    name: 'Xanax (Alprazolam)',
    dose: '0.5 mg',
    eofCode: '13401.02.01',
    critical: false,
    prescriber: 'Δρ. Ελένη Δημητρίου (Ψυχίατρος)',
    schedule: { kind: 'daily', timesMinutes: [22 * 60] },
    instructions: {
      doseForm: 'Δισκίο με γραμμή θραύσης',
      route: 'oral',
      foodRelation: 'any',
      maxDailyDoses: 3,
      warnings: [
        'Κίνδυνος εξάρτησης και εθισμού σε μακροχρόνια χορήγηση.',
        'Αυστηρή αποφυγή οινοπνεύματος.',
        'Μην οδηγείτε ή χειρίζεστε μηχανήματα αν νιώθετε υπνηλία.',
      ],
      sideEffects: 'Υπνηλία, καταστολή, μυϊκή αδυναμία, ζάλη.',
      storage: 'Προστατευμένο από το φως, κάτω των 25°C.',
      specialInstructions: 'Σταδιακή μείωση δόσης μόνο υπό ιατρική παρακολούθηση.',
    },
    durationDays: 30,
  },
  {
    id: 'med-aerolin',
    userId: 'u-giannis',
    name: 'Aerolin Inhaler (Salbutamol)',
    dose: '100 mcg/dose',
    eofCode: '09812.01.01',
    critical: true,
    prescriber: 'Δρ. Κωνσταντίνος Λάμπρου (Πνευμονολόγος)',
    schedule: { kind: 'daily', timesMinutes: [8 * 60, 20 * 60] },
    instructions: {
      doseForm: 'Αεροζόλ εισπνοών υπό πίεση',
      route: 'inhalation',
      foodRelation: 'any',
      maxDailyDoses: 8,
      warnings: [
        'Ανακινήστε καλά τον περιέκτη πριν από κάθε εισπνοή.',
        'Σε επιδείνωση της δύσπνοιας απευθυνθείτε αμέσως σε τμήμα επειγόντων.',
      ],
      sideEffects: 'Ταχυκαρδία, τρόμος δακτύλων, νευρικότητα, κεφαλαλγία.',
      storage: 'Μακριά από εστίες θερμότητας και άμεσο ηλιακό φως.',
      specialInstructions: 'Ξεπλύνετε το στόμα με νερό μετά τη χρήση.',
    },
    durationDays: 60,
  },
  {
    id: 'med-spiriva',
    userId: 'u-giannis',
    name: 'Spiriva Respimat (Tiotropium bromide)',
    dose: '2.5 mcg/puff',
    eofCode: '24561.01.01',
    critical: true,
    prescriber: 'Δρ. Κωνσταντίνος Λάμπρου (Πνευμονολόγος)',
    schedule: { kind: 'daily', timesMinutes: [9 * 60] },
    instructions: {
      doseForm: 'Εισπνεόμενο διάλυμα Respimat',
      route: 'inhalation',
      foodRelation: 'any',
      maxDailyDoses: 2,
      warnings: [
        '2 εισπνοές μία φορά την ημέρα, την ίδια ώρα.',
        'Αποφύγετε να εισέλθει εκνέφωμα στα μάτια.',
      ],
      sideEffects: 'Ξηροστομία, βήχας, δυσκοιλιότητα, φαρυγγικός ερεθισμός.',
      storage: 'Μην καταψύχετε. Χρήση εντός 3 μηνών από την τοποθέτηση του φυσιγγίου.',
      specialInstructions: 'Εφαρμόστε τον κανόνα: Στροφή - Άνοιγμα - Πίεση.',
    },
    durationDays: 60,
  },
  {
    id: 'med-januvia',
    userId: 'u-giannis',
    name: 'Januvia (Sitagliptin)',
    dose: '100 mg',
    eofCode: '25120.01.01',
    critical: true,
    prescriber: 'Δρ. Αικατερίνη Κοντού (Ενδοκρινολόγος)',
    schedule: { kind: 'daily', timesMinutes: [8 * 60 + 30] },
    instructions: {
      doseForm: 'Επικαλυμμένο δισκίο',
      route: 'oral',
      foodRelation: 'any',
      maxDailyDoses: 1,
      warnings: [
        'Ενημερώστε τον ιατρό για επίμονο έντονο κοιλιακό άλγος.',
        'Προσαρμογή δοσολογίας σε περίπτωση νεφρικής δυσλειτουργίας.',
      ],
      sideEffects: 'Λοίμωξη ανώτερου αναπνευστικού, ρινοφαρυγγίτιδα, κεφαλαλγία.',
      storage: 'Σε θερμοκρασία κάτω των 30°C.',
      specialInstructions: 'Μπορεί να ληφθεί ανεξάρτητα από τα γεύματα.',
    },
    durationDays: 90,
  },
  {
    id: 'med-triatec',
    userId: 'u-giorgos',
    name: 'Triatec (Ramipril)',
    dose: '5 mg',
    eofCode: '17890.01.02',
    critical: true,
    prescriber: 'Δρ. Δημήτριος Σταύρου (Καρδιολόγος)',
    schedule: { kind: 'daily', timesMinutes: [8 * 60] },
    instructions: {
      doseForm: 'Δισκίο',
      route: 'oral',
      foodRelation: 'any',
      maxDailyDoses: 2,
      warnings: [
        'Αναφέρετε ξηρό επίμονο βήχα ή πρήξιμο προσώπου/χειλέων.',
        'Περιοδικός έλεγχος καλίου και κρεατινίνης ορού.',
      ],
      sideEffects: 'Ξηρός βήχας, υπόταση, ζάλη, υπερκαλιαιμία.',
      storage: 'Σε θερμοκρασία κάτω των 25°C.',
      specialInstructions: 'Λαμβάνεται το πρωί με επαρκή ποσότητα νερού.',
    },
    durationDays: 90,
  },
  {
    id: 'med-lasix',
    userId: 'u-giorgos',
    name: 'Lasix (Furosemide)',
    dose: '40 mg',
    eofCode: '06712.01.01',
    critical: true,
    prescriber: 'Δρ. Δημήτριος Σταύρου (Καρδιολόγος)',
    schedule: { kind: 'daily', timesMinutes: [8 * 60] },
    instructions: {
      doseForm: 'Δισκίο',
      route: 'oral',
      foodRelation: 'before',
      maxDailyDoses: 2,
      warnings: [
        'Λήψη το πρωί για να αποφευχθεί η νυχτερινή έγερση για ούρηση.',
        'Συνιστάται δίαιτα πλούσια σε κάλιο (μπανάνες, πορτοκάλια).',
      ],
      sideEffects: 'Υποκαλιαιμία, αφυδάτωση, υπόταση, αυξημένο ουρικό οξύ.',
      storage: 'Προστατευμένο από το άμεσο φως.',
      specialInstructions: 'Συνοδεύεται συχνά από εργαστηριακό έλεγχο ηλεκτρολυτών.',
    },
    durationDays: 60,
  },
  {
    id: 'med-zoxil',
    userId: 'u-sofia',
    name: 'Zoxil (Amoxicillin trihydrate)',
    dose: '500 mg',
    eofCode: '18245.01.01',
    critical: false,
    prescriber: 'Δρ. Γεώργιος Νικολάου (Παθολόγος)',
    schedule: { kind: 'daily', timesMinutes: [8 * 60, 16 * 60, 24 * 60] },
    instructions: {
      doseForm: 'Καψάκιο',
      route: 'oral',
      foodRelation: 'before',
      maxDailyDoses: 3,
      warnings: [
        'Λήψη 1 ώρα πριν ή 2 ώρες μετά το φαγητό.',
        'Πλήρης ολοκλήρωση της θεραπείας 7 ημερών.',
        'Αντενδείκνυται σε γνωστή αλλεργία στις πενικιλίνες.',
      ],
      sideEffects: 'Γαστρεντερικές διαταραχές, ήπιος κνησμός, ναυτία.',
      storage: 'Σε θερμοκρασία κάτω των 25°C.',
      specialInstructions: 'Πίνετε ένα γεμάτο ποτήρι νερό με κάθε κάψουλα.',
    },
    durationDays: 7,
  },
  {
    id: 'med-plavix',
    userId: 'u-client',
    name: 'Plavix (Clopidogrel)',
    dose: '75 mg',
    eofCode: '22105.01.01',
    critical: true,
    prescriber: 'Δρ. Δημήτριος Σταύρου (Καρδιολόγος)',
    schedule: { kind: 'daily', timesMinutes: [9 * 60] },
    instructions: {
      doseForm: 'Επικαλυμμένο δισκίο',
      route: 'oral',
      foodRelation: 'any',
      maxDailyDoses: 1,
      warnings: [
        'Διακοπή 5-7 ημέρες πριν από προγραμματισμένο χειρουργείο.',
        'Ενημερώστε τον οδοντίατρο για τη λήψη του φαρμάκου.',
      ],
      sideEffects: 'Αιμάτωμα, επίσταξη, γαστρεντερική αιμορραγία.',
      storage: 'Σε θερμοκρασία κάτω των 30°C.',
      specialInstructions: 'Μπορεί να ληφθεί με ή χωρίς τροφή.',
    },
    durationDays: 180,
  },
  {
    id: 'med-crestor',
    userId: 'u-sofia',
    name: 'Crestor (Rosuvastatin)',
    dose: '10 mg',
    eofCode: '24089.01.01',
    critical: false,
    prescriber: 'Δρ. Δημήτριος Σταύρου (Καρδιολόγος)',
    schedule: { kind: 'daily', timesMinutes: [21 * 60] },
    instructions: {
      doseForm: 'Επικαλυμμένο δισκίο',
      route: 'oral',
      foodRelation: 'any',
      maxDailyDoses: 1,
      warnings: [
        'Αναφέρετε αμέσως ανεξήγητο μυϊκό πόνο ή ευαισθησία.',
        'Περιοδικός έλεγχος λιπιδαιμικού προφίλ και CPK.',
      ],
      sideEffects: 'Μυαλγία, δυσκοιλιότητα, ζάλη, ναυτία.',
      storage: 'Στην αρχική συσκευασία, κάτω των 30°C.',
      specialInstructions: 'Λαμβάνεται οποιαδήποτε ώρα, σταθερά καθημερινά.',
    },
    durationDays: 90,
  },
  {
    id: 'med-eliquis',
    userId: 'u-giorgos',
    name: 'Eliquis (Apixaban)',
    dose: '5 mg',
    eofCode: '27891.01.02',
    critical: true,
    prescriber: 'Δρ. Δημήτριος Σταύρου (Καρδιολόγος)',
    schedule: { kind: 'daily', timesMinutes: [8 * 60, 20 * 60] },
    instructions: {
      doseForm: 'Επικαλυμμένο δισκίο',
      route: 'oral',
      foodRelation: 'any',
      maxDailyDoses: 2,
      warnings: [
        'Μην παραλείπετε καμία δόση (κίνδυνος θρόμβωσης).',
        'Δεν απαιτείται τακτικός έλεγχος INR.',
      ],
      sideEffects: 'Αιμορραγία, αναιμία, ναυτία, μώλωπες.',
      storage: 'Σε θερμοκρασία κάτω των 30°C.',
      specialInstructions: 'Λαμβάνεται ανά 12ωρο με νερό.',
    },
    durationDays: 90,
  },
  {
    id: 'med-xarelto',
    userId: 'u-giannis',
    name: 'Xarelto (Rivaroxaban)',
    dose: '20 mg',
    eofCode: '26901.01.03',
    critical: true,
    prescriber: 'Δρ. Δημήτριος Σταύρου (Καρδιολόγος)',
    schedule: { kind: 'daily', timesMinutes: [14 * 60] },
    instructions: {
      doseForm: 'Επικαλυμμένο δισκίο',
      route: 'oral',
      foodRelation: 'with',
      maxDailyDoses: 1,
      warnings: [
        'Υποχρεωτική λήψη μαζί με γεύμα για βέλτιστη απορρόφηση.',
        'Αναφέρετε τυχόν ασυνήθιστη αιμορραγία ή αδυναμία.',
      ],
      sideEffects: 'Αιμορραγία, ζάλη, περιφερικό οίδημα.',
      storage: 'Σε θερμοκρασία κάτω των 30°C.',
      specialInstructions: 'Πάρτε το δισκίο την ίδια ώρα κάθε μέρα με το μεσημεριανό φαγητό.',
    },
    durationDays: 90,
  },
  {
    id: 'med-betaloc',
    userId: 'u-client',
    name: 'Betaloc ZOK (Metoprolol succinate)',
    dose: '50 mg',
    eofCode: '12045.01.02',
    critical: true,
    prescriber: 'Δρ. Δημήτριος Σταύρου (Καρδιολόγος)',
    schedule: { kind: 'daily', timesMinutes: [8 * 60] },
    instructions: {
      doseForm: 'Δισκίο ελεγχόμενης αποδέσμευσης',
      route: 'oral',
      foodRelation: 'any',
      maxDailyDoses: 2,
      warnings: [
        'Μην διακόπτετε απότομα τη θεραπεία.',
        'Ελέγχετε τους καρδιακούς παλμούς (όχι λήψη αν σφυγμοί < 55/min).',
      ],
      sideEffects: 'Βραδυκαρδία, υπόταση, κρύα άκρα, κόπωση.',
      storage: 'Σε θερμοκρασία κάτω των 25°C.',
      specialInstructions: 'Κατάποση αμάσητο με νερό το πρωί.',
    },
    durationDays: 90,
  },
  {
    id: 'med-concor',
    userId: 'u-giorgos',
    name: 'Concor (Bisoprolol fumarate)',
    dose: '5 mg',
    eofCode: '19820.01.01',
    critical: true,
    prescriber: 'Δρ. Δημήτριος Σταύρου (Καρδιολόγος)',
    schedule: { kind: 'daily', timesMinutes: [8 * 60] },
    instructions: {
      doseForm: 'Δισκίο σε σχήμα καρδιάς',
      route: 'oral',
      foodRelation: 'before',
      maxDailyDoses: 2,
      warnings: [
        'Λήψη το πρωί πριν ή μαζί με το πρωινό.',
        'Αποφύγετε απότομη διακοπή.',
      ],
      sideEffects: 'Ζάλη, κόπωση, βραδυκαρδία, κρύα χέρια/πόδια.',
      storage: 'Σε θερμοκρασία κάτω των 25°C.',
      specialInstructions: 'Παρακολουθείτε την πίεση και τους σφυγμούς.',
    },
    durationDays: 90,
  },
  {
    id: 'med-diovan',
    userId: 'u-client',
    name: 'Diovan (Valsartan)',
    dose: '80 mg',
    eofCode: '22340.01.01',
    critical: true,
    prescriber: 'Δρ. Δημήτριος Σταύρου (Καρδιολόγος)',
    schedule: { kind: 'daily', timesMinutes: [9 * 60] },
    instructions: {
      doseForm: 'Επικαλυμμένο δισκίο',
      route: 'oral',
      foodRelation: 'any',
      maxDailyDoses: 2,
      warnings: [
        'Τακτικός έλεγχος αρτηριακής πίεσης.',
        'Αντενδείκνυται κατά την κύηση.',
      ],
      sideEffects: 'Ζάλη, ορθοστατική υπόταση, υπερκαλιαιμία.',
      storage: 'Σε θερμοκρασία κάτω των 30°C.',
      specialInstructions: 'Μπορεί να ληφθεί με ή χωρίς τροφή.',
    },
    durationDays: 90,
  },
  {
    id: 'med-atarax',
    userId: 'u-aikaterini',
    name: 'Atarax (Hydroxyzine HCl)',
    dose: '25 mg',
    eofCode: '08912.01.01',
    critical: false,
    prescriber: 'Δρ. Ελένη Δημητρίου (Ψυχίατρος)',
    schedule: { kind: 'daily', timesMinutes: [21 * 60] },
    instructions: {
      doseForm: 'Επικαλυμμένο δισκίο με γραμμή θραύσης',
      route: 'oral',
      foodRelation: 'any',
      maxDailyDoses: 4,
      warnings: [
        'Έντονη υπνηλία και καταστολή.',
        'Απαγορεύεται η κατανάλωση αλκοόλ.',
      ],
      sideEffects: 'Ξηροστομία, υπνηλία, κεφαλαλγία.',
      storage: 'Σε δροσερό μέρος προστατευμένο από φως.',
      specialInstructions: 'Συνιστάται η λήψη πριν τον ύπνο.',
    },
    durationDays: 30,
  },
  {
    id: 'med-voltaren',
    userId: 'u-aikaterini',
    name: 'Voltaren (Diclofenac sodium)',
    dose: '75 mg',
    eofCode: '07823.01.02',
    critical: false,
    prescriber: 'Δρ. Μιχαήλ Παυλίδης (Ορθοπεδικός)',
    schedule: { kind: 'daily', timesMinutes: [13 * 60] },
    instructions: {
      doseForm: 'Δισκίο παρατεταμένης αποδέσμευσης',
      route: 'oral',
      foodRelation: 'with',
      maxDailyDoses: 2,
      warnings: [
        'Λήψη υποχρεωτικά μετά από πλήρες γεύμα.',
        'Συνιστάται συγχορήγηση με γαστροπροστασία (π.χ. Nexium).',
      ],
      sideEffects: 'Γαστραλγία, ναυτία, δυσπεψία, διάρροια.',
      storage: 'Σε θερμοκρασία κάτω των 25°C.',
      specialInstructions: 'Κατάποση αμάσητο με ένα μεγάλο ποτήρι νερό.',
    },
    durationDays: 10,
  },
  {
    id: 'med-medrol',
    userId: 'u-giannis',
    name: 'Medrol (Methylprednisolone)',
    dose: '16 mg',
    eofCode: '10450.01.02',
    critical: true,
    prescriber: 'Δρ. Κωνσταντίνος Λάμπρου (Πνευμονολόγος)',
    schedule: { kind: 'daily', timesMinutes: [8 * 60] },
    instructions: {
      doseForm: 'Δισκίο με σταυροειδή χαραγή',
      route: 'oral',
      foodRelation: 'after',
      maxDailyDoses: 2,
      warnings: [
        'Λήψη το πρωί μετά το πρωινό γεύμα.',
        'Σταδιακή μείωση δόσης (tapering), ποτέ απότομη διακοπή.',
      ],
      sideEffects: 'Αύξηση σακχάρου, υπέρταση, αϋπνία, κατακράτηση υγρών.',
      storage: 'Σε θερμοκρασία κάτω των 25°C.',
      specialInstructions: 'Παρακολουθήστε την αρτηριακή πίεση και τη γλυκόζη.',
    },
    durationDays: 14,
  },
  {
    id: 'med-fosamax',
    userId: 'u-aikaterini',
    name: 'Fosamax (Alendronic acid)',
    dose: '70 mg',
    eofCode: '21456.01.01',
    critical: false,
    prescriber: 'Δρ. Μιχαήλ Παυλίδης (Ορθοπεδικός)',
    schedule: { kind: 'weekly', weekdays: [0], timeMinutes: 7 * 60 },
    instructions: {
      doseForm: 'Δισκίο',
      route: 'oral',
      foodRelation: 'before',
      maxDailyDoses: 1,
      warnings: [
        'Λήψη μία φορά την εβδομάδα (Κυριακή πρωί) νηστική με σκέτο νερό.',
        'Παραμείνετε σε όρθια ή καθιστή θέση για τουλάχιστον 30 λεπτά.',
        'Μην ξαπλώσετε μέχρι να καταναλώσετε το πρωινό γεύμα.',
      ],
      sideEffects: 'Οισοφαγικός ερεθισμός, καούρα, κοιλιακό άλγος.',
      storage: 'Στην αρχική συσκευασία σε ξηρό μέρος.',
      specialInstructions: 'Μην μασάτε ή διαλύετε το δισκίο στο στόμα.',
    },
    durationDays: 180,
  },
  {
    id: 'med-prolia',
    userId: 'u-sofia',
    name: 'Prolia (Denosumab)',
    dose: '60 mg/ml',
    eofCode: '27123.01.01',
    critical: true,
    prescriber: 'Δρ. Αικατερίνη Κοντού (Ενδοκρινολόγος)',
    schedule: { kind: 'interval', everyDays: 180, timeMinutes: 10 * 60 },
    instructions: {
      doseForm: 'Προγεμισμένη σύριγγα με προστατευτικό βελόνας',
      route: 'injection',
      foodRelation: 'any',
      maxDailyDoses: 1,
      warnings: [
        'Χορηγείται υποδορίως μία φορά κάθε 6 μήνες.',
        'Απαιτείται καθημερινή λήψη ασβεστίου και βιταμίνης D.',
      ],
      sideEffects: 'Μυοσκελετικός πόνος, πόνος στα άκρα, υπασβεστιαιμία.',
      storage: 'Στο ψυγείο (2-8°C). Μην ανακινείτε.',
      specialInstructions: 'Χορήγηση από εξειδικευμένο νοσηλευτή στο μηρό ή την κοιλιά.',
    },
    durationDays: 365,
  },
  {
    id: 'med-ciproxin',
    userId: 'u-giannis',
    name: 'Ciproxin (Ciprofloxacin HCl)',
    dose: '500 mg',
    eofCode: '16789.01.01',
    critical: false,
    prescriber: 'Δρ. Γεώργιος Νικολάου (Παθολόγος)',
    schedule: { kind: 'daily', timesMinutes: [8 * 60, 20 * 60] },
    instructions: {
      doseForm: 'Επικαλυμμένο δισκίο',
      route: 'oral',
      foodRelation: 'any',
      maxDailyDoses: 2,
      warnings: [
        'Αποφύγετε την έκθεση σε έντονο ηλιακό φως (φωτοευαισθησία).',
        'Διακόψτε άμεσα σε εμφάνιση πόνου ή φλεγμονής σε τένοντα (Αχίλλειος).',
      ],
      sideEffects: 'Ναυτία, διάρροια, τενοντίτιδα, ζάλη.',
      storage: 'Σε θερμοκρασία κάτω των 30°C.',
      specialInstructions: 'Μην λαμβάνετε μαζί με γαλακτοκομικά ή αντιόξινα.',
    },
    durationDays: 7,
  },
  {
    id: 'med-klaricid',
    userId: 'u-sofia',
    name: 'Klaricid (Clarithromycin)',
    dose: '500 mg',
    eofCode: '19432.01.01',
    critical: false,
    prescriber: 'Δρ. Κωνσταντίνος Λάμπρου (Πνευμονολόγος)',
    schedule: { kind: 'daily', timesMinutes: [9 * 60, 21 * 60] },
    instructions: {
      doseForm: 'Επικαλυμμένο δισκίο',
      route: 'oral',
      foodRelation: 'any',
      maxDailyDoses: 2,
      warnings: [
        'Ολοκληρώστε πλήρως τη συνταγογραφημένη αγωγή.',
        'Ενημερώστε τον γιατρό για τυχόν αλληλεπιδράσεις με άλλα φάρμακα.',
      ],
      sideEffects: 'Διαταραχή γεύσης, ναυτία, κοιλιακό άλγος, πονοκέφαλος.',
      storage: 'Σε θερμοκρασία δωματίου κάτω των 25°C.',
      specialInstructions: 'Μπορεί να ληφθεί με ή χωρίς τροφή.',
    },
    durationDays: 7,
  },
  {
    id: 'med-seroxat',
    userId: 'u-giannis',
    name: 'Seroxat (Paroxetine HCl)',
    dose: '20 mg',
    eofCode: '20124.01.01',
    critical: false,
    prescriber: 'Δρ. Ελένη Δημητρίου (Ψυχίατρος)',
    schedule: { kind: 'daily', timesMinutes: [8 * 60] },
    instructions: {
      doseForm: 'Επικαλυμμένο δισκίο με χαραγή',
      route: 'oral',
      foodRelation: 'with',
      maxDailyDoses: 2,
      warnings: [
        'Λήψη το πρωί μαζί με το πρωινό γεύμα.',
        'Απαιτούνται 2-3 εβδομάδες για την πλήρη θεραπευτική δράση.',
        'Μην διακόπτετε απότομα τη θεραπεία.',
      ],
      sideEffects: 'Ναυτία, σεξουαλική δυσλειτουργία, αϋπνία ή υπνηλία.',
      storage: 'Σε θερμοκρασία κάτω των 30°C.',
      specialInstructions: 'Κατάποση ολόκληρου του δισκίου, να μην μασάται.',
    },
    durationDays: 90,
  },
  {
    id: 'med-lyrica',
    userId: 'u-aikaterini',
    name: 'Lyrica (Pregabalin)',
    dose: '75 mg',
    eofCode: '24890.01.01',
    critical: false,
    prescriber: 'Δρ. Μιχαήλ Παυλίδης (Ορθοπεδικός)',
    schedule: { kind: 'daily', timesMinutes: [8 * 60, 20 * 60] },
    instructions: {
      doseForm: 'Σκληρό καψάκιο',
      route: 'oral',
      foodRelation: 'any',
      maxDailyDoses: 4,
      warnings: [
        'Μπορεί να προκαλέσει ζάλη και υπνηλία.',
        'Σταδιακή μείωση σε περίπτωση διακοπής.',
      ],
      sideEffects: 'Ζάλη, υπνηλία, ξηροστομία, περιφερικό οίδημα.',
      storage: 'Σε θερμοκρασία κάτω των 25°C.',
      specialInstructions: 'Κατάλληλο για νευροπαθητικό πόνο και οσφυαλγία.',
    },
    durationDays: 60,
  },
  {
    id: 'med-daflon',
    userId: 'u-sofia',
    name: 'Daflon (Purified flavonoid fraction)',
    dose: '500 mg',
    eofCode: '15430.01.01',
    critical: false,
    prescriber: 'Δρ. Γεώργιος Νικολάου (Παθολόγος)',
    schedule: { kind: 'daily', timesMinutes: [13 * 60, 20 * 60] },
    instructions: {
      doseForm: 'Επικαλυμμένο με λεπτό υμένιο δισκίο',
      route: 'oral',
      foodRelation: 'with',
      maxDailyDoses: 4,
      warnings: [
        'Λαμβάνεται κατά τη διάρκεια των γευμάτων (μεσημέρι και βράδυ).',
        'Συνδυάζεται με αποφυγή παρατεταμένης ορθοστασίας.',
      ],
      sideEffects: 'Διάρροια, δυσπεψία, ναυτία, έμετος.',
      storage: 'Σε θερμοκρασία κάτω των 30°C.',
      specialInstructions: 'Ενδείκνυται για φλεβική ανεπάρκεια κάτω άκρων.',
    },
    durationDays: 60,
  },
  {
    id: 'med-losec',
    userId: 'u-client',
    name: 'Losec (Omeprazole)',
    dose: '20 mg',
    eofCode: '17234.01.01',
    critical: false,
    prescriber: 'Δρ. Ευάγγελος Μανώλης (Γαστρεντερολόγος)',
    schedule: { kind: 'daily', timesMinutes: [8 * 60] },
    instructions: {
      doseForm: 'Γαστροανθεκτικό καψάκιο',
      route: 'oral',
      foodRelation: 'before',
      maxDailyDoses: 2,
      warnings: [
        'Λήψη το πρωί 30 λεπτά πριν το φαγητό.',
        'Μην ανοίγετε ή μασάτε τα κοκκία.',
      ],
      sideEffects: 'Κεφαλαλγία, διάρροια, ναυτία, κοιλιακό άλγος.',
      storage: 'Στη γνήσια συσκευασία σε ξηρό μέρος κάτω των 25°C.',
      specialInstructions: 'Κατάποση με μισό ποτήρι νερό.',
    },
    durationDays: 30,
  },
];

// --------------------------------------------------------------------------
// 3. 25+ Authentic Greek Medical History Entries
// --------------------------------------------------------------------------

export const GREEK_CONDITIONS: GreekCondition[] = [
  {
    id: 'cond-1',
    userId: 'u-client',
    name: 'Υπέρταση (Ιδιοπαθής αρτηριακή)',
    icd11Code: 'BA00',
    status: 'chronic',
    diagnosedAgoYears: 8,
    notes: 'Υπό σταθερή αντιυπερτασική αγωγή (Norvasc, Diovan) — τακτική παρακολούθηση.',
  },
  {
    id: 'cond-2',
    userId: 'u-client',
    name: 'Σακχαρώδης διαβήτης τύπου 2',
    icd11Code: '5A11',
    status: 'chronic',
    diagnosedAgoYears: 5,
    notes: 'Παρακολούθηση HbA1c ανά τρίμηνο (στόχος < 7.0%). Αγωγή με ινσουλίνη.',
  },
  {
    id: 'cond-3',
    userId: 'u-giorgos',
    name: 'Κολπική μαρμαρυγή (Μόνιμη)',
    icd11Code: 'BC81.3',
    status: 'chronic',
    diagnosedAgoYears: 4,
    notes: 'Υπό αντιπηκτική αγωγή Sintrom. Στόχος INR: 2.0 - 3.0. Μηνιαίος έλεγχος.',
  },
  {
    id: 'cond-4',
    userId: 'u-giorgos',
    name: 'Υπέρταση (Αρτηριακή)',
    icd11Code: 'BA00',
    status: 'chronic',
    diagnosedAgoYears: 10,
    notes: 'Συνδυασμός αναστολέα ACE και διουρητικού (Triatec, Lasix).',
  },
  {
    id: 'cond-5',
    userId: 'u-sofia',
    name: 'Δυσλιπιδαιμία / Υπερχοληστερολαιμία',
    icd11Code: '5C80',
    status: 'chronic',
    diagnosedAgoYears: 6,
    notes: 'Αγωγή με στατίνη Crestor 10mg. Τελευταία LDL: 95 mg/dL.',
  },
  {
    id: 'cond-6',
    userId: 'u-sofia',
    name: 'Μετεμμηνοπαυσιακή οστεοπόρωση',
    icd11Code: 'FB83.1',
    status: 'active',
    diagnosedAgoYears: 2,
    notes: 'Μέτρηση DEXA ΟΜΣΣ T-score: -2.8. Υπό εξαμηνιαία ένεση Prolia.',
  },
  {
    id: 'cond-7',
    userId: 'u-giannis',
    name: 'Χρόνια αποφρακτική πνευμονοπάθεια (ΧΑΠ)',
    icd11Code: 'CA22',
    status: 'chronic',
    diagnosedAgoYears: 7,
    notes: 'Στάδιο GOLD II. Ιστορικό καπνίσματος (40 pack-years, διακοπή προ 5ετίας).',
  },
  {
    id: 'cond-8',
    userId: 'u-giannis',
    name: 'Σακχαρώδης διαβήτης τύπου 2',
    icd11Code: '5A11',
    status: 'chronic',
    diagnosedAgoYears: 9,
    notes: 'Αγωγή με Glucophage και Januvia. Τακτικός έλεγχος διαβητικού ποδιού.',
  },
  {
    id: 'cond-9',
    userId: 'u-aikaterini',
    name: 'Οστεοαρθρίτιδα γόνατος (Πρωτοπαθής)',
    icd11Code: 'FA00',
    status: 'chronic',
    diagnosedAgoYears: 3,
    notes: 'Μετεγχειρητική κατάσταση δεξιού γόνατος. Φυσικοθεραπευτική κινητοποίηση.',
  },
  {
    id: 'cond-10',
    userId: 'u-aikaterini',
    name: 'Μετεμμηνοπαυσιακή οστεοπόρωση',
    icd11Code: 'FB83.1',
    status: 'chronic',
    diagnosedAgoYears: 4,
    notes: 'Εβδομαδιαία αγωγή Fosamax 70mg με ασβέστιο και D3.',
  },
];

export const GREEK_ALLERGIES: GreekAllergy[] = [
  {
    id: 'all-1',
    userId: 'u-client',
    substance: 'Πενικιλίνη (και παράγωγα)',
    kind: 'drug',
    reaction: 'Γενικευμένη κνίδωση, βρογχόσπασμος, κίνδυνος αναφυλαξίας',
    severity: 'severe',
    confirmedAgoYears: 10,
    notes: 'Αναγράφεται ρητά στο ιατρικό βραχιόλι αλλεργίας και στο ηλεκτρονικό βιβλιάριο.',
  },
  {
    id: 'all-2',
    userId: 'u-giorgos',
    substance: 'Ακετυλοσαλικυλικό οξύ (Ασπιρίνη)',
    kind: 'drug',
    reaction: 'Βρογχόσπασμος, έντονη δύσπνοια, οίδημα Quincke',
    severity: 'severe',
    confirmedAgoYears: 12,
    notes: 'Αντένδειξη για λήψη ασπιρίνης και συγγενών σκευασμάτων.',
  },
  {
    id: 'all-3',
    userId: 'u-sofia',
    substance: 'Σουλφοναμίδες (Κοτριμοξαζόλη / Bactrim)',
    kind: 'drug',
    reaction: 'Εκτεταμένο φυσαλιδώδες ερύθημα, σύνδρομο Stevens-Johnson (ιστορικό)',
    severity: 'severe',
    confirmedAgoYears: 8,
    notes: 'Απόλυτη αντένδειξη για οποιοδήποτε σουλφοναμιδικό παράγωγο.',
  },
  {
    id: 'all-4',
    userId: 'u-aikaterini',
    substance: 'Μη στεροειδή αντιφλεγμονώδη (ΜΣΑΦ - Ιβουπροφαίνη)',
    kind: 'drug',
    reaction: 'Οίδημα προσώπου και βλεφάρων, γαστρικό άλγος',
    severity: 'moderate',
    confirmedAgoYears: 5,
    notes: 'Χρήση παρακεταμόλης ως αναλγητικό εκλογής.',
  },
  {
    id: 'all-5',
    userId: 'u-giannis',
    substance: 'Ιωδιούχα σκιαγραφικά μέσα',
    kind: 'drug',
    reaction: 'Αναφυλακτοειδής αντίδραση, υπόταση, διάχυτο ερύθημα',
    severity: 'severe',
    confirmedAgoYears: 6,
    notes: 'Υποχρεωτική προνάρκωση / αντιαλλεργικό πρωτόκολλο πριν από κάθε αξονική.',
  },
];

export const GREEK_IMMUNIZATIONS: GreekImmunization[] = [
  {
    id: 'imm-1',
    userId: 'u-client',
    vaccine: 'Γρίπη (Vaxigrip Tetra)',
    doseNumber: 1,
    administeredAgoMonths: 6,
    source: 'manual',
    notes: 'Ετήσιος αντιγριπικός εμβολιασμός περιόδου 2024-2025.',
  },
  {
    id: 'imm-2',
    userId: 'u-client',
    vaccine: 'Πνευμονιόκοκκος (Prevenar 20)',
    doseNumber: 1,
    administeredAgoMonths: 14,
    source: 'wallet',
    notes: '20-δύναμο συζευγμένο πνευμονιοκοκκικό εμβόλιο (εφάπαξ δόση ενηλίκων).',
  },
  {
    id: 'imm-3',
    userId: 'u-giorgos',
    vaccine: 'COVID-19 (Comirnaty JN.1)',
    doseNumber: 5,
    administeredAgoMonths: 8,
    source: 'wallet',
    notes: 'Επικαιροποιημένο μονοδύναμο εμβόλιο JN.1 - Κέντρο Υγείας Αμαρουσίου.',
  },
  {
    id: 'imm-4',
    userId: 'u-sofia',
    vaccine: 'Έρπης ζωστήρας (Shingrix)',
    doseNumber: 2,
    administeredAgoMonths: 10,
    source: 'manual',
    notes: 'Ολοκλήρωση του σχήματος 2 δόσεων (0 και 2 μήνες).',
  },
  {
    id: 'imm-5',
    userId: 'u-giannis',
    vaccine: 'Πνευμονιόκοκκος (Prevenar 20)',
    doseNumber: 1,
    administeredAgoMonths: 18,
    source: 'wallet',
    notes: 'Εμβολιασμός ομάδας υψηλού κινδύνου λόγω ΧΑΠ.',
  },
  {
    id: 'imm-6',
    userId: 'u-aikaterini',
    vaccine: 'Τέτανος - Διφθερίτιδα - Κοκκύτης (Boostrix)',
    doseNumber: 1,
    administeredAgoMonths: 24,
    source: 'manual',
    notes: 'Αναμνηστική δεκαετής δόση ενηλίκων Tdap.',
  },
];

export const GREEK_MEDICAL_EVENTS: GreekMedicalEvent[] = [
  {
    id: 'ev-1',
    userId: 'u-client',
    kind: 'surgery',
    name: 'Σκωληκοειδεκτομή',
    facility: 'Γενικό Νοσοκομείο Αθηνών «Ο Ευαγγελισμός»',
    occurredAgoMonths: 72,
    notes: 'Επείγουσα λαπαροσκοπική επέμβαση. Ομαλή μετεγχειρητική πορεία χωρίς επιπλοκές.',
  },
  {
    id: 'ev-2',
    userId: 'u-aikaterini',
    kind: 'surgery',
    name: 'Ολική αρθροπλαστική δεξιού γόνατος',
    facility: 'Γενικό Νοσοκομείο Αττικής ΚΑΤ',
    occurredAgoMonths: 5,
    notes: 'Επιτυχής αντικατάσταση δεξιάς άρθρωσης γόνατος. Συνέχιση φυσικοθεραπείας.',
  },
  {
    id: 'ev-3',
    userId: 'u-giorgos',
    kind: 'surgery',
    name: 'Καθετηριασμός καρδιάς & Τοποθέτηση stent (DES)',
    facility: 'Ωνάσειο Καρδιοχειρουργικό Κέντρο',
    occurredAgoMonths: 28,
    notes: 'Αγγειοπλαστική στεφανιαίας αρτηρίας LAD με έκλουση φαρμάκου. Αιμοδυναμικά σταθερός.',
  },
  {
    id: 'ev-4',
    userId: 'u-sofia',
    kind: 'surgery',
    name: 'Λαπαροσκοπική χολοκυστεκτομή',
    facility: 'Ιπποκράτειο Γενικό Νοσοκομείο Αθηνών',
    occurredAgoMonths: 36,
    notes: 'Αφαίρεση χοληδόχου κύστης λόγω συμπτωματικής χολολιθίασης.',
  },
  {
    id: 'ev-5',
    userId: 'u-giannis',
    kind: 'hospitalization',
    name: 'Νοσηλεία λόγω παρόξυνσης ΧΑΠ',
    facility: 'Σισμανόγλειο Γενικό Νοσοκομείο Αττικής',
    occurredAgoMonths: 11,
    notes: 'Χορήγηση οξυγονοθεραπείας, βρογχοδιασταλτικών και κορτικοστεροειδών για 6 ημέρες.',
  },
  {
    id: 'ev-6',
    userId: 'u-giannis',
    kind: 'procedure',
    name: 'Ενδοσκοπική πολυπεκτομή παχέος εντέρου',
    facility: 'Νοσοκομείο «Ερρίκος Ντυνάν»',
    occurredAgoMonths: 16,
    notes: 'Αφαίρεση δύο σωληνωδών αδενωμάτων (καλοήθη στη βιοψία). Επανέλεγχος σε 3 έτη.',
  },
];

export const GREEK_SYMPTOMS: GreekSymptom[] = [
  {
    id: 'sym-1',
    userId: 'u-client',
    name: 'Κεφαλαλγία τάσεως',
    severity: 'moderate',
    onsetAgoDays: 10,
    status: 'ongoing',
    notes: 'Περιοδικός πονοκέφαλος κατά τις απογευματινές ώρες, ανταποκρίνεται σε ανάπαυση.',
  },
  {
    id: 'sym-2',
    userId: 'u-giannis',
    name: 'Δύσπνοια στην κόπωση',
    severity: 'moderate',
    onsetAgoDays: 45,
    status: 'ongoing',
    notes: 'Δυσκολία στην ανάβαση κλίμακας (mMRC βαθμός 2). Υποχωρεί με λήψη Aerolin.',
  },
  {
    id: 'sym-3',
    userId: 'u-aikaterini',
    name: 'Οσφυαλγία με αντανάκλαση',
    severity: 'moderate',
    onsetAgoDays: 20,
    status: 'ongoing',
    notes: 'Πόνος στην οσφυϊκή μοίρα μετά από παρατεταμένη ορθοστασία. Βελτίωση με φυσικοθεραπεία.',
  },
  {
    id: 'sym-4',
    userId: 'u-giorgos',
    name: 'Αίσθημα παλμών & ταχυκαρδία',
    severity: 'mild',
    onsetAgoDays: 14,
    status: 'ongoing',
    notes: 'Σύντομα επεισόδια παλμών σε κατάσταση ηρεμίας. Παρακολούθηση με Holter ρυθμού.',
  },
  {
    id: 'sym-5',
    userId: 'u-sofia',
    name: 'Πυρωτικός οπισθοστερνικός καύσος',
    severity: 'mild',
    onsetAgoDays: 30,
    status: 'ongoing',
    notes: 'Συμπτώματα γαστροοισοφαγικής παλινδρόμησης μετά από βαριά γεύματα.',
  },
];

// --------------------------------------------------------------------------
// 4. Real Preventive Screenings with Greek Guidelines
// --------------------------------------------------------------------------

export const GREEK_SCREENINGS: GreekScreening[] = [
  // Maria Papadopoulou (DOB: 1968-03-14, age 56, female)
  {
    id: 'scr-1',
    userId: 'u-client',
    type: 'cardioCheck',
    status: 'done',
    atAgoMonths: 14, // 14 months ago -> interval is 12 mo -> overdue (required by tests)
    reason: 'Ετήσιος καρδιολογικός έλεγχος & ηλεκτροκαρδιογράφημα',
  },
  {
    id: 'scr-mammo-maria',
    userId: 'u-client',
    type: 'mammography',
    status: 'done',
    atAgoMonths: 8,
    reason: 'Πρόγραμμα προσυμπτωματικού ελέγχου «Φώφη Γεννηματά» - Ψηφιακή Μαστογραφία',
  },
  {
    id: 'scr-pap-maria',
    userId: 'u-client',
    type: 'cervicalSmear',
    status: 'done',
    atAgoMonths: 18,
    reason: 'Προληπτικός γυναικολογικός έλεγχος Pap test (Αρνητικό για κακοήθεια)',
  },
  {
    id: 'scr-colorectal-maria',
    userId: 'u-client',
    type: 'colorectalScreening',
    status: 'done',
    atAgoMonths: 10,
    reason: 'Αρνητικό τεστ ανίχνευσης αιμοσφαιρίνης κοπράνων (FIT)',
  },

  // Giorgos Dimitriadis (DOB: 1955-07-22, age 69, male)
  {
    id: 'scr-cardio-giorgos',
    userId: 'u-giorgos',
    type: 'cardioCheck',
    status: 'done',
    atAgoMonths: 4,
    reason: 'Triplex καρδιάς & ηλεκτροκαρδιογράφημα - Παρακολούθηση κολπικής μαρμαρυγής',
  },
  {
    id: 'scr-colorectal-giorgos',
    userId: 'u-giorgos',
    type: 'colorectalScreening',
    status: 'done',
    atAgoMonths: 12,
    reason: 'Προληπτική κολονοσκόπηση ελέγχου - Ελεύθερη ευρημάτων',
  },
  {
    id: 'scr-flu-giorgos',
    userId: 'u-giorgos',
    type: 'fluVaccine',
    status: 'done',
    atAgoMonths: 5,
    reason: 'Εποχικός εμβολιασμός Vaxigrip Tetra 2024-2025',
  },

  // Sofia Oikonomou (DOB: 1962-09-18, age 62, female)
  {
    id: 'scr-mammo-sofia',
    userId: 'u-sofia',
    type: 'mammography',
    status: 'done',
    atAgoMonths: 15,
    reason: 'Ψηφιακή μαστογραφία & υπερηχογράφημα μαστών (BIRADS 1)',
  },
  {
    id: 'scr-cardio-sofia',
    userId: 'u-sofia',
    type: 'cardioCheck',
    status: 'done',
    atAgoMonths: 6,
    reason: 'Ετήσιος καρδιολογικός έλεγχος ρουτίνας & μέτρηση αρτηριακής πίεσης',
  },
  {
    id: 'scr-bone-sofia',
    userId: 'u-sofia',
    type: 'boneDensity',
    status: 'done',
    atAgoMonths: 11,
    reason: 'Μέτρηση οστικής πυκνότητας DEXA ΟΜΣΣ & ισχίου (T-score: -2.8)',
  },

  // Giannis Karagiannis (DOB: 1950-04-05, age 74, male)
  {
    id: 'scr-cardio-giannis',
    userId: 'u-giannis',
    type: 'cardioCheck',
    status: 'done',
    atAgoMonths: 2,
    reason: 'Καρδιολογική εκτίμηση & Triplex ανιούσας αορτής',
  },
  {
    id: 'scr-colorectal-giannis',
    userId: 'u-giannis',
    type: 'colorectalScreening',
    status: 'done',
    atAgoMonths: 16,
    reason: 'Κολονοσκόπηση και πολυπεκτομή στο Ερρίκος Ντυνάν',
  },
  {
    id: 'scr-flu-giannis',
    userId: 'u-giannis',
    type: 'fluVaccine',
    status: 'done',
    atAgoMonths: 4,
    reason: 'Εποχικός αντιγριπικός εμβολιασμός ευπαθών ομάδων',
  },

  // Aikaterini Alexiou (DOB: 1970-11-30, age 53, female)
  {
    id: 'scr-mammo-aikaterini',
    userId: 'u-aikaterini',
    type: 'mammography',
    status: 'done',
    atAgoMonths: 6,
    reason: 'Πρόγραμμα «Φώφη Γεννηματά» - Ψηφιακή Μαστογραφία',
  },
  {
    id: 'scr-pap-aikaterini',
    userId: 'u-aikaterini',
    type: 'cervicalSmear',
    status: 'done',
    atAgoMonths: 12,
    reason: 'Pap test & ThinPrep γυναικολογικού ελέγχου',
  },
  {
    id: 'scr-cardio-aikaterini',
    userId: 'u-aikaterini',
    type: 'cardioCheck',
    status: 'done',
    atAgoMonths: 9,
    reason: 'Προληπτικό check-up καρδιολογίας',
  },
];

// --------------------------------------------------------------------------
// 5. Authentic Greek Caregivers (Coordinates, Specialties, Ratings, Bios)
// --------------------------------------------------------------------------

export const GREEK_CAREGIVERS: GreekCaregiver[] = [
  {
    id: 'u-nurse',
    displayName: 'Elena Papadaki',
    roles: ['nurse'],
    rating: 4.9,
    distanceKm: 1.8,
    hourlyRate: 25,
    availableNow: true,
    specialties: [
      'Ενέσεις & Αιμοληψίες',
      'Φροντίδα τραυμάτων & κατακλίσεων',
      'Χορήγηση ορών (IV)',
      'Μετεγχειρητική παρακολούθηση',
      'Μέτρηση ζωτικών σημείων',
    ],
    lat: 37.9779,
    lng: 23.7436, // Kolonaki
    completedVisits: 184,
    recentCancellations: 0,
    bio: 'Πτυχιούχος Νοσηλευτικής ΕΚΠΑ με 10ετή εμπειρία στη Μονάδα Εντατικής Θεραπείας του ΓΝΑ «Ο Ευαγγελισμός». Εξειδίκευση στη διαχείριση χρόνιων ασθενών, κατ\' οίκον νοσηλεία και μετεγχειρητική φροντίδα.',
    languages: ['Greek', 'English'],
    gender: 'female',
  },
  {
    id: 'u-nurse-karras',
    displayName: 'Eleni Karras',
    roles: ['nurse'],
    rating: 4.85,
    distanceKm: 4.2,
    hourlyRate: 28,
    availableNow: true,
    specialties: [
      'Διαβητικό πόδι',
      'Ενδοφλέβια θεραπεία',
      'Καθετηριασμός κύστης',
      'Αιμοληψίες κατ οίκον',
      'Γεροντολογική νοσηλευτική',
    ],
    lat: 38.0742,
    lng: 23.8118, // Kifisia
    completedVisits: 142,
    recentCancellations: 1,
    bio: 'Νοσηλεύτρια ΠΕ με μεταπτυχιακό στη Γεροντολογία. 8 χρόνια προϋπηρεσίας στο Σισμανόγλειο Νοσοκομείο. Πιστοποιημένη στη φροντίδα στομιών και διαβητικού ποδιού.',
    languages: ['Greek', 'English', 'French'],
    gender: 'female',
  },
  {
    id: 'u-nurse-vasilis',
    displayName: 'Vasilis Christopoulos',
    roles: ['nurse'],
    rating: 4.78,
    distanceKm: 6.5,
    hourlyRate: 26,
    availableNow: false,
    specialties: [
      'Τραυματιολογία',
      'Ανακουφιστική φροντίδα',
      'Περιποίηση τραυμάτων',
      'Υποδόριες ενέσεις',
      'Διαχείριση πόνου',
    ],
    lat: 37.943,
    lng: 23.647, // Piraeus
    completedVisits: 98,
    recentCancellations: 0,
    bio: 'Απόφοιτος Νοσηλευτικής Πανεπιστημίου Δυτικής Αττικής με πολυετή θητεία στο Τζάνειο Νοσοκομείο Πειραιά. Εξειδικευμένος στην κατ\' οίκον αποκατάσταση και περιποίηση χειρουργικών τομών.',
    languages: ['Greek', 'English'],
    gender: 'male',
  },
  {
    id: 'u-physio',
    displayName: 'Anna Karakosta',
    roles: ['physio'],
    rating: 4.95,
    distanceKm: 3.1,
    hourlyRate: 30,
    availableNow: true,
    specialties: [
      'Ορθοπεδική αποκατάσταση',
      'Αρθροπλαστική ισχίου & γόνατος',
      'Κινησιοθεραπεία',
      'Χειροπρακτική',
      'Αναπνευστική φυσικοθεραπεία',
    ],
    lat: 38.021,
    lng: 23.798, // Chalandri
    completedVisits: 215,
    recentCancellations: 0,
    bio: 'Φυσικοθεραπεύτρια με εξειδίκευση στην μυοσκελετική και ορθοπεδική αποκατάσταση (Cert. OMT). 12 χρόνια κλινικής εμπειρίας στο ΓΝΑ ΚΑΤ και σε ιδιωτικά κέντρα αποκατάστασης.',
    languages: ['Greek', 'English'],
    gender: 'female',
  },
  {
    id: 'u-physio-dimitris',
    displayName: 'Dimitris Vlachos',
    roles: ['physio'],
    rating: 4.88,
    distanceKm: 5.0,
    hourlyRate: 35,
    availableNow: false,
    specialties: [
      'Νευρολογική αποκατάσταση (Bobath)',
      'Εγκεφαλικά επεισόδια (ΑΕΕ)',
      'Νόσος Parkinson',
      'Επανεκπαίδευση βάδισης',
      'Βελονισμός',
    ],
    lat: 38.056,
    lng: 23.808, // Marousi
    completedVisits: 167,
    recentCancellations: 0,
    bio: 'Φυσικοθεραπευτής MSc στη Νευρολογική Αποκατάσταση. Εξειδίκευση σε ασθενείς μετά από ισχαιμικό/αιμορραγικό εγκεφαλικό και κινητικές διαταραχές. Επίσημος θεραπευτής μεθόδου Bobath.',
    languages: ['Greek', 'English', 'German'],
    gender: 'male',
  },
  {
    id: 'u-nikos',
    displayName: 'Nikos Georgiou',
    roles: ['caregiver'],
    rating: 4.75,
    distanceKm: 2.5,
    hourlyRate: 15,
    availableNow: true,
    specialties: [
      'Βοήθεια στην ατομική υγιεινή',
      'Συνοδεία σε ιατρικά ραντεβού',
      'Προετοιμασία γευμάτων',
      'Υπενθύμιση φαρμάκων',
      'Νυχτερινή φύλαξη',
    ],
    lat: 37.995,
    lng: 23.725, // Kypseli / Athens
    completedVisits: 120,
    recentCancellations: 1,
    bio: 'Έμπειρος φροντιστής ηλικιωμένων με πιστοποίηση πρώτων βοηθειών από τον Ελληνικό Ερυθρό Σταυρό. 7 χρόνια συνεχούς παρουσίας δίπλα σε άτομα τρίτης ηλικίας με υπομονή και ενσυναίσθηση.',
    languages: ['Greek'],
    gender: 'male',
  },
  {
    id: 'u-caregiver-maria',
    displayName: 'Maria Spyropoulou',
    roles: ['caregiver'],
    rating: 4.92,
    distanceKm: 4.0,
    hourlyRate: 18,
    availableNow: true,
    specialties: [
      'Άνοια & Alzheimer',
      'Ψυχολογική υποστήριξη',
      'Κινητική υποβοήθηση',
      'Διαχείριση οικιακής φροντίδας',
      'Συντροφικότητα',
    ],
    lat: 37.8631,
    lng: 23.7547, // Glyfada
    completedVisits: 195,
    recentCancellations: 0,
    bio: 'Πιστοποιημένη βοηθός νοσηλευτή & συνοδός ηλικιωμένων με ειδική επιμόρφωση στην άνοια και νόσο Alzheimer. Αφοσιωμένη στην αξιοπρεπή και ζεστή καθημερινή φροντίδα.',
    languages: ['Greek', 'English'],
    gender: 'female',
  },
  {
    id: 'u-caregiver-kostas',
    displayName: 'Kostas Papantoniou',
    roles: ['caregiver'],
    rating: 4.7,
    distanceKm: 7.2,
    hourlyRate: 16,
    availableNow: false,
    specialties: [
      'Υποστήριξη κατάκοιτων ασθενών',
      'Αλλαγή πάνας & καθαριότητα',
      'Μετακίνηση & ασφαλής έγερση',
      'Ελαφριά γυμναστική',
      'Ψώνια & φάρμακα',
    ],
    lat: 37.943,
    lng: 23.647, // Piraeus
    completedVisits: 84,
    recentCancellations: 0,
    bio: 'Φροντιστής με εμπειρία σε άτομα με κινητικά προβλήματα και μετεγχειρητική κατάκλιση. Εκπαιδευμένος σε τεχνικές ασφαλούς ανύψωσης και πρόληψης πτώσεων.',
    languages: ['Greek'],
    gender: 'male',
  },
];

// --------------------------------------------------------------------------
// 6. 25 Authentic Greek Reviews & Corresponding Completed Bookings
// --------------------------------------------------------------------------

export const GREEK_REVIEWS: GreekReview[] = [
  // Elena Papadaki (u-nurse)
  {
    id: 'rv-1',
    caregiverId: 'u-nurse',
    bookingId: 'b-1',
    authorId: 'u-client',
    authorName: 'Maria Papadopoulou',
    rating: 5,
    comment: 'Άψογη φροντίδα, πολύ συνεπής.',
    status: 'published',
    agoDays: 8,
  },
  {
    id: 'rv-elena-2',
    caregiverId: 'u-nurse',
    bookingId: 'b-elena-2',
    authorId: 'u-giorgos',
    authorName: 'Giorgos Dimitriadis',
    rating: 5,
    comment: 'Η κα Παπαδάκη είναι εξαιρετική επαγγελματίας. Ήρθε στην ώρα της, πολύ ευγενική και έκανε την αιμοληψία εντελώς ανώδυνα. Την συνιστώ ανεπιφύλακτα!',
    status: 'published',
    agoDays: 12,
  },
  {
    id: 'rv-elena-3',
    caregiverId: 'u-nurse',
    bookingId: 'b-elena-3',
    authorId: 'u-sofia',
    authorName: 'Sofia Oikonomou',
    rating: 5,
    comment: 'Υποδειγματική περιποίηση του χειρουργικού τραύματος. Σχολαστική τήρηση των κανόνων αντισηψίας και άψογη επικοινωνία με τον θεράποντα ιατρό μας.',
    status: 'published',
    agoDays: 19,
  },
  {
    id: 'rv-elena-4',
    caregiverId: 'u-nurse',
    bookingId: 'b-elena-4',
    authorId: 'u-aikaterini',
    authorName: 'Aikaterini Alexiou',
    rating: 5,
    comment: 'Πολύ καταρτισμένη και υπομονετική νοσηλεύτρια. Μας εξήγησε τα πάντα για τη χορήγηση της υποδόριας αγωγής και μας γέμισε σιγουριά.',
    status: 'published',
    agoDays: 25,
  },

  // Eleni Karras (u-nurse-karras)
  {
    id: 'rv-karras-1',
    caregiverId: 'u-nurse-karras',
    bookingId: 'b-karras-1',
    authorId: 'u-giannis',
    authorName: 'Giannis Karagiannis',
    rating: 5,
    comment: 'Η Ελένη διαθέτει σπάνια πείρα στη φροντίδα διαβητικού ποδιού. Εντόπισε έγκαιρα αρχόμενη βλάβη και μας γλίτωσε από επιπλοκές. Εξαιρετική επιστήμονας!',
    status: 'published',
    agoDays: 7,
  },
  {
    id: 'rv-karras-2',
    caregiverId: 'u-nurse-karras',
    bookingId: 'b-karras-2',
    authorId: 'u-giorgos',
    authorName: 'Giorgos Dimitriadis',
    rating: 5,
    comment: 'Πολύ προσεκτική και υπεύθυνη στον καθετηριασμό. Ήρεμη, ανθρώπινη και απόλυτα επαγγελματίας. Νιώσαμε απόλυτη ασφάλεια.',
    status: 'published',
    agoDays: 15,
  },
  {
    id: 'rv-karras-3',
    caregiverId: 'u-nurse-karras',
    bookingId: 'b-karras-3',
    authorId: 'u-client',
    authorName: 'Maria Papadopoulou',
    rating: 4,
    comment: 'Συνεπέστατη στο ραντεβού της, γλυκύτατη με ηλικιωμένο άτομο, άριστη τεχνική στις ενδοφλέβιες εγχύσεις.',
    status: 'published',
    agoDays: 22,
  },

  // Vasilis Christopoulos (u-nurse-vasilis)
  {
    id: 'rv-vasilis-1',
    caregiverId: 'u-nurse-vasilis',
    bookingId: 'b-vasilis-1',
    authorId: 'u-sofia',
    authorName: 'Sofia Oikonomou',
    rating: 5,
    comment: 'Ο Βασίλης ήταν άψογος στην αλλαγή των επιδέσμων και τη φροντίδα κατάκλισης. Μας ενέπνευσε εμπιστοσύνη από το πρώτο λεπτό.',
    status: 'published',
    agoDays: 9,
  },
  {
    id: 'rv-vasilis-2',
    caregiverId: 'u-nurse-vasilis',
    bookingId: 'b-vasilis-2',
    authorId: 'u-giannis',
    authorName: 'Giannis Karagiannis',
    rating: 5,
    comment: 'Πολύ πρόθυμος, εξυπηρετικός και έμπειρος νοσηλευτής. Η επίσκεψη έγινε ακριβώς στην ώρα της χωρίς καμία καθυστέρηση.',
    status: 'published',
    agoDays: 17,
  },
  {
    id: 'rv-vasilis-3',
    caregiverId: 'u-nurse-vasilis',
    bookingId: 'b-vasilis-3',
    authorId: 'u-aikaterini',
    authorName: 'Aikaterini Alexiou',
    rating: 4,
    comment: 'Επαγγελματισμός υψηλού επιπέδου. Ήρεμη δύναμη, καταπληκτική προσέγγιση στον ασθενή.',
    status: 'published',
    agoDays: 31,
  },

  // Anna Karakosta (u-physio)
  {
    id: 'rv-anna-1',
    caregiverId: 'u-physio',
    bookingId: 'b-anna-1',
    authorId: 'u-client',
    authorName: 'Maria Papadopoulou',
    rating: 5,
    comment: 'Η κα Καρακώστα βοήθησε τον πατέρα μου να σταθεί ξανά στα πόδια του μετά την αρθροπλαστική ισχίου. Εξαιρετική επιστημονική κατάρτιση και απίστευτη υπομονή!',
    status: 'published',
    agoDays: 11,
  },
  {
    id: 'rv-anna-2',
    caregiverId: 'u-physio',
    bookingId: 'b-anna-2',
    authorId: 'u-aikaterini',
    authorName: 'Aikaterini Alexiou',
    rating: 5,
    comment: 'Σπουδαία φυσικοθεραπεύτρια! Η κινησιοθεραπεία για το γόνατό μου είχε θεαματικά αποτελέσματα μέσα σε δύο εβδομάδες.',
    status: 'published',
    agoDays: 14,
  },
  {
    id: 'rv-anna-3',
    caregiverId: 'u-physio',
    bookingId: 'b-anna-3',
    authorId: 'u-giorgos',
    authorName: 'Giorgos Dimitriadis',
    rating: 5,
    comment: 'Ανακουφίστηκα άμεσα από τη χρόνια οσφυαλγία χάρη στις εξειδικευμένες ασκήσεις και διατάσεις. Πολύ ευγενική και μεταδοτική.',
    status: 'published',
    agoDays: 28,
  },

  // Dimitris Vlachos (u-physio-dimitris)
  {
    id: 'rv-vlachos-1',
    caregiverId: 'u-physio-dimitris',
    bookingId: 'b-vlachos-1',
    authorId: 'u-giannis',
    authorName: 'Giannis Karagiannis',
    rating: 5,
    comment: 'Ο κ. Βλάχος είναι κορυφαίος στη νευρολογική αποκατάσταση. Μετά το ισχαιμικό επεισόδιο, η βελτίωση στη βάδιση και την ισορροπία ήταν εντυπωσιακή.',
    status: 'published',
    agoDays: 6,
  },
  {
    id: 'rv-vlachos-2',
    caregiverId: 'u-physio-dimitris',
    bookingId: 'b-vlachos-2',
    authorId: 'u-sofia',
    authorName: 'Sofia Oikonomou',
    rating: 5,
    comment: 'Μεθοδικός, συγκεντρωμένος και με βαθιά γνώση του αντικειμένου. Προσάρμοσε το ασκησιολόγιο ακριβώς στις αντοχές της μητέρας μου.',
    status: 'published',
    agoDays: 18,
  },
  {
    id: 'rv-vlachos-3',
    caregiverId: 'u-physio-dimitris',
    bookingId: 'b-vlachos-3',
    authorId: 'u-client',
    authorName: 'Maria Papadopoulou',
    rating: 4,
    comment: 'Εξαιρετικός θεραπευτής. Η επανεκπαίδευση βάδισης έγινε με ασφάλεια και απόλυτη ενθάρρυνση.',
    status: 'published',
    agoDays: 35,
  },

  // Nikos Georgiou (u-nikos)
  {
    id: 'rv-nikos-1',
    caregiverId: 'u-nikos',
    bookingId: 'b-nikos-1',
    authorId: 'u-giorgos',
    authorName: 'Giorgos Dimitriadis',
    rating: 5,
    comment: 'Ο Νίκος είναι πραγματικό στήριγμα για το σπίτι. Συνόδευσε τον πατέρα μου στο νοσοκομείο και περίμενε υπομονετικά επί ώρες. Χρυσός άνθρωπος.',
    status: 'published',
    agoDays: 5,
  },
  {
    id: 'rv-nikos-2',
    caregiverId: 'u-nikos',
    bookingId: 'b-nikos-2',
    authorId: 'u-aikaterini',
    authorName: 'Aikaterini Alexiou',
    rating: 4,
    comment: 'Πολύ αξιόπιστος φροντιστής, συνεπής στην ώρα του, βοήθησε στην ατομική υγιεινή με μεγάλο σεβασμό και λεπτότητα.',
    status: 'published',
    agoDays: 16,
  },
  {
    id: 'rv-nikos-3',
    caregiverId: 'u-nikos',
    bookingId: 'b-nikos-3',
    authorId: 'u-sofia',
    authorName: 'Sofia Oikonomou',
    rating: 5,
    comment: 'Ευγενικός, εργατικός και πολύ διακριτικός. Μας βοήθησε πάρα πολύ στις καθημερινές μετακινήσεις και στην οικιακή φροντίδα.',
    status: 'published',
    agoDays: 24,
  },

  // Maria Spyropoulou (u-caregiver-maria)
  {
    id: 'rv-c-maria-1',
    caregiverId: 'u-caregiver-maria',
    bookingId: 'b-c-maria-1',
    authorId: 'u-sofia',
    authorName: 'Sofia Oikonomou',
    rating: 5,
    comment: 'Η Μαρία είναι ένας άγγελος για τη μητέρα μας με άνοια. Έχει μοναδικό τρόπο να την ηρεμεί, να της τραγουδά και να της κρατά συντροφιά με χαμόγελο.',
    status: 'published',
    agoDays: 4,
  },
  {
    id: 'rv-c-maria-2',
    caregiverId: 'u-caregiver-maria',
    bookingId: 'b-c-maria-2',
    authorId: 'u-client',
    authorName: 'Maria Papadopoulou',
    rating: 5,
    comment: 'Αφοσιωμένη και ζεστή κοπέλα. Φρόντισε τη διατροφή και τα φάρμακα με απόλυτη τάξη και ακρίβεια. Νιώθουμε απόλυτη ασφάλεια μαζί της.',
    status: 'published',
    agoDays: 13,
  },
  {
    id: 'rv-c-maria-3',
    caregiverId: 'u-caregiver-maria',
    bookingId: 'b-c-maria-3',
    authorId: 'u-giannis',
    authorName: 'Giannis Karagiannis',
    rating: 5,
    comment: 'Καταπληκτική παρουσία. Ευγενική, καθαρή, πρόθυμη να βοηθήσει σε οτιδήποτε προέκυπτε.',
    status: 'published',
    agoDays: 27,
  },

  // Kostas Papantoniou (u-caregiver-kostas)
  {
    id: 'rv-kostas-1',
    caregiverId: 'u-caregiver-kostas',
    bookingId: 'b-kostas-1',
    authorId: 'u-giorgos',
    authorName: 'Giorgos Dimitriadis',
    rating: 5,
    comment: 'Ο Κώστας διαθέτει εξαιρετική δύναμη και σωστές τεχνικές για την ασφαλή μετακίνηση κατάκοιτου ασθενούς. Απέτρεψε πτώσεις και μας έμαθε πώς να βοηθάμε.',
    status: 'published',
    agoDays: 10,
  },
  {
    id: 'rv-kostas-2',
    caregiverId: 'u-caregiver-kostas',
    bookingId: 'b-kostas-2',
    authorId: 'u-giannis',
    authorName: 'Giannis Karagiannis',
    rating: 4,
    comment: 'Πολύ καλός επαγγελματίας, πρόθυμος και προσεκτικός. Η βοήθειά του στην πρωινή έγερση και καθαριότητα ήταν ανεκτίμητη.',
    status: 'published',
    agoDays: 21,
  },
  {
    id: 'rv-kostas-3',
    caregiverId: 'u-caregiver-kostas',
    bookingId: 'b-kostas-3',
    authorId: 'u-aikaterini',
    authorName: 'Aikaterini Alexiou',
    rating: 5,
    comment: 'Συνεπέστατος, ευγενικός και πολύ προσεκτικός στη φροντίδα. Τον ευχαριστούμε θερμά για τη στήριξη.',
    status: 'published',
    agoDays: 33,
  },
];

// --------------------------------------------------------------------------
// 7. Authentic Greek Partner Pharmacies (Athens, Syntagma, Kolonaki, Kifisia, Glyfada, Piraeus)
// --------------------------------------------------------------------------

export const GREEK_PARTNER_PHARMACIES: GreekPartnerPharmacy[] = [
  {
    id: 'ph-1',
    name: 'Φαρμακείο Συντάγματος - Παναγιώτης Ράπτης',
    address: 'Πλατεία Συντάγματος 1, Αθήνα 10563',
    lat: 37.9755,
    lng: 23.7348,
    inStock: true,
    phone: '210 3221100',
    workingHours: 'Δευτέρα - Παρασκευή: 08:00 - 21:00, Σάββατο: 08:30 - 20:00',
    stockItems: [
      { name: 'Augmentin 875/125mg', eof: '23412.01.01', qty: 45, priceEur: 7.2 },
      { name: 'Salospir 100mg', eof: '02319.01.01', qty: 120, priceEur: 2.1 },
      { name: 'Glucophage 850mg', eof: '14820.02.01', qty: 85, priceEur: 3.4 },
      { name: 'Lipitor 20mg', eof: '21903.01.02', qty: 60, priceEur: 12.8 },
      { name: 'Nexium 40mg', eof: '23984.01.02', qty: 40, priceEur: 9.5 },
      { name: 'Aerolin Inhaler', eof: '09812.01.01', qty: 30, priceEur: 3.8 },
      { name: 'Lantus Solostar', eof: '22870.01.01', qty: 25, priceEur: 42.5 },
    ],
  },
  {
    id: 'ph-2',
    name: 'Φαρμακείο Κολωνακίου - Δέσποινα Νικολάου',
    address: 'Σκουφά 12, Κολωνάκι 10673',
    lat: 37.9779,
    lng: 23.7436,
    inStock: true,
    phone: '210 3632200',
    workingHours: 'Δευτέρα - Σάββατο: 08:00 - 21:30',
    stockItems: [
      { name: 'Augmentin 875/125mg', eof: '23412.01.01', qty: 30, priceEur: 7.2 },
      { name: 'Salospir 100mg', eof: '02319.01.01', qty: 90, priceEur: 2.1 },
      { name: 'T4 100mcg', eof: '11204.01.03', qty: 75, priceEur: 2.8 },
      { name: 'Norvasc 5mg', eof: '19502.01.01', qty: 55, priceEur: 4.9 },
      { name: 'Januvia 100mg', eof: '25120.01.01', qty: 35, priceEur: 31.2 },
      { name: 'Xanax 0.5mg', eof: '13401.02.01', qty: 40, priceEur: 3.1 },
    ],
  },
  {
    id: 'ph-3',
    name: 'Φαρμακείο Πατησίων (Εκτός αποθέματος)',
    address: '28ης Οκτωβρίου (Πατησίων) 100, Αθήνα 10434',
    lat: 37.9908,
    lng: 23.7311,
    inStock: false,
    phone: '210 8214500',
    workingHours: 'Δευτέρα - Παρασκευή: 08:30 - 14:30 & 17:30 - 20:30',
    stockItems: [],
  },
  {
    id: 'ph-kifisia',
    name: 'Φαρμακείο Κηφισιάς - Γεώργιος Βασιλείου',
    address: 'Λεωφόρος Κηφισίας 260, Κηφισιά 14562',
    lat: 38.0742,
    lng: 23.8118,
    inStock: true,
    phone: '210 8080120',
    workingHours: 'Δευτέρα - Σάββατο: 08:00 - 22:00, Διανυκτερεύον εκ περιτροπής',
    stockItems: [
      { name: 'Spiriva Respimat', eof: '24561.01.01', qty: 20, priceEur: 38.9 },
      { name: 'Lantus Solostar', eof: '22870.01.01', qty: 35, priceEur: 42.5 },
      { name: 'Triatec 5mg', eof: '17890.01.02', qty: 50, priceEur: 5.6 },
      { name: 'Lasix 40mg', eof: '06712.01.01', qty: 65, priceEur: 2.3 },
      { name: 'Sintrom 4mg', eof: '05432.01.01', qty: 40, priceEur: 2.5 },
      { name: 'Zoxil 500mg', eof: '18245.01.01', qty: 45, priceEur: 6.8 },
    ],
  },
  {
    id: 'ph-glyfada',
    name: 'Φαρμακείο Γλυφάδας - Αικατερίνη Σταματοπούλου',
    address: 'Λεωφόρος Ποσειδώνος 85 & Μεταξά, Γλυφάδα 16674',
    lat: 37.8631,
    lng: 23.7547,
    inStock: true,
    phone: '210 8945600',
    workingHours: '24ωρο συνεχές ωράριο (Διανυκτερεύον 365 ημέρες)',
    stockItems: [
      { name: 'Augmentin 875/125mg', eof: '23412.01.01', qty: 60, priceEur: 7.2 },
      { name: 'Salospir 100mg', eof: '02319.01.01', qty: 150, priceEur: 2.1 },
      { name: 'Lipitor 20mg', eof: '21903.01.02', qty: 80, priceEur: 12.8 },
      { name: 'Glucophage 850mg', eof: '14820.02.01', qty: 110, priceEur: 3.4 },
      { name: 'Aerolin Inhaler', eof: '09812.01.01', qty: 50, priceEur: 3.8 },
      { name: 'Plavix 75mg', eof: '22105.01.01', qty: 40, priceEur: 18.5 },
      { name: 'Eliquis 5mg', eof: '27891.01.02', qty: 30, priceEur: 54.2 },
    ],
  },
  {
    id: 'ph-piraeus',
    name: 'Φαρμακείο Πειραιά - Δημήτριος Αντωνίου',
    address: 'Ηρώων Πολυτεχνείου 42, Πειραιάς 18535',
    lat: 37.943,
    lng: 23.647,
    inStock: true,
    phone: '210 4178900',
    workingHours: 'Δευτέρα - Παρασκευή: 08:00 - 21:00, Σάββατο: 08:30 - 15:00',
    stockItems: [
      { name: 'Salospir 100mg', eof: '02319.01.01', qty: 100, priceEur: 2.1 },
      { name: 'Sintrom 4mg', eof: '05432.01.01', qty: 55, priceEur: 2.5 },
      { name: 'Norvasc 5mg', eof: '19502.01.01', qty: 70, priceEur: 4.9 },
      { name: 'T4 100mcg', eof: '11204.01.03', qty: 90, priceEur: 2.8 },
      { name: 'Nexium 40mg', eof: '23984.01.02', qty: 50, priceEur: 9.5 },
      { name: 'Xarelto 20mg', eof: '26901.01.03', qty: 30, priceEur: 52.8 },
    ],
  },
  {
    id: 'ph-marousi',
    name: 'Φαρμακείο Αμαρουσίου - Ελένη Μανωλοπούλου',
    address: 'Βασιλίσσης Σοφίας 24, Μαρούσι 15124',
    lat: 38.056,
    lng: 23.808,
    inStock: true,
    phone: '210 6123400',
    workingHours: 'Δευτέρα - Παρασκευή: 08:00 - 21:00, Σάββατο: 08:30 - 20:00',
    stockItems: [
      { name: 'Augmentin 875/125mg', eof: '23412.01.01', qty: 35, priceEur: 7.2 },
      { name: 'Glucophage 850mg', eof: '14820.02.01', qty: 70, priceEur: 3.4 },
      { name: 'Lipitor 20mg', eof: '21903.01.02', qty: 50, priceEur: 12.8 },
      { name: 'Triatec 5mg', eof: '17890.01.02', qty: 45, priceEur: 5.6 },
      { name: 'Lasix 40mg', eof: '06712.01.01', qty: 60, priceEur: 2.3 },
    ],
  },
];

// --------------------------------------------------------------------------
// 8. Official Greek Government (Gov.gr) SVG Document Generator
// --------------------------------------------------------------------------

export function generateGovGrDocumentSvg(params: {
  category: 'vaccinations' | 'prescriptions' | 'exams' | 'kepa_certificates';
  title: string;
  docNumber: string;
  recipientName: string;
  recipientAmka: string;
  issueDateStr: string;
  detailRows: Array<{ label: string; value: string }>;
  kepaPercentage?: number;
  barcode12?: string;
  verificationCode: string;
}): string {
  const {
    category,
    title,
    docNumber,
    recipientName,
    recipientAmka,
    issueDateStr,
    detailRows,
    kepaPercentage,
    barcode12,
    verificationCode,
  } = params;

  let categoryBadge = 'ΕΠΙΣΗΜΟ ΨΗΦΙΑΚΟ ΕΓΓΡΑΦΟ';
  let bannerColor = '#0c3875'; // Hellenic Blue
  if (category === 'kepa_certificates') {
    categoryBadge = 'ΚΕΝΤΡΟ ΠΙΣΤΟΠΟΙΗΣΗΣ ΑΝΑΠΗΡΙΑΣ (ΚΕ.Π.Α.)';
    bannerColor = '#003366';
  } else if (category === 'prescriptions') {
    categoryBadge = 'ΗΛΕΚΤΡΟΝΙΚΗ ΣΥΝΤΑΓΟΓΡΑΦΗΣΗ (ΗΔΙΚΑ)';
    bannerColor = '#1351b4';
  } else if (category === 'vaccinations') {
    categoryBadge = 'ΕΘΝΙΚΟ ΜΗΤΡΩΟ ΕΜΒΟΛΙΑΣΜΩΝ';
    bannerColor = '#0055a5';
  } else if (category === 'exams') {
    categoryBadge = 'ΕΘΝΙΚΟ ΔΙΚΤΥΟ ΕΡΓΑΣΤΗΡΙΩΝ ΥΓΕΙΑΣ';
    bannerColor = '#0e417a';
  }

  const rowsSvg = detailRows
    .slice(0, 4)
    .map(
      (r, idx) => `
      <g transform="translate(40, ${250 + idx * 36})">
        <rect x="0" y="0" width="560" height="30" fill="${idx % 2 === 0 ? '#f0f4f9' : '#ffffff'}" rx="4"/>
        <text x="12" y="20" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" font-weight="bold" fill="#333333">${r.label}:</text>
        <text x="210" y="20" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#111111">${r.value}</text>
      </g>`
    )
    .join('');

  let extraBlockSvg = '';
  if (category === 'kepa_certificates' && kepaPercentage) {
    extraBlockSvg = `
      <g transform="translate(40, 400)">
        <rect width="560" height="75" fill="#eaf7ed" stroke="#2e7d32" stroke-width="2" rx="8"/>
        <text x="280" y="32" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="bold" fill="#1b5e20" text-anchor="middle">
          ΣΥΝΟΛΙΚΟ ΠΟΣΟΣΤΟ ΑΝΑΠΗΡΙΑΣ: ${kepaPercentage}%
        </text>
        <text x="280" y="58" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="bold" fill="#2e7d32" text-anchor="middle">
          ΔΙΑΡΚΕΙΑ: ΕΦ' ΟΡΟΥ ΖΩΗΣ • ΑΠΟΦΑΣΗ ΥΓΕΙΟΝΟΜΙΚΗΣ ΕΠΙΤΡΟΠΗΣ
        </text>
      </g>`;
  } else if (category === 'prescriptions' && barcode12) {
    extraBlockSvg = `
      <g transform="translate(40, 400)">
        <rect width="560" height="75" fill="#f8f9fa" stroke="#0c3875" stroke-width="1.5" rx="8"/>
        <text x="280" y="24" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" font-weight="bold" fill="#555555" text-anchor="middle">
          ΓΡΑΜΜΩΤΟΣ ΚΩΔΙΚΑΣ ΣΥΝΤΑΓΗΣ (BARCODE)
        </text>
        <!-- Barcode Lines visualization -->
        <g transform="translate(180, 32)">
          <rect x="0" y="0" width="3" height="24" fill="#000"/>
          <rect x="6" y="0" width="2" height="24" fill="#000"/>
          <rect x="12" y="0" width="4" height="24" fill="#000"/>
          <rect x="20" y="0" width="1" height="24" fill="#000"/>
          <rect x="25" y="0" width="3" height="24" fill="#000"/>
          <rect x="32" y="0" width="2" height="24" fill="#000"/>
          <rect x="38" y="0" width="5" height="24" fill="#000"/>
          <rect x="47" y="0" width="2" height="24" fill="#000"/>
          <rect x="53" y="0" width="3" height="24" fill="#000"/>
          <rect x="60" y="0" width="1" height="24" fill="#000"/>
          <rect x="65" y="0" width="4" height="24" fill="#000"/>
          <rect x="73" y="0" width="2" height="24" fill="#000"/>
          <rect x="79" y="0" width="3" height="24" fill="#000"/>
          <rect x="86" y="0" width="2" height="24" fill="#000"/>
          <rect x="92" y="0" width="5" height="24" fill="#000"/>
          <rect x="101" y="0" width="2" height="24" fill="#000"/>
          <rect x="107" y="0" width="4" height="24" fill="#000"/>
          <rect x="115" y="0" width="1" height="24" fill="#000"/>
          <rect x="120" y="0" width="3" height="24" fill="#000"/>
          <rect x="127" y="0" width="3" height="24" fill="#000"/>
          <rect x="134" y="0" width="2" height="24" fill="#000"/>
          <rect x="140" y="0" width="4" height="24" fill="#000"/>
          <rect x="148" y="0" width="2" height="24" fill="#000"/>
          <rect x="154" y="0" width="4" height="24" fill="#000"/>
          <rect x="162" y="0" width="2" height="24" fill="#000"/>
          <rect x="168" y="0" width="3" height="24" fill="#000"/>
          <rect x="175" y="0" width="2" height="24" fill="#000"/>
          <rect x="181" y="0" width="4" height="24" fill="#000"/>
          <rect x="189" y="0" width="3" height="24" fill="#000"/>
          <rect x="196" y="0" width="2" height="24" fill="#000"/>
        </g>
        <text x="280" y="68" font-family="Courier New, monospace" font-size="14" font-weight="bold" fill="#000000" text-anchor="middle" letter-spacing="4">
          ${barcode12}
        </text>
      </g>`;
  } else {
    extraBlockSvg = `
      <g transform="translate(40, 400)">
        <rect width="560" height="75" fill="#f0f7ff" stroke="#0c3875" stroke-width="1.5" rx="8"/>
        <text x="280" y="32" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold" fill="#0c3875" text-anchor="middle">
          ΨΗΦΙΑΚΑ ΥΠΟΓΕΓΡΑΜΜΕΝΟ ΑΠΟ ΤΟ ΕΛΛΗΝΙΚΟ ΔΗΜΟΣΙΟ
        </text>
        <text x="280" y="56" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#333333" text-anchor="middle">
          Κωδικός Επαλήθευσης: ${verificationCode} • Έγκυρο μέσω gov.gr
        </text>
      </g>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 560" width="640" height="560">
    <defs>
      <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bannerColor}"/>
        <stop offset="100%" stop-color="#051c3d"/>
      </linearGradient>
      <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.15"/>
      </filter>
    </defs>

    <!-- Document Background -->
    <rect width="640" height="560" fill="#ffffff" stroke="#d0d7de" stroke-width="1"/>
    <rect x="8" y="8" width="624" height="544" fill="#ffffff" stroke="#e1e4e8" stroke-width="1" rx="4"/>

    <!-- Header Banner -->
    <rect x="8" y="8" width="624" height="110" fill="url(#headerGrad)" rx="4"/>

    <!-- Hellenic Republic Coat of Arms (Stylized Emblem) -->
    <g transform="translate(30, 26)">
      <!-- Blue Shield -->
      <path d="M0,0 L44,0 C44,28 32,54 22,60 C12,54 0,28 0,0 Z" fill="#ffffff"/>
      <path d="M3,3 L41,3 C41,26 30,49 22,55 C14,49 3,26 3,3 Z" fill="#003399"/>
      <!-- White Cross -->
      <rect x="18" y="10" width="8" height="34" fill="#ffffff"/>
      <rect x="9" y="21" width="26" height="8" fill="#ffffff"/>
    </g>

    <!-- Header Texts -->
    <text x="92" y="44" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="bold" fill="#ffffff" letter-spacing="1">
      ΕΛΛΗΝΙΚΗ ΔΗΜΟΚΡΑΤΙΑ
    </text>
    <text x="92" y="66" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="bold" fill="#a5c8ff">
      gov.gr • ${categoryBadge}
    </text>
    <text x="92" y="86" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" fill="#e0e8f5">
      Αρ. Εγγράφου: ${docNumber} • Ημερομηνία: ${issueDateStr}
    </text>

    <!-- Document Title Section -->
    <g transform="translate(40, 136)">
      <rect width="560" height="42" fill="#f6f8fa" rx="6" stroke="#e1e4e8"/>
      <text x="280" y="26" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold" fill="#0c3875" text-anchor="middle">
        ${title}
      </text>
    </g>

    <!-- Beneficiary Details Header -->
    <g transform="translate(40, 192)">
      <text x="0" y="18" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="bold" fill="#1f2328">
        Στοιχεία Δικαιούχου: <tspan fill="#0c3875">${recipientName}</tspan>
      </text>
      <text x="350" y="18" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="bold" fill="#1f2328">
        ΑΜΚΑ: <tspan fill="#0c3875">${recipientAmka}</tspan>
      </text>
      <line x1="0" y1="28" x2="560" y2="28" stroke="#d0d7de" stroke-width="1"/>
    </g>

    <!-- Detail Rows -->
    ${rowsSvg}

    <!-- Category-specific Extra Block (KEPA Badge or Barcode) -->
    ${extraBlockSvg}

    <!-- Official Footer -->
    <g transform="translate(40, 500)">
      <line x1="0" y1="0" x2="560" y2="0" stroke="#e1e4e8" stroke-width="1"/>
      <text x="0" y="20" font-family="DejaVu Sans, Arial, sans-serif" font-size="10" fill="#656d76">
        Έκδοση από την Ενιαία Ψηφιακή Πύλη της Δημόσιας Διοίκησης (gov.gr)
      </text>
      <text x="560" y="20" font-family="Courier New, monospace" font-size="10" font-weight="bold" fill="#0c3875" text-anchor="end">
        VERIFIED • ${verificationCode}
      </text>
    </g>
  </svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// --------------------------------------------------------------------------
// 9. Authentic Gov.gr Health Wallet Documents (Vaccinations, Prescriptions, Exams, KEPA)
// --------------------------------------------------------------------------

export const GREEK_WALLET_DOCUMENTS: GreekWalletDoc[] = [
  // 1. Maria Papadopoulou: Flu Vaccination 2025 (Preserved wd-1 for demo compatibility)
  {
    id: 'wd-1',
    userId: 'u-client',
    category: 'vaccinations',
    title: 'Εμβόλιο γρίπης 2025',
    issuer: 'Gov.gr / Εθνικό Μητρώο Εμβολιασμών',
    issuedAgoDays: 200,
    expiresInDays: 165,
    docType: 'image',
    dataUrl: generateGovGrDocumentSvg({
      category: 'vaccinations',
      title: 'ΒΕΒΑΙΩΣΗ ΕΜΒΟΛΙΑΣΜΟΥ ΚΑΤΑ ΤΗΣ ΕΠΟΧΙΚΗΣ ΓΡΙΠΗΣ',
      docNumber: 'VACC-2024-GR-901824',
      recipientName: 'Μαρία Παπαδοπούλου',
      recipientAmka: '14036801234',
      issueDateStr: '15/10/2024',
      detailRows: [
        { label: 'Εμβόλιο', value: 'Vaxigrip Tetra (Τετραδύναμο αδρανοποιημένο)' },
        { label: 'Αριθμός Παρτίδας (LOT)', value: 'LOT-GR89201A' },
        { label: 'Εμβολιαστικό Κέντρο', value: '1ο Κέντρο Υγείας Αθηνών (Αλεξάνδρας)' },
        { label: 'Εμβολιαστής Ιατρός', value: 'Δρ. Νικόλαος Σακελλαρίου' },
      ],
      verificationCode: 'A9B2-74F1-88CE',
    }),
    verified: true,
  },

  // 2. Maria Papadopoulou: KEPA Certificate (Preserved wd-2 for demo compatibility)
  {
    id: 'wd-2',
    userId: 'u-client',
    category: 'kepa_certificates',
    title: 'Πιστοποιητικό ΚΕΠΑ (67% Αναπηρία)',
    issuer: 'Gov.gr / Κέντρο Πιστοποίησης Αναπηρίας (ΚΕ.Π.Α.)',
    issuedAgoDays: 400,
    expiresInDays: null,
    docType: 'image',
    dataUrl: generateGovGrDocumentSvg({
      category: 'kepa_certificates',
      title: 'ΓΝΩΣΤΟΠΟΙΗΣΗ ΑΠΟΤΕΛΕΣΜΑΤΟΣ ΠΙΣΤΟΠΟΙΗΣΗΣ ΑΝΑΠΗΡΙΑΣ',
      docNumber: 'ΚΕΠΑ-2023-891204',
      recipientName: 'Μαρία Παπαδοπούλου',
      recipientAmka: '14036801234',
      issueDateStr: '12/08/2023',
      kepaPercentage: 67,
      detailRows: [
        { label: 'Υγειονομική Επιτροπή', value: 'Α/θμια Υγειονομική Επιτροπή Αθηνών' },
        { label: 'Κύρια Πάθηση', value: 'Χρόνια ισχαιμική καρδιοπάθεια & υπέρταση' },
        { label: 'Αρ. Απόφασης', value: 'ΑΠ-2023/89124-ΚΕΠΑ' },
        { label: 'Διάρκεια Ισχύος', value: 'Εφ\' όρου ζωής (Χωρίς επανεξέταση)' },
      ],
      verificationCode: 'KEPA-67-LIFETIME',
    }),
    verified: true,
  },

  // 3. Maria Papadopoulou: e-Prescription with 12-digit barcode
  {
    id: 'wd-rx-maria',
    userId: 'u-client',
    category: 'prescriptions',
    title: 'Ηλεκτρονική Συνταγή ΗΔΙΚΑ - 250491823901',
    issuer: 'ΗΔΙΚΑ / Υπουργείο Υγείας',
    issuedAgoDays: 15,
    expiresInDays: 45,
    docType: 'image',
    dataUrl: generateGovGrDocumentSvg({
      category: 'prescriptions',
      title: 'ΗΛΕΚΤΡΟΝΙΚΗ ΣΥΝΤΑΓΟΓΡΑΦΗΣΗ ΦΑΡΜΑΚΩΝ',
      docNumber: 'RX-2025-250491823901',
      recipientName: 'Μαρία Παπαδοπούλου',
      recipientAmka: '14036801234',
      issueDateStr: '01/03/2025',
      barcode12: '250491823901',
      detailRows: [
        { label: 'Φάρμακο 1', value: 'Atorvastatin 20mg • 3 κουτιά (90 ημέρες)' },
        { label: 'Φάρμακο 2', value: 'Norvasc 5mg • 3 κουτιά (90 ημέρες)' },
        { label: 'Διάγνωση (ICD-10)', value: 'I10 - Ιδιοπαθής υπέρταση' },
        { label: 'Συνταγογράφος', value: 'Δρ. Δημήτριος Σταύρου (Καρδιολόγος)' },
      ],
      verificationCode: 'HDIKA-250491823901',
    }),
    verified: true,
  },

  // 4. Maria Papadopoulou: Blood Exams
  {
    id: 'wd-exam-maria',
    userId: 'u-client',
    category: 'exams',
    title: 'Αιματολογικός & Βιοχημικός Έλεγχος - ΓΝΑ Ευαγγελισμός',
    issuer: 'Gov.gr / Εθνικό Δίκτυο Εργαστηρίων',
    issuedAgoDays: 45,
    expiresInDays: null,
    docType: 'image',
    dataUrl: generateGovGrDocumentSvg({
      category: 'exams',
      title: 'ΕΡΓΑΣΤΗΡΙΑΚΟΣ ΕΛΕΓΧΟΣ ΒΙΟΠΑΘΟΛΟΓΙΑΣ',
      docNumber: 'LAB-2025-EVANG-78210',
      recipientName: 'Μαρία Παπαδοπούλου',
      recipientAmka: '14036801234',
      issueDateStr: '30/01/2025',
      detailRows: [
        { label: 'Γλυκόζη νηστείας', value: '98 mg/dL (Φυσιολογικό: 70 - 105)' },
        { label: 'HbA1c (Γλυκοζυλιωμένη)', value: '6.4% (Στόχος < 7.0%)' },
        { label: 'Ολική Χοληστερόλη', value: '168 mg/dL • LDL: 88 mg/dL' },
        { label: 'Κρεατινίνη ορού', value: '0.85 mg/dL • eGFR: 84 mL/min' },
      ],
      verificationCode: 'LAB-EVANG-78210',
    }),
    verified: true,
  },

  // 5. Giorgos Dimitriadis: COVID-19 Certificate
  {
    id: 'wd-vacc-giorgos',
    userId: 'u-giorgos',
    category: 'vaccinations',
    title: 'Πιστοποιητικό Εμβολιασμού COVID-19',
    issuer: 'Gov.gr / Εθνικό Μητρώο Εμβολιασμών',
    issuedAgoDays: 240,
    expiresInDays: null,
    docType: 'image',
    dataUrl: generateGovGrDocumentSvg({
      category: 'vaccinations',
      title: 'ΠΙΣΤΟΠΟΙΗΤΙΚΟ ΕΜΒΟΛΙΑΣΜΟΥ COVID-19 (COMIRNATY JN.1)',
      docNumber: 'COVID-2024-GR-781290',
      recipientName: 'Γεώργιος Δημητριάδης',
      recipientAmka: '22075502345',
      issueDateStr: '18/07/2024',
      detailRows: [
        { label: 'Εμβόλιο', value: 'Comirnaty Omicron JN.1 (BioNTech/Pfizer)' },
        { label: 'Δόση', value: '5η αναμνηστική δόση ενηλίκων' },
        { label: 'Εμβολιαστικό Κέντρο', value: 'Κέντρο Υγείας Αμαρουσίου' },
        { label: 'Αρ. Παρτίδας', value: 'LOT-PF78921B' },
      ],
      verificationCode: 'COV-JN1-GR-781',
    }),
    verified: true,
  },

  // 6. Giorgos Dimitriadis: e-Prescription with 12-digit barcode
  {
    id: 'wd-rx-giorgos',
    userId: 'u-giorgos',
    category: 'prescriptions',
    title: 'Ηλεκτρονική Συνταγή ΗΔΙΚΑ - 281920394812',
    issuer: 'ΗΔΙΚΑ / Υπουργείο Υγείας',
    issuedAgoDays: 20,
    expiresInDays: 40,
    docType: 'image',
    dataUrl: generateGovGrDocumentSvg({
      category: 'prescriptions',
      title: 'ΗΛΕΚΤΡΟΝΙΚΗ ΣΥΝΤΑΓΟΓΡΑΦΗΣΗ ΦΑΡΜΑΚΩΝ',
      docNumber: 'RX-2025-281920394812',
      recipientName: 'Γεώργιος Δημητριάδης',
      recipientAmka: '22075502345',
      issueDateStr: '24/02/2025',
      barcode12: '281920394812',
      detailRows: [
        { label: 'Φάρμακο 1', value: 'Sintrom 4mg • 2 κουτιά (60 ημέρες)' },
        { label: 'Φάρμακο 2', value: 'Triatec 5mg • 3 κουτιά (90 ημέρες)' },
        { label: 'Διάγνωση (ICD-10)', value: 'I48 - Κολπική μαρμαρυγή και πτερυγισμός' },
        { label: 'Συνταγογράφος', value: 'Δρ. Δημήτριος Σταύρου (Καρδιολόγος)' },
      ],
      verificationCode: 'HDIKA-281920394812',
    }),
    verified: true,
  },

  // 7. Giannis Karagiannis: KEPA Certificate (80% disability)
  {
    id: 'wd-kepa-giannis',
    userId: 'u-giannis',
    category: 'kepa_certificates',
    title: 'Γνωστοποίηση Πιστοποίησης Αναπηρίας ΚΕΠΑ 80%',
    issuer: 'Gov.gr / Κέντρο Πιστοποίησης Αναπηρίας (ΚΕ.Π.Α.)',
    issuedAgoDays: 300,
    expiresInDays: null,
    docType: 'image',
    dataUrl: generateGovGrDocumentSvg({
      category: 'kepa_certificates',
      title: 'ΓΝΩΣΤΟΠΟΙΗΣΗ ΑΠΟΤΕΛΕΣΜΑΤΟΣ ΠΙΣΤΟΠΟΙΗΣΗΣ ΑΝΑΠΗΡΙΑΣ',
      docNumber: 'ΚΕΠΑ-2024-918234',
      recipientName: 'Ιωάννης Καραγιάννης',
      recipientAmka: '05045004567',
      issueDateStr: '20/05/2024',
      kepaPercentage: 80,
      detailRows: [
        { label: 'Υγειονομική Επιτροπή', value: 'Β/θμια Υγειονομική Επιτροπή Αθηνών' },
        { label: 'Κύρια Πάθηση', value: 'Χρόνια αποφρακτική πνευμονοπάθεια & ΣΔ2' },
        { label: 'Αρ. Απόφασης', value: 'ΑΠ-2024/91823-ΚΕΠΑ' },
        { label: 'Διάρκεια Ισχύος', value: 'Εφ\' όρου ζωής (Οριστική πιστοποίηση)' },
      ],
      verificationCode: 'KEPA-80-LIFETIME',
    }),
    verified: true,
  },

  // 8. Sofia Oikonomou: Digital Mammography
  {
    id: 'wd-exam-sofia',
    userId: 'u-sofia',
    category: 'exams',
    title: 'Ψηφιακή Μαστογραφία - Πρόγραμμα Φώφη Γεννηματά',
    issuer: 'Gov.gr / Πρόγραμμα Φώφη Γεννηματά',
    issuedAgoDays: 450,
    expiresInDays: null,
    docType: 'image',
    dataUrl: generateGovGrDocumentSvg({
      category: 'exams',
      title: 'ΠΟΡΙΣΜΑ ΨΗΦΙΑΚΗΣ ΜΑΣΤΟΓΡΑΦΙΑΣ',
      docNumber: 'MAMMO-2023-FOFI-45129',
      recipientName: 'Σοφία Οικονόμου',
      recipientAmka: '18096203456',
      issueDateStr: '20/12/2023',
      detailRows: [
        { label: 'Διαγνωστικό Κέντρο', value: 'Διαγνωστικό Κέντρο Πειραιά' },
        { label: 'Κατάταξη ACR / BIRADS', value: 'BIRADS 1 (Αρνητικό εύρημα)' },
        { label: 'Πυκνότητα Μαστών', value: 'Τύπος B (Διάσπαρτες ινωδοαδενικές πυκνότητες)' },
        { label: 'Σύσταση', value: 'Τακτικός έλεγχος ανά διετία' },
      ],
      verificationCode: 'FOFI-MAMMO-45129',
    }),
    verified: true,
  },

  // 9. Giorgos Dimitriadis: Heart Triplex
  {
    id: 'wd-exam-giorgos',
    userId: 'u-giorgos',
    category: 'exams',
    title: 'Υπερηχοκαρδιογράφημα Triplex - Ωνάσειο',
    issuer: 'Gov.gr / Ωνάσειο Καρδιοχειρουργικό Κέντρο',
    issuedAgoDays: 120,
    expiresInDays: null,
    docType: 'image',
    dataUrl: generateGovGrDocumentSvg({
      category: 'exams',
      title: 'ΥΠΕΡΗΧΟΚΑΡΔΙΟΓΡΑΦΙΚΗ ΜΕΛΕΤΗ (TRIPLEX)',
      docNumber: 'ECHO-2024-ONAS-89214',
      recipientName: 'Γεώργιος Δημητριάδης',
      recipientAmka: '22075502345',
      issueDateStr: '15/11/2024',
      detailRows: [
        { label: 'Κλάσμα Εξώθησης (LVEF)', value: '55% (Διατηρημένη συστολική λειτουργία)' },
        { label: 'Αριστερός Κόλπος', value: 'Ήπια διάταση (LAD: 44mm)' },
        { label: 'Αορτική Βαλβίδα', value: 'Τρίπτυχη, χωρίς σημαντική στένωση' },
        { label: 'Συμπέρασμα', value: 'Αιμοδυναμικά σταθερή εικόνα υπό αγωγή' },
      ],
      verificationCode: 'ONAS-ECHO-89214',
    }),
    verified: true,
  },

  // 10. Aikaterini Alexiou: e-Prescription with 12-digit barcode
  {
    id: 'wd-rx-aikaterini',
    userId: 'u-aikaterini',
    category: 'prescriptions',
    title: 'Ηλεκτρονική Συνταγή ΗΔΙΚΑ - 390182471925',
    issuer: 'ΗΔΙΚΑ / Υπουργείο Υγείας',
    issuedAgoDays: 10,
    expiresInDays: 50,
    docType: 'image',
    dataUrl: generateGovGrDocumentSvg({
      category: 'prescriptions',
      title: 'ΗΛΕΚΤΡΟΝΙΚΗ ΣΥΝΤΑΓΟΓΡΑΦΗΣΗ ΦΑΡΜΑΚΩΝ',
      docNumber: 'RX-2025-390182471925',
      recipientName: 'Αικατερίνη Αλεξίου',
      recipientAmka: '30117005678',
      issueDateStr: '05/03/2025',
      barcode12: '390182471925',
      detailRows: [
        { label: 'Φάρμακο 1', value: 'Fosamax 70mg • 2 κουτιά (8 εβδομάδες)' },
        { label: 'Φάρμακο 2', value: 'Lyrica 75mg • 2 κουτιά (60 ημέρες)' },
        { label: 'Διάγνωση (ICD-10)', value: 'M81.0 - Μετεμμηνοπαυσιακή οστεοπόρωση' },
        { label: 'Συνταγογράφος', value: 'Δρ. Μιχαήλ Παυλίδης (Ορθοπεδικός)' },
      ],
      verificationCode: 'HDIKA-390182471925',
    }),
    verified: true,
  },
];
