import { _decorator, Component, Node, UITransform, view, sys, input, Input, EventTouch } from 'cc';
import { HomeButton } from './HomeButton';
import { makeResult, ScoreResult } from './Bridge';
import { Field, WORLD, HOOK, FISH, ROUND, LINE, COMBO, SAVE_KEY } from './Constants';
import { loadFishConfig, getFishConfig, pickSpecies } from './FishDB';
import { Ocean } from './Ocean';
import { Hook, HookLoad } from './Hook';
import { Fish } from './Fish';
import { Hud } from './Hud';

const { ccclass } = _decorator;

type GameState = 'loading' | 'ready' | 'playing' | 'over';

/** 主控：60 秒限时、匀速下潜、上钩即回弹、Combo、断线、鱼线成长 */
@ccclass('Game')
export class Game extends Component {
    private _oceanLayer: Node | null = null;
    private _fishLayer: Node | null = null;
    private _uiLayer: Node | null = null;

    private _ocean: Ocean | null = null;
    private _hook: Hook | null = null;
    private _hud: Hud | null = null;

    private _fishNodes: Node[] = [];
    private _hooked: Fish[] = [];

    private _timeLeft = ROUND.duration;
    private _roundCoins = 0;
    private _totalCoins = 0;
    private _bestDepth = 0;
    private _lineLevel = 0;
    private _maxDepthThisRound = 0;
    private _state: GameState = 'loading';
    private _elapsed = 0;

    onLoad(): void {
        const size = view.getVisibleSize();
        Field.halfW = size.width / 2;
        Field.halfH = size.height / 2;

        const trans = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
        trans.setContentSize(size.width, size.height);

        this._oceanLayer = this._createLayer('ocean-layer');
        this._fishLayer = this._createLayer('fish-layer');
        this._uiLayer = this._createLayer('ui-layer');
        this._mountHomeButton(this._uiLayer);
    }

    onEnable(): void {
        input.on(Input.EventType.TOUCH_START, this._onTouchStart, this);
        input.on(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
        input.on(Input.EventType.TOUCH_END, this._onTouchEnd, this);
        input.on(Input.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    }

    onDisable(): void {
        input.off(Input.EventType.TOUCH_START, this._onTouchStart, this);
        input.off(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
        input.off(Input.EventType.TOUCH_END, this._onTouchEnd, this);
        input.off(Input.EventType.TOUCH_CANCEL, this._onTouchEnd, this);
    }

    start(): void {
        void this._boot();
    }

    update(dt: number): void {
        const hook = this._hook;
        const ocean = this._ocean;
        const hud = this._hud;
        if (this._state === 'loading' || !hook || !ocean || !hud) {
            return;
        }

        this._elapsed += dt;

        if (this._state === 'playing') {
            this._timeLeft -= dt;
            if (this._timeLeft <= 0) {
                this._timeLeft = 0;
                hud.setTime(0);
                this._endRound();
                return;
            }
            hud.setTime(this._timeLeft);
        }

        hook.tick(dt, this._hookLoad(), this._lineLength());
        this._maxDepthThisRound = Math.max(this._maxDepthThisRound, hook.depth);

        const anchorY = hook.anchorY;
        const ppm = WORLD.pixelsPerMeter;

        for (const node of this._fishNodes) {
            const fish = node.getComponent(Fish);
            if (!fish || fish.hooked) {
                continue;
            }
            fish.tick(dt);
            this._syncFishY(node, fish, anchorY, ppm, hook.depth);
            if (fish.depth < hook.depth - FISH.behindMeters) {
                this._placeFish(node, hook.depth + FISH.aheadMeters * (0.35 + Math.random() * 0.65));
                this._syncFishY(node, fish, anchorY, ppm, hook.depth);
            }
        }

        for (let i = 0; i < this._hooked.length; i++) {
            const fish = this._hooked[i];
            fish.depth = Math.max(0, hook.depth - 6 - i * 4);
            fish.x = hook.x + (i % 2 === 0 ? -10 : 10);
            fish.node.setPosition(fish.x, anchorY - (fish.depth - hook.depth) * ppm, 0);
            fish.struggle(this._elapsed + i * 0.7);
        }

        // 下潜与上拉途中都能勾鱼（上拉顺路收割 = Combo）
        if (hook.state !== 'idle') {
            this._collide(anchorY);
        }
        if (hook.state === 'idle' && this._hooked.length > 0) {
            this._landCatch();
        }

        ocean.setDepth(hook.depth, anchorY, ppm);
        ocean.drawLine(hook.x, anchorY);
        hud.setDepth(hook.depth);

        if (this._hooked.length >= 2) {
            hud.showCombo(this._hooked.length, comboMultiplier(this._hooked.length));
        } else {
            hud.hideCombo();
        }
    }

    // ---------------------------------------------------------------- 初始化

    private _createLayer(name: string): Node {
        const node = new Node(name);
        node.layer = this.node.layer;
        node.addComponent(UITransform);
        this.node.addChild(node);
        return node;
    }

    private async _boot(): Promise<void> {
        try {
            await loadFishConfig();
            this._setupOcean();
            this._setupHook();
            this._setupHud();
            this._loadSave();
            this._spawnInitial();
            this._state = 'ready';
            if (this._hud) {
                this._hud.setTime(ROUND.duration);
                this._hud.setLineLimit(this._lineLength());
            }
            this._refreshUpgrade();
        } catch (err) {
            console.error('[Game] boot failed', err);
        }
    }

    private _setupOcean(): void {
        if (!this._oceanLayer) {
            return;
        }
        const node = new Node('ocean');
        node.layer = this.node.layer;
        node.addComponent(UITransform);
        this._oceanLayer.addChild(node);
        const ocean = node.addComponent(Ocean);
        if (!ocean) {
            return;
        }
        ocean.setup();
        this._ocean = ocean;
    }

    private _setupHook(): void {
        if (!this._fishLayer) {
            return;
        }
        const node = new Node('hook');
        node.layer = this.node.layer;
        this._fishLayer.addChild(node);
        const hook = node.addComponent(Hook);
        if (!hook) {
            return;
        }
        hook.setup();
        this._hook = hook;
    }

    private _setupHud(): void {
        if (!this._uiLayer) {
            return;
        }
        const node = new Node('hud');
        node.layer = this.node.layer;
        node.addComponent(UITransform);
        this._uiLayer.addChild(node);
        const hud = node.addComponent(Hud);
        if (!hud) {
            return;
        }
        hud.setup();
        hud.setCallbacks(() => this._startRound(), () => this._upgradeLine());
        this._hud = hud;
    }

    private _spawnInitial(): void {
        const count = getFishConfig().spawn.count;
        const range = Math.min(this._lineLength() + 400, getFishConfig().maxDepth);
        const anchorY = this._hook ? this._hook.anchorY : 0;
        for (let i = 0; i < count; i++) {
            const node = this._takeFishNode();
            this._placeFish(node, (i / count) * range * 0.95);
            const fish = node.getComponent(Fish);
            if (fish) {
                this._syncFishY(node, fish, anchorY, WORLD.pixelsPerMeter, 0);
            }
            this._fishNodes.push(node);
        }
    }

    private _takeFishNode(): Node {
        const node = new Node('fish');
        node.layer = this.node.layer;
        node.addComponent(Fish);
        if (this._fishLayer) {
            this._fishLayer.addChild(node);
        }
        return node;
    }

    private _placeFish(node: Node, depth: number): void {
        const fish = node.getComponent(Fish);
        if (!fish) {
            return;
        }
        const maxDepth = getFishConfig().maxDepth;
        // 水面下 40 米内不刷鱼，留给玩家观察与反应的时间
        const d = Math.max(40, Math.min(maxDepth, depth));
        const species = pickSpecies(d);
        const limit = Math.max(20, Field.halfW - species.size * 0.8);
        const x = (Math.random() * 2 - 1) * limit;
        fish.init(species, d, x, Math.random() < 0.5 ? -1 : 1);
    }

    /** 深度差换算成屏幕 y：鱼比钩子深就画在下方 */
    private _syncFishY(node: Node, fish: Fish, anchorY: number, ppm: number, hookDepth: number): void {
        node.setPosition(fish.x, anchorY - (fish.depth - hookDepth) * ppm, 0);
    }

    // ---------------------------------------------------------------- 玩法

    private _hookLoad(): HookLoad {
        let maxValue = 0;
        for (const fish of this._hooked) {
            if (fish.species) {
                maxValue = Math.max(maxValue, fish.species.value);
            }
        }
        return { count: this._hooked.length, maxValue };
    }

    private _collide(anchorY: number): void {
        const hook = this._hook;
        if (!hook) {
            return;
        }
        for (const node of this._fishNodes) {
            const fish = node.getComponent(Fish);
            if (!fish || fish.hooked) {
                continue;
            }
            const dx = fish.x - hook.x;
            const dy = node.position.y - anchorY;
            const r = fish.radius + HOOK.radius;
            if (dx * dx + dy * dy > r * r) {
                continue;
            }
            if (fish.species?.hostile) {
                this._cutLine(fish);
                return;
            }
            fish.hooked = true;
            this._hooked.push(fish);
            hook.caught();
        }
    }

    /** 掠食者咬断鱼线：本趟渔获全部损失 */
    private _cutLine(predator: Fish): void {
        const hook = this._hook;
        if (!hook) {
            return;
        }
        for (const fish of this._hooked) {
            this._recycleFish(fish);
        }
        this._hooked.length = 0;
        this._recycleFish(predator);
        hook.cut();
        if (this._hud) {
            this._hud.showToast('鱼线断了！');
            this._hud.hideCombo();
        }
    }

    private _landCatch(): void {
        const count = this._hooked.length;
        const mult = comboMultiplier(count);
        let sum = 0;
        for (const fish of this._hooked) {
            if (fish.species) {
                sum += fish.species.value;
            }
            this._recycleFish(fish);
        }
        this._hooked.length = 0;

        const gain = Math.round(sum * mult);
        this._roundCoins += gain;
        if (this._hud) {
            this._hud.setRoundCoins(this._roundCoins);
            this._hud.hideCombo();
            if (gain > 0) {
                const combo = mult > 1 ? `  COMBO x${mult}` : '';
                this._hud.showGain(`+${gain} 金币${combo}`);
            }
        }
    }

    private _recycleFish(fish: Fish): void {
        const hook = this._hook;
        const hookDepth = hook ? hook.depth : 0;
        const anchorY = hook ? hook.anchorY : 0;
        this._placeFish(fish.node, hookDepth + FISH.aheadMeters * (0.4 + Math.random() * 0.6));
        this._syncFishY(fish.node, fish, anchorY, WORLD.pixelsPerMeter, hookDepth);
    }

    // ---------------------------------------------------------------- 单局

    private _startRound(): void {
        this._timeLeft = ROUND.duration;
        this._roundCoins = 0;
        this._maxDepthThisRound = 0;
        this._hooked.length = 0;
        this._hook?.reset();
        if (this._hud) {
            this._hud.hideResult();
            this._hud.setRoundCoins(0);
            this._hud.setTime(ROUND.duration);
            this._hud.setDepth(0);
            this._hud.hideCombo();
        }
        this._state = 'playing';
    }

    private _endRound(): void {
        this._state = 'over';
        for (const fish of this._hooked) {
            this._recycleFish(fish);
        }
        this._hooked.length = 0;
        this._totalCoins += this._roundCoins;
        this._bestDepth = Math.max(this._bestDepth, this._maxDepthThisRound);
        this._save();
        this._refreshUpgrade();
        if (this._hud) {
            this._hud.showResult(this._roundCoins, this._maxDepthThisRound, this._totalCoins);
        }
    }

    // ---------------------------------------------------------------- 鱼线成长

    /** 统一的「回星球」按钮 */
    private _mountHomeButton(parent: Node): void {
        const n = new Node('homeBtn');
        n.layer = parent.layer;
        n.addComponent(UITransform);
        parent.addChild(n);
        const btn = n.addComponent(HomeButton);
        if (btn) {
            btn.setup(() => this._scoreResult());
        }
    }

    /** 汇总当前战绩回传给小程序主页（单人游戏，没有胜负方） */
    private _scoreResult(): ScoreResult {
        const depth = Math.floor(this._bestDepth);
        return makeResult('deepfish', '深海钓鱼', 0, ['我', '深海'],
            [this._totalCoins, depth],
            '金币 ' + this._totalCoins + ' · 最深 ' + depth + 'm');
    }

    private _lineLength(): number {
        const idx = Math.min(this._lineLevel, LINE.lengths.length - 1);
        return LINE.lengths[idx];
    }

    private _refreshUpgrade(): void {
        const hud = this._hud;
        if (!hud) {
            return;
        }
        const next = this._lineLevel + 1;
        if (next >= LINE.lengths.length) {
            hud.setUpgrade('鱼线已满级', true);
            return;
        }
        hud.setUpgrade(`升级鱼线 ${LINE.lengths[next]}m（${LINE.costs[next]}）`, true);
    }

    private _upgradeLine(): void {
        const hud = this._hud;
        const next = this._lineLevel + 1;
        if (next >= LINE.lengths.length) {
            hud?.showToast('鱼线已满级');
            return;
        }
        const cost = LINE.costs[next];
        if (this._totalCoins < cost) {
            hud?.showToast('金币不足');
            return;
        }
        this._totalCoins -= cost;
        this._lineLevel = next;
        this._save();
        if (hud) {
            hud.setLineLimit(this._lineLength());
            hud.showResult(this._roundCoins, this._maxDepthThisRound, this._totalCoins);
        }
        this._refreshUpgrade();
    }

    // ---------------------------------------------------------------- 输入

    private _onTouchStart(evt: EventTouch): void {
        const hook = this._hook;
        if (this._state === 'loading' || this._state === 'over' || !hook) {
            return;
        }
        const p = evt.getUILocation();
        if (!p) {
            return;
        }
        if (this._state === 'ready') {
            this._startRound();
        }
        hook.press(this._toLocalX(p.x));
        if (this._hud) {
            this._hud.hideTip();
        }
    }

    private _onTouchMove(evt: EventTouch): void {
        const hook = this._hook;
        if (this._state !== 'playing' || !hook) {
            return;
        }
        const p = evt.getUILocation();
        if (!p) {
            return;
        }
        hook.moveTo(this._toLocalX(p.x));
    }

    private _onTouchEnd(): void {
        if (this._hook) {
            this._hook.release();
        }
    }

    private _toLocalX(uiX: number): number {
        const limit = Field.halfW - HOOK.radius;
        return Math.max(-limit, Math.min(limit, uiX - Field.halfW));
    }

    // ---------------------------------------------------------------- 存档

    private _loadSave(): void {
        const best = Number(sys.localStorage.getItem(SAVE_KEY.best) ?? '0');
        const coins = Number(sys.localStorage.getItem(SAVE_KEY.coins) ?? '0');
        const level = Number(sys.localStorage.getItem(SAVE_KEY.lineLevel) ?? '0');
        this._bestDepth = Number.isFinite(best) ? best : 0;
        this._totalCoins = Number.isFinite(coins) ? coins : 0;
        this._lineLevel = Number.isFinite(level)
            ? Math.max(0, Math.min(LINE.lengths.length - 1, Math.floor(level)))
            : 0;
    }

    private _save(): void {
        sys.localStorage.setItem(SAVE_KEY.best, String(Math.floor(this._bestDepth)));
        sys.localStorage.setItem(SAVE_KEY.coins, String(this._totalCoins));
        sys.localStorage.setItem(SAVE_KEY.lineLevel, String(this._lineLevel));
    }
}

function comboMultiplier(count: number): number {
    let mult = 1;
    for (let i = 0; i < COMBO.counts.length; i++) {
        if (count >= COMBO.counts[i]) {
            mult = COMBO.multipliers[i];
        }
    }
    return mult;
}
