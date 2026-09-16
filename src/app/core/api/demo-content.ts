/**
 * Greek copy for the in-memory demo backend.
 *
 * The demo dataset in `demo.api.ts` is authored in English; this module holds
 * the Greek side of the *content* — provider bios, cities, education,
 * specialities, service names, review comments, care-plan goals and notes,
 * pharmacy names and booking notes — so the demo runs bilingual exactly like
 * the real server does (see `server/src/marketplace-copy.ts` and
 * `server/src/locale.ts`).
 *
 * Deliberate shape choices:
 *  - Only Greek lives here. The English source stays in `demo.api.ts` next to
 *    the rest of the record, so there is nothing to keep in sync but the
 *    translations themselves.
 *  - Lists are *order-aligned* with the English list they translate
 *    (`specialties[i]` ↔ `specialtiesEl[i]`, likewise `services`). That keeps
 *    prices and durations owned by a single place — the dataset — instead of
 *    being repeated per language where they could silently drift.
 *  - `languages` is deliberately absent: language names are stored as endonyms
 *    ("Ελληνικά", "English"), which read correctly in either locale.
 */

/** Content language the demo backend can render. */
export type DemoLang = 'en' | 'el';

/**
 * Read the content language off a request URL.
 *
 * Mirrors the real server's precedence in `server/src/locale.ts`: an explicit
 * `?lang=` wins, anything else falls back to English (the reference locale).
 * An unknown value is ignored rather than rejected — a bad parameter must never
 * break a request.
 */
export function parseDemoLang(query: string): DemoLang {
  for (const pair of query.split('&')) {
    const [rawKey, rawValue = ''] = pair.split('=');
    if (decodeURIComponent(rawKey) !== 'lang') {
      continue;
    }
    const value = decodeURIComponent(rawValue).trim().toLowerCase().split('-')[0];
    if (value === 'el' || value === 'en') {
      return value;
    }
  }
  return 'en';
}

/** Provider editorial copy, Greek side. Lists align with the English source. */
export interface DemoCaregiverCopy {
  bio: string;
  city: string;
  education: string;
  specialties: string[];
  /** Service *names* in the same order as the English `services` array. */
  services: string[];
}

export const CAREGIVER_COPY_EL: Record<string, DemoCaregiverCopy> = {
  'cg-1': {
    bio: 'Πιστοποιημένη νοσηλεύτρια με 12 χρόνια εμπειρίας στην κατ\u2019 οίκον νοσηλεία. Εξειδικεύομαι στη θεραπεία με ινσουλίνη και στη μετεγχειρητική φροντίδα τραυμάτων, και κρατώ την οικογένεια ενήμερη μετά από κάθε επίσκεψη.',
    city: 'Αθήνα — Σύνταγμα',
    education: 'Πτυχίο Νοσηλευτικής, Εθνικό και Καποδιστριακό Πανεπιστήμιο Αθηνών',
    specialties: ['Ενέσεις', 'Φροντίδα τραυμάτων', 'Ινσουλίνη'],
    services: [
      'Ένεση στο σπίτι',
      'Περιποίηση & φροντίδα τραύματος',
      'Ανασκόπηση φαρμακευτικής αγωγής',
    ],
  },
  'cg-2': {
    bio: 'Κρατώ συντροφιά σε ηλικιωμένους όπως θα έκανε ένας καλός γείτονας: περπάτημα, ψώνια, μαγείρεμα μαζί και ειλικρινής συζήτηση. Υπομονετικός και ήρεμος με την απώλεια μνήμης.',
    city: 'Πειραιάς',
    education: 'Πιστοποίηση φροντιστή, ΙΕΚ Πειραιά',
    specialties: ['Συντροφικότητα', 'Ατομική φροντίδα'],
    services: [
      'Επίσκεψη συντροφικότητας',
      'Ατομική φροντίδα & υγιεινή',
      'Θέματα & ψώνια',
    ],
  },
  'cg-3': {
    bio: 'Φυσικοθεραπεύτρια με εξειδίκευση στη νευρολογική αποκατάσταση. Σχεδιάζω σύντομα και ρεαλιστικά προγράμματα στο σπίτι, που η οικογένεια μπορεί πραγματικά να συνεχίσει ανάμεσα στις συνεδρίες.',
    city: 'Αθήνα — Κολωνάκι',
    education: 'Μεταπτυχιακό Νευρολογικής Αποκατάστασης, Πανεπιστήμιο Θεσσαλίας',
    specialties: ['Αποκατάσταση μετά από εγκεφαλικό', 'Κινητικότητα'],
    services: [
      'Αποκατάσταση μετά από εγκεφαλικό',
      'Ασκήσεις κινητικότητας & ισορροπίας',
    ],
  },
  'cg-4': {
    bio: 'Νοσηλευτής κατ\u2019 οίκον για μετεγχειρητική αποκατάσταση και μακροχρόνια φροντίδα καθετήρα. Καταγράφω κάθε μέτρηση, ώστε ο θεράπων ιατρός να βλέπει την ίδια εικόνα με εμένα.',
    city: 'Αθήνα — Αμπελόκηποι',
    education: 'Πτυχίο Νοσηλευτικής, Πανεπιστήμιο Πατρών',
    specialties: ['Φροντίδα καθετήρα', 'Μετεγχειρητική φροντίδα', 'Ζωτικά σημεία'],
    services: [
      'Φροντίδα καθετήρα',
      'Μετεγχειρητική φροντίδα',
      'Μέτρηση ζωτικών σημείων & πίεσης',
    ],
  },
  'cg-5': {
    bio: 'Συνοδός με εκπαίδευση στην άνοια. Δουλεύω με ρουτίνα και καθησύχαση — το ίδιο πρόσωπο, η ίδια ώρα, ο ίδιος καφές — γιατί η συνήθεια είναι αυτό που κρατά τη μέρα.',
    city: 'Αθήνα — Κουκάκι',
    education: 'Πιστοποιητικό φροντίδας άνοιας, Alzheimer Hellas',
    specialties: ['Φροντίδα άνοιας', 'Προετοιμασία γευμάτων'],
    services: ['Συντροφικότητα σε άνοια', 'Προετοιμασία γευμάτων'],
  },
  'cg-6': {
    bio: 'Αθλητικός φυσικοθεραπευτής που δουλεύει στο σπίτι με τον εξοπλισμό που ήδη έχετε. Πρώτα η ενδυνάμωση, μετά η χειροπρακτική θεραπεία.',
    city: 'Πειραιάς',
    education: 'Πτυχίο Φυσικοθεραπείας, Πανεπιστήμιο Δυτικής Αττικής',
    specialties: ['Αθλητικοί τραυματισμοί', 'Κινητικότητα'],
    services: ['Συνεδρία φυσικοθεραπείας στο σπίτι', 'Αποκατάσταση αθλητικού τραυματισμού'],
  },
};

/** Review comments, Greek side, keyed by review id. */
export const REVIEW_COMMENT_EL: Record<string, string> = {
  'rv-1': 'Συνεπής, ευγενική και πολύ επαγγελματική στην περιποίηση του τραύματος.',
  'rv-2': 'Ήρθε ακριβώς στην ώρα της, εξήγησε κάθε βήμα στη μητέρα μου και έμεινε μέχρι να επανέλθει η μέτρηση της γλυκόζης στο φυσιολογικό. Επιτέλους σταμάτησα να ανησυχώ.',
  'rv-3': 'Πολύ καλή κλινική φροντίδα μετά την επέμβαση στο γόνατο του πατέρα μου. Μία φορά άργησε δέκα λεπτά λόγω κίνησης, αλλά τηλεφώνησε από πριν.',
  'rv-4': 'Εντόπισε κατακλίσεις που είχε αφήσει η ομάδα του νοσοκομείου και το ανέφερε αυθημερόν. Τέτοια προσοχή δεν τη βρίσκεις εύκολα.',
  'rv-5': 'Πήγαινε τον θείο μου βόλτα κάθε πρωί και η αλλαγή στη διάθεσή του φάνηκε μέσα σε δύο εβδομάδες.',
  'rv-6': 'Ευγενικός και υπομονετικός, αλλά χρειάστηκε να αναβάλει δύο φορές την τελευταία στιγμή. Όταν ήρθε, η επίσκεψη ήταν πραγματικά καλή.',
  'rv-7': 'Το πρόγραμμα στο σπίτι ήταν αρκετά σύντομο ώστε να το κάνει πραγματικά η μητέρα μου. Έξι εβδομάδες μετά, σηκώνεται μόνη της.',
  'rv-8': 'Αλλαγές καθετήρα στο σπίτι, αντί για ταξί στο νοσοκομείο κάθε δεκαπενθήμερο. Ήρεμος, με σωστή αποστείρωση, και τα καταγράφει όλα.',
  'rv-9': 'Καλός με τον πατέρα μου μετά το χειρουργείο. Μας εξηγεί καθαρά την περιποίηση του τραύματος, ώστε να μην ψάχνουμε στα τυφλά ανάμεσα στις επισκέψεις.',
  'rv-10': 'Μέτρησε πίεση και σφυγμό στη μητέρα μου και τηλεφώνησε ο ίδιος στον καρδιολόγο όταν ήταν εκτός ορίων. Σχολαστικός.',
  'rv-11': 'Κρατά την ίδια ρουτίνα σε κάθε επίσκεψη, που είναι ακριβώς αυτό που χρειάζεται η γιαγιά μου. Ποτέ δεν τη βιάζει.',
  'rv-12': 'Ζεστή και αξιόπιστη. Θα ήθελα μεγαλύτερη ενημέρωση τις μέρες που αντάλλασσε βάρδια με συνάδελφο, αλλά η φροντίδα ήταν εξαιρετική.',
  'rv-13': 'Έβαλε τον άντρα μου να προπονείται με λάστιχα στο σπίτι μετά από τραυματισμό στο ποδόσφαιρο. Πρακτικός, χωρίς περιστροφές.',
  'rv-14': 'Αναφέρθηκε από την οικογένεια για τηλέφωνο που χτυπούσε στην πόρτα — εκκρεμεί έλεγχος συντονιστή.',
};

/** Care-plan goal text, Greek side, keyed by goal id. */
export const CARE_GOAL_EL: Record<string, string> = {
  'g-1': 'Καθημερινή κινητοποίηση ώμου',
  'g-2': 'Σταθεροποίηση αρτηριακής πίεσης',
};

/** Care-plan note text, Greek side, keyed by note id. */
export const CARE_NOTE_EL: Record<string, string> = {
  'n-1': 'Η πίεση σταθερή στο 125/80, συνεχίζουμε την παρακολούθηση.',
};

/** Partner pharmacy name and address, Greek side, keyed by pharmacy id. */
export const PHARMACY_EL: Record<string, { name: string; address: string }> = {
  'ph-1': { name: 'Κεντρικό Φαρμακείο Συντάγματος', address: 'Πλ. Συντάγματος 1, Αθήνα' },
  'ph-2': { name: 'Φαρμακείο Κολωνακίου', address: 'Σκουφά 12, Αθήνα' },
  'ph-3': { name: 'Φαρμακείο Λιμανιού Πειραιά', address: 'Ακτή Μιαούλη 45, Πειραιάς' },
};

/** Short booking notes, Greek side, keyed by booking id. */
export const BOOKING_NOTE_EL: Record<string, string> = {
  'b-1': 'Πρωινή ένεση ινσουλίνης',
  'b-done': 'Συνεδρία αποκατάστασης μετά από εγκεφαλικό',
  'b-reviewed': 'Περιποίηση τραύματος',
  'b-disputed': 'Περιποίηση τραύματος',
};
