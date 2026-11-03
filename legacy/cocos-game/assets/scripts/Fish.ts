import { _decorator, Component, Graphics, Color, UITransform, Vec3 } from 'cc';
import { FishSpecies } from './FishDB';
import { Field } from './Constants';

const { ccclass } = _decorator;

/** 一条鱼：按深度分布、左右游动；被勾中后跟随钩子并挣扎 */
@ccclass('Fish')
export class Fish extends Component {
    species: FishSpecies | null = null;
    depth = 0;
    x = 0;
    dir = 1;
    hooked = false;

    private _gfx: Graphics | null = null;

    private _ensure(): void {
        if (!this.node.getComponent(UITransform)) {
            this.node.addComponent(UITransform);
        }
        if (!this._gfx) {
            this._gfx = this.node.addComponent(Graphics);
        }
    }

    init(species: FishSpecies, depth: number, x: number, dir: number): void {
        this._ensure();
        this.species = species;
        this.depth = depth;
        this.x = x;
        this.dir = dir;
        this.hooked = false;
        this.node.active = true;
        this.node.angle = 0;
        this.node.setScale(new Vec3(dir, 1, 1));
        this._draw();
    }

    private _draw(): void {
        if (!this._gfx) {
            return;
        }
        this._gfx.clear();
        if (this.species?.hostile) {
            this._drawPredator();
        } else {
            this._drawFish();
        }
    }

    private _drawFish(): void {
        const gfx = this._gfx;
        const sp = this.species;
        if (!gfx || !sp) {
            return;
        }
        const [r, g, b] = sp.color;
        const half = sp.size / 2;
        const body = new Color(r, g, b, 255);

        gfx.fillColor = body;
        gfx.moveTo(-half * 0.8, 0);
        gfx.lineTo(-half * 1.4, -half * 0.5);
        gfx.lineTo(-half * 1.4, half * 0.5);
        gfx.close();
        gfx.fill();
        gfx.moveTo(-half * 0.1, half * 0.45);
        gfx.lineTo(-half * 0.35, half * 0.95);
        gfx.lineTo(half * 0.3, half * 0.45);
        gfx.close();
        gfx.fill();
        gfx.ellipse(0, 0, half, half * 0.55);
        gfx.fill();
        gfx.fillColor = new Color(
            Math.min(255, r + 45),
            Math.min(255, g + 45),
            Math.min(255, b + 45),
            190,
        );
        gfx.ellipse(0, -half * 0.18, half * 0.72, half * 0.26);
        gfx.fill();
        gfx.fillColor = new Color(250, 250, 250, 255);
        gfx.circle(half * 0.45, half * 0.12, Math.max(2.5, half * 0.14));
        gfx.fill();
        gfx.fillColor = new Color(20, 25, 35, 255);
        gfx.circle(half * 0.45, half * 0.12, Math.max(1.2, half * 0.07));
        gfx.fill();
    }

    /** 掠食者：流线型长身、尖吻、大背鳍、分叉尾、红眼 */
    private _drawPredator(): void {
        const gfx = this._gfx;
        const sp = this.species;
        if (!gfx || !sp) {
            return;
        }
        const [r, g, b] = sp.color;
        const half = sp.size / 2;
        const body = new Color(r, g, b, 255);

        gfx.fillColor = body;
        gfx.ellipse(0, 0, half, half * 0.34);
        gfx.fill();
        // 尖吻
        gfx.moveTo(half * 0.82, -half * 0.14);
        gfx.lineTo(half * 1.38, 0);
        gfx.lineTo(half * 0.82, half * 0.14);
        gfx.close();
        gfx.fill();
        // 背鳍
        gfx.moveTo(-half * 0.12, half * 0.28);
        gfx.lineTo(-half * 0.32, half * 1.0);
        gfx.lineTo(half * 0.38, half * 0.28);
        gfx.close();
        gfx.fill();
        // 分叉尾
        gfx.moveTo(-half * 0.78, 0);
        gfx.lineTo(-half * 1.36, -half * 0.6);
        gfx.lineTo(-half * 1.02, 0);
        gfx.lineTo(-half * 1.36, half * 0.6);
        gfx.close();
        gfx.fill();
        // 腹部
        gfx.fillColor = new Color(215, 220, 230, 210);
        gfx.ellipse(0, -half * 0.13, half * 0.78, half * 0.15);
        gfx.fill();
        // 嘴缝
        gfx.strokeColor = new Color(245, 245, 250, 255);
        gfx.lineWidth = 2;
        gfx.moveTo(half * 0.45, half * 0.05);
        gfx.lineTo(half * 1.0, half * 0.02);
        gfx.stroke();
        // 红眼
        gfx.fillColor = new Color(235, 70, 70, 255);
        gfx.circle(half * 0.46, half * 0.1, Math.max(2.5, half * 0.1));
        gfx.fill();
    }

    /** 由 Game 显式驱动 */
    tick(dt: number): void {
        if (this.hooked || !this.species) {
            return;
        }
        const limit = Field.halfW - this.species.size * 0.8;
        this.x += this.dir * this.species.speed * dt;
        if (this.x > limit) {
            this.x = limit;
            this.dir = -1;
        } else if (this.x < -limit) {
            this.x = -limit;
            this.dir = 1;
        }
        this.node.setScale(new Vec3(this.dir, 1, 1));
    }

    /** 被勾住时头朝上并挣扎摆动 */
    struggle(time: number): void {
        this.node.angle = -78 + Math.sin(time * 14) * 15;
    }

    get radius(): number {
        return this.species ? this.species.size * 0.42 : 0;
    }
}
