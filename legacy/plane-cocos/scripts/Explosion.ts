import { _decorator, Component, Sprite, SpriteFrame, UITransform } from 'cc';
import { TIMING } from './Constants';

const { ccclass } = _decorator;

/** 帧序列爆炸动画，播放完自动隐藏并回调 */
@ccclass('Explosion')
export class Explosion extends Component {
    private _sprite: Sprite | null = null;
    private _frames: SpriteFrame[] = [];
    private _index = 0;
    private _timer = 0;
    private _playing = false;
    private _onDone: (() => void) | null = null;

    private _ensure(): void {
        if (!this._sprite) {
            this.node.addComponent(UITransform);
            const sprite = this.node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            this._sprite = sprite;
        }
    }

    play(frames: SpriteFrame[], x: number, y: number, size: number, onDone: (() => void) | null): void {
        if (frames.length === 0) {
            if (onDone) {
                onDone();
            }
            return;
        }
        this._ensure();
        const trans = this.node.getComponent(UITransform);
        if (trans) {
            trans.setContentSize(size, size);
        }
        this.node.setPosition(x, y, 0);
        this.node.active = true;
        this._frames = frames;
        this._index = 0;
        this._timer = 0;
        this._playing = true;
        this._onDone = onDone;
        if (this._sprite) {
            this._sprite.spriteFrame = frames[0];
        }
    }

    update(dt: number): void {
        if (!this._playing) {
            return;
        }
        this._timer += dt;
        while (this._timer >= TIMING.explosionFrame) {
            this._timer -= TIMING.explosionFrame;
            this._index++;
            if (this._index >= this._frames.length) {
                this._playing = false;
                this.node.active = false;
                const done = this._onDone;
                this._onDone = null;
                if (done) {
                    done();
                }
                return;
            }
            if (this._sprite) {
                this._sprite.spriteFrame = this._frames[this._index];
            }
        }
    }
}
