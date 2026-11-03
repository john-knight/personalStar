const app = getApp();
const db = require('../../utils/db.js');
const score = require('../../utils/score.js');
const ai = require('../../utils/gobang-ai.js');

const N = 15;
const MODES = ['对手：TA', '电脑·简单', '电脑·困难'];

function newBoard() {
  const b = [];
  for (let y = 0; y < N; y++) {
    const row = [];
    for (let x = 0; x < N; x++) {
      row.push(0);
    }
    b.push(row);
  }
  return b;
}

/** 四个方向连五 */
function winAt(b, x, y, v) {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let d = 0; d < dirs.length; d++) {
    let cnt = 1;
    for (let s = 1; s >= -1; s -= 2) {
      let cx = x + dirs[d][0] * s;
      let cy = y + dirs[d][1] * s;
      while (cx >= 0 && cx < N && cy >= 0 && cy < N && b[cy][cx] === v) {
        cnt++;
        cx += dirs[d][0] * s;
        cy += dirs[d][1] * s;
      }
    }
    if (cnt >= 5) {
      return true;
    }
  }
  return false;
}

Page({
  data: {
    boardPx: 300,
    mode: 0,
    modeText: MODES[0],
    names: ['我', 'TA'],
    turnName: '我',
    scores: [0, 0],
    steps: 0,
    over: false,
    overText: '',
    gain: 0,
    limited: false,
    thinking: false,
  },

  onLoad() {
    try {
      const w = wx.getSystemInfoSync().windowWidth;
      // 留出内边距，取 15 的整数倍好看一点
      const raw = Math.floor(w - 64);
      this.setData({ boardPx: raw - (raw % N) });
    } catch (e) {
      console.warn('[gobang] getSystemInfo failed', e);
    }
    const c = app.globalData.couple;
    const role = app.globalData.role;
    const me = c ? (role === 'a' ? c.aName : c.bName) : '我';
    const ta = c ? (role === 'a' ? c.bName : c.aName) : 'TA';
    this._names = [me || '我', ta || 'TA'];
    this.setData({ names: this._names });
    this._data = newBoard();
    this._steps = [];
    this._turn = 1;
    this._last = null;
    this._thinking = false;
    this.setData({ turnName: this.nameOf(1) });
  },

  onReady() {
    this.initCanvas();
  },

  onUnload() {
    if (this._aiTimer) {
      clearTimeout(this._aiTimer);
    }
  },

  onHide() {
    if (this._aiTimer) {
      clearTimeout(this._aiTimer);
    }
  },

  initCanvas() {
    const q = wx.createSelectorQuery().in(this);
    q.select('#board').fields({ node: true, size: true }).exec((res) => {
      const info = res && res[0];
      if (!info || !info.node) {
        console.warn('[gobang] canvas 没拿到');
        return;
      }
      const canvas = info.node;
      const ctx = canvas.getContext('2d');
      let dpr = 2;
      try {
        dpr = wx.getSystemInfoSync().pixelRatio || 2;
      } catch (e) {
        console.warn('[gobang] dpr fallback', e);
      }
      canvas.width = info.width * dpr;
      canvas.height = info.height * dpr;
      ctx.scale(dpr, dpr);
      this._canvas = canvas;
      this._ctx = ctx;
      this._cell = info.width / N;
      this._pad = this._cell / 2;
      this.draw();
    });
  },

  nameOf(v) {
    if (this.data.mode > 0 && v === 2) {
      return '电脑';
    }
    return this._names[v - 1] || (v === 1 ? '我' : 'TA');
  },

  onTouch(e) {
    const t = e.touches && e.touches[0];
    if (!t || !this._cell) {
      return;
    }
    const gx = Math.round((t.x - this._pad) / this._cell);
    const gy = Math.round((t.y - this._pad) / this._cell);
    this.play(gx, gy);
  },

  play(x, y) {
    if (this.data.over || this._thinking) {
      return;
    }
    if (x < 0 || x >= N || y < 0 || y >= N) {
      return;
    }
    if (this._data[y][x] !== 0) {
      return;
    }
    // 人机模式下轮到电脑时，点了也不算
    if (this.data.mode > 0 && this._turn === 2 && !this._force) {
      return;
    }
    const v = this._turn;
    this._data[y][x] = v;
    this._steps.push({ x, y, v });
    this._last = { x, y };
    this.draw();
    if (winAt(this._data, x, y, v)) {
      this.finish(v);
      return;
    }
    if (this._steps.length >= N * N) {
      this.finish(0);
      return;
    }
    this._turn = v === 1 ? 2 : 1;
    this.setData({ turnName: this.nameOf(this._turn), steps: this._steps.length });
    if (this.data.mode > 0 && this._turn === 2) {
      this.setData({ thinking: true });
      this._thinking = true;
      this._aiTimer = setTimeout(() => {
        this._thinking = false;
        this.setData({ thinking: false });
        this.aiMove();
      }, 380);
    }
  },

  aiMove() {
    if (this.data.over || this.data.mode === 0 || this._turn !== 2) {
      return;
    }
    const mv = ai.bestMove(this._data, 2, N, this.data.mode);
    if (!mv) {
      return;
    }
    this._force = true;
    this.play(mv.x, mv.y);
    this._force = false;
  },

  finish(winner) {
    const scores = this.data.scores.slice();
    let text = '平局';
    if (winner === 0) {
      text = '棋盘下满了，平局';
    } else {
      scores[winner - 1] += 1;
      text = `${this.nameOf(winner)} 获胜`;
    }
    this.setData({ over: true, overText: text, scores });
    score.saveScore('gobang', '五子棋', this._names, scores,
      `${this.data.mode > 0 ? '人机' : '双人'} · 本局 ${this._steps.length} 手`);
    wx.vibrateShort({ type: 'light' });
    // 人机输了少给点，别让人觉得白玩
    const gain = this.data.mode > 0 && winner === 2 ? 18 : 30;
    this.setData({ gain });
    this.reward(gain);
  },

  reward(gain) {
    const c = app.globalData.couple;
    if (!c) {
      return;
    }
    db.addCoins(c._id, app.globalData.openid, gain, 'gobang')
      .then((res) => {
        this.setData({ gain: res.gain || 0, limited: !!res.limited });
        app.refresh();
      })
      .catch((err) => {
        console.error('[gobang] reward failed', err);
      });
  },

  undo() {
    if (this._thinking) {
      return;
    }
    this._undoOnce();
    // 人机模式一次退两手，回到玩家自己落子之前
    if (this.data.mode > 0 && this._steps.length > 0) {
      this._undoOnce();
    }
    this.setData({ over: false, steps: this._steps.length, turnName: this.nameOf(this._turn) });
    this.draw();
  },

  _undoOnce() {
    const s = this._steps.pop();
    if (!s) {
      return;
    }
    this._data[s.y][s.x] = 0;
    this._turn = s.v;
    this._last = this._steps.length > 0 ? this._steps[this._steps.length - 1] : null;
  },

  cycleMode() {
    const mode = (this.data.mode + 1) % 3;
    this.setData({ mode, modeText: MODES[mode] });
    this.restart();
  },

  restart() {
    this._data = newBoard();
    this._steps = [];
    this._turn = 1;
    this._last = null;
    this._thinking = false;
    if (this._aiTimer) {
      clearTimeout(this._aiTimer);
    }
    this.setData({
      over: false, overText: '', steps: 0, thinking: false, limited: false,
      turnName: this.nameOf(1),
    });
    this.draw();
  },

  goHome() {
    wx.navigateBack();
  },

  draw() {
    const ctx = this._ctx;
    if (!ctx) {
      return;
    }
    const cell = this._cell;
    const pad = this._pad;
    const size = cell * N;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#F6DFB8';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = '#D6B087';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      ctx.moveTo(pad, pad + i * cell);
      ctx.lineTo(pad + (N - 1) * cell, pad + i * cell);
      ctx.moveTo(pad + i * cell, pad);
      ctx.lineTo(pad + i * cell, pad + (N - 1) * cell);
    }
    ctx.stroke();

    ctx.fillStyle = '#C9A47A';
    const stars = [[3, 3], [11, 3], [3, 11], [11, 11], [7, 7]];
    for (let i = 0; i < stars.length; i++) {
      ctx.beginPath();
      ctx.arc(pad + stars[i][0] * cell, pad + stars[i][1] * cell, Math.max(2, cell * 0.09), 0, Math.PI * 2);
      ctx.fill();
    }

    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const v = this._data[y][x];
        if (!v) {
          continue;
        }
        const cx = pad + x * cell;
        const cy = pad + y * cell;
        ctx.beginPath();
        ctx.arc(cx, cy, cell * 0.45, 0, Math.PI * 2);
        const g = ctx.createRadialGradient(cx - cell * 0.16, cy - cell * 0.16, cell * 0.08, cx, cy, cell * 0.5);
        if (v === 1) {
          g.addColorStop(0, '#6B7075');
          g.addColorStop(1, '#1F2329');
        } else {
          g.addColorStop(0, '#FFFFFF');
          g.addColorStop(1, '#D5D9DE');
        }
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = v === 1 ? '#1F2329' : '#B9BEC4';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    if (this._last) {
      ctx.strokeStyle = '#F0658A';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pad + this._last.x * cell, pad + this._last.y * cell, cell * 0.22, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
});
