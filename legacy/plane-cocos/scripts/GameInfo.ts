import { _decorator, Component, Node, Label, UITransform, Color, EventTouch, Graphics } from 'cc';
import { Field } from './Constants';

const { ccclass } = _decorator;

/** 分数显示与结算面板 */
@ccclass('GameInfo')
export class GameInfo extends Component {
    onRestart: (() => void) | null = null;

    private _scoreLabel: Label | null = null;
    private _panel: Node | null = null;
    private _scoreValue: Label | null = null;

    setup(): void {
        this._panel = new Node('over-panel');
        this._panel.layer = this.node.layer;
        this._panel.addComponent(UITransform);
        this._panel.active = false;
        this.node.addChild(this._panel);

        this._createMask();

        const title = this._createLabel('over-title', 56, 0, 90, '游戏结束', this._panel);
        title.color = new Color(255, 220, 120, 255);
        this._scoreValue = this._createLabel('over-score', 44, 0, -10, '得分: 0', this._panel);

        this._createRestartButton();

        // 分数放在最后创建，保证结算时显示在遮罩之上
        this._scoreLabel = this._createLabel(
            'score', 36, -Field.halfW + 24, Field.halfH - 20, '0', undefined, 0, 1,
        );
        this._scoreLabel.horizontalAlign = Label.HorizontalAlign.LEFT;
        this._scoreLabel.verticalAlign = Label.VerticalAlign.TOP;
    }

    /** 半透明遮罩，避免结算信息与背景混在一起 */
    private _createMask(): void {
        if (!this._panel) {
            return;
        }
        const node = new Node('mask');
        node.layer = this.node.layer;
        const trans = node.addComponent(UITransform);
        trans.setContentSize(Field.halfW * 2, Field.halfH * 2);
        const gfx = node.addComponent(Graphics);
        gfx.fillColor = new Color(0, 0, 0, 180);
        gfx.fillRect(-Field.halfW, -Field.halfH, Field.halfW * 2, Field.halfH * 2);
        this._panel.addChild(node);
    }

    private _createRestartButton(): void {
        if (!this._panel) {
            return;
        }
        const button = new Node('restart-button');
        button.layer = this.node.layer;
        const trans = button.addComponent(UITransform);
        trans.setContentSize(240, 90);
        button.setPosition(0, -140, 0);
        this._panel.addChild(button);

        const bgNode = new Node('button-bg');
        bgNode.layer = this.node.layer;
        const bgTrans = bgNode.addComponent(UITransform);
        bgTrans.setContentSize(240, 90);
        const gfx = bgNode.addComponent(Graphics);
        gfx.fillColor = new Color(20, 120, 90, 220);
        gfx.roundRect(-120, -45, 240, 90, 14);
        gfx.fill();
        gfx.strokeColor = new Color(120, 255, 200, 255);
        gfx.lineWidth = 3;
        gfx.roundRect(-120, -45, 240, 90, 14);
        gfx.stroke();
        button.addChild(bgNode);

        const label = this._createLabel('restart-text', 40, 0, 0, '重新开始', button);
        label.color = new Color(235, 255, 245, 255);

        button.on(Node.EventType.TOUCH_END, this._onRestartTouch, this);
    }

    private _createLabel(
        name: string,
        fontSize: number,
        x: number,
        y: number,
        text: string,
        parent?: Node,
        anchorX = 0.5,
        anchorY = 0.5,
    ): Label {
        const node = new Node(name);
        node.layer = this.node.layer;
        const trans = node.addComponent(UITransform);
        trans.setContentSize(600, fontSize + 10);
        trans.setAnchorPoint(anchorX, anchorY);
        node.setPosition(x, y, 0);
        const label = node.addComponent(Label);
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 8;
        label.string = text;
        (parent ?? this.node).addChild(node);
        return label;
    }

    private _onRestartTouch(_evt: EventTouch): void {
        if (this.onRestart) {
            this.onRestart();
        }
    }

    setScore(score: number): void {
        if (this._scoreLabel) {
            this._scoreLabel.string = `${score}`;
        }
    }

    showOver(score: number): void {
        if (this._panel) {
            this._panel.active = true;
        }
        if (this._scoreValue) {
            this._scoreValue.string = `得分: ${score}`;
        }
    }

    hideOver(): void {
        if (this._panel) {
            this._panel.active = false;
        }
    }
}
