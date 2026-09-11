/**
 * Curated ICD-11 (MMS) code catalog with Greek labels (FEATURE_PLAN.md §21
 * extension: conditions are coded with ICD-11, not ICD-10, and surfaced in
 * Greek for the primary audience). This is a SMALL curated subset of common
 * primary-care diagnoses, verified against the ICD-11 MMS baseline — it is
 * NOT the full WHO classification. Unknown codes remain freely enterable;
 * extend `ICD11_CATALOG` to grow the picker.
 *
 * Verified against: WHO ICD-11 reference guide / MMS listings (findacode.com,
 * KEGG BRITE ICD-11, peer-reviewed code tables).
 */

export type Icd11Category =
  | 'metabolic'
  | 'circulatory'
  | 'respiratory'
  | 'nervous'
  | 'digestive'
  | 'musculoskeletal'
  | 'renal';

export interface Icd11Entry {
  code: string;
  /** Greek display label (primary). */
  labelEl: string;
  /** English display label. */
  labelEn: string;
  category: Icd11Category;
}

export const ICD11_CATEGORY_LABELS: Record<Icd11Category, { el: string; en: string }> = {
  metabolic: { el: 'Μεταβολικά & ενδοκρινικά', en: 'Metabolic & endocrine' },
  circulatory: { el: 'Καρδιαγγειακά', en: 'Circulatory' },
  respiratory: { el: 'Αναπνευστικά', en: 'Respiratory' },
  nervous: { el: 'Νευρικό σύστημα', en: 'Nervous system' },
  digestive: { el: 'Πεπτικά', en: 'Digestive' },
  musculoskeletal: { el: 'Μυοσκελετικά', en: 'Musculoskeletal' },
  renal: { el: 'Νεφρά & ουροποιητικό', en: 'Renal & urinary' },
};

export const ICD11_CATALOG: readonly Icd11Entry[] = [
  // Metabolic / endocrine
  { code: '5A10', labelEl: 'Σακχαρώδης διαβήτης τύπου 1', labelEn: 'Type 1 diabetes mellitus', category: 'metabolic' },
  { code: '5A11', labelEl: 'Σακχαρώδης διαβήτης τύπου 2', labelEn: 'Type 2 diabetes mellitus', category: 'metabolic' },
  { code: '5B81', labelEl: 'Παχυσαρκία', labelEn: 'Obesity', category: 'metabolic' },
  // Circulatory
  { code: 'BA00', labelEl: 'Ιδιοπαθής υπέρταση', labelEn: 'Essential hypertension', category: 'circulatory' },
  { code: 'BA52', labelEl: 'Ισχαιμική καρδιοπάθεια', labelEn: 'Ischaemic heart disease', category: 'circulatory' },
  { code: 'BD10', labelEl: 'Συμφορητική καρδιακή ανεπάρκεια', labelEn: 'Congestive heart failure', category: 'circulatory' },
  { code: 'BC81', labelEl: 'Κολπική μαρμαρυγή', labelEn: 'Atrial fibrillation', category: 'circulatory' },
  // Respiratory
  { code: 'CA22', labelEl: 'Χρόνια αποφρακτική πνευμονοπάθεια (ΧΑΠ)', labelEn: 'Chronic obstructive pulmonary disease', category: 'respiratory' },
  { code: 'CA23', labelEl: 'Άσθμα', labelEn: 'Asthma', category: 'respiratory' },
  { code: 'CA40', labelEl: 'Πνευμονία', labelEn: 'Pneumonia', category: 'respiratory' },
  // Nervous system
  { code: '8A20', labelEl: 'Νόσος Αλτσχάιμερ', labelEn: 'Alzheimer disease', category: 'nervous' },
  { code: '6D80', labelEl: 'Άνοια', labelEn: 'Dementia', category: 'nervous' },
  // Digestive
  { code: 'DA22', labelEl: 'Γαστροοισοφαγική παλινδρόμηση', labelEn: 'Gastro-oesophageal reflux disease', category: 'digestive' },
  // Musculoskeletal
  { code: 'FA01', labelEl: 'Οστεοαρθρίτιδα γόνατος', labelEn: 'Osteoarthritis of knee', category: 'musculoskeletal' },
  // Renal
  { code: 'GB61.Z', labelEl: 'Χρόνια νεφρική νόσος (μη καθορισμένη)', labelEn: 'Chronic kidney disease, unspecified', category: 'renal' },
];

/** Strict ICD-11 stem/extension shape: e.g. `5A10`, `BA00`, `CA23.01`, `GB61.Z`. */
export const ICD11_CODE_PATTERN = /^[A-Z0-9]{2}[0-9][A-Z0-9](\.[0-9A-Z]+)?$/i;

export function isIcd11Code(value: string): boolean {
  return ICD11_CODE_PATTERN.test(value.trim());
}

const byCode = new Map(ICD11_CATALOG.map((e) => [e.code.toUpperCase(), e]));

/** Catalog entry for a code (case-insensitive), or null when not curated. */
export function icd11ByCode(code: string): Icd11Entry | null {
  return byCode.get(code.trim().toUpperCase()) ?? null;
}

/**
 * Display label for a code: Greek label + code when curated, otherwise the
 * raw code the user typed (free-form ICD-11 entry stays supported).
 */
export function icd11Label(code: string, locale: 'el' | 'en' = 'el'): string {
  const entry = icd11ByCode(code);
  if (!entry) {
    return code.trim();
  }
  const label = locale === 'el' ? entry.labelEl : entry.labelEn;
  return `${label} (${entry.code})`;
}

/**
 * Case-insensitive search across code, Greek label AND English label — used
 * by the condition-form picker as the user types (both languages match,
 * since a Greek UI user may type either).
 */
export function searchIcd11(query: string): Icd11Entry[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) {
    return [...ICD11_CATALOG];
  }
  return ICD11_CATALOG.filter((entry) => {
    if (entry.code.toLocaleLowerCase().includes(q)) {
      return true;
    }
    if (entry.labelEl.toLocaleLowerCase().includes(q)) {
      return true;
    }
    return entry.labelEn.toLocaleLowerCase().includes(q);
  });
}

/** Greek label of a category chip. */
export function icd11CategoryLabel(category: Icd11Category, locale: 'el' | 'en' = 'el'): string {
  const labels = ICD11_CATEGORY_LABELS[category];
  return locale === 'el' ? labels.el : labels.en;
}