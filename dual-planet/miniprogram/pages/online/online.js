const app = getApp();
const db = require('../../utils/db.js');

const N = 15;
const POLL_MS = 2000;

Page({
  data: {
    role: 'a',
    room: null,
    code: '',
    joinCode: '',
    hint: '',
    local: false,
  },

  onLoad() {
    this.setData({
      role: app.globalData.role || 'a',
      local: app.globalData.local,
    });
    this.initCanvas();
  },

  onShow() {
    if (this.data.code) {
      this.startPoll();
    }
  },

  onHide() {
    this.stopPoll();
  },

  onUnload() {
    this.stopPoll();
  },

  // ------------------------------------------------------------ 画布

  initCanvas() {
    const q = wx.createSelectorQuery();
    q.select('#board').fields({ node: true, size: true, rect: true }).exec((res) => {
      const info = res && res[0];
      if (!info || !info.node) {
        return;
      }
      let dpr = 2;
      try {
        const wi = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        dpr = wi.pixelRatio || 2;
      } catch (e) {
        dpr = 2;
      }
      const canvas = info.node;
      canvas.width = info.width * dpr;
      canvas.height = info.width * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      this._canvas = canvas;
      this._ctx = ctx;
      this._size = info.width;
      this._rect = { left: info.left, top: info.top };
      this.draw();
    });
  },

  draw() {
    const ctx = this._ctx;
    const size = this._size;
    if (!ctx || !size) {
      return;
    }
    const gap = size / N;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#EFE0C6';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = '#C9B896';
    ctx.lineWidth = 1;
    for (let i = 0; i < N; i++) {
      const p = gap * (i + 0.5);
      ctx.beginPath();
      ctx.moveTo(gap * 0.5, p);
      ctx.lineTo(size - gap * 0.5, p);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p, gap * 0.5);
      ctx.lineTo(p, size - gap * 0.5);
      ctx.stroke();
    }

    const stars = [3, 7, 11];
    ctx.fillStyle = '#8C7A5C';
    for (let i = 0; i < stars.length; i++) {
      for (let j = 0; j < stars.length; j++) {
        ctx.beginPath();
        ctx.arc(gap * (stars[i] + 0.5), gap * (stars[j] + 0.5), 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const moves = (this.data.room && this.data.room.moves) || [];
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const cx = gap * (m.x + 0.5);
      const cy = gap * (m.y + 0.5);
      const r = gap * 0.4;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = m.who === 'a' ? '#2A2E33' : '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = m.who === 'a' ? '#111111' : '#C9CDD2';
      ctx.stroke();
      if (i === moves.length - 1) {
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.34, 0, Math.PI * 2);
        ctx.fillStyle = '#F0658A';
        ctx.fill();
      }
    }
  },

  // ------------------------------------------------------------ 房间

  onCode(e) {
    this.setData({ joinCode: (e.detail.value || '').toUpperCase() });
  },

  create() {
    const couple = app.globalData.couple;
    if (!couple) {
      return;
    }
    if (this.data.local) {
      wx.showToast({ title: '联机要联网才能用', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '开房间' });
    db.roomCreate(couple._id)
      .then((res) => {
        wx.hideLoading();
        this.apply(res.room);
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: err.message || '开不了', icon: 'none' });
      });
  },

  join() {
    const couple = app.globalData.couple;
    const code = (this.data.joinCode || '').trim();
    if (!couple) {
      return;
    }
    if (code.length < 4) {
      wx.showToast({ title: '房间码不对', icon: 'none' });
      return;
    }
    if (this.data.local) {
      wx.showToast({ title: '联机要联网才能用', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '进房间' });
    db.roomJoin(couple._id, code)
      .then((res) => {
        wx.hideLoading();
        this.apply(res.room);
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: err.message || '进不去', icon: 'none' });
      });
  },

  apply(room) {
    const old = this.data.room;
    this.setData({
      room,
      code: room.code,
      hint: this.hintOf(room),
    });
    if (!old || old.count !== room.count || old.status !== room.status) {
      this.draw();
    }
    if (room.status === 'over' && (!old || old.status !== 'over')) {
      wx.vibrateShort({ type: 'heavy' });
    }
  },

  hintOf(room) {
    if (room.status === 'waiting') {
      return '等 TA 进来';
    }
    if (room.status === 'over') {
      if (room.winner === 'draw') {
        return '平局';
      }
      return room.winner === this.data.role ? '你赢了' : 'TA 赢了';
    }
    return room.turn === this.data.role ? '轮到你了' : '等 TA 落子';
  },

  startPoll() {
    if (this._timer) {
      return;
    }
    this._timer = setInterval(() => this.poll(), POLL_MS);
  },

  stopPoll() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  poll() {
    const couple = app.globalData.couple;
    const code = this.data.code;
    if (!couple || !code || this._polling) {
      return;
    }
    this._polling = true;
    db.roomState(couple._id, code)
      .then((res) => {
        this._polling = false;
        this.apply(res.room);
      })
      .catch(() => {
        this._polling = false;
      });
  },

  // ------------------------------------------------------------ 落子

  tap(e) {
    const room = this.data.room;
    if (!room || room.status !== 'playing') {
      return;
    }
    if (room.turn !== this.data.role) {
      wx.showToast({ title: '等 TA 落子', icon: 'none' });
      return;
    }
    const gap = this._size / N;
    const left = this._rect ? this._rect.left : 0;
    const top = this._rect ? this._rect.top : 0;
    const x = Math.floor((e.detail.x - left) / gap);
    const y = Math.floor((e.detail.y - top) / gap);
    if (x < 0 || y < 0 || x >= N || y >= N) {
      return;
    }
    this.play(x, y);
  },

  play(x, y) {
    const couple = app.globalData.couple;
    const room = this.data.room;
    if (!couple || !room) {
      return;
    }
    db.roomMove(couple._id, room.code, x, y)
      .then((res) => this.apply(res.room))
      .catch((err) => {
        wx.showToast({ title: err.message || '下不了', icon: 'none' });
      });
  },

  copyCode() {
    if (!this.data.code) {
      return;
    }
    wx.setClipboardData({
      data: this.data.code,
      success: () => wx.showToast({ title: '房间码已复制' }),
    });
  },
});
