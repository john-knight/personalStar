import { _decorator, Component, Node, Label, UITransform, Graphics, Color } from 'cc';
import { COLOR, PLAYERS } from './Constants';
import type { Cell } from './Judger';

const { ccclass } = _decorator;

/** 界面层：顶部对局信息、底部按钮、结算面板 */
@ccclass('Hud')
export class Hud extends Component {
    private _turn: Label | null = null;
    private _score: Label | null = null;
    private _rings: Node[] = [];
    private _names: Label[] = [];
    private _result: Node | null = null;
    private _resultTitle: Label | null = null;
    private _resultSub: Label | null = null;
    private _undoBtn: Node | null = null;
    private _oppBtn: Node | null = null;
    private _reviewBtn: Node | null = null;

    private _onUndo: (() => void) | null = null;
    private _onRestart: (() => void) | null = null;
    private _onAgain: (() => void) | null = null;
    private _onOpponent: (() => void) | null = null;
    private _onReview: (() => void) | null = null;

    onUndo(fn: () => void): void {
        this._onUndo = fn;
    }

    /** 切换对手（真人对战 / 人机） */
    onOpponent(fn: () => void): void {
        this._onOpponent = fn;
    }

    setOpponentText(text: string): void {
        const lab = this._oppBtn?.getChildByName('text')?.getComponent(Label);
        if (lab) {
            lab.string = text;
        }
    }

    setPlayerName(i: number, name: string): void {
        if (this._names[i]) {
            this._names[i].string = name;
        }
    }

    /** 结算面板的「看回放」 */
    onReview(fn: () => void): void {
        this._onReview = fn;
    }

    setReviewVisible(on: boolean): void {
        if (this._reviewBtn) {
            this._reviewBtn.active = on;
        }
    }

    onRestart(fn: () => void): void {
        this._onRestart = fn;
    }

    onAgain(fn: () => void): void {
        this._onAgain = fn;
    }

    build(w: number, h: number, topY: number, bottomY: number): void {
        const sideX = Math.min(w * 0.3, 240);

        for (let i = 0; i < 2; i++) {
            const p = PLAYERS[i];
            const x = i === 0 ? -sideX : sideX;
            const card = new Node('player' + i);
            card.addComponent(UITransform).setContentSize(200, 96);
            const bg = card.addComponent(Graphics);
            bg.fillColor = new Color(255, 255, 255, 0);
            bg.roundRect(-100, -48, 200, 96, 16);
            bg.fill();
            card.setPosition(x, topY + 8, 0);
            this.node.addChild(card);

            const ring = new Node('ring');
            ring.addComponent(UITransform).setContentSize(56, 56);
            const rg = ring.addComponent(Graphics);
            rg.fillColor = p.color;
            rg.circle(0, 0, 22);
            rg.fill();
            rg.lineWidth = 2;
            rg.strokeColor = COLOR.accent;
            rg.circle(0, 0, 27);
            rg.stroke();
            ring.setPosition(0, 16, 0);
            card.addChild(ring);
            this._rings.push(ring);

            this._names.push(this._label(card, 'name', p.name, 24, COLOR.text, 0, -26));
        }

        this._turn = this._label(this.node, 'turn', '轮到 ' + PLAYERS[0].name, 30, COLOR.text, 0, topY + 20);
        this._score = this._label(this.node, 'score', '0 : 0', 26, COLOR.muted, 0, topY - 14);

        // 三个按钮并排：悔棋 / 对手切换 / 重新开始
        const btnX = Math.min(w * 0.3, 200);
        const btnW = 190;
        this._undoBtn = this._button('undo', '悔棋', -btnX, bottomY, btnW, 84, new Color(255, 255, 255, 255), COLOR.text, () => {
            if (this._onUndo) {
                this._onUndo();
            }
        });
        this._oppBtn = this._button('opponent', '对手：小鹿', 0, bottomY, btnW, 84, new Color(255, 255, 255, 255), COLOR.text, () => {
            if (this._onOpponent) {
                this._onOpponent();
            }
        });
        this._button('restart', '重新开始', btnX, bottomY, btnW, 84, COLOR.accent, COLOR.white, () => {
            if (this._onRestart) {
                this._onRestart();
            }
        });

        this._buildResult(w, h);
    }

    private _buildResult(w: number, h: number): void {
        const box = new Node('result');
        box.addComponent(UITransform);
        box.setPosition(0, 0, 0);
        box.active = false;
        this.node.addChild(box);
        this._result = box;

        const mask = new Node('mask');
        const mt = mask.addComponent(UITransform);
        mt.setContentSize(w * 2, h * 2);
        const mg = mask.addComponent(Graphics);
        mg.fillColor = COLOR.mask;
        mg.rect(-w, -h, w * 2, h * 2);
        mg.fill();
        mask.on(Node.EventType.TOUCH_END, () => {}, this);
        box.addChild(mask);

        const card = new Node('card');
        card.addComponent(UITransform).setContentSize(520, 440);
        const cg = card.addComponent(Graphics);
        cg.fillColor = COLOR.panel;
        cg.roundRect(-260, -220, 520, 440, 24);
        cg.fill();
        card.on(Node.EventType.TOUCH_END, () => {}, this);
        box.addChild(card);

        this._resultTitle = this._label(card, 'title', '', 44, COLOR.text, 0, 100);
        this._resultSub = this._label(card, 'sub', '', 26, COLOR.muted, 0, 44);
        this._buttonIn(card, 'again', '再来一局', 0, -50, 300, 88, () => {
            if (this._onAgain) {
                this._onAgain();
            }
        });
        this._reviewBtn = this._buttonIn(card, 'review', '看回放', 0, -160, 300, 88, () => {
            if (this._onReview) {
                this._onReview();
            }
        });
    }

    setTurn(v: Cell, name: string): void {
        if (this._turn) {
            this._turn.string = '轮到 ' + name;
        }
        for (let i = 0; i < this._rings.length; i++) {
            const active = PLAYERS[i].id === v;
            this._rings[i].setScale(active ? 1.12 : 1, active ? 1.12 : 1, 1);
            this._names[i].color = active ? COLOR.text : COLOR.muted;
        }
    }

    /** 本局结束时的顶部状态文字 */
    setOver(text: string): void {
        if (this._turn) {
            this._turn.string = text;
        }
        for (let i = 0; i < this._rings.length; i++) {
            this._rings[i].setScale(1, 1, 1);
            this._names[i].color = COLOR.muted;
        }
    }

    setScore(a: number, b: number): void {
        if (this._score) {
            this._score.string = a + ' : ' + b;
        }
    }

    setUndoEnabled(on: boolean): void {
        if (this._undoBtn) {
            this._undoBtn.active = on;
        }
    }

    showResult(title: string, sub: string): void {
        if (!this._result) {
            return;
        }
        this._resultTitle!.string = title;
        this._resultSub!.string = sub;
        this._result.active = true;
    }

    hideResult(): void {
        if (this._result) {
            this._result.active = false;
        }
    }

    private _label(parent: Node, name: string, text: string, size: number, color: Color, x: number, y: number): Label {
        const n = new Node(name);
        n.addComponent(UITransform);
        const l = n.addComponent(Label);
        l.string = text;
        l.fontSize = size;
        l.lineHeight = size + 8;
        l.color = color;
        n.setPosition(x, y, 0);
        parent.addChild(n);
        return l;
    }

    private _button(
        name: string, text: string, x: number, y: number,
        w: number, h: number, fill: Color, font: Color, onClick: () => void,
    ): Node {
        const n = new Node(name);
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = fill;
        g.roundRect(-w / 2, -h / 2, w, h, 16);
        g.fill();
        g.lineWidth = 2;
        g.strokeColor = new Color(235, 236, 238, 255);
        g.roundRect(-w / 2, -h / 2, w, h, 16);
        g.stroke();
        this._label(n, 'text', text, 30, font, 0, 0);
        n.setPosition(x, y, 0);
        n.on(Node.EventType.TOUCH_END, onClick, this);
        this.node.addChild(n);
        return n;
    }

    private _buttonIn(
        parent: Node, name: string, text: string, x: number, y: number,
        w: number, h: number, onClick: () => void,
    ): Node {
        const n = new Node(name);
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = COLOR.accent;
        g.roundRect(-w / 2, -h / 2, w, h, 44);
        g.fill();
        this._label(n, 'text', text, 32, COLOR.white, 0, 0);
        n.setPosition(x, y, 0);
        n.on(Node.EventType.TOUCH_END, onClick, this);
        parent.addChild(n);
        return n;
    }
}
