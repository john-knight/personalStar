const app = getApp();
const db = require('../../utils/db.js');
const score = require('../../utils/score.js');

const N = 3;
const CELLS = N * N;
const DURATION = 20;
/** 爱心亮多久，过了就算没点到 */
const LIT_MS = 520;

Page({
  data: {
    names: ['我', 'TA'],
    boardPx: 300,
    cellPx: 100,
    cells: [],
    active: -1,
    hitIdx: -1,
    missIdx: -1,
    turnIdx: 0,
    scores: [0, 0],
    left: DURATION,
    phase: 'ready',
    gain: 0,
    limited: false,
    winnerText: '',
    solo: false,
  },

  onLoad() {
    try {
      const w = wx.getSystemInfoSync().windowWidth;
      const board = Math.floor(w - 64);
      this.setData({ boardPx: board, cellPx: Math.floor(board / N) });
    } catch (e) {
      console.warn('[tapheart] getSystemInfo failed', e);
    }
    const cp = this.data.cellPx;
    const cells = [];
    for (let i = 0; i < CELLS; i++) {
      cells.push({ left: (i % N) * cp, top: Math.floor(i / N) * cp });
    }
    this.setData({ cells });

    const c = app.globalData.couple;
    const role = app.globalData.role;
    const me = c ? (role === 'a' ? c.aName : c.bName) : '我';
    const ta = c ? (role === 'a' ? c.bName : c.aName) : 'TA';
    this.setData({ names: [me || '我', ta || 'TA'] });
  },

  onUnload() {
    this.clearAll();
  },

  onHide() {
    this.clearAll();
  },

  begin() {
    this.setData({ phase: 'playing', left: DURATION, active: -1, hitIdx: -1, missIdx: -1 });
    this.startCountdown();
    this.scheduleHeart();
  },

  startCountdown() {
    this.clearCountdown();
    this._tick = setInterval(() => {
      const left = this.data.left - 1;
      this.setData({ left });
      if (left <= 0) {
        this.endTurn();
      }
    }, 1000);
  },

  /** 爱心随机跳，亮 LIT_MS 毫秒后熄灭 */
  scheduleHeart() {
    this.clearHeart();
    const gap = 620 + Math.random() * 420;
    this._heart = setTimeout(() => {
      if (this.data.phase !== 'playing') {
        return;
      }
      const i = Math.floor(Math.random() * CELLS);
      this.setData({ active: i });
      this._lit = setTimeout(() => {
        if (this.data.active === i) {
          this.setData({ active: -1 });
        }
      }, LIT_MS);
      this.scheduleHeart();
    }, gap);
  },

  tapCell(e) {
    if (this.data.phase !== 'playing') {
      return;
    }
    const i = Number(e.currentTarget.dataset.i);
    const hit = this.data.active === i;
    const scores = this.data.scores.slice();
    scores[this.data.turnIdx] += hit ? 1 : -1;
    if (scores[this.data.turnIdx] < 0) {
      scores[this.data.turnIdx] = 0;
    }
    this.setData({
      scores,
      active: -1,
      hitIdx: hit ? i : -1,
      missIdx: hit ? -1 : i,
    });
    wx.vibrateShort({ type: 'light' });
    setTimeout(() => this.setData({ hitIdx: -1, missIdx: -1 }), 220);
  },

  endTurn() {
    this.clearCountdown();
    this.clearHeart();
    this.setData({ active: -1 });
    // 第一人称玩完，交给 TA
    if (this.data.turnIdx === 0 && !this.data.solo) {
      this.setData({ phase: 'rest', turnIdx: 1 });
      return;
    }
    this.finish();
  },

  skipPartner() {
    this.setData({ solo: true, turnIdx: 0, scores: [0, 0] });
    this.begin();
  },

  finish() {
    const s = this.data.scores;
    let text = '平手！';
    if (this.data.solo) {
      text = `点了 ${s[0]} 个爱心`;
    } else if (s[0] > s[1]) {
      text = `${this.data.names[0]} 手更快`;
    } else if (s[1] > s[0]) {
      text = `${this.data.names[1]} 手更快`;
    }
    const gain = Math.min(40, 20 + Math.max(s[0], s[1]));
    this.setData({ phase: 'over', winnerText: text, gain });
    score.saveScore('tapheart', '点爱心', this.data.names, s, text);
    this.reward(gain);
  },

  reward(gain) {
    const c = app.globalData.couple;
    if (!c) {
      return;
    }
    db.addCoins(c._id, app.globalData.openid, gain, 'tapheart')
      .then((res) => {
        this.setData({ gain: res.gain || 0, limited: !!res.limited });
        app.refresh();
      })
      .catch((err) => {
        console.error('[tapheart] reward failed', err);
      });
  },

  again() {
    this.setData({ turnIdx: 0, scores: [0, 0], phase: 'ready', solo: false, limited: false });
  },

  goHome() {
    wx.navigateBack();
  },

  clearCountdown() {
    if (this._tick) {
      clearInterval(this._tick);
      this._tick = null;
    }
  },

  clearHeart() {
    if (this._heart) {
      clearTimeout(this._heart);
      this._heart = null;
    }
    if (this._lit) {
      clearTimeout(this._lit);
      this._lit = null;
    }
  },

  clearAll() {
    this.clearCountdown();
    this.clearHeart();
  },
});
