import { _decorator, Component, Graphics } from 'cc';
import { BOARD, COLOR } from './Constants';

const { ccclass } = _decorator;

/** 棋盘：负责网格绘制与「坐标 ↔ 格点」换算 */
@ccclass('Board')
export class Board extends Component {
    private _g: Graphics | null = null;
    private _cell = 0;
    private _half = 0;
    private _outer = 0;
    private _n = BOARD.n;

    onLoad(): void {
        this._g = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
    }

    /** 按正方形边长布局，返回格距 */
    layout(size: number): number {
        const pad = 1.15;
        this._cell = size / (this._n - 1 + pad * 2);
        this._half = (this._cell * (this._n - 1)) / 2;
        this._outer = this._half + this._cell * pad;
        return this._cell;
    }

    get cell(): number {
        return this._cell;
    }

    get outer(): number {
        return this._outer;
    }

    /** 格点 → 局部坐标（棋盘中心为 0,0） */
    px(x: number): number {
        return -this._half + x * this._cell;
    }

    py(y: number): number {
        return this._half - y * this._cell;
    }

    draw(): void {
        const g = this._g;
        if (!g) {
            return;
        }
        const n = this._n;
        const o = this._outer;
        g.clear();

        g.fillColor = COLOR.board;
        g.roundRect(-o, -o, o * 2, o * 2, 14);
        g.fill();
        g.lineWidth = 2;
        g.strokeColor = COLOR.boardEdge;
        g.roundRect(-o, -o, o * 2, o * 2, 14);
        g.stroke();

        g.lineWidth = 1.4;
        g.strokeColor = COLOR.line;
        for (let i = 0; i < n; i++) {
            g.moveTo(this.px(0), this.py(i));
            g.lineTo(this.px(n - 1), this.py(i));
            g.moveTo(this.px(i), this.py(0));
            g.lineTo(this.px(i), this.py(n - 1));
        }
        g.stroke();

        // 星位：3 / 7 / 11
        g.fillColor = COLOR.line;
        const stars = [3, 7, 11];
        for (let i = 0; i < stars.length; i++) {
            for (let j = 0; j < stars.length; j++) {
                g.circle(this.px(stars[i]), this.py(stars[j]), Math.max(3, this._cell * 0.09));
                g.fill();
            }
        }
    }

    /** 局部坐标 → 最近格点；离任何格点太远返回 null */
    hit(lx: number, ly: number): { x: number; y: number } | null {
        const gx = Math.round((lx + this._half) / this._cell);
        const gy = Math.round((this._half - ly) / this._cell);
        if (gx < 0 || gx >= this._n || gy < 0 || gy >= this._n) {
            return null;
        }
        const dx = lx - this.px(gx);
        const dy = ly - this.py(gy);
        if (Math.sqrt(dx * dx + dy * dy) > this._cell * 0.5) {
            return null;
        }
        return { x: gx, y: gy };
    }
}
