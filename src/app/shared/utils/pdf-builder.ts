/**
 * Minimal canvas-free PDF 1.4 builder (shared util for FEATURE_PLAN.md §10).
 *
 * Generation-strategy decision (subtask 1): client-side, zero new
 * dependencies. jsPDF/pdfmake were deliberately NOT added — they would cost
 * ~100–350 KB of bundle for a summary document this builder produces in
 * ~3 KB of source. Bundle-budget impact (subtask 2): this module is only
 * reachable via the dynamic `import('./export.pdf')` in
 * `export.service.ts`, so it lands in a lazy chunk and the initial bundle is
 * unaffected (initial budget stays ≤ 300 KB; `angular.json` budgets are
 * unchanged).
 *
 * Output is a valid PDF 1.4 using the built-in Helvetica / Helvetica-Bold
 * base-14 fonts (no font embedding needed). ASCII text is emitted as literal
 * strings; non-ASCII text (Greek labels, subtask 9) is emitted as UTF-16BE
 * hex strings — valid PDF, though Greek glyph shapes depend on the viewer's
 * base-14 font coverage. The in-app print fallback (`window.print`,
 * `printHealthSummary()`) renders Greek via HTML for pixel-perfect output.
 */

export type PdfTextSize = 'title' | 'heading' | 'body' | 'small';

export type PdfBlock =
  | { kind: 'text'; text: string; size: PdfTextSize }
  | { kind: 'gap' }
  | { kind: 'sparkline'; label: string; values: number[] };

export interface PdfDocumentInput {
  title: string;
  headerLines: string[];
  blocks: PdfBlock[];
  /** Left-aligned footer text (the page number is appended automatically). */
  footerLeft: string;
}

const PAGE_W = 595; // A4, points
const PAGE_H = 842;
const MARGIN_X = 48;
const CONTENT_W = PAGE_W - 2 * MARGIN_X;
const TOP_Y = 792;
const BOTTOM_Y = 64; // content stops here; footer lives below

const SIZE_PT: Record<PdfTextSize, number> = {
  title: 16,
  heading: 12,
  body: 10,
  small: 9,
};

const LINE_H: Record<PdfTextSize, number> = {
  title: 22,
  heading: 17,
  body: 14,
  small: 12,
};

const MAX_CHARS: Record<PdfTextSize, number> = {
  title: 56,
  heading: 78,
  body: 92,
  small: 100,
};

const SPARKLINE_H = 92;

function fontFor(size: PdfTextSize): string {
  return size === 'title' || size === 'heading' ? 'F2' : 'F1';
}

/** Encode a string as a PDF string object (ASCII-safe output). */
export function encodePdfText(text: string): string {
  if (/^[\x09\x0A\x0D\x20-\x7E]*$/.test(text)) {
    return `(${text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')})`;
  }
  let hex = 'FEFF';
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp <= 0xffff) {
      hex += cp.toString(16).padStart(4, '0').toUpperCase();
    } else {
      const v = cp - 0x10000;
      hex += (0xd800 + (v >> 10)).toString(16).padStart(4, '0').toUpperCase();
      hex += (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, '0').toUpperCase();
    }
  }
  return `<${hex}>`;
}

/** Greedy word wrap; over-long words are hard-split. Exported for tests. */
export function wrapText(text: string, maxChars: number): string[] {
  if (text === '') {
    return [''];
  }
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) {
    return [''];
  }
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (word.length > maxChars) {
      if (current) {
        lines.push(current);
        current = '';
      }
      for (let i = 0; i < word.length; i += maxChars) {
        lines.push(word.slice(i, i + maxChars));
      }
      continue;
    }
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

interface FlatLine {
  text: string;
  size: PdfTextSize;
}

interface FlatSpark {
  label: string;
  values: number[];
}

type FlatItem = { kind: 'line'; line: FlatLine } | { kind: 'spark'; spark: FlatSpark };

function flatten(input: PdfDocumentInput): FlatItem[] {
  const items: FlatItem[] = [];
  items.push({ kind: 'line', line: { text: input.title, size: 'title' } });
  for (const header of input.headerLines) {
    items.push({ kind: 'line', line: { text: header, size: 'small' } });
  }
  for (const block of input.blocks) {
    if (block.kind === 'gap') {
      items.push({ kind: 'line', line: { text: '', size: 'body' } });
      continue;
    }
    if (block.kind === 'sparkline') {
      items.push({ kind: 'spark', spark: { label: block.label, values: block.values } });
      continue;
    }
    for (const wrapped of wrapText(block.text, MAX_CHARS[block.size])) {
      items.push({ kind: 'line', line: { text: wrapped, size: block.size } });
    }
  }
  return items;
}

function itemHeight(item: FlatItem): number {
  if (item.kind === 'spark') {
    return SPARKLINE_H;
  }
  return LINE_H[item.line.size];
}

/** Normalize values into chart coordinates inside a w×h box at (x, yTop). */
export function sparklineCoords(
  values: number[],
  x: number,
  yTop: number,
  w: number,
  h: number
): Array<{ x: number; y: number }> {
  if (values.length === 0) {
    return [];
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((v, i) => ({
    x: values.length === 1 ? x + w / 2 : x + (i / (values.length - 1)) * w,
    y: yTop - 6 - ((v - min) / span) * (h - 12),
  }));
}

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

function textOp(text: string, size: PdfTextSize, x: number, y: number): string {
  return `BT /${fontFor(size)} ${SIZE_PT[size]} Tf 1 0 0 1 ${fmt(x)} ${fmt(y)} Tm ${encodePdfText(text)} Tj ET`;
}

function sparklineOps(label: string, values: number[], x: number, yTop: number): string[] {
  const ops: string[] = [textOp(label, 'small', x, yTop)];
  const chartTop = yTop - 8;
  const chartH = 56;
  const w = CONTENT_W;
  // Frame.
  ops.push(
    `0.7 0.7 0.75 w ${fmt(x)} ${fmt(chartTop - chartH)} ${fmt(w)} ${fmt(chartH)} re S`
  );
  const pts = sparklineCoords(values, x + 4, chartTop, w - 8, chartH);
  if (pts.length === 1) {
    ops.push(`${fmt(pts[0].x)} ${fmt(pts[0].y)} m ${fmt(pts[0].x + 1)} ${fmt(pts[0].y)} l S`);
  } else if (pts.length > 1) {
    let path = `${fmt(pts[0].x)} ${fmt(pts[0].y)} m`;
    for (const p of pts.slice(1)) {
      path += ` ${fmt(p.x)} ${fmt(p.y)} l`;
    }
    ops.push('0.1 0.34 0.86 RG 1.4 w', `${path} S`, '0 0 0 RG 0.7 w');
  }
  return ops;
}

export function buildPdfBytes(input: PdfDocumentInput): Uint8Array {
  const items = flatten(input);

  // Paginate.
  const pages: FlatItem[][] = [[]];
  let cursor = TOP_Y;
  for (const item of items) {
    const height = itemHeight(item);
    if (cursor - height < BOTTOM_Y && pages[pages.length - 1].length > 0) {
      pages.push([]);
      cursor = TOP_Y;
    }
    pages[pages.length - 1].push(item);
    cursor -= height;
  }
  const total = pages.length;

  // Content stream per page.
  const contents: string[] = pages.map((pageItems, pageIndex) => {
    const ops: string[] = [];
    let y = TOP_Y;
    for (const item of pageItems) {
      if (item.kind === 'spark') {
        ops.push(...sparklineOps(item.spark.label, item.spark.values, MARGIN_X, y));
        y -= SPARKLINE_H;
      } else {
        const { text, size } = item.line;
        if (text !== '') {
          ops.push(textOp(text, size, MARGIN_X, y - SIZE_PT[size]));
        }
        y -= LINE_H[size];
      }
    }
    // Footer: left label + right-aligned page number (subtask 6).
    const pageLabel = `Page ${pageIndex + 1} of ${total}`;
    ops.push(textOp(input.footerLeft, 'small', MARGIN_X, 36));
    const approxCharW = 5;
    ops.push(
      textOp(pageLabel, 'small', PAGE_W - MARGIN_X - pageLabel.length * approxCharW, 36)
    );
    return ops.join('\n');
  });

  // Object numbering: 1 = catalog, 2 = pages, 3 = F1, 4 = F2,
  // then per page: page object + contents object.
  const objects: string[] = [];
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  const pageObjNums: number[] = [];
  let next = 5;
  for (let i = 0; i < total; i++) {
    pageObjNums.push(next);
    next += 2;
  }
  objects.push(
    `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${total} >>`
  );
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  for (let i = 0; i < total; i++) {
    const contentNum = pageObjNums[i] + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentNum} 0 R >>`
    );
    objects.push(`<< /Length ${contents[i].length} >>\nstream\n${contents[i]}\nendstream`);
  }

  let pdf = '%PDF-1.4\n% health-summary export (canvas-free builder)\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefAt}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
