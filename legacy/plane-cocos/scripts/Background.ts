import { _decorator, Component, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { SPEED } from './Constants';

const { ccclass } = _decorator;

/** 无限滚动背景：两张首尾相接的同尺寸图片循环下移 */
@ccclass('Background')
export class Background extends Component {
    private _top: Node | null = null;
    private _bottom: Node | null = null;
    private _offset = 0;
    private _height = 0;

    setup(frame: SpriteFrame, width: number, height: number): void {
        this._height = height;
        this._offset = 0;
        this._top = this._createLayer('bg-top', frame, width, height);
        this._bottom = this._createLayer('bg-bottom', frame, width, height);
        this._apply();
    }

    private _createLayer(name: string, frame: SpriteFrame, width: number, height: number): Node {
        const node = new Node(name);
        node.layer = this.node.layer;
        const trans = node.addComponent(UITransform);
        trans.setContentSize(width, height);
        const sprite = node.addComponent(Sprite);
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.spriteFrame = frame;
        this.node.addChild(node);
        return node;
    }

    private _apply(): void {
        if (this._top) {
            this._top.setPosition(0, this._offset, 0);
        }
        if (this._bottom) {
            this._bottom.setPosition(0, this._offset + this._height, 0);
        }
    }

    update(dt: number): void {
        if (!this._top || this._height <= 0) {
            return;
        }
        this._offset -= SPEED.background * dt;
        if (this._offset <= -this._height) {
            this._offset += this._height;
        }
        this._apply();
    }
}
