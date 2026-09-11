/**
 * Curated medicine-info catalog (FEATURE_PLAN.md — medicine instructions
 * manager): a small, Greek-first reference used to auto-fill a pill's
 * structured instruction sheet. It is **informational convenience only, not
 * medical advice** — every field stays user-editable, and `applyCatalog`
 * never overwrites a saved sheet without the caller's confirmation.
 *
 * Kept client-side (no network, works offline in the PWA) and matched
 * case/diacritic-insensitively against the generic name, Greek name and common
 * brand aliases.
 */
import {
  FoodRelation,
  MedicineInstructions,
  MedicineRoute,
  hasInstructions,
  normalizeInstructions,
} from './medicine.info';
import type { Medication } from './medications.logic';

export interface MedicineInfoEntry {
  /** Canonical (usually generic) name shown in the UI. */
  name: string;
  /** Greek generic name, when different from `name`. */
  greekName?: string;
  /** Generic + brand + transliterated aliases used for matching. */
  aliases: string[];
  category: 'analgesic' | 'antibiotic' | 'cardio' | 'metabolic' | 'respiratory' | 'anticoagulant' | 'other';
  instructions: MedicineInstructions;
}

const entry = (
  name: string,
  greekName: string,
  aliases: string[],
  category: MedicineInfoEntry['category'],
  route: MedicineRoute,
  foodRelation: FoodRelation,
  maxDailyDoses: number | null,
  doseForm: string,
  warnings: string[],
  sideEffects: string,
  storage: string
): MedicineInfoEntry => ({
  name,
  greekName,
  aliases,
  category,
  instructions: {
    doseForm,
    route,
    foodRelation,
    maxDailyDoses,
    warnings,
    sideEffects,
    storage,
    specialInstructions: '',
  },
});

/** Curated reference set (12 common medicines). Clearly non-exhaustive. */
export const MEDICINE_CATALOG: readonly MedicineInfoEntry[] = [
  entry('Paracetamol', 'Παρακεταμόλη', ['paracetamol', 'acetaminophen', 'depon', 'panadol', 'παρακεταμολη'], 'analgesic', 'oral', 'any', 4, 'Δισκίο',
    ['Μην υπερβαίνετε τις 4 δόσεις την ημέρα.', 'Αποφύγετε το αλκοόλ — κίνδυνος για το συκώτι.', 'Ελέγξτε άλλα φάρμακα για κρυολόγημα που το περιέχουν.'],
    'Σπάνια: εξάνθημα, ναυτία.', 'Σε ξηρό, δροσερό μέρος, μακριά από παιδιά.'),
  entry('Ibuprofen', 'Ιβουπροφαίνη', ['ibuprofen', 'brufen', 'nurofen', 'ιβουπροφαινη'], 'analgesic', 'oral', 'with', 3, 'Δισκίο',
    ['Πάρτε το με φαγητό για προστασία του στομάχου.', 'Αποφύγετε αν έχετε έλκος ή νεφρικά προβλήματα.', 'Να αποφεύγεται στο τελευταίο τρίμηνο της εγκυμοσύνης.'],
    'Καούρα, στομαχόπονος, ζαλάδα.', 'Σε ξηρό, δροσερό μέρος.'),
  entry('Amoxicillin', 'Αμοξικιλλίνη', ['amoxicillin', 'amoxil', 'αμοξικιλλινη'], 'antibiotic', 'oral', 'any', 3, 'Κάψουλη',
    ['Ολοκληρώστε όλη τη θεραπεία ακόμη κι αν νιώσετε καλύτερα.', 'Αναφέρετε αμέσως τυχόν αλλεργία (εξάνθημα, πρήξιμο).'],
    'Διάρροια, ναυτία, εξάνθημα.', 'Σε ξηρό, δροσερό μέρος· ορισμένα σιρόπια στο ψυγείο.'),
  entry('Metformin', 'Μετφορμίνη', ['metformin', 'glucophage', 'μετφορμινη'], 'metabolic', 'oral', 'with', 3, 'Δισκίο',
    ['Πάρτε το με ή αμέσως μετά το φαγητό.', 'Ενημερώστε τον γιατρό πριν από εξέταση με σκιαγραφικό.', 'Αναφέρετε μυϊκό πόνο ή αίσθημα κόπωσης.'],
    'Διάρροια, μεταλλική γεύση, στομαχική ενόχληση.', 'Σε ξηρό, δροσερό μέρος.'),
  entry('Atorvastatin', 'Ατορβαστατίνη', ['atorvastatin', 'lipitor', 'ατορβαστατινη'], 'cardio', 'oral', 'any', 1, 'Δισκίο',
    ['Αποφύγετε τον χυμό γκρέιπφρουτ.', 'Αναφέρετε ανεξήγητο μυϊκό πόνο.', 'Συνήθως λαμβάνεται το βράδυ, την ίδια ώρα.'],
    'Μυϊκός πόνος, κεφαλαλγία, πεπτικές διαταραχές.', 'Σε ξηρό, δροσερό μέρος.'),
  entry('Ramipril', 'Ραμιπρίλη', ['ramipril', 'tritace', 'ραμιπριλη'], 'cardio', 'oral', 'any', 1, 'Δισκίο',
    ['Σηκωθείτε αργά — μπορεί να προκαλέσει ζάλη.', 'Ενημερώστε τον γιατρό για ξηρό βήχα.', 'Αποφύγετε τα συμπληρώματα καλίου χωρίς ιατρική οδηγία.'],
    'Ξηρός βήχας, ζάλη, κόπωση.', 'Σε ξηρό, δροσερό μέρος.'),
  entry('Omeprazole', 'Ομεπραζόλη', ['omeprazole', 'losec', 'ομεπραζολη'], 'other', 'oral', 'before', 1, 'Κάψουλη',
    ['Πάρτε το 30 λεπτά πριν το πρωινό.', 'Μακροχρόνια χρήση: ελέγξτε βιταμίνη B12 και μαγνήσιο.'],
    'Κεφαλαλγία, διάρροια, κοιλιακό άλγος.', 'Σε ξηρό, δροσερό μέρος· προστασία από υγρασία.'),
  entry('Salbutamol', 'Σαλβουταμόλη', ['salbutamol', 'albuterol', 'ventolin', 'σαλβουταμολη'], 'respiratory', 'inhalation', 'any', 4, 'Εισπνεόμενο',
    ['Χρησιμοποιήστε όπως σας έχει δείξει ο γιατρός.', 'Αν χρειάζεστε το συχνότερα από συνήθως, ζητήστε ιατρική βοήθεια.', 'Καθαρίστε το επιστόμιο μετά τη χρήση.'],
    'Τρόμος, ταχυκαρδία, πονοκέφαλος.', 'Σε θερμοκρασία δωματίου, μακριά από φωτιά.'),
  entry('Warfarin', 'Βαρφαρίνη', ['warfarin', 'sintrom', 'βαρφαρινη'], 'anticoagulant', 'oral', 'any', 1, 'Δισκίο',
    ['Λάβετε την ίδια ώρα κάθε μέρα.', 'Τακτικός έλεγχος INR — μην αλλάζετε δόση χωρίς γιατρό.', 'Αποφύγετε απότομες αλλαγές σε πράσινα λαχανικά και αλκοόλ.'],
    'Μώλωπες, αιμορραγία από τη μύτη ή τα ούλα.', 'Σε ξηρό, δροσερό μέρος.'),
  entry('Furosemide', 'Φουροσεμίδη', ['furosemide', 'lasix', 'φουροσεμιδη'], 'cardio', 'oral', 'any', 1, 'Δισκίο',
    ['Πάρτε το νωρίς το πρωί για να μην διαταράσσεται ο ύπνος.', 'Μπορεί να αυξήσει την ούρηση — μείνετε ενυδατωμένοι.', 'Ελέγξτε κάλιο και νεφρική λειτουργία.'],
    'Ζάλη, ξηροστομία, αυξημένη ούρηση.', 'Σε ξηρό, δροσερό μέρος.'),
  entry('Levothyroxine', 'Λεβοθυροξίνη', ['levothyroxine', 'thyrofix', 'levothyrox', 'λεβοθυροξινη'], 'metabolic', 'oral', 'before', 1, 'Δισκίο',
    ['Πάρτε το με άδειο στομάχι, 30–60 λεπτά πριν το πρωινό.', 'Αφήστε 4 ώρες από ασβέστιο ή σίδηρο.'],
    'Αίσθημα παλμών, αϋπνία, απώλεια βάρους.', 'Σε ξηρό, δροσερό μέρος.'),
  entry('Clopidogrel', 'Κλοπιδογρέλη', ['clopidogrel', 'plavix', 'κλοπιδογρελη'], 'cardio', 'oral', 'with', 1, 'Δισκίο',
    ['Αναφέρετε τυχόν αυξημένη αιμορραγία ή μώλωπες.', 'Ενημερώστε τον γιατρό/οδοντίατρο πριν από χειρουργείο.', 'Αποφύγετε άλλα αντιφλεγμονώδη χωρίς οδηγία.'],
    'Αιμορραγία, διάρροια, εξάνθημα.', 'Σε ξηρό, δροσερό μέρος.'),
];

/** Normalize a drug name for matching: lowercase, no diacritics, alphanumeric. */
export function normalizeDrugName(name: string): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

/** Exact (normalized) match on the name or any alias, then substring match. */
export function findMedicineInfo(name: string): MedicineInfoEntry | null {
  const needle = normalizeDrugName(name);
  if (needle.length < 3) {
    return null;
  }
  for (const info of MEDICINE_CATALOG) {
    const candidates = [info.name, info.greekName ?? '', ...info.aliases].map(normalizeDrugName);
    if (candidates.some((c) => c === needle)) {
      return info;
    }
  }
  for (const info of MEDICINE_CATALOG) {
    const candidates = [info.name, info.greekName ?? '', ...info.aliases].map(normalizeDrugName);
    if (candidates.some((c) => c.includes(needle) || needle.includes(c))) {
      return info;
    }
  }
  return null;
}

/** Suggested sheet from the catalog, or null when the drug is unknown. */
export function applyCatalog(name: string): MedicineInstructions | null {
  const info = findMedicineInfo(name);
  return info ? normalizeInstructions(info.instructions) : null;
}

/**
 * Effective instructions for a medication: the saved sheet when it carries
 * information, otherwise the catalog suggestion (never both merged silently —
 * the editor lets the user adopt the suggestion explicitly).
 */
export function instructionsForMed(
  med: Pick<Medication, 'name' | 'instructions'>
): MedicineInstructions | null {
  if (med.instructions && hasInstructions(med.instructions)) {
    return normalizeInstructions(med.instructions);
  }
  return applyCatalog(med.name);
}
