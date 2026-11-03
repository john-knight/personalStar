const app = getApp();
const db = require('../../utils/db.js');
const score = require('../../utils/score.js');
const words = require('../../data/words.js');

const ROUNDS = 6;
const DRAW_SECONDS = 60;

Page({
  data: {
    names: ['我', 'TA'],
    padPx: 300,
    total: ROUNDS,
    round: 0,
    phase: 'ready',
    drawerName: '我',
    guesserName: 'TA',
    choices: [],
    pickIdx: -1,
    word: null,
    left: DRAW_SECONDS,
    cands: [],
    guessTitle: '',
    roundOk: false,
    score: [0, 0],
    overText: '',
    gain: 0,
    limited: false,
  },

  onLoad() {
    try {
      const w = wx.getSystemInfoSync().windowWidth;
      this.setData({ padPx: Math.floor(w - 64) });
    } catch (e) {
      console.warn('[drawguess] getSystemInfo failed', e);
    }
    const c = app.globalData.couple;
    const role = app.globalData.role;
    const me = c ? (role === 'a' ? c.aName : c.bName) : '我';
    const ta = c ? (role === 'a' ? c.bName : c.aName) : 'TA';
    this._names = [me || '我', ta || 'TA'];
    this.setData({ names: this._names });
    this._used = [];
    this.newRound();
  },

  onUnload() {
    this.stopTimer();
  },

  onHide() {
    this.stopTimer();
  },

  newRound() {
    const drawer = this.data.round % 2;
    const guesser = 1 - drawer;
    const choices = words.pickDrawChoices(3, this._used);
    this.setData({
      phase: 'ready',
      drawerName: this._names[drawer],
      guesserName: this._names[guesser],
      choices,
      pickIdx: -1,
      word: null,
      cands: [],
      left: DRAW_SECONDS,
    });
    this._drawer = drawer;
    this._guesser = guesser;
  },

  pickWord(e) {
    const i = Number(e.currentTarget.dataset.i);
    this.setData({ pickIdx: i });
  },

  startDraw() {
    if (this.data.pickIdx < 0) {
      wx.showToast({ title: '先选一个词', icon: 'none' });
      return;
    }
    const word = this.data.choices[this.data.pickIdx];
    this._used.push(word.text);
    this.setData({ word, phase: 'drawing', left: DRAW_SECONDS }, () => {
      this.initPad();
      this.startTimer();
    });
  },

  initPad() {
    const q = wx.createSelectorQuery().in(this);
    q.select('#pad').fields({ node: true, size: true }).exec((res) => {
      const info = res && res[0];
      if (!info || !info.node) {
        console.warn('[drawguess] canvas 没拿到');
        return;
      }
      const canvas = info.node;
      const ctx = canvas.getContext('2d');
      let dpr = 2;
      try {
        dpr = wx.getSystemInfoSync().pixelRatio || 2;
      } catch (e) {
        console.warn('[drawguess] dpr fallback', e);
      }
      canvas.width = info.width * dpr;
      canvas.height = info.height * dpr;
      ctx.scale(dpr, dpr);
      this._canvas = canvas;
      this._ctx = ctx;
      this.clearPad();
    });
  },

  clearPad() {
    const ctx = this._ctx;
    if (!ctx) {
      return;
    }
    const size = this.data.padPx;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#1F2329';
  },

  touchStart(e) {
    const ctx = this._ctx;
    const t = e.touches && e.touches[0];
    if (!ctx || !t) {
      return;
    }
    ctx.beginPath();
    ctx.moveTo(t.x, t.y);
  },

  touchMove(e) {
    const ctx = this._ctx;
    const t = e.touches && e.touches[0];
    if (!ctx || !t) {
      return;
    }
    ctx.lineTo(t.x, t.y);
    ctx.stroke();
    // 每次重新起一段，避免整条路径被反复重绘
    ctx.beginPath();
    ctx.moveTo(t.x, t.y);
  },

  touchEnd() {
    const ctx = this._ctx;
    if (ctx) {
      ctx.beginPath();
    }
  },

  startTimer() {
    this.stopTimer();
    this._tick = setInterval(() => {
      const left = this.data.left - 1;
      this.setData({ left });
      if (left <= 0) {
        this.stopTimer();
        this.finishDraw();
      }
    }, 1000);
  },

  stopTimer() {
    if (this._tick) {
      clearInterval(this._tick);
      this._tick = null;
    }
  },

  finishDraw() {
    this.stopTimer();
    const cands = words.pickCandidates(this.data.word, 6);
    this._guessCount = 0;
    this.setData({
      phase: 'guess',
      cands,
      guessTitle: `${this.data.guesserName} 来猜？`,
    });
  },

  guessWord(e) {
    const t = e.currentTarget.dataset.t;
    const ok = t === (this.data.word ? this.data.word.text : '');
    this._guessCount++;
    // 第一次猜错只去掉这个选项再给一次机会
    if (!ok && this._guessCount < 2 && this.data.cands.length > 2) {
      const cands = this.data.cands.filter((x) => x !== t);
      this.setData({
        cands,
        guessTitle: `${this.data.guesserName} 再想想？`,
      });
      wx.vibrateShort({ type: 'light' });
      return;
    }
    const score = this.data.score.slice();
    if (ok) {
      score[this._guesser] += 1;
      wx.vibrateShort({ type: 'light' });
    }
    this.setData({ score, roundOk: ok, phase: 'roundResult' });
  },

  nextRound() {
    const round = this.data.round + 1;
    if (round >= ROUNDS) {
      this.finish();
      return;
    }
    this.setData({ round });
    this.newRound();
  },

  finish() {
    const s = this.data.score;
    let text = '打平了！';
    if (s[0] > s[1]) {
      text = `${this._names[0]} 猜得更准`;
    } else if (s[1] > s[0]) {
      text = `${this._names[1]} 猜得更准`;
    }
    const gain = Math.min(40, 20 + (s[0] + s[1]) * 3);
    this.setData({ phase: 'over', overText: text, gain });
    score.saveScore('drawguess', '你画我猜', this._names, s,
      `第 ${ROUNDS} / ${ROUNDS} 回合 · 猜对 ${s[0] + s[1]} 次`);
    this.reward(gain);
  },

  reward(gain) {
    const c = app.globalData.couple;
    if (!c) {
      return;
    }
    db.addCoins(c._id, app.globalData.openid, gain, 'drawguess')
      .then((res) => {
        this.setData({ gain: res.gain || 0, limited: !!res.limited });
        app.refresh();
      })
      .catch((err) => {
        console.error('[drawguess] reward failed', err);
      });
  },

  restart() {
    this._used = [];
    this.setData({ round: 0, score: [0, 0], limited: false });
    this.newRound();
  },

  goHome() {
    wx.navigateBack();
  },
});
