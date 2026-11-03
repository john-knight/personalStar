import { _decorator, Component, Node, UITransform, view, input, Input, EventTouch, Camera, Vec3, Graphics, Color } from 'cc';
import { HomeButton } from './HomeButton';
import { makeResult, ScoreResult } from './Bridge';
import { COLOR, PLAYERS, DRAW_SECONDS, ROUNDS, CANDIDATES } from './Constants';
import { pickDrawChoices, pickCandidates } from './Words';
import type { WordItem } from './Words';
import { PaintCanvas } from './PaintCanvas';
import { Hud } from './Hud';

const { ccclass } = _decorator;

type Phase = 'ready' | 'choose' | 'draw' | 'guess' | 'result' | 'over';

/** 主控：回合流程、画笔输入、倒计时 */
@ccclass('Game')
export class Game extends Component {
    private _frameLayer: Node | null = null;
    private _paperLayer: Node | null = null;
    private _uiLayer: Node | null = null;
    private _pc: PaintCanvas | null = null;
    private _hud: Hud | null = null;
    private _camera: Camera | null = null;

    private _phase: Phase = 'ready';
    private _round = 0;
    private _score = [0, 0];
    private _used: string[] = [];
    private _choices: WordItem[] = [];
    private _word: WordItem | null = null;
    private _cands: string[] = [];
    private _left = DRAW_SECONDS;
    private _acc = 0;
    private _drawing = false;
    private _replaying = false;
    private _replayRate = 10;
    private _replayAcc = 0;
    private _lastOk = false;
    private _lastGuess = '';
    /** 本回合已经猜了几次（最多 2 次） */
    private _guessCount = 0;
    private _w = 0;
    private _h = 0;

    private get _drawer(): number {
        return this._round % 2;
    }

    private get _guesser(): number {
        return 1 - (this._round % 2);
    }

    onEnable(): void {
        input.on(Input.EventType.TOUCH_START, this._onDown, this);
        input.on(Input.EventType.TOUCH_MOVE, this._onMove, this);
        input.on(Input.EventType.TOUCH_END, this._onUp, this);
        input.on(Input.EventType.TOUCH_CANCEL, this._onUp, this);
    }

    onDisable(): void {
        input.off(Input.EventType.TOUCH_START, this._onDown, this);
        input.off(Input.EventType.TOUCH_MOVE, this._onMove, this);
        input.off(Input.EventType.TOUCH_END, this._onUp, this);
        input.off(Input.EventType.TOUCH_CANCEL, this._onUp, this);
    }

    start(): void {
        const size = view.getVisibleSize();
        this._w = size.width;
        this._h = size.height;
        const t = this.getComponent(UITransform) ?? this.addComponent(UITransform);
        t.setContentSize(size.width, size.height);

        this._camera = this.node.scene.getComponentInChildren(Camera);

        const topH = 150;
        const toolH = 190;
        let paperH = size.height - topH - toolH - 20;
        let paperW = Math.min(size.width * 0.94, 660);
        if (paperH > paperW * 1.2) {
            paperH = paperW * 1.2;
        }
        paperW = Math.min(paperW, paperH * 1.15);
        const paperY = (toolH - topH) / 2;
        const topY = size.height / 2 - topH / 2;
        const toolY = -size.height / 2 + toolH / 2;

        this._frameLayer = this._mk('frame-layer');
        this._paperLayer = this._mk('paper-layer');
        this._paperLayer.setPosition(0, paperY, 0);
        this._uiLayer = this._mk('ui-layer');
        this._mountHomeButton(this._uiLayer);

        this._drawFrame(paperW + 16, paperH + 16, paperY);

        this._pc = this._paperLayer.addComponent(PaintCanvas);
        this._pc.setup(paperW, paperH);

        this._hud = this._uiLayer.addComponent(Hud);
        this._hud.build(size.width, size.height, topY, toolY);
        this._hud.buildDoneButton(this._uiLayer, 0, paperY - paperH / 2 - 44, Math.min(paperW, 300), () => {
            this._toGuess();
        });
        this._hud.onPen((i) => {
            this._pc!.setPen(i);
            this._pc!.setEraser(false);
            this._hud!.setPen(i, false);
        });
        this._hud.onWidth((i) => {
            this._pc!.setWidth(i);
            this._hud!.setWidthIdx(i);
        });
        this._hud.onEraser(() => {
            const on = !this._pc!.isEraser();
            this._pc!.setEraser(on);
            this._hud!.setPen(this._pc!.currentPen(), on);
        });
        this._hud.onUndo(() => this._pc!.undo());
        this._hud.onClear(() => this._pc!.clear());
        this._hud.onDone(() => this._toGuess());
        this._hud.setWidthIdx(1);
        this._hud.setPen(0, false);
        this._pc.setPen(0);
        this._pc.setWidth(1);

        this._phaseReady();
    }

    private _mk(name: string): Node {
        const n = new Node(name);
        n.addComponent(UITransform);
        this.node.addChild(n);
        return n;
    }

    private _drawFrame(w: number, h: number, y: number): void {
        const n = new Node('f');
        n.addComponent(UITransform).setContentSize(w, h);
        const g = n.addComponent(Graphics);
        g.fillColor = new Color(226, 229, 235, 255);
        g.roundRect(-w / 2, -h / 2, w, h, 20);
        g.fill();
        g.lineWidth = 2;
        g.strokeColor = COLOR.border;
        g.roundRect(-w / 2, -h / 2, w, h, 20);
        g.stroke();
        n.setPosition(0, y, 0);
        this._frameLayer!.addChild(n);
    }

    update(dt: number): void {
        if (this._replaying) {
            this._replayAcc += this._replayRate * dt;
            const n = Math.floor(this._replayAcc);
            if (n > 0) {
                this._replayAcc -= n;
                if (this._pc!.replayTick(n)) {
                    this._replaying = false;
                    this._pc!.stopReplay();
                    this._showResult();
                }
            }
            return;
        }
        if (this._phase !== 'draw') {
            return;
        }
        this._acc += dt;
        if (this._acc < 1) {
            return;
        }
        this._acc -= 1;
        this._left--;
        if (this._left <= 0) {
            this._toGuess();
            return;
        }
        this._syncTop();
        if (this._left <= 10) {
            this._hud!.accent(COLOR.accentDark);
        } else {
            this._hud!.accent(COLOR.accent);
        }
    }

    private _syncTop(): void {
        const d = PLAYERS[this._drawer].name;
        const g = PLAYERS[this._guesser].name;
        let status = '';
        let timer = '';
        if (this._phase === 'ready' || this._phase === 'choose') {
            status = '轮到 ' + d + ' 画';
        } else if (this._phase === 'draw') {
            status = d + ' 正在画';
            timer = String(this._left);
        } else if (this._phase === 'guess') {
            status = g + ' 来猜';
        } else if (this._phase === 'result') {
            status = '答案 · ' + (this._word ? this._word.text : '');
        } else {
            status = '本轮结束';
        }
        this._hud!.setTop(status, timer, PLAYERS[0].name + ' ' + this._score[0] + ' : ' + this._score[1] + ' ' + PLAYERS[1].name);
    }

    // ---------------------------------------------------------------- 阶段

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

    /** 汇总当前战绩回传给小程序主页 */
    private _scoreResult(): ScoreResult {
        const a = this._score[0];
        const b = this._score[1];
        const winner = a === b ? 0 : (a > b ? 1 : 2);
        const done = Math.min(this._round, ROUNDS);
        return makeResult('drawguess', '你画我猜', winner,
            [PLAYERS[0].name, PLAYERS[1].name], [a, b],
            '第 ' + done + ' / ' + ROUNDS + ' 回合 · 猜对 ' + (a + b) + ' 次');
    }

    private _phaseReady(): void {
        this._phase = 'ready';
        this._hud!.setToolsVisible(false);
        this._hud!.setDoneVisible(false);
        this._syncTop();
        const d = PLAYERS[this._drawer].name;
        const g = PLAYERS[this._guesser].name;
        const round = this._round + 1;
        this._hud!.info(this._w, this._h, '第 ' + round + ' / ' + ROUNDS + ' 回合', [
            '请把手机交给 ' + d,
            d + '先画，' + g + '来猜',
            '画什么都行，别写字',
        ], [{ text: '我是 ' + d, primary: true, cb: () => this._phaseChoose() }]);
    }

    private _phaseChoose(): void {
        this._phase = 'choose';
        this._pc!.clear();
        this._choices = pickDrawChoices(3, this._used);
        this._syncTop();
        this._hud!.words(this._w, this._h, '选一个来画', this._choices, (i) => {
            this._word = this._choices[i];
            this._used.push(this._word.id);
            this._phaseDraw();
        });
    }

    private _phaseDraw(): void {
        this._phase = 'draw';
        this._left = DRAW_SECONDS;
        this._acc = 0;
        this._hud!.hidePanel();
        this._hud!.setToolsVisible(true);
        this._hud!.setDoneVisible(true);
        this._hud!.accent(COLOR.accent);
        this._syncTop();
    }

    private _toGuess(): void {
        if (this._phase !== 'draw') {
            return;
        }
        this._phase = 'guess';
        this._guessCount = 0;
        this._drawing = false;
        this._pc!.end();
        this._hud!.setToolsVisible(false);
        this._hud!.setDoneVisible(false);
        this._syncTop();
        if (!this._word) {
            return;
        }
        this._cands = pickCandidates(this._word, CANDIDATES);
        const g = PLAYERS[this._guesser].name;
        this._hud!.guess(this._w, this._h, g + ' 猜猜 TA 画的是什么', this._cands, (text) => this._judge(text));
    }

    private _judge(text: string): void {
        const ok = text === (this._word ? this._word.text : '');
        this._guessCount++;
        // 还有一次机会：去掉猜错的选项再问一遍，一次判死太打击人
        if (!ok && this._guessCount < 2 && this._cands.length > 2) {
            this._cands = this._cands.filter((t) => t !== text);
            const g = PLAYERS[this._guesser].name;
            this._hud!.guess(this._w, this._h, g + ' 再想想？', this._cands, (t) => this._judge(t));
            return;
        }
        this._phase = 'result';
        if (ok) {
            this._score[this._guesser] += 1;
        }
        this._lastOk = ok;
        this._lastGuess = text;
        this._syncTop();
        this._showResult();
    }

    private _showResult(): void {
        const ok = this._lastOk;
        const lines: string[] = [];
        lines.push(this._word ? '画的是「' + this._word.text + '」' : '');
        lines.push(ok
            ? PLAYERS[this._guesser].name + ' 答对了，默契 +1'
            : PLAYERS[this._guesser].name + ' 答的是「' + this._lastGuess + '」');
        const last = this._round >= ROUNDS - 1;
        const buttons = [];
        buttons.push({
            text: last ? '看总成绩' : '下一回合',
            primary: true,
            cb: () => (last ? this._phaseOver() : this._nextRound()),
        });
        if (!this._pc!.isEmpty()) {
            buttons.push({ text: '看 TA 怎么画的', primary: false, cb: () => this._replay() });
        }
        this._hud!.info(this._w, this._h, ok ? '猜对了！' : '哎呀，猜错了', lines, buttons);
    }

    private _replay(): void {
        this._hud!.hidePanel();
        this._replaying = true;
        this._replayAcc = 0;
        // 无论笔画多少都用约 2.5 秒播完，太快就失去观赏性了
        this._replayRate = Math.max(6, this._pc!.pointCount() / 2.5);
        this._pc!.startReplay();
    }

    private _nextRound(): void {
        this._round++;
        this._phaseReady();
    }

    private _phaseOver(): void {
        this._phase = 'over';
        this._pc!.clear();
        this._hud!.setToolsVisible(false);
        this._syncTop();
        const a = this._score[0];
        const b = this._score[1];
        let line = '';
        if (a === b) {
            line = '打平了，谁也不比谁懂';
        } else {
            const win = a > b ? PLAYERS[0] : PLAYERS[1];
            line = win.name + ' 更懂对方一点点';
        }
        this._hud!.info(this._w, this._h, '本轮结束', [
            PLAYERS[0].name + ' ' + a + ' : ' + b + ' ' + PLAYERS[1].name,
            line,
            '共 ' + ROUNDS + ' 个回合，每人画了 ' + ROUNDS / 2 + ' 次',
        ], [{ text: '再来一轮', primary: true, cb: () => this._restart() }]);
    }

    private _restart(): void {
        this._round = 0;
        this._score = [0, 0];
        this._used = [];
        this._phaseReady();
    }

    // ---------------------------------------------------------------- 画笔输入

    private _localOf(e: EventTouch): { x: number; y: number } | null {
        const t = this._paperLayer!.getComponent(UITransform);
        if (!t || !this._camera) {
            return null;
        }
        // 屏幕坐标 → 世界坐标 → 画板局部坐标（用 UI 坐标会差半个可见区域）
        const p = e.getLocation();
        const world = this._camera.screenToWorld(new Vec3(p.x, p.y, 0));
        const local = t.convertToNodeSpaceAR(world);
        const size = t.contentSize;
        if (Math.abs(local.x) > size.width / 2 || Math.abs(local.y) > size.height / 2) {
            return null;
        }
        return { x: local.x, y: local.y };
    }

    private _onDown(e: EventTouch): void {
        if (this._phase !== 'draw' || this._replaying) {
            return;
        }
        const p = this._localOf(e);
        if (!p) {
            return;
        }
        this._drawing = true;
        this._pc!.begin(p.x, p.y);
    }

    private _onMove(e: EventTouch): void {
        if (!this._drawing || this._replaying) {
            return;
        }
        const p = this._localOf(e);
        if (!p) {
            return;
        }
        this._pc!.move(p.x, p.y);
    }

    private _onUp(): void {
        this._drawing = false;
        this._pc!.end();
    }
}
