import { _decorator, Component, Input, input, EventTouch, Sprite, SpriteFrame, UITransform } from 'cc';
import { Field, SIZE, TIMING } from './Constants';

const { ccclass } = _decorator;

/** 玩家飞机：跟随手指移动，按固定间隔自动开火 */
@ccclass('Player')
export class Player extends Component {
    /** 由 Game 注入的开火回调，参数为枪口坐标 */
    onShoot: ((x: number, y: number) => void) | null = null;

    private _timer = 0;
    private _alive = false;
    private _size = SIZE.player;

    setup(frame: SpriteFrame): void {
        let trans = this.node.getComponent(UITransform);
        if (!trans) {
            trans = this.node.addComponent(UITransform);
        }
        trans.setContentSize(this._size, this._size);
        let sprite = this.node.getComponent(Sprite);
        if (!sprite) {
            sprite = this.node.addComponent(Sprite);
        }
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame;
    }

    onEnable(): void {
        input.on(Input.EventType.TOUCH_START, this._onTouchMove, this);
        input.on(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
    }

    onDisable(): void {
        input.off(Input.EventType.TOUCH_START, this._onTouchMove, this);
        input.off(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
    }

    /** 复活：回到屏幕底部居中上方 30px */
    revive(): void {
        this._alive = true;
        this._timer = 0;
        this.node.active = true;
        this.node.setPosition(0, -Field.halfH + this._size / 2 + 30, 0);
    }

    kill(): void {
        this._alive = false;
        this.node.active = false;
    }

    private _onTouchMove(evt: EventTouch): void {
        if (!this._alive) {
            return;
        }
        const p = evt.getUILocation();
        if (!p) {
            return;
        }
        const half = this._size / 2;
        const minX = -Field.halfW + half;
        const maxX = Field.halfW - half;
        const minY = -Field.halfH + half;
        const maxY = Field.halfH - half;
        const x = Math.min(maxX, Math.max(minX, p.x - Field.halfW));
        const y = Math.min(maxY, Math.max(minY, p.y - Field.halfH));
        this.node.setPosition(x, y, 0);
    }

    update(dt: number): void {
        if (!this._alive) {
            return;
        }
        this._timer += dt;
        if (this._timer < TIMING.shoot) {
            return;
        }
        this._timer = 0;
        if (this.onShoot) {
            this.onShoot(this.node.position.x, this.node.position.y + this._size / 2 - 10);
        }
    }
}
