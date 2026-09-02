import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ChatStore } from './chat.store';
import { SessionStore } from '../../core/auth/session';
import * as i0 from "@angular/core";
import * as i1 from "@angular/forms";
const _forTrack0 = ($index, $item) => $item.id;
function ChatPage_Conditional_5_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p", 3);
    i0.ɵɵtext(1, "No conversations yet. Find a caregiver in the marketplace and tap \u201CMessage\u201D.");
    i0.ɵɵelementEnd();
} }
function ChatPage_Conditional_6_For_2_Conditional_4_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "span", 7);
    i0.ɵɵtext(1);
    i0.ɵɵelementEnd();
} if (rf & 2) {
    const conv_r2 = i0.ɵɵnextContext().$implicit;
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(conv_r2.unread);
} }
function ChatPage_Conditional_6_For_2_Template(rf, ctx) { if (rf & 1) {
    const _r1 = i0.ɵɵgetCurrentView();
    i0.ɵɵelementStart(0, "li")(1, "button", 5);
    i0.ɵɵlistener("click", function ChatPage_Conditional_6_For_2_Template_button_click_1_listener() { const conv_r2 = i0.ɵɵrestoreView(_r1).$implicit; const ctx_r2 = i0.ɵɵnextContext(2); return i0.ɵɵresetView(ctx_r2.open(conv_r2.id)); });
    i0.ɵɵelementStart(2, "span", 6);
    i0.ɵɵtext(3);
    i0.ɵɵelementEnd();
    i0.ɵɵconditionalCreate(4, ChatPage_Conditional_6_For_2_Conditional_4_Template, 2, 1, "span", 7);
    i0.ɵɵelementEnd()();
} if (rf & 2) {
    const conv_r2 = ctx.$implicit;
    const ctx_r2 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance();
    i0.ɵɵclassProp("active", conv_r2.id === ctx_r2.activeId());
    i0.ɵɵadvance(2);
    i0.ɵɵtextInterpolate(conv_r2.displayName);
    i0.ɵɵadvance();
    i0.ɵɵconditional(conv_r2.unread > 0 ? 4 : -1);
} }
function ChatPage_Conditional_6_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "ul");
    i0.ɵɵrepeaterCreate(1, ChatPage_Conditional_6_For_2_Template, 5, 4, "li", null, _forTrack0);
    i0.ɵɵelementEnd();
} if (rf & 2) {
    const ctx_r2 = i0.ɵɵnextContext();
    i0.ɵɵadvance();
    i0.ɵɵrepeater(ctx_r2.conversations());
} }
function ChatPage_Conditional_8_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p", 3);
    i0.ɵɵtext(1, "Select a conversation to start chatting.");
    i0.ɵɵelementEnd();
} }
function ChatPage_Conditional_9_For_2_Conditional_3_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵtext(0, " not delivered ");
} }
function ChatPage_Conditional_9_For_2_Conditional_4_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵtext(0, " sending\u2026 ");
} }
function ChatPage_Conditional_9_For_2_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p", 14);
    i0.ɵɵtext(1);
    i0.ɵɵelementStart(2, "span", 15);
    i0.ɵɵconditionalCreate(3, ChatPage_Conditional_9_For_2_Conditional_3_Template, 1, 0)(4, ChatPage_Conditional_9_For_2_Conditional_4_Template, 1, 0);
    i0.ɵɵelementEnd()();
} if (rf & 2) {
    const msg_r5 = ctx.$implicit;
    const ctx_r2 = i0.ɵɵnextContext(2);
    i0.ɵɵclassProp("mine", msg_r5.authorId === ctx_r2.myId());
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate1(" ", msg_r5.text, " ");
    i0.ɵɵadvance(2);
    i0.ɵɵconditional(msg_r5.status === "failed" ? 3 : msg_r5.status === "sending" ? 4 : -1);
} }
function ChatPage_Conditional_9_Conditional_3_Template(rf, ctx) { if (rf & 1) {
    i0.ɵɵelementStart(0, "p", 10);
    i0.ɵɵtext(1);
    i0.ɵɵelementEnd();
} if (rf & 2) {
    const ctx_r2 = i0.ɵɵnextContext(2);
    i0.ɵɵadvance();
    i0.ɵɵtextInterpolate(ctx_r2.store.sendError());
} }
function ChatPage_Conditional_9_Template(rf, ctx) { if (rf & 1) {
    const _r4 = i0.ɵɵgetCurrentView();
    i0.ɵɵelementStart(0, "div", 8);
    i0.ɵɵrepeaterCreate(1, ChatPage_Conditional_9_For_2_Template, 5, 4, "p", 9, _forTrack0);
    i0.ɵɵelementEnd();
    i0.ɵɵconditionalCreate(3, ChatPage_Conditional_9_Conditional_3_Template, 2, 1, "p", 10);
    i0.ɵɵelementStart(4, "form", 11);
    i0.ɵɵlistener("ngSubmit", function ChatPage_Conditional_9_Template_form_ngSubmit_4_listener() { i0.ɵɵrestoreView(_r4); const ctx_r2 = i0.ɵɵnextContext(); return i0.ɵɵresetView(ctx_r2.send()); });
    i0.ɵɵelementStart(5, "input", 12);
    i0.ɵɵtwoWayListener("ngModelChange", function ChatPage_Conditional_9_Template_input_ngModelChange_5_listener($event) { i0.ɵɵrestoreView(_r4); const ctx_r2 = i0.ɵɵnextContext(); i0.ɵɵtwoWayBindingSet(ctx_r2.draft, $event) || (ctx_r2.draft = $event); return i0.ɵɵresetView($event); });
    i0.ɵɵelementEnd();
    i0.ɵɵcontrolCreate();
    i0.ɵɵelementStart(6, "button", 13);
    i0.ɵɵtext(7, "Send");
    i0.ɵɵelementEnd()();
} if (rf & 2) {
    const ctx_r2 = i0.ɵɵnextContext();
    i0.ɵɵadvance();
    i0.ɵɵrepeater(ctx_r2.activeMessages());
    i0.ɵɵadvance(2);
    i0.ɵɵconditional(ctx_r2.store.sendError() ? 3 : -1);
    i0.ɵɵadvance(2);
    i0.ɵɵtwoWayProperty("ngModel", ctx_r2.draft);
    i0.ɵɵcontrol();
    i0.ɵɵadvance();
    i0.ɵɵproperty("disabled", !ctx_r2.draft.trim());
} }
export class ChatPage {
    store = inject(ChatStore);
    route = inject(ActivatedRoute);
    session = inject(SessionStore);
    draft = '';
    conversations = this.store.conversations;
    activeId = this.store.activeId;
    activeMessages = this.store.activeMessages;
    myId = () => this.session.session()?.userId ?? '';
    ngOnInit() {
        const params = this.route.snapshot.queryParamMap;
        const peerId = params.get('with');
        if (peerId) {
            this.store.openConversation(peerId, params.get('name') ?? peerId);
        }
        this.store.connect();
    }
    open(id) {
        this.store.openConversation(id);
    }
    send() {
        this.store.send(this.draft);
        this.draft = '';
    }
    static ɵfac = function ChatPage_Factory(__ngFactoryType__) { return new (__ngFactoryType__ || ChatPage)(); };
    static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({ type: ChatPage, selectors: [["app-chat"]], decls: 10, vars: 2, consts: [[1, "chat"], [1, "chat-layout"], ["aria-label", "Conversations", 1, "chat-list"], [1, "muted"], [1, "chat-thread"], ["type", "button", 1, "conv", 3, "click"], [1, "name"], [1, "badge"], ["aria-live", "polite", 1, "messages"], [1, "msg", 3, "mine"], ["role", "alert", 1, "error"], [1, "composer", 3, "ngSubmit"], ["type", "text", "name", "message", "placeholder", "Type a message\u2026", "autocomplete", "off", 3, "ngModelChange", "ngModel"], ["type", "submit", 3, "disabled"], [1, "msg"], [1, "meta"]], template: function ChatPage_Template(rf, ctx) { if (rf & 1) {
            i0.ɵɵelementStart(0, "section", 0)(1, "h1");
            i0.ɵɵtext(2, "Chat");
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(3, "div", 1)(4, "aside", 2);
            i0.ɵɵconditionalCreate(5, ChatPage_Conditional_5_Template, 2, 0, "p", 3)(6, ChatPage_Conditional_6_Template, 3, 0, "ul");
            i0.ɵɵelementEnd();
            i0.ɵɵelementStart(7, "div", 4);
            i0.ɵɵconditionalCreate(8, ChatPage_Conditional_8_Template, 2, 0, "p", 3)(9, ChatPage_Conditional_9_Template, 8, 3);
            i0.ɵɵelementEnd()()();
        } if (rf & 2) {
            i0.ɵɵadvance(5);
            i0.ɵɵconditional(ctx.conversations().length === 0 ? 5 : 6);
            i0.ɵɵadvance(3);
            i0.ɵɵconditional(ctx.activeId() === null ? 8 : 9);
        } }, dependencies: [FormsModule, i1.ɵNgNoValidate, i1.DefaultValueAccessor, i1.NgControlStatus, i1.NgControlStatusGroup, i1.NgModel, i1.NgForm], styles: [".chat-layout[_ngcontent-%COMP%] {\n      display: grid;\n      grid-template-columns: 16rem 1fr;\n      gap: 1rem;\n      align-items: start;\n    }\n    .chat-list[_ngcontent-%COMP%]   ul[_ngcontent-%COMP%] {\n      list-style: none;\n      margin: 0;\n      padding: 0;\n      display: grid;\n      gap: 0.35rem;\n    }\n    .chat-list[_ngcontent-%COMP%]   .conv[_ngcontent-%COMP%] {\n      display: flex;\n      justify-content: space-between;\n      align-items: center;\n      width: 100%;\n      padding: 0.6rem 0.8rem;\n      border-radius: 0.5rem;\n      text-decoration: none;\n      color: var(--%NS%text);\n      background: var(--%NS%surface);\n      border: 1px solid var(--%NS%border);\n    }\n    .chat-list[_ngcontent-%COMP%]   .conv.active[_ngcontent-%COMP%] {\n      border-color: var(--%NS%accent);\n      background: var(--%NS%accent-soft);\n    }\n    .badge[_ngcontent-%COMP%] {\n      background: var(--%NS%accent);\n      color: #fff;\n      border-radius: 999px;\n      font-size: 0.75rem;\n      padding: 0.05rem 0.45rem;\n      font-weight: 700;\n    }\n    .messages[_ngcontent-%COMP%] {\n      display: flex;\n      flex-direction: column;\n      gap: 0.5rem;\n      max-height: 22rem;\n      overflow-y: auto;\n      padding: 0.75rem;\n      background: var(--%NS%surface);\n      border: 1px solid var(--%NS%border);\n      border-radius: 0.75rem;\n    }\n    .msg[_ngcontent-%COMP%] {\n      align-self: flex-start;\n      max-width: 75%;\n      background: var(--%NS%surface-raised);\n      border-radius: 0.75rem;\n      padding: 0.45rem 0.7rem;\n      margin: 0;\n    }\n    .msg.mine[_ngcontent-%COMP%] {\n      align-self: flex-end;\n      background: var(--%NS%accent-soft);\n    }\n    .msg[_ngcontent-%COMP%]   .meta[_ngcontent-%COMP%] {\n      display: block;\n      font-size: 0.7rem;\n      color: var(--%NS%text-muted);\n    }\n    .composer[_ngcontent-%COMP%] {\n      display: flex;\n      gap: 0.5rem;\n      margin-top: 0.75rem;\n      max-width: none;\n    }\n    .muted[_ngcontent-%COMP%] {\n      color: var(--%NS%text-muted);\n    }"] });
}
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassMetadata(ChatPage, [{
        type: Component,
        args: [{ selector: 'app-chat', standalone: true, imports: [FormsModule], template: `
    <section class="chat">
      <h1>Chat</h1>

      <div class="chat-layout">
        <aside class="chat-list" aria-label="Conversations">
          @if (conversations().length === 0) {
            <p class="muted">No conversations yet. Find a caregiver in the marketplace and tap “Message”.</p>
          } @else {
            <ul>
              @for (conv of conversations(); track conv.id) {
                <li>
                  <button
                    type="button"
                    class="conv"
                    (click)="open(conv.id)"
                    [class.active]="conv.id === activeId()"
                  >
                    <span class="name">{{ conv.displayName }}</span>
                    @if (conv.unread > 0) {
                      <span class="badge">{{ conv.unread }}</span>
                    }
                  </button>
                </li>
              }
            </ul>
          }
        </aside>

        <div class="chat-thread">
          @if (activeId() === null) {
            <p class="muted">Select a conversation to start chatting.</p>
          } @else {
            <div class="messages" aria-live="polite">
              @for (msg of activeMessages(); track msg.id) {
                <p class="msg" [class.mine]="msg.authorId === myId()">
                  {{ msg.text }}
                  <span class="meta">
                    @if (msg.status === 'failed') {
                      not delivered
                    } @else if (msg.status === 'sending') {
                      sending…
                    }
                  </span>
                </p>
              }
            </div>
            @if (store.sendError()) {
              <p class="error" role="alert">{{ store.sendError() }}</p>
            }
            <form class="composer" (ngSubmit)="send()">
              <input
                type="text"
                [(ngModel)]="draft"
                name="message"
                placeholder="Type a message…"
                autocomplete="off"
              />
              <button type="submit" [disabled]="!draft.trim()">Send</button>
            </form>
          }
        </div>
      </div>
    </section>
  `, styles: ["\n    .chat-layout {\n      display: grid;\n      grid-template-columns: 16rem 1fr;\n      gap: 1rem;\n      align-items: start;\n    }\n    .chat-list ul {\n      list-style: none;\n      margin: 0;\n      padding: 0;\n      display: grid;\n      gap: 0.35rem;\n    }\n    .chat-list .conv {\n      display: flex;\n      justify-content: space-between;\n      align-items: center;\n      width: 100%;\n      padding: 0.6rem 0.8rem;\n      border-radius: 0.5rem;\n      text-decoration: none;\n      color: var(--text);\n      background: var(--surface);\n      border: 1px solid var(--border);\n    }\n    .chat-list .conv.active {\n      border-color: var(--accent);\n      background: var(--accent-soft);\n    }\n    .badge {\n      background: var(--accent);\n      color: #fff;\n      border-radius: 999px;\n      font-size: 0.75rem;\n      padding: 0.05rem 0.45rem;\n      font-weight: 700;\n    }\n    .messages {\n      display: flex;\n      flex-direction: column;\n      gap: 0.5rem;\n      max-height: 22rem;\n      overflow-y: auto;\n      padding: 0.75rem;\n      background: var(--surface);\n      border: 1px solid var(--border);\n      border-radius: 0.75rem;\n    }\n    .msg {\n      align-self: flex-start;\n      max-width: 75%;\n      background: var(--surface-raised);\n      border-radius: 0.75rem;\n      padding: 0.45rem 0.7rem;\n      margin: 0;\n    }\n    .msg.mine {\n      align-self: flex-end;\n      background: var(--accent-soft);\n    }\n    .msg .meta {\n      display: block;\n      font-size: 0.7rem;\n      color: var(--text-muted);\n    }\n    .composer {\n      display: flex;\n      gap: 0.5rem;\n      margin-top: 0.75rem;\n      max-width: none;\n    }\n    .muted {\n      color: var(--text-muted);\n    }\n  "] }]
    }], null, null); })();
(() => { (typeof ngDevMode === "undefined" || ngDevMode) && i0.ɵsetClassDebugInfo(ChatPage, { className: "ChatPage", filePath: "src/app/features/marketplace/chat.page.ts", lineNumber: 153 }); })();
