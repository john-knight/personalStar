import { _decorator, Component, Node, Label, UITransform, Color, Graphics } from 'cc';
import { Field } from './Constants';

const { ccclass } = _decorator;

/** 倒计时、深度、本局金币、Combo、结算与升级面板 */
@ccclass('Hud')
export class Hud extends Component {
    private _time: Label | null = null;
    private _depth: Label | null = null;
    private _roundCoins: Label | null = null;
    private _lineLimit: Label | null = null;
    private _combo: Label | null = null;
    private _toast: Label | null = null;
    private _gain: Label | null = null;
    private _tip: Label | null = null;

    private _panel: Node | null = null;
    private _resultCoins: Label | null = null;
    private _resultDepth: Label | null = null;
    private _resultTotal: Label | null = null;
    private _upgradeBtn: Node | null = null;
    private _upgradeLabel: Label | null = null;

    private _onRestart: (() => void) | null = null;
    private _onUpgrade: (() => void) | null = null;

    setup(): void {
        // 顶部渐隐遮罩
        const bar = new Node('hud-bar');
        bar.layer = this.node.layer;
        const barTrans = bar.addComponent(UITransform);
        barTrans.setContentSize(Field.halfW * 2, 150);
        barTrans.setAnchorPoint(0.5, 1);
        bar.setPosition(0, Field.halfH, 0);
        const barGfx = bar.addComponent(Graphics);
        barGfx.fillColor = new Color(4, 24, 48, 72);
        barGfx.fillRect(-Field.halfW, -150, Field.halfW * 2, 150);
        this.node.addChild(bar);

        this._time = this._createLabel(this.node, 'time', 56, 0, Field.halfH - 24, '60', 0.5, 1);
        this._time.color = new Color(255, 255, 255, 255);

        this._depth = this._createLabel(this.node, 'depth', 40, -Field.halfW + 24, Field.halfH - 26, '0 m', 0, 1);
        this._depth.color = new Color(255, 255, 255, 255);

        this._lineLimit = this._createLabel(this.node, 'line', 26, -Field.halfW + 24, Field.halfH - 78, '鱼线 200 m', 0, 1);
        this._lineLimit.color = new Color(180, 215, 240, 255);

        this._roundCoins = this._createLabel(this.node, 'round-coins', 40, Field.halfW - 24, Field.halfH - 26, '0', 1, 1);
        this._roundCoins.color = new Color(255, 225, 120, 255);

        this._combo = this._createLabel(this.node, 'combo', 44, 0, Field.halfH * 0.5, '', 0.5, 0.5);
        this._combo.color = new Color(255, 210, 90, 255);
        this._combo.node.active = false;

        this._toast = this._createLabel(this.node, 'toast', 46, 0, Field.halfH * 0.3, '', 0.5, 0.5);
        this._toast.color = new Color(255, 110, 110, 255);
        this._toast.node.active = false;

        this._gain = this._createLabel(this.node, 'gain', 44, 0, -Field.halfH * 0.42, '', 0.5, 0.5);
        this._gain.color = new Color(255, 235, 140, 255);
        this._gain.node.active = false;

        this._tip = this._createLabel(this.node, 'tip', 34, 0, -Field.halfH * 0.7, '按住屏幕下潜，松手收线', 0.5, 0.5);
        this._tip.color = new Color(230, 240, 250, 235);

        this._buildResultPanel();
    }

    private _buildResultPanel(): void {
        const panel = new Node('result-panel');
        panel.layer = this.node.layer;
        panel.addComponent(UITransform);
        this.node.addChild(panel);
        this._panel = panel;

        const shade = new Node('shade');
        shade.layer = this.node.layer;
        shade.addComponent(UITransform);
        const g = shade.addComponent(Graphics);
        g.fillColor = new Color(2, 12, 28, 190);
        g.fillRect(-Field.halfW, -Field.halfH, Field.halfW * 2, Field.halfH * 2);
        panel.addChild(shade);

        const box = new Node('box');
        box.layer = this.node.layer;
        box.addComponent(UITransform);
        const bg = box.addComponent(Graphics);
        bg.fillColor = new Color(14, 44, 78, 245);
        bg.roundRect(-260, -280, 520, 560, 28);
        bg.fill();
        panel.addChild(box);

        this._createLabel(box, 'title', 44, 0, 210, '时间到', 0.5, 0.5).color = new Color(180, 225, 255, 255);
        this._resultCoins = this._createLabel(box, 'coins-val', 64, 0, 100, '0', 0.5, 0.5);
        this._resultCoins.color = new Color(255, 225, 120, 255);
        this._createLabel(box, 'coins-cap', 26, 0, 44, '本局金币', 0.5, 0.5).color = new Color(190, 215, 240, 255);
        this._resultDepth = this._createLabel(box, 'depth-val', 34, 0, -6, '最深 0 m', 0.5, 0.5);
        this._resultDepth.color = new Color(220, 235, 250, 255);
        this._resultTotal = this._createLabel(box, 'total-val', 28, 0, -56, '总金币 0', 0.5, 0.5);
        this._resultTotal.color = new Color(190, 215, 240, 255);

        this._createButton(box, 'restart', '再来一局', 0, -152, 340, 88, new Color(46, 150, 220, 255), () => {
            if (this._onRestart) {
                this._onRestart();
            }
        }, 30);

        this._upgradeBtn = this._createButton(
            box, 'upgrade', '升级鱼线', 0, -232, 400, 72, new Color(220, 150, 60, 255), () => {
                if (this._onUpgrade) {
                    this._onUpgrade();
                }
            }, 26,
        );
        this._upgradeLabel = this._upgradeBtn.getComponentInChildren(Label);

        panel.active = false;
    }

    setCallbacks(onRestart: () => void, onUpgrade: () => void): void {
        this._onRestart = onRestart;
        this._onUpgrade = onUpgrade;
    }

    private _createLabel(
        parent: Node, name: string, fontSize: number, x: number, y: number, text: string,
        anchorX: number, anchorY: number,
    ): Label {
        const node = new Node(name);
        node.layer = parent.layer;
        const trans = node.addComponent(UITransform);
        trans.setContentSize(620, fontSize + 12);
        trans.setAnchorPoint(anchorX, anchorY);
        node.setPosition(x, y, 0);
        const label = node.addComponent(Label);
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 10;
        label.string = text;
        parent.addChild(node);
        return label;
    }

    private _createButton(
        parent: Node, name: string, text: string, x: number, y: number,
        w: number, h: number, fill: Color, onClick: () => void, fontSize = 30,
    ): Node {
        const node = new Node(name);
        node.layer = parent.layer;
        const trans = node.addComponent(UITransform);
        trans.setContentSize(w, h);
        node.setPosition(x, y, 0);
        const gfx = node.addComponent(Graphics);
        gfx.fillColor = fill;
        gfx.roundRect(-w / 2, -h / 2, w, h, h / 2);
        gfx.fill();

        const labelNode = new Node('label');
        labelNode.layer = parent.layer;
        labelNode.addComponent(UITransform).setContentSize(w, h);
        const label = labelNode.addComponent(Label);
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 8;
        label.string = text;
        label.color = new Color(255, 255, 255, 255);
        node.addChild(labelNode);

        node.on(Node.EventType.TOUCH_END, onClick, this);
        parent.addChild(node);
        return node;
    }

    setTime(seconds: number): void {
        if (!this._time) {
            return;
        }
        const s = Math.max(0, Math.ceil(seconds));
        this._time.string = `${s}s`;
        this._time.color = s <= 10 ? new Color(255, 110, 110, 255) : new Color(255, 255, 255, 255);
    }

    setDepth(meters: number): void {
        if (this._depth) {
            this._depth.string = `${Math.floor(meters)} m`;
        }
    }

    setRoundCoins(coins: number): void {
        if (this._roundCoins) {
            this._roundCoins.string = `${coins}`;
        }
    }

    setLineLimit(meters: number): void {
        if (this._lineLimit) {
            this._lineLimit.string = `鱼线 ${meters} m`;
        }
    }

    hideTip(): void {
        if (this._tip) {
            this._tip.node.active = false;
        }
    }

    showCombo(count: number, multiplier: number): void {
        if (!this._combo) {
            return;
        }
        this._combo.string = `COMBO ${count} 连  x${multiplier}`;
        this._combo.node.active = true;
    }

    hideCombo(): void {
        if (this._combo) {
            this._combo.node.active = false;
        }
    }

    showToast(text: string): void {
        if (!this._toast) {
            return;
        }
        this._toast.string = text;
        this._toast.node.active = true;
        this.unschedule(this._hideToast);
        this.scheduleOnce(this._hideToast, 1.4);
    }

    private _hideToast(): void {
        if (this._toast) {
            this._toast.node.active = false;
        }
    }

    showGain(text: string): void {
        if (!this._gain) {
            return;
        }
        this._gain.string = text;
        this._gain.node.active = true;
        this.unschedule(this._hideGain);
        this.scheduleOnce(this._hideGain, 1.6);
    }

    private _hideGain(): void {
        if (this._gain) {
            this._gain.node.active = false;
        }
    }

    showResult(roundCoins: number, maxDepth: number, totalCoins: number): void {
        if (!this._panel) {
            return;
        }
        if (this._resultCoins) {
            this._resultCoins.string = `${roundCoins}`;
        }
        if (this._resultDepth) {
            this._resultDepth.string = `最深 ${Math.floor(maxDepth)} m`;
        }
        if (this._resultTotal) {
            this._resultTotal.string = `总金币 ${totalCoins}`;
        }
        this._panel.active = true;
    }

    hideResult(): void {
        if (this._panel) {
            this._panel.active = false;
        }
    }

    setUpgrade(text: string, enabled: boolean): void {
        if (this._upgradeLabel) {
            this._upgradeLabel.string = text;
        }
        if (this._upgradeBtn) {
            this._upgradeBtn.active = enabled;
        }
    }
}
