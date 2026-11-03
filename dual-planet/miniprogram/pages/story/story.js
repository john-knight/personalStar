const app = getApp();
const db = require('../../utils/db.js');
const score = require('../../utils/score.js');

const STORE_KEY = 'dualplanet.stories';
/** 每人写三句 */
const TOTAL = 6;

const OPENERS = [
  '那天我们第一次一起看海，',
  '如果有一天我们回到十年前，',
  '深夜十一点，你发来一句「在吗」，',
  '我们搬进了那间很小的房子，',
  '很多年以后的一个早晨，',
  '那场雨下了很久，',
  '你说想去一个没人认识我们的地方，',
  '我把那张旧照片翻出来的时候，',
];

Page({
  data: {
    names: ['我', 'TA'],
    opener: '',
    lines: [],
    draft: '',
    curWho: 0,
    phase: 'writing',
    gain: 0,
    limited: false,
    history: [],
  },

  onLoad() {
    const c = app.globalData.couple;
    const role = app.globalData.role;
    const me = c ? (role === 'a' ? c.aName : c.bName) : '我';
    const ta = c ? (role === 'a' ? c.bName : c.aName) : 'TA';
    this.setData({ names: [me || '我', ta || 'TA'] });
    this.newStory();
    this.loadHistory();
  },

  newStory() {
    const opener = OPENERS[Math.floor(Math.random() * OPENERS.length)];
    this.setData({
      opener,
      lines: [],
      draft: '',
      curWho: 0,
      phase: 'writing',
      gain: 0,
      limited: false,
    });
  },

  loadHistory() {
    try {
      const raw = wx.getStorageSync(STORE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      this.setData({ history: Array.isArray(list) ? list : [] });
    } catch (e) {
      this.setData({ history: [] });
    }
  },

  onInput(e) {
    this.setData({ draft: e.detail.value || '' });
  },

  submit() {
    const text = (this.data.draft || '').trim();
    if (!text) {
      wx.showToast({ title: '写一句再提交吧', icon: 'none' });
      return;
    }
    const lines = this.data.lines.concat([{ who: this.data.curWho, text }]);
    const curWho = lines.length % 2;
    this.setData({ lines, draft: '', curWho });
    if (lines.length >= TOTAL) {
      this.finish(lines);
    }
  },

  finish(lines) {
    const full = this.data.opener + lines.map((l) => l.text).join('');
    const now = new Date();
    const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
    const time = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const rec = {
      id: String(Date.now()),
      time,
      opener: this.data.opener,
      lines,
      preview: full.length > 40 ? `${full.slice(0, 40)}…` : full,
    };
    const list = [rec].concat(this.data.history).slice(0, 10);
    this.setData({ history: list, phase: 'done', gain: 30 });
    try {
      wx.setStorageSync(STORE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('[story] save failed', e);
    }
    wx.vibrateShort({ type: 'light' });
    score.saveScore('story', '故事接龙', [], [], `写完了 ${lines.length} 句：${rec.preview}`);
    this.reward(30);
  },

  reward(gain) {
    const c = app.globalData.couple;
    if (!c) {
      return;
    }
    db.addCoins(c._id, app.globalData.openid, gain, 'story')
      .then((res) => {
        this.setData({ gain: res.gain || 0, limited: !!res.limited });
        app.refresh();
      })
      .catch((err) => {
        console.error('[story] reward failed', err);
      });
  },

  again() {
    this.newStory();
  },

  goHome() {
    wx.navigateBack();
  },
});
