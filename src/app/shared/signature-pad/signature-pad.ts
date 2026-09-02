import { Component, ElementRef, signal, viewChild } from '@angular/core';

/**
 * Canvas signature capture (PLAN.md §5 Phase 2 — Clinical log). Draws with
 * pointer events, exposes a clear action and `toDataUrl()`. The signature is
 * only "signed" once at least one stroke has been drawn.
 */
@Component({
  selector: 'app-signature-pad',
  standalone: true,
  template: `
    <div class="sig-pad">
      <canvas
        #canvas
        width="380"
        height="140"
        (pointerdown)="start($event)"
        (pointermove)="move($event)"
        (pointerup)="end()"
        (pointerleave)="end()"
        aria-label="Signature canvas — draw with your mouse or finger"
      ></canvas>
      <button type="button" class="secondary" (click)="clear()" [disabled]="!signed()">
        Clear
      </button>
    </div>
  `,
  styles: `
    .sig-pad { display: inline-flex; flex-direction: column; gap: 0.5rem; }
    canvas {
      border: 1px dashed var(--border);
      border-radius: 0.5rem;
      background: var(--surface);
      touch-action: none;
      cursor: crosshair;
    }
  `,
})
export class SignaturePad {
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private context: CanvasRenderingContext2D | null = null;
  private drawing = false;

  /** True once the user has drawn at least a stroke. */
  readonly signed = signal(false);

  private ctx(): CanvasRenderingContext2D | null {
    const el = this.canvas()?.nativeElement;
    if (!el) {
      return null;
    }
    if (!this.context) {
      const context = el.getContext('2d');
      if (context) {
        context.lineWidth = 2.5;
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.strokeStyle = '#1b2430';
      }
      this.context = context;
    }
    return this.context;
  }

  start(event: PointerEvent): void {
    const context = this.ctx();
    const rect = this.canvas()?.nativeElement.getBoundingClientRect();
    if (!context || !rect) {
      return;
    }
    this.drawing = true;
    context.beginPath();
    context.moveTo(event.clientX - rect.left, event.clientY - rect.top);
  }

  move(event: PointerEvent): void {
    const context = this.ctx();
    const rect = this.canvas()?.nativeElement.getBoundingClientRect();
    if (!context || !rect || !this.drawing) {
      return;
    }
    context.lineTo(event.clientX - rect.left, event.clientY - rect.top);
    context.stroke();
    this.signed.set(true);
  }

  end(): void {
    this.drawing = false;
  }

  clear(): void {
    const el = this.canvas()?.nativeElement;
    if (!el) {
      return;
    }
    this.ctx()?.clearRect(0, 0, el.width, el.height);
    this.signed.set(false);
  }

  /** PNG data URL of the signature, or null when blank. */
  toDataUrl(): string | null {
    const el = this.canvas()?.nativeElement;
    if (!el || !this.signed()) {
      return null;
    }
    return el.toDataURL('image/png');
  }
}