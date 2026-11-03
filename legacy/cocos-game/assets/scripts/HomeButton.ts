import { _decorator, Component, Node, UITransform, Graphics, Label, Color, view } from 'cc';
import { ScoreResult, backHome } from './Bridge';

const { ccclass } = _decorator;

/**
 * 左上角统一的「回星球」按钮。
 * 三个游戏共用同一份实现：点击 → 汇总当前战绩 → 回传并返回小程序。
 * 直接从我自己打开（没从小程序跳过来）时，只落地到本地并给一句提示。
 */
@ccclass('HomeButton')
export class HomeButton extends Component {
    private _cb: (() => ScoreResult) | null = null;
    private _tipNode: Node | null = null;
    private _tipLeft = 0;

    /** cb：返回当前这局（或当前累计）的战绩 */
    setup(cb: () => ScoreResult): void {
        this._cb = cb;
        this._build();
    }

    update(dt: number): void {
        if (this._tipLeft <= 0) {
            return;
        }
        this._tipLeft -= dt;
        if (this._tipLeft <= 0 && this._tipNode) {
            this._tipNode.active = false;
        }
    }

    private _build(): void {
        const size = view.getVisibleSize();
        // 贴着屏幕最上沿，避开各游戏自己的顶部信息条
        const x = -size.width / 2 + 58;
        const y = size.height / 2 - 26;

        const btn = new Node('btn');
        btn.layer = this.node.layer;
        btn.addComponent(UITransform).setContentSize(104, 40);
        const g = btn.addComponent(Graphics);
        g.fillColor = new Color(255, 255, 255, 230);
        g.lineColor = new Color(226, 228, 231, 255);
        g.lineWidth = 2;
        g.roundRect(-52, -20, 104, 40, 20);
        g.fill();
        g.stroke();

        const lab = new Node('t');
        lab.layer = btn.layer;
        lab.addComponent(UITransform).setContentSize(104, 40);
        const l = lab.addComponent(Label);
        l.string = '回星球';
        l.fontSize = 20;
        l.lineHeight = 40;
        l.color = new Color(107, 112, 117, 255);
        btn.addChild(lab);

        btn.setPosition(x, y, 0);
        btn.on(Node.EventType.TOUCH_END, this._onClick, this);
        this.node.addChild(btn);

        // 提示放底部，顶部信息太挤
        const tip = new Node('tip');
        tip.layer = this.node.layer;
        tip.addComponent(UITransform).setContentSize(560, 40);
        const tl = tip.addComponent(Label);
        tl.string = '';
        tl.fontSize = 22;
        tl.lineHeight = 40;
        tl.color = new Color(107, 112, 117, 255);
        tip.setPosition(0, -size.height / 2 + 120, 0);
        tip.active = false;
        this.node.addChild(tip);
        this._tipNode = tip;
    }

    private _onClick(): void {
        if (!this._cb) {
            return;
        }
        const wentBack = backHome(this._cb());
        if (!wentBack) {
            this._showTip('战绩已保存，回主页就能看到');
        }
    }

    private _showTip(text: string): void {
        const node = this._tipNode;
        if (!node) {
            return;
        }
        const l = node.getComponent(Label);
        if (l) {
            l.string = text;
        }
        node.active = true;
        this._tipLeft = 2;
    }
}
