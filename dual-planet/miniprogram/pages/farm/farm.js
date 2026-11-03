const app = getApp();
const db = require('../../utils/db.js');
const crops = require('../../data/crops.js');
const words = require('../../data/lovewords.js');

/** 各格子解锁所需等级 */
const PLOT_LEVEL = [0, 0, 0, 0, 3, 5];

/**
 * 多久去云端看一眼对方有没有动静。
 * 文档 4.1 说「实时先用云数据库 watch / 轮询，不急于上 WebSocket」，
 * 这里先用轮询：两边都好使（云环境和本地模拟），实现也轻。
 */
const SYNC_MS = 6000;

Page({
  data: {
    farm: null,
    plots: [],
    ripeCount: 0,
    seeds: [],
    showSeed: false,
    seedSlot: -1,
    expPercent: 0,
    local: false,
    flyers: [],
    popIndex: -1,
    shakeIndex: -1,
    guardList: [],
    lastSteal: null,
    lovewords: 0,
    tree: null,
    notes: [],
    noteText: '',
  },

  onLoad() {
    this._remains = [];
    this._flyTimers = [];
    this.setData({ local: app.globalData.local });
    this.load();
  },

  onShow() {
    if (this.data.farm) {
      this.load();
    }
    this.startSync();
  },

  onHide() {
    this.stopTimer();
    this.stopSync();
    if (this._flyTimers) {
      this.clearFly();
    }
  },

  onUnload() {
    this.stopTimer();
    this.stopSync();
    if (this._flyTimers) {
      this.clearFly();
    }
  },

  load() {
    const couple = app.globalData.couple;
    if (!couple) {
      return;
    }
    return Promise.all([
      db.getFarm(couple._id, app.globalData.openid),
      db.planetOverview(couple._id, app.globalData.openid).catch(() => null),
    ])
      .then((res) => {
        this.applyFarm(res[0]);
        this.startTimer();
        if (res[1]) {
          this.applyPlanet(res[1]);
        }
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  /** 树和纸条跟菜地一起刷 */
  applyPlanet(ov) {
    this.setData({
      tree: ov.tree || null,
      notes: this.buildNotes(ov.notes),
    });
  },

  buildNotes(n) {
    const list = (n && n.list) || [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const x = list[i];
      out.push({
        id: x.id,
        mine: x.mine,
        open: x.open,
        text: x.text,
        fromText: x.fromText,
        read: x.read,
        leftText: x.open ? '' : `还有 ${Math.max(1, Math.ceil(x.leftMs / 60000))} 分钟发芽`,
      });
    }
    return out;
  },

  /** 浇水：每人每天一次，两个人都浇了树才长一级 */
  waterTree() {
    const couple = app.globalData.couple;
    if (!couple) {
      return;
    }
    db.waterTree(couple._id, app.globalData.openid)
      .then((res) => {
        this.setData({ tree: res.tree });
        if (res.leveled) {
          this.fly(`树长到第 ${res.tree.level} 级 +${res.bonus} 币`, 'gain', 0);
          wx.vibrateShort({ type: 'medium' });
          this.load();
        } else {
          this.fly('浇好了，等 TA 也来一次', 'exp', 0);
        }
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '浇不了', icon: 'none' });
      });
  },

  onNoteInput(e) {
    this.setData({ noteText: e.detail.value });
  },

  /** 埋一颗惊喜种子 */
  leaveNote() {
    const couple = app.globalData.couple;
    const text = (this.data.noteText || '').trim();
    if (!couple) {
      return;
    }
    if (!text) {
      wx.showToast({ title: '写点什么再埋', icon: 'none' });
      return;
    }
    db.leaveNote(couple._id, app.globalData.openid, text)
      .then((res) => {
        this.setData({ noteText: '', notes: this.buildNotes(res.notes) });
        this.fly('埋好了，半小时后发芽', 'gain', 0);
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '埋不下', icon: 'none' });
      });
  },

  readNote(e) {
    const couple = app.globalData.couple;
    const id = e.currentTarget.dataset.id;
    if (!couple || !id) {
      return;
    }
    db.readNote(couple._id, app.globalData.openid, id)
      .then((res) => {
        this.setData({ notes: this.buildNotes(res.notes) });
      })
      .catch(() => {});
  },

  /** 把拉到的星球状态铺到页面上，load 和定时同步都走这里 */
  applyFarm(farm) {
    this.setData({
      farm,
      seeds: this.buildSeeds(farm.level),
      expPercent: expPercent(farm.exp),
      guardList: this.buildGuards(farm.guards),
      lastSteal: this.buildLastSteal(farm),
      lovewords: (farm.perks && farm.perks.lovewords) || 0,
    });
    this._remains = farm.plots.map((p) => (p ? p.remain : 0));
    this.render();
  },

  startSync() {
    if (this._syncTimer) {
      return;
    }
    this._syncTimer = setInterval(() => this.sync(), SYNC_MS);
  },

  stopSync() {
    if (this._syncTimer) {
      clearInterval(this._syncTimer);
      this._syncTimer = null;
    }
    this._syncing = false;
  },

  /**
   * 后台看一眼对方有没有动静。
   * 只有「别人动过」才提示，自己刚做的操作已经在 load 里更新过基线了。
   */
  sync() {
    const couple = app.globalData.couple;
    if (!couple || !this.data.farm || this._syncing) {
      return;
    }
    this._syncing = true;
    db.getFarm(couple._id, app.globalData.openid)
      .then((farm) => {
        this._syncing = false;
        const msgs = this.diffFarm(this.data.farm, farm);
        if (!msgs.length) {
          return;
        }
        this.applyFarm(farm);
        for (let i = 0; i < msgs.length; i++) {
          this.fly(msgs[i].text, msgs[i].type, i * 320);
        }
        wx.vibrateShort({ type: 'light' });
      })
      .catch(() => {
        this._syncing = false;
      });
  },

  /**
   * 对比两次星球状态，只挑出「TA 动过」的部分。
   * 自己种的、自己收的、自己偷的都不吭声。
   */
  diffFarm(oldF, newF) {
    const msgs = [];
    if (!oldF || !newF) {
      return msgs;
    }
    const me = app.globalData.role;
    const oldPlots = oldF.plots || [];
    const newPlots = newF.plots || [];
    for (let i = 0; i < newPlots.length; i++) {
      const a = oldPlots[i] || null;
      const b = newPlots[i] || null;
      if (!a && b) {
        // 空地长出新东西
        if (b.by !== me) {
          msgs.push({ text: `TA 种下了${b.name}`, type: 'gain' });
        }
      } else if (a && !b) {
        // 作物不见了，说明被收走
        if (a.by !== me) {
          msgs.push({ text: `TA 收走了${a.name}`, type: 'exp' });
        }
      } else if (a && b && (a.stolen || 0) === 0 && (b.stolen || 0) > 0) {
        // 本来好好的，现在被摸过了
        if (b.by === me) {
          msgs.push({ text: `TA 摸走了你的${b.name}`, type: 'steal' });
        }
      }
    }
    return msgs;
  },

  /** 道具列表：带上当前生效状态 */
  buildGuards(g) {
    const list = [];
    for (let i = 0; i < crops.GUARDS.length; i++) {
      const x = crops.GUARDS[i];
      let on = false;
      let state = '未装';
      if (x.id === 'cat') {
        on = !!(g && g.catLeft > 0);
        state = on ? `生效中 · 还剩 ${Math.ceil(g.catLeft / 3600000)} 小时` : '未装';
      } else if (x.id === 'fence') {
        on = !!(g && g.fence > 0);
        state = on ? `还能挡 ${g.fence} 次` : '未装';
      } else if (x.id === 'alarm') {
        on = !!(g && g.alarm);
        state = on ? '已开启' : '未装';
      }
      list.push({
        id: x.id, name: x.name, icon: x.icon, price: x.price, desc: x.desc, state, on,
      });
    }
    return list;
  },

  /** 装了闹钟才显示最近一次被偷 */
  buildLastSteal(farm) {
    const g = farm.guards || {};
    const ls = farm.lastSteal;
    if (!g.alarm || !ls) {
      return null;
    }
    const role = app.globalData.role;
    // 被偷的是我这块地，就是 TA 摸走我的；反过来说我摸走 TA 的
    const mine = ls.victim === role;
    return {
      crop: ls.crop,
      amount: ls.amount,
      whoText: mine ? 'TA' : '你',
      whose: mine ? '你的' : 'TA 的',
    };
  },

  buyGuard(e) {
    const id = e.currentTarget.dataset.id;
    const couple = app.globalData.couple;
    if (!couple) {
      return;
    }
    wx.showLoading({ title: '装扮中' });
    db.buyGuard(couple._id, app.globalData.openid, id)
      .then(() => {
        wx.hideLoading();
        const g = crops.getGuard(id);
        this.fly('装好了 ' + (g ? g.icon : ''), 'gain');
        wx.vibrateShort({ type: 'light' });
        app.refresh();
        this.load();
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: err.message || '买不了', icon: 'none' });
      });
  },

  startTimer() {
    if (this._timer) {
      return;
    }
    this._timer = setInterval(() => {
      for (let i = 0; i < this._remains.length; i++) {
        if (this._remains[i] > 0) {
          this._remains[i] -= 1000;
          if (this._remains[i] < 0) {
            this._remains[i] = 0;
          }
        }
      }
      this.render();
    }, 1000);
  },

  stopTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  },

  render() {
    const farm = this.data.farm;
    if (!farm) {
      return;
    }
    const myRole = app.globalData.role;
    const plots = [];
    let ripeCount = 0;
    for (let i = 0; i < farm.plots.length; i++) {
      const p = farm.plots[i];
      if (i >= farm.unlocked) {
        plots.push({ index: i, locked: true, text: 'Lv.' + PLOT_LEVEL[i] + ' 解锁' });
        continue;
      }
      if (!p) {
        plots.push({ index: i, empty: true, text: '' });
        continue;
      }
      const remain = this._remains[i] || 0;
      const crop = crops.getCrop(p.cropId);
      const total = (crop && crop.matureMs) || 1;
      const ripe = remain <= 0;
      // 成熟才给 100，否则最多 99，免得进度条满了却没熟
      const progress = ripe ? 100 : Math.max(0, Math.min(99, Math.round(((total - remain) / total) * 100)));
      if (ripe) {
        ripeCount++;
      }
      plots.push({
        index: i,
        empty: false,
        locked: false,
        name: p.name,
        color: crop ? crop.color : '#CCCCCC',
        icon: ripe ? ((crop && crop.icon) || '🌾') : stageIcon(progress),
        stage: ripe ? 'ripe' : (progress >= 66 ? 'grown' : (progress >= 33 ? 'sprout' : 'seed')),
        progress,
        mature: ripe,
        text: ripe ? '可收获' : crops.formatDuration(remain),
        mine: p.by === myRole,
        stolen: p.stolen > 0,
        stolenPct: Math.round((p.stolen || 0) * 100),
      });
    }
    this.setData({ plots, ripeCount });
  },

  onPlotTap(e) {
    const i = Number(e.currentTarget.dataset.index);
    const farm = this.data.farm;
    if (i >= farm.unlocked) {
      wx.showToast({ title: 'Lv.' + PLOT_LEVEL[i] + ' 可开垦这块地', icon: 'none' });
      return;
    }
    const p = farm.plots[i];
    if (!p) {
      this.setData({ showSeed: true, seedSlot: i });
      return;
    }
    const remain = this._remains[i] || 0;
    if (remain > 0) {
      wx.showToast({ title: '还要 ' + crops.formatDuration(remain), icon: 'none' });
      return;
    }
    if (p.by === app.globalData.role) {
      this.doHarvest(i);
      return;
    }
    if (p.stolen > 0) {
      wx.showToast({ title: '这个已经被偷过了', icon: 'none' });
      return;
    }
    this.doSteal(i);
  },

  /** 飘字反馈：type = gain | steal | exp */
  fly(text, type, delay) {
    const id = Date.now() + '_' + Math.floor(Math.random() * 1000);
    const d = delay || 0;
    const list = this.data.flyers.concat([{
      id,
      text,
      type: type || 'gain',
      x: 24 + Math.floor(Math.random() * 46),
      delay: d,
    }]);
    this.setData({ flyers: list });
    const t = setTimeout(() => {
      this.setData({ flyers: this.data.flyers.filter((f) => f.id !== id) });
    }, 1400 + d);
    this._flyTimers.push(t);
  },

  /** 地块弹一下（收获、播种） */
  pop(index) {
    this.setData({ popIndex: index });
    this._flyTimers.push(setTimeout(() => this.setData({ popIndex: -1 }), 580));
  },

  /** 地块左右抖（被偷） */
  shake(index) {
    this.setData({ shakeIndex: index });
    this._flyTimers.push(setTimeout(() => this.setData({ shakeIndex: -1 }), 540));
  },

  clearFly() {
    for (let i = 0; i < this._flyTimers.length; i++) {
      clearTimeout(this._flyTimers[i]);
    }
    this._flyTimers = [];
    this.setData({ flyers: [], popIndex: -1, shakeIndex: -1 });
  },

  doHarvest(slot) {
    const couple = app.globalData.couple;
    wx.showLoading({ title: '收获中' });
    db.harvest(couple._id, app.globalData.openid, slot)
      .then((res) => {
        wx.hideLoading();
        this.pop(slot);
        this.fly('+' + res.gain + ' 爱心币', 'gain');
        if (res.exp > 0) {
          this.fly('+' + res.exp + ' 经验', 'exp', 240);
        }
        if (res.levelUp) {
          this.fly('升级啦 Lv.' + (res.level || ''), 'exp', 520);
        }
        // 草莓给情话、猫草抽惊喜、纪念树按天数加码
        if (res.perk) {
          this.fly(res.perk.text, 'gain', 760);
        }
        // 第一次收菜记进时光轴，重复的自动忽略
        db.pushEvent(couple._id, 'harvest', '你们第一次一起收了一茬菜', true).catch(() => {});
        wx.vibrateShort({ type: 'light' });
        app.refresh();
        this.load();
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: err.message || '收获失败', icon: 'none' });
      });
  },

  doSteal(slot) {
    const couple = app.globalData.couple;
    wx.showLoading({ title: '偷菜中' });
    db.steal(couple._id, app.globalData.openid, slot)
      .then((res) => {
        wx.hideLoading();
        this.shake(slot);
        this.fly('摸走 ' + res.amount + ' 币', 'steal');
        wx.vibrateShort({ type: 'light' });
        app.refresh();
        this.load();
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: err.message || '偷菜失败', icon: 'none' });
      });
  },

  openSeed(e) {
    this.setData({ showSeed: true, seedSlot: Number(e.currentTarget.dataset.index) });
  },

  closeSeed() {
    this.setData({ showSeed: false });
  },

  pickSeed(e) {
    const id = e.currentTarget.dataset.id;
    const seed = this.data.seeds.filter((s) => s.id === id)[0];
    if (!seed || seed.locked) {
      wx.showToast({ title: '等级不够，种不了', icon: 'none' });
      return;
    }
    const couple = app.globalData.couple;
    wx.showLoading({ title: '播种中' });
    db.plant(couple._id, app.globalData.openid, this.data.seedSlot, id)
      .then(() => {
        wx.hideLoading();
        this.setData({ showSeed: false });
        this.pop(this.data.seedSlot);
        this.fly('种下啦', 'gain');
        this.load();
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: err.message || '播种失败', icon: 'none' });
      });
  },

  /** 翻一张情话，用掉一次收草莓攒的次数 */
  useLoveWord() {
    const couple = app.globalData.couple;
    if (!couple) {
      return;
    }
    if ((this.data.lovewords || 0) <= 0) {
      wx.showToast({ title: '收草莓能攒情话次数', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '翻一张' });
    return db.usePerk(couple._id, 'lovewords')
      .then((res) => {
        wx.hideLoading();
        this.setData({ lovewords: (res.perks && res.perks.lovewords) || 0 });
        this.showLove();
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: err.message || '翻不出来', icon: 'none' });
      });
  },

  /** 换一句不再扣次数 */
  showLove() {
    wx.showModal({
      title: '💌 给你的',
      content: words.pickLove(),
      cancelText: '换一句',
      confirmText: '收下',
      success: (r) => {
        if (!r.confirm) {
          this.showLove();
        }
      },
    });
  },

  /** 本地模拟：对方种一棵已经成熟的月亮花 */
  mockPlant() {
    const couple = app.globalData.couple;
    db.mockPartnerPlant(couple._id, app.globalData.openid, 'moonflower')
      .then(() => this.load())
      .catch((err) => wx.showToast({ title: err.message, icon: 'none' }));
  },

  /** 本地模拟：对方来偷第一块成熟的、我种的作物 */
  mockSteal() {
    const couple = app.globalData.couple;
    const farm = this.data.farm;
    let slot = -1;
    for (let i = 0; i < farm.plots.length; i++) {
      const p = farm.plots[i];
      if (p && p.mature && p.by === app.globalData.role && !p.stolen) {
        slot = i;
        break;
      }
    }
    if (slot < 0) {
      wx.showToast({ title: '先种一棵并等它成熟', icon: 'none' });
      return;
    }
    db.mockSteal(couple._id, app.globalData.openid, slot)
      .then(() => {
        wx.showToast({ title: 'TA 偷走了一部分', icon: 'none' });
        this.load();
      })
      .catch((err) => wx.showToast({ title: err.message, icon: 'none' }));
  },

  buildSeeds(level) {
    return crops.CROPS.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon || '🌱',
      price: c.price,
      color: c.color,
      level: c.level,
      locked: level < c.level,
      timeText: shortTime(c.matureMs),
    }));
  },

  noop() {
    return null;
  },
});

function shortTime(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) {
    return m + ' 分钟';
  }
  const h = Math.round((m / 60) * 10) / 10;
  return h + ' 小时';
}

/** 生长阶段用不同的芽，一眼看得出在长大 */
function stageIcon(progress) {
  if (progress >= 66) {
    return '🌾';
  }
  if (progress >= 33) {
    return '🌿';
  }
  return '🌱';
}

function expPercent(exp) {
  const lv = crops.levelOf(exp);
  let cur = 0;
  let next = 0;
  for (let i = 0; i < crops.LEVELS.length; i++) {
    if (crops.LEVELS[i].level === lv) {
      cur = crops.LEVELS[i].exp;
    }
    if (crops.LEVELS[i].level === lv + 1) {
      next = crops.LEVELS[i].exp;
    }
  }
  if (next === 0) {
    return 100;
  }
  return Math.round(((exp - cur) / (next - cur)) * 100);
}
