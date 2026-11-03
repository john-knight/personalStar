import { _decorator, Component, Node, UITransform, view, sys, input, Input, EventTouch, Vec3, Graphics, Camera } from 'cc';
import { HomeButton } from './HomeButton';
import { makeResult, ScoreResult } from './Bridge';
import { BOARD, COLOR, SAVE_KEY, PLAYERS, AI_NAME, OPPONENT_TEXT } from './Constants';
import { bestMove } from './Ai';
import { createBoard, place, checkWin, isFull, opponent, Cell } from './Judger';
import { Board } from './Board';
import { Piece } from './Piece';
import { Hud } from './Hud';

const { ccclass } = _decorator;

type Step = { x: number; y: number; v: Cell };

/**
 * 主控：两人轮流落子、胜负判定、悔棋、战绩
 * 联机时把 play() 换成「同步层 → 对手端 play()」即可，本局逻辑不用改
 */
@ccclass('Game')
export class Game extends Component {
    private _boardLayer: Node | null = null;
    private _pieceLayer: Node | null = null;
    private _lineLayer: Node | null = null;
    private _uiLayer: Node | null = null;

    private _board: Board | null = null;
    private _hud: Hud | null = null;

    private _data: Cell[][] = [];
    private _steps: Step[] = [];
    private _pieceNodes: Node[] = [];
    private _turn: Cell = 1;
    private _first: Cell = 1;
    private _over = false;
    private _scores = [0, 0];
    private _radius = 14;
    private _boardY = 0;
    /** 收到的触摸次数（联机与自动化验证用的探针） */
    private _touchHits = 0;
    /** 最近一次触摸的换算结果（探针） */
    private _lastTouch = { ux: 0, uy: 0, lx: 0, ly: 0, hx: -1, hy: -1, ok: false };
    private _camera: Camera | null = null;
    /** 人机模式等级：0 真人对战 / 1 简单 / 2 困难，AI 执白 */
    private _aiLevel = 0;
    /** AI 正在落子，这段时间不接受玩家输入 */
    private _aiActing = false;
    /** 正在回放本局落子 */
    private _reviewing = false;
    private _reviewSteps: Step[] = [];
    private _reviewIdx = 0;

    private get _ai(): boolean {
        return this._aiLevel > 0;
    }

    private get _opponentName(): string {
        return this._ai ? AI_NAME : PLAYERS[1].name;
    }

    onLoad(): void {
        this._boardLayer = this._createLayer('board-layer');
        this._pieceLayer = this._createLayer('piece-layer');
        this._lineLayer = this._createLayer('line-layer');
        this._uiLayer = this._createLayer('ui-layer');
        this._mountHomeButton(this._uiLayer);

        this._board = this._boardLayer.addComponent(Board);
        this._lineLayer.addComponent(Graphics);
        this._hud = this._uiLayer.addComponent(Hud);
        this._camera = this.node.scene.getComponentInChildren(Camera);

        this._loadScores();
    }

    onEnable(): void {
        input.on(Input.EventType.TOUCH_END, this._onTouchEnd, this);
    }

    onDisable(): void {
        input.off(Input.EventType.TOUCH_END, this._onTouchEnd, this);
    }

    start(): void {
        const size = view.getVisibleSize();
        const trans = this.node.getComponent(UITransform) ?? this.node.addComponent(UITransform);
        trans.setContentSize(size.width, size.height);

        // 上下留白给 HUD；用下限兜底，避免屏幕矮时按钮被裁到界外
        const topH = Math.max(148, Math.min(190, size.height * 0.15));
        const bottomH = Math.max(116, Math.min(150, size.height * 0.12));
        const boardSize = Math.min(size.width * 0.94, size.height - topH - bottomH - 24);

        this._boardY = (bottomH - topH) / 2;
        this._boardLayer!.setPosition(0, this._boardY, 0);
        this._pieceLayer!.setPosition(0, this._boardY, 0);
        this._lineLayer!.setPosition(0, this._boardY, 0);

        this._radius = this._board!.layout(boardSize) * 0.45;
        this._board!.draw();

        this._hud!.build(size.width, size.height, size.height / 2 - topH / 2, -size.height / 2 + bottomH / 2);
        this._hud!.onUndo(() => this.undo());
        this._hud!.onRestart(() => this.restart());
        this._hud!.onAgain(() => this.restart());
        this._hud!.onOpponent(() => this._cycleOpponent());
        this._hud!.onReview(() => this.startReview());
        this._hud!.setOpponentText(OPPONENT_TEXT[0]);

        this.restart();
        this._hud!.setScore(this._scores[0], this._scores[1]);
    }

    /** 落子；成功返回 true */
    play(x: number, y: number): boolean {
        if (this._over) {
            return false;
        }
        // 人机模式下轮到 AI 时，玩家点了也不算
        if (this._ai && this._turn === 2 && !this._aiActing) {
            return false;
        }
        if (!place(this._data, x, y, this._turn)) {
            return false;
        }
        this._steps.push({ x, y, v: this._turn });
        this._addPiece(x, y, this._turn);

        const line = checkWin(this._data, x, y, this._turn, BOARD.winLen);
        if (line.length > 0) {
            this._drawLine(line);
            this._finish(this._turn);
            return true;
        }
        if (isFull(this._data)) {
            this._finish(0);
            return true;
        }
        this._turn = opponent(this._turn);
        this._updateTurn();
        if (this._ai && !this._over && this._turn === 2) {
            this.scheduleOnce(() => this.aiMove(), 0.35);
        }
        return true;
    }

    undo(): void {
        if (this._over || this._steps.length === 0) {
            return;
        }
        this._undoOnce();
        // 人机模式一次退两手，直接回到玩家自己落子之前
        if (this._ai && this._steps.length > 0) {
            this._undoOnce();
        }
    }

    private _undoOnce(): void {
        const s = this._steps.pop();
        if (!s) {
            return;
        }
        this._data[s.y][s.x] = 0;
        const n = this._pieceNodes.pop();
        if (n) {
            n.destroy();
        }
        this._turn = s.v;
        this._markLast();
        this._updateTurn();
    }

    restart(): void {
        this._data = createBoard(BOARD.n);
        this._steps = [];
        for (let i = 0; i < this._pieceNodes.length; i++) {
            this._pieceNodes[i].destroy();
        }
        this._pieceNodes = [];
        // 人机模式下玩家永远执黑先手
        this._turn = this._ai ? 1 : this._first;
        this._over = false;
        const g = this._lineLayer!.getComponent(Graphics);
        if (g) {
            g.clear();
        }
        this._hud!.hideResult();
        this._updateTurn();
    }

    private _onTouchEnd(e: EventTouch): void {
        this._touchHits++;
        if (this._over || this._reviewing || !this._board) {
            return;
        }
        const t = this._boardLayer!.getComponent(UITransform);
        if (!t || !this._camera) {
            return;
        }
        // 屏幕坐标 → 世界坐标 → 棋盘局部坐标。
        // 注意别用 getUILocation()：它返回的是左下原点坐标，与 convertToNodeSpaceAR 要的世界坐标差半个可见区域
        const p = e.getLocation();
        const world = this._camera.screenToWorld(new Vec3(p.x, p.y, 0));
        const local = t.convertToNodeSpaceAR(world);
        const hit = this._board.hit(local.x, local.y);
        this._lastTouch.ux = p.x;
        this._lastTouch.uy = p.y;
        this._lastTouch.lx = local.x;
        this._lastTouch.ly = local.y;
        this._lastTouch.ok = !!hit;
        if (hit) {
            this._lastTouch.hx = hit.x;
            this._lastTouch.hy = hit.y;
        }
        if (!hit) {
            return;
        }
        this.play(hit.x, hit.y);
    }

    private _addPiece(x: number, y: number, v: Cell): void {
        const n = new Node('piece');
        n.addComponent(UITransform).setContentSize(this._radius * 2, this._radius * 2);
        n.setPosition(this._board!.px(x), this._board!.py(y), 0);
        this._pieceLayer!.addChild(n);
        const p = n.addComponent(Piece);
        p.setup(v, this._radius);
        this._pieceNodes.push(n);
        this._markLast();
    }

    private _markLast(): void {
        for (let i = 0; i < this._pieceNodes.length; i++) {
            const p = this._pieceNodes[i].getComponent(Piece);
            if (p) {
                p.setLast(i === this._pieceNodes.length - 1);
            }
        }
    }

    private _updateTurn(): void {
        this._hud!.setTurn(this._turn, this._turn === 1 ? PLAYERS[0].name : this._opponentName);
        this._hud!.setUndoEnabled(this._steps.length > 0 && !this._over);
    }

    private _finish(winner: Cell): void {
        this._over = true;
        if (winner === 1) {
            this._scores[0]++;
        } else if (winner === 2) {
            this._scores[1]++;
        }
        this._saveScores();

        // 下一局换成上一局的后手，情侣对局保持公平
        this._first = opponent(this._first);

        this._hud!.setScore(this._scores[0], this._scores[1]);
        this._hud!.setUndoEnabled(false);
        const who = winner === 1 ? PLAYERS[0].name : this._opponentName;
        this._hud!.setOver(winner === 0 ? '平局' : who + ' 获胜');

        this._hud!.setReviewVisible(this._steps.length > 0);

        const title = winner === 0 ? '平局' : who + ' 赢了';
        const sub = winner === 0 ? '棋盘下满了' : '比分 ' + this._scores[0] + ' : ' + this._scores[1];
        this.scheduleOnce(() => {
            this._hud!.showResult(title, sub);
        }, 0.45);
    }

    /** AI 应手 */
    aiMove(): void {
        if (this._over || !this._ai || this._turn !== 2) {
            return;
        }
        const mv = bestMove(this._data, 2, BOARD.n, this._aiLevel);
        if (!mv) {
            return;
        }
        this._aiActing = true;
        this.play(mv.x, mv.y);
        this._aiActing = false;
    }

    /** 对手三档循环：真人 → 电脑简单 → 电脑困难 */
    private _cycleOpponent(): void {
        this._aiLevel = (this._aiLevel + 1) % 3;
        this._hud!.setOpponentText(OPPONENT_TEXT[this._aiLevel]);
        this._hud!.setPlayerName(1, this._aiLevel > 0 ? AI_NAME : PLAYERS[1].name);
        // 换对手就换一套战绩，不要把人机和人人的比分混在一起
        this._scores = [0, 0];
        this._saveScores();
        this._hud!.setScore(0, 0);
        this.restart();
    }

    /** 按落子顺序重现本局 */
    startReview(): void {
        if (this._steps.length === 0) {
            return;
        }
        this._reviewSteps = this._steps.map((s) => ({ x: s.x, y: s.y, v: s.v }));
        this._reviewIdx = 0;
        this._hud!.hideResult();
        this.restart();
        this._reviewing = true;
        this._hud!.setUndoEnabled(false);
        this._hud!.setOver('回放中');
        this.schedule(this._reviewTick, 0.45);
    }

    private _reviewTick(): void {
        if (!this._reviewing) {
            return;
        }
        if (this._reviewIdx >= this._reviewSteps.length) {
            this.unschedule(this._reviewTick);
            this._reviewing = false;
            this._hud!.setOver('回放结束');
            this._hud!.showResult('本局回放结束', '再来一局？');
            return;
        }
        const s = this._reviewSteps[this._reviewIdx++];
        this._addPiece(s.x, s.y, s.v);
    }

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
        let winner = 0;
        const a = this._scores[0];
        const b = this._scores[1];
        if (a !== b) {
            winner = a > b ? 1 : 2;
        }
        const mode = this._aiLevel > 0 ? '人机' : '双人';
        return makeResult('gobang', '五子棋', winner,
            [PLAYERS[0].name, this._opponentName], [a, b],
            mode + ' · 本局 ' + this._steps.length + ' 手');
    }

    private _drawLine(line: Array<[number, number]>): void {
        const g = this._lineLayer!.getComponent(Graphics);
        if (!g || line.length < 2) {
            return;
        }
        const a = line[0];
        const b = line[line.length - 1];
        g.clear();
        g.lineWidth = 5;
        g.strokeColor = COLOR.accent;
        g.moveTo(this._board!.px(a[0]), this._board!.py(a[1]));
        g.lineTo(this._board!.px(b[0]), this._board!.py(b[1]));
        g.stroke();
    }

    private _createLayer(name: string): Node {
        const n = new Node(name);
        n.addComponent(UITransform);
        this.node.addChild(n);
        return n;
    }

    private _loadScores(): void {
        try {
            const raw = sys.localStorage.getItem(SAVE_KEY);
            if (raw) {
                const v = JSON.parse(raw);
                if (Array.isArray(v) && v.length === 2) {
                    this._scores = [Number(v[0]) || 0, Number(v[1]) || 0];
                }
            }
        } catch (e) {
            this._scores = [0, 0];
        }
    }

    private _saveScores(): void {
        try {
            sys.localStorage.setItem(SAVE_KEY, JSON.stringify(this._scores));
        } catch (e) {
            // 存储不可用时忽略，不影响本局
        }
    }
}
