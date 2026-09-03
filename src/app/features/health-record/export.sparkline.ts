/**
 * Vitals sparkline helpers (FEATURE_PLAN.md §10 subtask 7).
 *
 * The pure geometry (`sparklinePoints`) is unit-testable without a DOM; the
 * canvas helpers render the on-screen preview and produce a PNG data URL
 * (`canvas → PNG`) from the same vitals data. The PDF itself embeds the
 * identical polyline as vector drawing (see `pdf-builder.ts`), so the export
 * stays canvas-free and dependency-free.
 */

export interface SparkPoint {
  x: number;
  y: number;
}

/**
 * Normalize values into a width×height box (pure, no DOM). Empty input →
 * `[]`; a single or constant series → a flat mid-line (never NaN).
 */
export function sparklinePoints(
  values: readonly number[],
  width: number,
  height: number,
  pad = 4
): SparkPoint[] {
  if (values.length === 0 || width <= 0 || height <= 0) {
    return [];
  }
  const w = Math.max(width - pad * 2, 1);
  const h = Math.max(height - pad * 2, 1);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((v, i) => ({
    x: pad + (values.length === 1 ? w / 2 : (i / (values.length - 1)) * w),
    y: pad + (1 - (v - min) / span) * h,
  }));
}

/** Draw a sparkline on an existing canvas; no-op when 2D context is missing. */
export function drawSparkline(
  canvas: HTMLCanvasElement,
  values: readonly number[],
  color = '#1a56db'
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  const pts = sparklinePoints(values, width, height);
  if (pts.length === 0) {
    return;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (pts.length === 1) {
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[0].x + 1, pts[0].y);
  } else {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) {
      ctx.lineTo(p.x, p.y);
    }
  }
  ctx.stroke();
}

/**
 * Render values to a PNG data URL via an offscreen canvas.
 * Returns null when the DOM/canvas is unavailable (SSR, jsdom without
 * canvas) — callers must handle the null case (the PDF vector fallback
 * covers it).
 */
export function sparklineDataUrl(
  values: readonly number[],
  width = 480,
  height = 96
): string | null {
  try {
    if (typeof document === 'undefined' || values.length === 0) {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    drawSparkline(canvas, values);
    if (!canvas.getContext('2d')) {
      return null;
    }
    const url = canvas.toDataURL('image/png');
    return url.startsWith('data:image/png') ? url : null;
  } catch {
    return null;
  }
}
