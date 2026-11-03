import { _decorator, Component, Graphics, Color, UITransform } from 'cc';
import { Field, WORLD, HOOK } from './Constants';

const { ccclass } = _decorator;

export type HookState = 'idle' | 'sinking' | 'reeling';

/** 钩子当前的负载，用来决定回弹速度 */
export interface HookLoad {
    count: number;
    maxValue: number;
}

/** 钓钩：按住匀速下潜；勾到鱼或松手立即回弹；回弹速度取决于渔获重量 */
@ccclass('Hook')
export class Hook extends Component {
    depth = 0;
    x = 0;
    state: HookState = 'idle';

    private _targetX = 0;
    private _gfx: Graphics | null = null;

    /** 钩子在屏幕上固定的锚点高度 */
    get anchorY(): number {
        return Field.halfH * WORLD.hookAnchorRatio;
    }

    setup(): void {
        this.node.addComponent(UITransform);
        const gfx = this.node.addComponent(Graphics);
        this._gfx = gfx;

        const r = HOOK.radius;
        gfx.strokeColor = new Color(235, 240, 245, 255);
        gfx.lineWidth = 5;
        gfx.moveTo(0, r * 1.6);
        gfx.lineTo(0, -r * 0.2);
        gfx.stroke();
        gfx.moveTo(0, -r * 0.2);
        gfx.lineTo(-r * 0.85, -r * 0.9);
        gfx.lineTo(r * 0.15, -r * 1.5);
        gfx.stroke();
        gfx.fillColor = new Color(200, 205, 210, 255);
        gfx.circle(0, r * 1.7, r * 0.5);
        gfx.fill();

        this.node.setPosition(0, this.anchorY, 0);
    }

    reset(): void {
        this.depth = 0;
        this.x = 0;
        this._targetX = 0;
        this.state = 'idle';
        this.node.setPosition(0, this.anchorY, 0);
    }

    /** 按下：开始匀速下潜 */
    press(targetX: number): void {
        if (this.state === 'idle') {
            this.state = 'sinking';
            this._targetX = targetX;
        }
    }

    moveTo(targetX: number): void {
        this._targetX = targetX;
    }

    /** 松手：空钩快速回弹 */
    release(): void {
        if (this.state === 'sinking') {
            this.state = 'reeling';
        }
    }

    /** 勾到鱼：立刻带着鱼回弹 */
    caught(): void {
        if (this.state === 'sinking') {
            this.state = 'reeling';
        }
    }

    /** 断线：钩子空着弹回水面 */
    cut(): void {
        this.state = 'reeling';
    }

    /** 由 Game 显式驱动，保证与鱼群、碰撞的更新顺序 */
    tick(dt: number, load: HookLoad, maxDepth: number): void {
        const limit = Field.halfW - HOOK.radius;
        this._targetX = Math.max(-limit, Math.min(limit, this._targetX));
        this.x += (this._targetX - this.x) * Math.min(1, HOOK.followLerp * dt);

        const metersPerPixel = 1 / WORLD.pixelsPerMeter;
        if (this.state === 'sinking') {
            this.depth += HOOK.sinkSpeed * dt * metersPerPixel;
            if (this.depth >= maxDepth) {
                this.depth = maxDepth;
                this.state = 'reeling';
            }
        } else if (this.state === 'reeling') {
            this.depth -= riseSpeedFor(load) * dt * metersPerPixel;
            if (this.depth <= 0) {
                this.depth = 0;
                this.state = 'idle';
            }
        }
        this.node.setPosition(this.x, this.anchorY, 0);
    }

    get graphics(): Graphics | null {
        return this._gfx;
    }
}

/** 空钩最快；小鱼几乎不拖慢；大鱼明显变沉、带挣扎感 */
function riseSpeedFor(load: HookLoad): number {
    if (load.count === 0) {
        return HOOK.riseEmpty;
    }
    if (load.maxValue <= 10) {
        return HOOK.riseSmall;
    }
    if (load.maxValue <= 100) {
        return HOOK.riseMid;
    }
    return HOOK.riseBig;
}
