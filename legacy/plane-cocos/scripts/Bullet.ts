import { _decorator, Component, Sprite, SpriteFrame, UITransform } from 'cc';
import { Field, SIZE, SPEED } from './Constants';

const { ccclass } = _decorator;

/** 玩家子弹，向上飞行，飞出可视区域后自行失效 */
@ccclass('Bullet')
export class Bullet extends Component {
    alive = false;

    private _speed = SPEED.bullet;
    private _halfH = 0;

    private _ensure(): void {
        if (!this.node.getComponent(UITransform)) {
            const trans = this.node.addComponent(UITransform);
            trans.setContentSize(SIZE.bulletW, SIZE.bulletH);
            const sprite = this.node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        }
    }

    init(frame: SpriteFrame, x: number, y: number, speed: number): void {
        this._ensure();
        const sprite = this.node.getComponent(Sprite);
        if (sprite) {
            sprite.spriteFrame = frame;
        }
        this._speed = speed;
        this._halfH = SIZE.bulletH / 2;
        this.node.setPosition(x, y, 0);
        this.node.active = true;
        this.alive = true;
    }

    update(dt: number): void {
        if (!this.alive) {
            return;
        }
        const y = this.node.position.y + this._speed * dt;
        this.node.setPosition(this.node.position.x, y, 0);
        if (y - this._halfH > Field.halfH) {
            this.alive = false;
            this.node.active = false;
        }
    }
}
