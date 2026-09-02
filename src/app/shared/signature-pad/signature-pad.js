import { Component, signal, viewChild } from '@angular/core';
import * as i0 from "@angular/core";
const _c0 = ["canvas"];
/**
 * Canvas signature capture (PLAN.md §5 Phase 2 — Clinical log). Draws with
 * pointer events, exposes a clear action and `toDataUrl()`. The signature is
 * only "signed" once at least one stroke has been drawn.
 */
export class SignaturePad {
    canvas = viewChild('canvas', /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "canvas" }] : /* istanbul ignore next */ []));
    context = null;
    drawing = false;
    /** True once the user has drawn at least a stroke. */
    signed = signal(false, /* @ts-ignore */
    ...(ngDevMode ? [{ debugName: "signed" }] : /* istanbul ignore next */ []));
    ctx() {
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
    start(event) {
        const context = this.ctx();
        const rect = this.canvas()?.nativeElement.getBoundingClientRect();
        if (!context || !rect) {
            return;
        }
        this.drawing = true;
        context.beginPath();
        context.moveTo(event.clientX - rect.left, event.clientY - rect.top);
    }
    move(event) {
        const context = this.ctx();
        const rect = this.canvas()?.nativeElement.getBoundingClientRect();
        if (!context || !rect || !this.drawing) {
            return;
        }
        context.lineTo(event.clientX - rect.left, event.clientY - rect.top);
        context.stroke();
        this.signed.set(true);
    }
    end() {
        this.drawing = false;
    }
    clear() {
        const el = this.canvas()?.nativeElement;
        if (!el) {
            return;
        }
        this.ctx()?.clearRect(0, 0, el.width, el.height);
        this.signed.set(false);
    }
    /** PNG data URL of the signature, or null when blank. */
    toDataUrl() {
        const el = this.canvas()?.nativeElement;
        if (!el || !this.signed()) {
            return null;
        }
        return el.toDataURL('image/png');
    }
    static ɵfac = function SignaturePad_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || SignaturePad)(); };
    static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: SignaturePad, selectors: [["app-signature-pad"]], viewQuery: function SignaturePad_Query(rf, ctx) { if (rf & 1) {
            i0.ɵɵviewQuerySignal(ctx.canvas, _c0, 5);
        } if (rf & 2) {
            i0.ɵɵqueryAdvance();
        } }, decls: 5, vars: 1, consts: [["canvas", ""], [1, "sig-pad"], ["width", "380", "height", "140", "aria-label", "Signature canvas \u2014 draw with your mouse or finger", 3, "pointerdown", "pointermove", "pointerup", "pointerleave"], ["type", "button", 1, "secondary", 3, "click", "disabled"]], template: function SignaturePad_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵdomElementStart(0, "div", 1)(1, "canvas", 2, 0);
            i0.ɵɵdomListener("pointerdown", function SignaturePad_Template_canvas_pointerdown_1_listener($event) { return ctx.start($event); })("pointermove", function SignaturePad_Template_canvas_pointermove_1_listener($event) { return ctx.move($event); })("pointerup", function SignaturePad_Template_canvas_pointerup_1_listener() { return ctx.end(); })("pointerleave", function SignaturePad_Template_canvas_pointerleave_1_listener() { return ctx.end(); });
            i0.ɵɵdomElementEnd();
            i0.ɵɵdomElementStart(3, "button", 3);
            i0.ɵɵdomListener("click", function SignaturePad_Template_button_click_3_listener() { return ctx.clear(); });
            i0.ɵɵtext(4, " Clear ");
            i0.ɵɵdomElementEnd()();
        } if (rf & 2) {
            i0.ɵɵadvance(3);
            i0.ɵɵdomProperty("disabled", !ctx.signed());
        } }, styles: [".sig-pad[_ngcontent-%COMP%] { display: inline-flex; flex-direction: column; gap: 0.5rem; }\n    canvas[_ngcontent-%COMP%] {\n      border: 1px dashed var(--%NS%border);\n      border-radius: 0.5rem;\n      background: var(--%NS%surface);\n      touch-action: none;\n      cursor: crosshair;\n    }"] });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(SignaturePad, [{
        type: Component,
        args: [{ selector: 'app-signature-pad', standalone: true, template: `
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
  `, styles: ["\n    .sig-pad { display: inline-flex; flex-direction: column; gap: 0.5rem; }\n    canvas {\n      border: 1px dashed var(--border);\n      border-radius: 0.5rem;\n      background: var(--surface);\n      touch-action: none;\n      cursor: crosshair;\n    }\n  "] }]
    }], null, { canvas: [{ type: i0.ViewChild, args: ['canvas', { isSignal: true }] }] }); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(SignaturePad, { className: "SignaturePad", filePath: "src/app/shared/signature-pad/signature-pad.ts", lineNumber: 39 }); })();
