import { _decorator, Component, Graphics, Color, tween, Vec3 } from 'cc';
import { COLOR } from './Constants';
import type { Cell } from './Judger';

const { ccclass } = _decorator;

/** 单颗棋子：主体圆 + 高光 + 最后一手标记 */
@ccclass('Piece')
export class Piece extends Component {
    private _g: Graphics | null = null;
    private _r = 10;
    private _v: Cell = 1;
    private _last = false;

    onLoad(): void {
        this._g = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
    }

    setup(v: Cell, r: number): void {
        this._v = v;
        this._r = r;
        this._last = false;
        this._paint();
        this.node.setScale(new Vec3(1.3, 1.3, 1));
        tween(this.node).to(0.13, { scale: new Vec3(1, 1, 1) }).start();
    }

    setLast(on: boolean): void {
        if (this._last === on) {
            return;
        }
        this._last = on;
        this._paint();
    }

    private _paint(): void {
        const g = this._g;
        if (!g) {
            return;
        }
        const r = this._r;
        g.clear();

        g.fillColor = new Color(70, 60, 55, 36);
        g.circle(1.5, -2.5, r);
        g.fill();

        g.fillColor = this._v === 1 ? COLOR.black : COLOR.white;
        g.circle(0, 0, r);
        g.fill();

        g.lineWidth = this._v === 1 ? 1 : 1.6;
        g.strokeColor = this._v === 1 ? COLOR.blackEdge : COLOR.whiteEdge;
        g.circle(0, 0, r);
        g.stroke();

        if (this._v === 1) {
            g.fillColor = new Color(255, 255, 255, 42);
            g.circle(-r * 0.26, r * 0.28, r * 0.4);
            g.fill();
        }

        if (this._last) {
            g.fillColor = COLOR.accent;
            g.circle(0, 0, Math.max(3, r * 0.26));
            g.fill();
        }
    }
}
