import { _decorator, Component, Graphics, Color, UITransform } from 'cc';
import { PENS, PEN_WIDTHS, COLOR, MIN_POINT_GAP } from './Constants';

const { ccclass } = _decorator;

/** 一笔画。pts 为归一化坐标（0~1），这样换个屏幕尺寸也能还原 */
export interface Stroke {
    pen: number;
    width: number;
    pts: number[];
}

/** 可序列化的画面数据，联机同步直接传这个 */
export interface BoardData {
    v: number;
    strokes: Stroke[];
}

/**
 * 画板：采集触摸笔迹、绘制、撤销、清空、回放。
 * 坐标一律以「画布左下为原点的归一化值」存储，屏幕自适应。
 */
@ccclass('PaintCanvas')
export class PaintCanvas extends Component {
    private _g: Graphics | null = null;
    private _w = 0;
    private _h = 0;
    private _strokes: Stroke[] = [];
    private _cur: Stroke | null = null;
    private _pen = 0;
    private _wIdx = 1;
    private _eraser = false;
    private _rs = 0;
    private _rp = 0;
    private _replaying = false;

    setup(w: number, h: number): void {
        this._w = w;
        this._h = h;
        const t = this.getComponent(UITransform) ?? this.addComponent(UITransform);
        t.setContentSize(w, h);
        this._g = this.getComponent(Graphics) ?? this.addComponent(Graphics);
        this._paper();
    }

    private _paper(): void {
        const g = this._g;
        if (!g) {
            return;
        }
        g.fillColor = COLOR.paper;
        g.rect(-this._w / 2, -this._h / 2, this._w, this._h);
        g.fill();
    }

    // ------------------------------------------------------------ 画笔状态

    setPen(i: number): void {
        this._pen = i;
        this._eraser = false;
    }

    setWidth(i: number): void {
        this._wIdx = i;
    }

    setEraser(on: boolean): void {
        this._eraser = on;
    }

    isEraser(): boolean {
        return this._eraser;
    }

    currentPen(): number {
        return this._pen;
    }

    currentWidth(): number {
        return this._wIdx;
    }

    isEmpty(): boolean {
        return this._strokes.length === 0;
    }

    strokeCount(): number {
        return this._strokes.length;
    }

    pointCount(): number {
        let n = 0;
        for (let i = 0; i < this._strokes.length; i++) {
            n += this._strokes[i].pts.length / 2;
        }
        return n;
    }

    private get _color(): Color {
        return this._eraser ? COLOR.paper : PENS[this._pen];
    }

    private get _pxWidth(): number {
        const base = PEN_WIDTHS[this._wIdx];
        return Math.max(3, (base * this._w) / 640) * (this._eraser ? 2.2 : 1);
    }

    // ------------------------------------------------------------ 绘制

    begin(x: number, y: number): void {
        if (this._replaying) {
            return;
        }
        const nx = this._nx(x);
        const ny = this._ny(y);
        this._cur = { pen: this._eraser ? -1 : this._pen, width: this._wIdx, pts: [nx, ny] };
        this._strokes.push(this._cur);
        const g = this._g;
        if (!g) {
            return;
        }
        g.fillColor = this._color;
        g.circle(x, y, this._pxWidth / 2);
        g.fill();
    }

    move(x: number, y: number): void {
        if (this._replaying || !this._cur) {
            return;
        }
        const pts = this._cur.pts;
        const px = this._dx(pts[pts.length - 2]);
        const py = this._dy(pts[pts.length - 1]);
        if (Math.abs(x - px) + Math.abs(y - py) < MIN_POINT_GAP) {
            return;
        }
        this._seg(this._color, this._pxWidth, px, py, x, y);
        pts.push(this._nx(x), this._ny(y));
    }

    end(): void {
        this._cur = null;
    }

    undo(): void {
        if (this._replaying) {
            return;
        }
        this._strokes.pop();
        this._redraw();
    }

    clear(): void {
        this._strokes = [];
        this._cur = null;
        this._replaying = false;
        const g = this._g;
        if (g) {
            g.clear();
        }
        this._paper();
    }

    private _redraw(): void {
        const g = this._g;
        if (!g) {
            return;
        }
        g.clear();
        this._paper();
        for (let i = 0; i < this._strokes.length; i++) {
            this._drawStroke(this._strokes[i]);
        }
    }

    private _drawStroke(s: Stroke): void {
        const pts = s.pts;
        const color = s.pen < 0 ? COLOR.paper : PENS[s.pen];
        const width = Math.max(3, (PEN_WIDTHS[s.width] * this._w) / 640) * (s.pen < 0 ? 2.2 : 1);
        const g = this._g;
        if (!g || pts.length < 2) {
            if (g) {
                g.fillColor = color;
                g.circle(this._dx(pts[0]), this._dy(pts[1]), width / 2);
                g.fill();
            }
            return;
        }
        for (let i = 2; i < pts.length; i += 2) {
            this._seg(color, width, this._dx(pts[i - 2]), this._dy(pts[i - 1]), this._dx(pts[i]), this._dy(pts[i + 1]));
        }
    }

    /** 一段线 + 端点圆：补齐转角接口，避免快速划线出现锯齿缺口 */
    private _seg(color: Color, width: number, x0: number, y0: number, x1: number, y1: number): void {
        const g = this._g;
        if (!g) {
            return;
        }
        g.lineWidth = width;
        g.strokeColor = color;
        g.fillColor = color;
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
        g.circle(x1, y1, width / 2);
        g.fill();
    }

    // ------------------------------------------------------------ 坐标

    private _nx(x: number): number {
        return Math.min(1, Math.max(0, x / this._w + 0.5));
    }

    private _ny(y: number): number {
        return Math.min(1, Math.max(0, y / this._h + 0.5));
    }

    private _dx(nx: number): number {
        return (nx - 0.5) * this._w;
    }

    private _dy(ny: number): number {
        return (ny - 0.5) * this._h;
    }

    // ------------------------------------------------------------ 序列化（联机草稿）

    serialize(): BoardData {
        return {
            v: 1,
            strokes: this._strokes.map((s) => ({ pen: s.pen, width: s.width, pts: s.pts.slice() })),
        };
    }

    load(data: BoardData): void {
        this.clear();
        if (!data || !data.strokes) {
            return;
        }
        for (let i = 0; i < data.strokes.length; i++) {
            const s = data.strokes[i];
            this._strokes.push({ pen: s.pen, width: s.width, pts: s.pts.slice() });
        }
        this._redraw();
    }

    // ------------------------------------------------------------ 回放

    startReplay(): void {
        this._replaying = true;
        this._rs = 0;
        this._rp = 0;
        const g = this._g;
        if (g) {
            g.clear();
        }
        this._paper();
    }

    /** 每帧推进一步，返回 true 表示回放结束 */
    replayTick(pointsPerTick: number): boolean {
        if (!this._replaying) {
            return true;
        }
        let left = pointsPerTick;
        while (left > 0 && this._rs < this._strokes.length) {
            const s = this._strokes[this._rs];
            const pts = s.pts;
            const color = s.pen < 0 ? COLOR.paper : PENS[s.pen];
            const width = Math.max(3, (PEN_WIDTHS[s.width] * this._w) / 640) * (s.pen < 0 ? 2.2 : 1);
            if (this._rp === 0) {
                const g = this._g;
                if (g) {
                    g.fillColor = color;
                    g.circle(this._dx(pts[0]), this._dy(pts[1]), width / 2);
                    g.fill();
                }
                this._rp = 2;
                left--;
                continue;
            }
            const x0 = this._dx(pts[this._rp - 2]);
            const y0 = this._dy(pts[this._rp - 1]);
            const x1 = this._dx(pts[this._rp]);
            const y1 = this._dy(pts[this._rp + 1]);
            this._seg(color, width, x0, y0, x1, y1);
            this._rp += 2;
            left--;
            if (this._rp >= pts.length - 2) {
                this._rs++;
                this._rp = 0;
            }
        }
        if (this._rs >= this._strokes.length) {
            this._replaying = false;
            return true;
        }
        return false;
    }

    stopReplay(): void {
        this._replaying = false;
        this._redraw();
    }
}
