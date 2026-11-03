import { _decorator, Component, Node, Graphics, Color, UITransform } from 'cc';
import { Field } from './Constants';
import { getFishConfig } from './FishDB';

const { ccclass } = _decorator;

const SHALLOW = new Color(96, 190, 235, 255);
const DEEP = new Color(4, 12, 40, 255);
const SKY = new Color(176, 224, 246, 255);

function lerpColor(a: Color, b: Color, t: number): Color {
    return new Color(
        Math.round(a.r + (b.r - a.r) * t),
        Math.round(a.g + (b.g - a.g) * t),
        Math.round(a.b + (b.b - a.b) * t),
        255,
    );
}

/** 海水背景、水面（船与老人）、钓线 */
@ccclass('Ocean')
export class Ocean extends Component {
    private _bg: Graphics | null = null;
    private _surface: Node | null = null;
    private _line: Graphics | null = null;
    private readonly _rodTipX = 44;
    private readonly _rodTipY = 96;

    setup(): void {
        const water = new Node('water');
        water.layer = this.node.layer;
        water.addComponent(UITransform);
        this.node.addChild(water);
        this._bg = water.addComponent(Graphics);

        const surface = new Node('surface');
        surface.layer = this.node.layer;
        surface.addComponent(UITransform);
        this.node.addChild(surface);
        this._surface = surface;
        this._drawSurface(surface.addComponent(Graphics));

        const line = new Node('line');
        line.layer = this.node.layer;
        line.addComponent(UITransform);
        this.node.addChild(line);
        this._line = line.addComponent(Graphics);
    }

    private _drawSurface(g: Graphics): void {
        const w = Field.halfW * 2;
        // 水面以上的空气
        g.fillColor = SKY;
        g.fillRect(-Field.halfW, 0, w, 2600);
        // 浪花
        g.strokeColor = new Color(255, 255, 255, 230);
        g.lineWidth = 5;
        for (let i = 0; i < 4; i++) {
            const y = -i * 14;
            g.moveTo(-Field.halfW, y);
            for (let x = -Field.halfW; x <= Field.halfW; x += 40) {
                g.lineTo(x, y + Math.sin((x + i * 60) / 55) * 6);
            }
            g.stroke();
        }
        // 船身
        g.fillColor = new Color(140, 92, 56, 255);
        g.moveTo(-78, 10);
        g.lineTo(78, 10);
        g.lineTo(58, 58);
        g.lineTo(-58, 58);
        g.close();
        g.fill();
        g.fillColor = new Color(168, 118, 74, 255);
        g.fillRect(-78, 46, 156, 12);
        // 钓竿
        g.strokeColor = new Color(112, 74, 46, 255);
        g.lineWidth = 7;
        g.moveTo(18, 58);
        g.lineTo(this._rodTipX, this._rodTipY);
        g.stroke();
        // 老人
        g.fillColor = new Color(58, 108, 168, 255);
        g.moveTo(-17, 58);
        g.lineTo(17, 58);
        g.lineTo(13, 102);
        g.lineTo(-13, 102);
        g.close();
        g.fill();
        g.fillColor = new Color(240, 208, 176, 255);
        g.circle(0, 112, 13);
        g.fill();
        g.fillColor = new Color(112, 88, 60, 255);
        g.moveTo(-22, 119);
        g.lineTo(22, 119);
        g.lineTo(0, 140);
        g.close();
        g.fill();
    }

    setDepth(depth: number, anchorY: number, pixelsPerMeter: number): void {
        if (this._surface) {
            this._surface.setPosition(0, anchorY + depth * pixelsPerMeter, 0);
        }
        this._drawWater(depth, pixelsPerMeter);
    }

    private _drawWater(depth: number, pixelsPerMeter: number): void {
        const g = this._bg;
        if (!g) {
            return;
        }
        const maxDepth = getFishConfig().maxDepth;
        const span = Field.halfH / pixelsPerMeter;
        const segments = 24;
        const h = (Field.halfH * 2) / segments;
        g.clear();
        for (let i = 0; i < segments; i++) {
            const meters = depth - span + span * 2 * (i / segments);
            const t = Math.max(0, Math.min(1, meters / maxDepth));
            g.fillColor = lerpColor(SHALLOW, DEEP, t);
            g.fillRect(-Field.halfW, Field.halfH - (i + 1) * h, Field.halfW * 2, h + 1);
        }
    }

    drawLine(hookX: number, hookY: number): void {
        const g = this._line;
        if (!g || !this._surface) {
            return;
        }
        g.clear();
        g.strokeColor = new Color(240, 245, 250, 210);
        g.lineWidth = 3;
        g.moveTo(this._rodTipX, this._surface.position.y + this._rodTipY);
        g.lineTo(hookX, hookY);
        g.stroke();
    }
}
