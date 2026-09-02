import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CarePlanStore, careGoalStatusLabel } from './care-plan.store';
import * as i0 from "@angular/core";
import * as i1 from "@angular/forms";
const _forTrack0 = ($index, $item) => $item.id;
function CarePlanPage_Conditional_3_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p");
    i0.ɵɵtext(1, "Loading\u2026");
    i0.ɵɵelementEnd();
} }
function CarePlanPage_Conditional_4_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p");
    i0.ɵɵtext(1, "No care plan yet for this user.");
    i0.ɵɵelementEnd();
} }
function CarePlanPage_Conditional_5_For_8_Template(rf, ctx) { if (rf & 1) {
    const _r2 = i0.ɵɵgetCurrentView();
    i0.ɵɵelementStart(0, "li", 3)(1, "span", 12);
    i0.ɵɵtext(2);
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(3, "p");
    i0.ɵɵtext(4);
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(5, "button", 13);
    i0.ɵɵlistener("click", function CarePlanPage_Conditional_5_For_8_Template_button_click_5_listener() { const goal_r3 = i0.ɵɵrestoreView(_r2).$implicit; const ctx_r3 = i0.ɵɵnextContext(2); return i0.ɵɵresetView(ctx_r3.advance(goal_r3)); });
    i0.ɵɵtext(6);
    i0.ɵɵelementEnd()();
} if (rf & 2) {
    const goal_r3 = ctx.$implicit;
    const ctx_r3 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance();
    i0.ɵɵclassProp("ok", goal_r3.status === "done")("now", goal_r3.status === "in-progress");
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate1(" ", ctx_r3.careGoalStatusLabel(goal_r3.status), " ");
    i0.ɵɵadvance(2);
    i0.ɵɵtextInterpolate(goal_r3.text);
    i0.ɵɵadvance();
    i0.ɵɵproperty("disabled", ctx_r3.store.saving());
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate1("\u2192 ", ctx_r3.careGoalStatusLabel(ctx_r3.NEXT_STATUS[goal_r3.status]));
} }
function CarePlanPage_Conditional_5_For_18_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "article", 9)(1, "p", 1);
    i0.ɵɵtext(2);
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(3, "p");
    i0.ɵɵtext(4);
    i0.ɵɵelementEnd()();
} if (rf & 2) {
    const note_r5 = ctx.$implicit;
    const ctx_r3 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance(2);
    i0.ɵɵtextInterpolate3("", note_r5.authorName, " \u00B7 ", note_r5.authorRole, " \u00B7 ", ctx_r3.formatDate(note_r5.atMs));
    i0.ɵɵadvance(2);
    i0.ɵɵtextInterpolate(note_r5.text);
} }
function CarePlanPage_Conditional_5_Conditional_19_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p", 1);
    i0.ɵɵtext(1, "No notes yet \u2014 nurses and physios can add updates here.");
    i0.ɵɵelementEnd();
} }
function CarePlanPage_Conditional_5_Conditional_24_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p", 11);
    i0.ɵɵtext(1);
    i0.ɵɵelementEnd();
} if (rf & 2) {
    const ctx_r3 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(ctx_r3.store.error());
} }
function CarePlanPage_Conditional_5_Template(rf, ctx) { if (rf & 1) {
    const _r1 = i0.ɵɵgetCurrentView();
    i0.ɵɵelementStart(0, "h2");
    i0.ɵɵtext(1);
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(2, "p", 1);
    i0.ɵɵtext(3);
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(4, "h3");
    i0.ɵɵtext(5, "Goals");
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(6, "ul", 2);
    i0.ɵɵrepeaterCreate(7, CarePlanPage_Conditional_5_For_8_Template, 7, 8, "li", 3, _forTrack0);
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(9, "form", 4);
    i0.ɵɵlistener("ngSubmit", function CarePlanPage_Conditional_5_Template_form_ngSubmit_9_listener() { i0.ɵɵrestoreView(_r1); const ctx_r3 = i0.ɵɵnextContext(); return i0.ɵɵresetView(ctx_r3.addGoal()); });
    i0.ɵɵelementStart(10, "div", 5);
    i0.ɵɵelement(11, "input", 6);
    i0.ɵɵcontrolCreate();
    i0.ɵɵelementStart(12, "button", 7);
    i0.ɵɵtext(13, "Add");
    i0.ɵɵelementEnd()()();
    i0.ɵɵelementStart(14, "h3");
    i0.ɵɵtext(15, "Care notes");
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(16, "div", 8);
    i0.ɵɵrepeaterCreate(17, CarePlanPage_Conditional_5_For_18_Template, 5, 4, "article", 9, _forTrack0);
    i0.ɵɵconditionalCreate(19, CarePlanPage_Conditional_5_Conditional_19_Template, 2, 0, "p", 1);
    i0.ɵɵelementEnd();
    i0.ɵɵelementStart(20, "form", 4);
    i0.ɵɵlistener("ngSubmit", function CarePlanPage_Conditional_5_Template_form_ngSubmit_20_listener() { i0.ɵɵrestoreView(_r1); const ctx_r3 = i0.ɵɵnextContext(); return i0.ɵɵresetView(ctx_r3.addNote()); });
    i0.ɵɵelement(21, "textarea", 10);
    i0.ɵɵcontrolCreate();
    i0.ɵɵelementStart(22, "button", 7);
    i0.ɵɵtext(23, "Add note");
    i0.ɵɵelementEnd()();
    i0.ɵɵconditionalCreate(24, CarePlanPage_Conditional_5_Conditional_24_Template, 2, 1, "p", 11);
} if (rf & 2) {
    const ctx_r3 = i0.ɵɵnextContext();
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(ctx_r3.store.plan().clientName);
    i0.ɵɵadvance(2);
    i0.ɵɵtextInterpolate2(" Updated ", ctx_r3.formatDate(ctx_r3.store.plan().updatedAtMs), " by ", ctx_r3.store.plan().updatedBy, " ");
    i0.ɵɵadvance(4);
    i0.ɵɵrepeater(ctx_r3.store.plan().goals);
    i0.ɵɵadvance(2);
    i0.ɵɵproperty("formGroup", ctx_r3.goalForm);
    i0.ɵɵadvance(2);
    i0.ɵɵcontrol();
    i0.ɵɵadvance();
    i0.ɵɵproperty("disabled", ctx_r3.store.saving() || ctx_r3.goalForm.invalid);
    i0.ɵɵadvance(5);
    i0.ɵɵrepeater(ctx_r3.store.plan().notes);
    i0.ɵɵadvance(2);
    i0.ɵɵconditional(ctx_r3.store.plan().notes.length === 0 ? 19 : -1);
    i0.ɵɵadvance();
    i0.ɵɵproperty("formGroup", ctx_r3.noteForm);
    i0.ɵɵadvance();
    i0.ɵɵcontrol();
    i0.ɵɵadvance();
    i0.ɵɵproperty("disabled", ctx_r3.store.saving() || ctx_r3.noteForm.invalid);
    i0.ɵɵadvance(2);
    i0.ɵɵconditional(ctx_r3.store.error() ? 24 : -1);
} }
const NEXT_STATUS = {
    open: 'in-progress',
    'in-progress': 'done',
    done: 'open',
};
export class CarePlanPage {
    store = inject(CarePlanStore);
    fb = inject(FormBuilder);
    goalForm = this.fb.nonNullable.group({
        text: ['', [Validators.required, Validators.minLength(3)]],
    });
    noteForm = this.fb.nonNullable.group({
        text: ['', [Validators.required, Validators.minLength(3)]],
    });
    NEXT_STATUS = NEXT_STATUS;
    ngOnInit() {
        this.store.load();
    }
    addGoal() {
        if (this.goalForm.invalid) {
            return;
        }
        const text = this.goalForm.getRawValue().text;
        this.store.addGoal(text).subscribe((ok) => {
            if (ok) {
                this.goalForm.reset();
            }
        });
    }
    advance(goal) {
        this.store.setGoalStatus(goal.id, NEXT_STATUS[goal.status]).subscribe();
    }
    addNote() {
        if (this.noteForm.invalid) {
            return;
        }
        const text = this.noteForm.getRawValue().text;
        this.store.addNote(text).subscribe((ok) => {
            if (ok) {
                this.noteForm.reset();
            }
        });
    }
    careGoalStatusLabel(status) {
        return careGoalStatusLabel(status);
    }
    formatDate(ms) {
        return new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
    static ɵfac = function CarePlanPage_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || CarePlanPage)(); };
    static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: CarePlanPage, selectors: [["app-care-plan"]], decls: 6, vars: 1, consts: [[1, "care-plan"], [1, "meta"], [1, "results"], [1, "card", "goal"], [3, "ngSubmit", "formGroup"], [1, "row"], ["type", "text", "formControlName", "text", "placeholder", "New goal\u2026"], ["type", "submit", 3, "disabled"], [1, "notes"], [1, "card", "note"], ["rows", "2", "formControlName", "text", "placeholder", "Update for the care team (nurses & physios)\u2026"], ["role", "alert", 1, "error"], [1, "chip"], ["type", "button", 1, "secondary", 3, "click", "disabled"]], template: function CarePlanPage_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵelementStart(0, "section", 0)(1, "h1");
            i0.ɵɵtext(2, "Care plan");
            i0.ɵɵelementEnd();
            i0.ɵɵconditionalCreate(3, CarePlanPage_Conditional_3_Template, 2, 0, "p")(4, CarePlanPage_Conditional_4_Template, 2, 0, "p")(5, CarePlanPage_Conditional_5_Template, 25, 9);
            i0.ɵɵelementEnd();
        } if (rf & 2) {
            i0.ɵɵadvance(3);
            i0.ɵɵconditional(ctx.store.loading() ? 3 : !ctx.store.plan() ? 4 : 5);
        } }, dependencies: [ReactiveFormsModule, i1.ɵNgNoValidate, i1.DefaultValueAccessor, i1.NgControlStatus, i1.NgControlStatusGroup, i1.FormGroupDirective, i1.FormControlName], styles: ["h3[_ngcontent-%COMP%] { margin: 1.5rem 0 0.5rem; font-size: 1.1rem; }\n    .goal[_ngcontent-%COMP%] { display: flex; align-items: center; gap: 0.75rem; }\n    .goal[_ngcontent-%COMP%]   p[_ngcontent-%COMP%] { flex: 1; margin: 0; }\n    .chip.ok[_ngcontent-%COMP%] { background: var(--%NS%success); color: #fff; }\n    .notes[_ngcontent-%COMP%] { display: grid; gap: 0.6rem; margin-bottom: 1rem; }\n    .row[_ngcontent-%COMP%] { display: flex; gap: 0.5rem; max-width: none; }\n    .row[_ngcontent-%COMP%]   input[_ngcontent-%COMP%] { flex: 1; }"] });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(CarePlanPage, [{
        type: Component,
        args: [{ selector: 'app-care-plan', standalone: true, imports: [ReactiveFormsModule], template: `
    <section class="care-plan">
      <h1>Care plan</h1>

      @if (store.loading()) {
        <p>Loading…</p>
      } @else if (!store.plan()) {
        <p>No care plan yet for this user.</p>
      } @else {
        <h2>{{ store.plan()!.clientName }}</h2>
        <p class="meta">
          Updated {{ formatDate(store.plan()!.updatedAtMs) }} by {{ store.plan()!.updatedBy }}
        </p>

        <h3>Goals</h3>
        <ul class="results">
          @for (goal of store.plan()!.goals; track goal.id) {
            <li class="card goal">
              <span class="chip"
                [class.ok]="goal.status === 'done'"
                [class.now]="goal.status === 'in-progress'">
                {{ careGoalStatusLabel(goal.status) }}
              </span>
              <p>{{ goal.text }}</p>
              <button type="button" class="secondary"
                [disabled]="store.saving()"
                (click)="advance(goal)">→ {{ careGoalStatusLabel(NEXT_STATUS[goal.status]) }}</button>
            </li>
          }
        </ul>

        <form [formGroup]="goalForm" (ngSubmit)="addGoal()">
          <div class="row">
            <input type="text" formControlName="text" placeholder="New goal…" />
            <button type="submit" [disabled]="store.saving() || goalForm.invalid">Add</button>
          </div>
        </form>

        <h3>Care notes</h3>
        <div class="notes">
          @for (note of store.plan()!.notes; track note.id) {
            <article class="card note">
              <p class="meta">{{ note.authorName }} · {{ note.authorRole }} · {{ formatDate(note.atMs) }}</p>
              <p>{{ note.text }}</p>
            </article>
          }
          @if (store.plan()!.notes.length === 0) {
            <p class="meta">No notes yet — nurses and physios can add updates here.</p>
          }
        </div>

        <form [formGroup]="noteForm" (ngSubmit)="addNote()">
          <textarea rows="2" formControlName="text"
            placeholder="Update for the care team (nurses & physios)…"></textarea>
          <button type="submit" [disabled]="store.saving() || noteForm.invalid">Add note</button>
        </form>

        @if (store.error()) {
          <p class="error" role="alert">{{ store.error() }}</p>
        }
      }
    </section>
  `, styles: ["\n    h3 { margin: 1.5rem 0 0.5rem; font-size: 1.1rem; }\n    .goal { display: flex; align-items: center; gap: 0.75rem; }\n    .goal p { flex: 1; margin: 0; }\n    .chip.ok { background: var(--success); color: #fff; }\n    .notes { display: grid; gap: 0.6rem; margin-bottom: 1rem; }\n    .row { display: flex; gap: 0.5rem; max-width: none; }\n    .row input { flex: 1; }\n  "] }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(CarePlanPage, { className: "CarePlanPage", filePath: "src/app/features/home-health/care-plan.page.ts", lineNumber: 88 }); })();
