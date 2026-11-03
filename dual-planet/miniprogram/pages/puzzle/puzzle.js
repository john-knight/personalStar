const app = getApp();
const db = require('../../utils/db.js');
const score = require('../../utils/score.js');

const N = 3;
const CELLS = N * N;

Page({
  data: {
    img: '',
    boardPx: 300,
    cellPx: 100,
    tiles: [],
    posList: [],
    sel: -1,
    moves: 0,
    seconds: 0,
    timeText: '00:00',
    done: false,
    gain: 0,
    limited: false,
    peeking: false,
  },

  onLoad() {
    try {
      const w = wx.getSystemInfoSync().windowWidth;
      const board = Math.floor(w - 32);
      this.setData({ boardPx: board, cellPx: Math.floor(board / N) });
    } catch (e) {
      console.warn('[puzzle] getSystemInfo failed', e);
    }
    this._tiles = [];
  },

  onUnload() {
    this.stopTimer();
  },

  onHide() {
    this.stopTimer();
  },

  pickImage() {
    const use = (path) => {
      if (!path) {
        return;
      }
      this.setData({ img: path });
      this.reset();
    };
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sizeType: ['compressed'],
        success: (res) => {
          const f = res.tempFiles && res.tempFiles[0];
          use(f ? f.tempFilePath : '');
        },
      });
      return;
    }
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      success: (res) => {
        const p = res.tempFilePaths && res.tempFilePaths[0];
        use(p || '');
      },
    });
  },

  reset() {
    this.stopTimer();
    this.setData({
      moves: 0, seconds: 0, timeText: '00:00', done: false,
      sel: -1, gain: 0, limited: false, peeking: false,
    });
    this.shuffle();
  },

  /** 打乱：只做交换，所以一定能拼回去 */
  shuffle() {
    const t = [];
    for (let i = 0; i < CELLS; i++) {
      t.push(i);
    }
    for (let k = 0; k < 60; k++) {
      const a = Math.floor(Math.random() * CELLS);
      const b = Math.floor(Math.random() * CELLS);
      const tmp = t[a];
      t[a] = t[b];
      t[b] = tmp;
    }
    let same = true;
    for (let i = 0; i < CELLS; i++) {
      if (t[i] !== i) {
        same = false;
        break;
      }
    }
    if (same) {
      const tmp = t[0];
      t[0] = t[1];
      t[1] = tmp;
    }
    this._tiles = t;
    this.setData({ sel: -1, moves: 0, done: false, seconds: 0, timeText: '00:00' });
    this.sync();
    this.startTimer();
  },

  sync() {
    const cp = this.data.cellPx;
    const posList = [];
    // WXML 里不支持位运算，格子坐标在 JS 里算好
    const cellStyles = [];
    for (let i = 0; i < this._tiles.length; i++) {
      const v = this._tiles[i];
      posList.push(`-${(v % N) * cp}px -${Math.floor(v / N) * cp}px`);
      cellStyles.push({ left: (i % N) * cp, top: Math.floor(i / N) * cp });
    }
    this.setData({ tiles: this._tiles.slice(), posList, cellStyles });
  },

  tapCell(e) {
    if (this.data.done) {
      return;
    }
    const i = Number(e.currentTarget.dataset.i);
    const sel = this.data.sel;
    if (sel < 0) {
      this.setData({ sel: i });
      return;
    }
    if (sel === i) {
      this.setData({ sel: -1 });
      return;
    }
    const t = this._tiles.slice();
    const tmp = t[sel];
    t[sel] = t[i];
    t[i] = tmp;
    this._tiles = t;
    this.setData({ sel: -1, moves: this.data.moves + 1 });
    this.sync();
    this.check();
  },

  check() {
    for (let i = 0; i < CELLS; i++) {
      if (this._tiles[i] !== i) {
        return;
      }
    }
    this.stopTimer();
    // 越快越省步，币越多
    let gain = 40 - Math.floor(this.data.seconds / 4) - Math.max(0, this.data.moves - 15);
    gain = Math.max(8, Math.min(40, gain));
    this.setData({ done: true, gain });
    score.saveScore('puzzle', '合照拼图', [], [],
      `用时 ${this.data.seconds} 秒 · ${this.data.moves} 步`);
    wx.vibrateShort({ type: 'light' });
    this.reward(gain);
  },

  reward(gain) {
    const c = app.globalData.couple;
    if (!c) {
      return;
    }
    db.addCoins(c._id, app.globalData.openid, gain, 'puzzle')
      .then((res) => {
        this.setData({ gain: res.gain || 0, limited: !!res.limited });
        if (res.limited) {
          wx.showToast({ title: '今天的奖励次数用完啦', icon: 'none' });
        }
        app.refresh();
      })
      .catch((err) => {
        console.error('[puzzle] reward failed', err);
        wx.showToast({ title: '奖励没发出来', icon: 'none' });
      });
  },

  peekOn() {
    if (this.data.img && !this.data.done) {
      this.setData({ peeking: true });
    }
  },

  peekOff() {
    this.setData({ peeking: false });
  },

  startTimer() {
    this.stopTimer();
    this._timer = setInterval(() => {
      const s = this.data.seconds + 1;
      const mm = Math.floor(s / 60);
      const ss = s % 60;
      const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
      this.setData({ seconds: s, timeText: `${pad(mm)}:${pad(ss)}` });
    }, 1000);
  },

  stopTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  goHome() {
    wx.navigateBack();
  },
});
