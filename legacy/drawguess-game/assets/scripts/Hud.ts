import { _decorator, Component, Node, Label, UITransform, Graphics, Color } from 'cc';
import { COLOR, PENS, PEN_WIDTHS } from './Constants';
import type { WordItem } from './Words';

const { ccclass } = _decorator;

interface Btn {
    text: string;
    primary: boolean;
    cb: () => void;
}

/** 界面层：顶部信息、画笔工具栏、各类面板 */
@ccclass('Hud')
export class Hud extends Component {
    private _status: Label | null = null;
    private _timer: Label | null = null;
    private _score: Label | null = null;
    private _tools: Node | null = null;
    private _penDots: Node[] = [];
    private _widthBtns: Node[] = [];
    private _eraserBtn: Node | null = null;
    private _panel: Node | null = null;
    private _card: Node | null = null;
    private _doneBtn: Node | null = null;

    private _onPen: ((i: number) => void) | null = null;
    private _onWidth: ((i: number) => void) | null = null;
    private _onEraser: (() => void) | null = null;
    private _onUndo: (() => void) | null = null;
    private _onClear: (() => void) | null = null;
    private _onDone: (() => void) | null = null;

    onPen(fn: (i: number) => void): void {
        this._onPen = fn;
    }

    onWidth(fn: (i: number) => void): void {
        this._onWidth = fn;
    }

    onEraser(fn: () => void): void {
        this._onEraser = fn;
    }

    onUndo(fn: () => void): void {
        this._onUndo = fn;
    }

    onClear(fn: () => void): void {
        this._onClear = fn;
    }

    onDone(fn: () => void): void {
        this._onDone = fn;
    }

    // ---------------------------------------------------------------- 构建

    build(w: number, h: number, topY: number, toolY: number): void {
        this._status = this._label(this.node, 'status', '', 30, COLOR.text, 0, topY + 22);
        this._timer = this._label(this.node, 'timer', '', 40, COLOR.accent, 0, topY - 16);
        this._score = this._label(this.node, 'score', '', 24, COLOR.muted, 0, topY - 58);

        this._tools = new Node('tools');
        this._tools.addComponent(UITransform);
        this._tools.setPosition(0, toolY, 0);
        this.node.addChild(this._tools);

        const toolW = Math.min(w * 0.94, 660);
        const half = toolW / 2;

        // 第一行：颜色（左） + 橡皮（右）
        const rowY1 = 44;
        for (let i = 0; i < PENS.length; i++) {
            const x = -half + 30 + i * 48;
            const dot = this._rect(this._tools, 'pen' + i, x, rowY1, 36, 36, 18, PENS[i], null, 0);
            dot.on(Node.EventType.TOUCH_END, () => {
                if (this._onPen) {
                    this._onPen(i);
                }
            }, this);
            this._penDots.push(dot);
            this._rect(this._tools, 'penRing' + i, x, rowY1, 44, 44, 22, new Color(0, 0, 0, 0), COLOR.border, 2);
        }
        this._eraserBtn = this._textBtn('eraser', '橡皮', half - 54, rowY1, 96, 52, () => {
            if (this._onEraser) {
                this._onEraser();
            }
        });

        // 第二行：笔宽（左） + 撤销 / 清空（右）
        const rowY2 = -30;
        for (let i = 0; i < PEN_WIDTHS.length; i++) {
            const x = -half + 30 + i * 52;
            const btn = this._rect(this._tools, 'wid' + i, x, rowY2, 44, 44, 22, new Color(255, 255, 255, 255), COLOR.border, 2);
            const r = 3 + i * 3;
            const n = new Node('dot');
            n.addComponent(UITransform);
            const ng = n.addComponent(Graphics);
            ng.fillColor = COLOR.text;
            ng.circle(0, 0, r);
            ng.fill();
            btn.addChild(n);
            this._widthBtns.push(btn);
            btn.on(Node.EventType.TOUCH_END, () => {
                if (this._onWidth) {
                    this._onWidth(i);
                }
            }, this);
        }
        this._textBtn('undo', '撤销', half - 152, rowY2, 96, 52, () => {
            if (this._onUndo) {
                this._onUndo();
            }
        });
        this._textBtn('clear', '清空', half - 54, rowY2, 96, 52, () => {
            if (this._onClear) {
                this._onClear();
            }
        });

        this._panel = new Node('panel');
        this._panel.addComponent(UITransform);
        this._panel.active = false;
        this.node.addChild(this._panel);
        this._card = new Node('card');
        this._card.addComponent(UITransform);
        this._panel.addChild(this._card);
    }

    private _textBtn(name: string, text: string, x: number, y: number, w: number, h: number, cb: () => void): Node {
        const n = this._rect(this._tools!, name, x, y, w, h, 14, new Color(255, 255, 255, 255), COLOR.border, 2);
        this._labelFit(n, 't', text, 24, COLOR.text, w, h);
        n.on(Node.EventType.TOUCH_END, cb, this);
        return n;
    }

    /** 画布下方的「画好了」按钮 */
    buildDoneButton(parent: Node, x: number, y: number, w: number, cb: () => void): Node {
        const n = this._rect(parent, 'doneBtn', x, y, w, 84, 22, COLOR.accent, null, 0);
        this._labelFit(n, 't', '画好了', 30, new Color(255, 255, 255, 255), w, 84);
        n.on(Node.EventType.TOUCH_END, cb, this);
        this._doneBtn = n;
        return n;
    }

    /** 只有作画阶段才显示 */
    setDoneVisible(on: boolean): void {
        if (this._doneBtn) {
            this._doneBtn.active = on;
        }
    }

    // ---------------------------------------------------------------- 状态

    setTop(status: string, timer: string, score: string): void {
        if (this._status) {
            this._status.string = status;
        }
        if (this._timer) {
            this._timer.string = timer;
        }
        if (this._score) {
            this._score.string = score;
        }
    }

    accent(color: Color): void {
        if (this._timer) {
            this._timer.color = color;
        }
    }

    setToolsVisible(on: boolean): void {
        if (this._tools) {
            this._tools.active = on;
        }
    }

    setPen(i: number, eraser: boolean): void {
        for (let k = 0; k < this._penDots.length; k++) {
            const g = this._penDots[k].getComponent(Graphics);
            const ring = this._tools!.getChildByName('penRing' + k);
            const rg = ring?.getComponent(Graphics);
            if (rg) {
                rg.clear();
                rg.lineWidth = 2;
                rg.strokeColor = COLOR.border;
                rg.roundRect(-22, -22, 44, 44, 22);
                rg.stroke();
                if (k === i && !eraser) {
                    rg.lineWidth = 3;
                    rg.strokeColor = COLOR.accent;
                    rg.roundRect(-22, -22, 44, 44, 22);
                    rg.stroke();
                }
            }
        }
        if (this._eraserBtn) {
            const bg = this._eraserBtn.getComponent(Graphics);
            if (bg) {
                bg.clear();
                bg.fillColor = eraser ? COLOR.accent : new Color(255, 255, 255, 255);
                bg.roundRect(-50, -26, 100, 52, 14);
                bg.fill();
                bg.lineWidth = 2;
                bg.strokeColor = eraser ? COLOR.accent : COLOR.border;
                bg.roundRect(-50, -26, 100, 52, 14);
                bg.stroke();
            }
            const lab = this._eraserBtn.getChildByName('t')?.getComponent(Label);
            if (lab) {
                lab.color = eraser ? new Color(255, 255, 255, 255) : COLOR.text;
            }
        }
    }

    setWidthIdx(i: number): void {
        for (let k = 0; k < this._widthBtns.length; k++) {
            const bg = this._widthBtns[k].getComponent(Graphics);
            if (!bg) {
                continue;
            }
            bg.clear();
            bg.fillColor = new Color(255, 255, 255, 255);
            bg.roundRect(-22, -22, 44, 44, 22);
            bg.fill();
            bg.lineWidth = k === i ? 3 : 2;
            bg.strokeColor = k === i ? COLOR.accent : COLOR.border;
            bg.roundRect(-22, -22, 44, 44, 22);
            bg.stroke();
        }
    }

    // ---------------------------------------------------------------- 面板

    hidePanel(): void {
        if (this._panel) {
            this._panel.active = false;
        }
        this._clearCard();
    }

    private _clearCard(): void {
        if (!this._card) {
            return;
        }
        this._card.removeAllChildren();
    }

    /** 居中卡片面板 */
    private _show(w: number, h: number, cardW: number, cardH: number): void {
        if (!this._panel || !this._card) {
            return;
        }
        this._panel.active = true;
        this._clearCard();
        const t = this._panel.getComponent(UITransform) ?? this._panel.addComponent(UITransform);
        t.setContentSize(w, h);
        const ct = this._card.getComponent(UITransform) ?? this._card.addComponent(UITransform);
        ct.setContentSize(cardW, cardH);
        const maskNode = this._panel.getComponent(Graphics) ?? this._panel.addComponent(Graphics);
        maskNode.clear();
        maskNode.fillColor = COLOR.mask;
        maskNode.rect(-w / 2, -h / 2, w, h);
        maskNode.fill();
        const cardG = this._card.getComponent(Graphics) ?? this._card.addComponent(Graphics);
        cardG.clear();
        cardG.fillColor = COLOR.panel;
        cardG.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 24);
        cardG.fill();
        cardG.lineWidth = 2;
        cardG.strokeColor = COLOR.border;
        cardG.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 24);
        cardG.stroke();
    }

    /** 通用信息面板 */
    info(w: number, h: number, title: string, lines: string[], buttons: Btn[]): void {
        const cardW = Math.min(w * 0.86, 560);
        const cardH = 140 + lines.length * 44 + buttons.length * 96;
        this._show(w, h, cardW, cardH);
        const card = this._card!;
        this._labelCard(card, 'title', title, 38, COLOR.accent, cardH / 2 - 58);
        for (let i = 0; i < lines.length; i++) {
            this._labelCard(card, 'line' + i, lines[i], 26, i === 0 ? COLOR.text : COLOR.muted,
                cardH / 2 - 120 - i * 44);
        }
        const total = buttons.length;
        for (let i = 0; i < total; i++) {
            const b = buttons[i];
            const y = -cardH / 2 + 62 + (total - 1 - i) * 96;
            const bw = Math.min(cardW - 80, 380);
            const btn = this._rect(card, 'btn' + i, 0, y, bw, 72, 18,
                b.primary ? COLOR.accent : new Color(255, 255, 255, 255),
                b.primary ? COLOR.accent : COLOR.border, 2);
            this._labelFit(btn, 't', b.text, 28, b.primary ? new Color(255, 255, 255, 255) : COLOR.text, bw, 72);
            btn.on(Node.EventType.TOUCH_END, b.cb, this);
        }
    }

    /** 选词面板 */
    words(w: number, h: number, title: string, list: WordItem[], cb: (i: number) => void): void {
        const cardW = Math.min(w * 0.86, 560);
        const cardH = 140 + list.length * 100;
        this._show(w, h, cardW, cardH);
        const card = this._card!;
        this._labelCard(card, 'title', title, 34, COLOR.accent, cardH / 2 - 56);
        for (let i = 0; i < list.length; i++) {
            const y = cardH / 2 - 132 - i * 100;
            const bw = Math.min(cardW - 80, 380);
            const btn = this._rect(card, 'w' + i, 0, y, bw, 80, 18, new Color(255, 255, 255, 255), COLOR.accent, 2);
            this._labelFit(btn, 't', list[i].text, 32, COLOR.text, bw, 80);
            const idx = i;
            btn.on(Node.EventType.TOUCH_END, () => cb(idx), this);
        }
    }

    /** 猜词候选面板 */
    guess(w: number, h: number, title: string, list: string[], cb: (t: string) => void): void {
        const cardW = Math.min(w * 0.9, 600);
        const rows = Math.ceil(list.length / 2);
        const cardH = 130 + rows * 104;
        this._show(w, h, cardW, cardH);
        const card = this._card!;
        this._labelCard(card, 'title', title, 32, COLOR.accent, cardH / 2 - 52);
        const bw = Math.min((cardW - 80) / 2 - 12, 240);
        for (let i = 0; i < list.length; i++) {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const x = col === 0 ? -bw / 2 - 8 : bw / 2 + 8;
            const y = cardH / 2 - 130 - row * 104;
            const btn = this._rect(card, 'g' + i, x, y, bw, 84, 16, new Color(255, 255, 255, 255), COLOR.border, 2);
            this._labelFit(btn, 't', list[i], 30, COLOR.text, bw, 84);
            const text = list[i];
            btn.on(Node.EventType.TOUCH_END, () => cb(text), this);
        }
    }

    // ---------------------------------------------------------------- 基础元件

    private _rect(parent: Node, name: string, x: number, y: number, w: number, h: number,
                  r: number, fill: Color, stroke: Color | null, lw: number): Node {
        const n = new Node(name);
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        if (w + h > 0) {
            g.fillColor = fill;
            g.roundRect(-w / 2, -h / 2, w, h, r);
            g.fill();
            if (stroke) {
                g.lineWidth = lw;
                g.strokeColor = stroke;
                g.roundRect(-w / 2, -h / 2, w, h, r);
                g.stroke();
            }
        }
        n.setPosition(x, y, 0);
        parent.addChild(n);
        return n;
    }

    private _label(parent: Node, name: string, text: string, size: number, color: Color,
                   x: number, y: number): Label {
        const n = new Node(name);
        n.addComponent(UITransform);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = size + 8;
        l.color = color;
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        n.setPosition(x, y, 0);
        parent.addChild(n);
        return l;
    }

    private _labelCard(parent: Node, name: string, text: string, size: number, color: Color, y: number): Label {
        const l = this._label(parent, name, text, size, color, 0, y);
        l.overflow = Label.Overflow.NONE;
        l.node.getComponent(UITransform)!.setContentSize(520, size + 12);
        return l;
    }

    private _labelFit(parent: Node, name: string, text: string, size: number, color: Color,
                      w: number, h: number): Label {
        const n = new Node(name);
        n.addComponent(UITransform).setContentSize(w, h);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = size + 6;
        l.color = color;
        l.horizontalAlign = Label.HorizontalAlign.CENTER;
        l.verticalAlign = Label.VerticalAlign.CENTER;
        l.overflow = Label.Overflow.SHRINK;
        parent.addChild(n);
        return l;
    }
}
