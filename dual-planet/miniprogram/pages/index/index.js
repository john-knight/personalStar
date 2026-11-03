const app = getApp();
const db = require('../../utils/db.js');
const config = require('../../config.js');
const score = require('../../utils/score.js');

/**
 * 统一跳转入口。
 * navigateTo 失败时小程序是静默的——页面栈满了、页面没编译进去，
 * 表现都是「点了没反应」。这里把失败原因翻成人话。
 */
function navTo(url) {
  wx.navigateTo({
    url,
    fail: (err) => {
      const msg = String((err && err.errMsg) || '');
      let tip = '打不开，看看控制台';
      if (msg.indexOf('limit') >= 0) {
        tip = '页面开太多了，先返回几次';
      } else if (msg.indexOf('not found') >= 0 || msg.indexOf('not exist') >= 0) {
        tip = '这个页面还没编译，点一下「编译」';
      }
      console.error('[nav] navigateTo failed', url, msg);
      wx.showToast({ title: tip, icon: 'none', duration: 2500 });
    },
  });
}

function fmtTime(at) {
  const d = new Date(at);
  const pad = (n) => (n < 10 ? '0' + n : String(n));
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

Page({
  data: {
    hasCouple: false,
    waiting: false,
    local: false,
    meName: '',
    taName: '',
    meInitial: '',
    taInitial: '',
    days: 0,
    level: 1,
    coins: 0,
    code: '',
    games: [],
    lastScore: null,
    nextDate: null,
    treeLevel: 1,
    bucketDone: 0,
    bucketTotal: 100,
    unreadNotes: 0,
    dailyAnswered: false,
    unbindOpen: false,
    unbindInput: '',
    unbindErr: '',
    unbindBusy: false,
    plots: [
      { slot: 0, text: '空地', free: true },
      { slot: 1, text: '空地', free: true },
      { slot: 2, text: '空地', free: true },
      { slot: 3, text: '空地', free: true },
    ],
    hasCrop: false,
  },

  onLoad() {
    this.load();
  },

  onShow() {
    this.load();
  },

  load() {
    this._setGames();
    this._setLastScore();
    return app
      .ready()
      .then(() => {
        const c = app.globalData.couple;
        const role = app.globalData.role;
        this.setData({ local: app.globalData.local });
        // 被对方解除的话，这里已经是空的，得先告诉用户发生了什么
        this._checkEnded();
        if (!c) {
          this.setData({ hasCouple: false });
          return null;
        }
        const meName = role === 'a' ? c.aName : c.bName;
        const taName = role === 'a' ? c.bName : c.aName;
        const days = c.sinceAt ? Math.floor((Date.now() - c.sinceAt) / 86400000) : 0;
        this.setData({
          hasCouple: true,
          waiting: c.status !== 'active',
          meName: meName || '我',
          taName: taName || 'TA',
          meInitial: (meName || '我').slice(0, 1),
          taInitial: (taName || 'T').slice(0, 1),
          days,
          code: c.code || '',
        });
        // 农场和星球总览并行拉，任一失败都不该把首页拖垮
        return Promise.all([
          db.getFarm(c._id, app.globalData.openid).catch(() => null),
          db.planetOverview(c._id, app.globalData.openid).catch(() => null),
        ]).then((res) => {
          const farm = res[0];
          const ov = res[1];
          if (farm) {
            const all = farm.plots || [];
            const plots = [];
            let hasCrop = false;
            for (let i = 0; i < 4; i++) {
              const p = all[i];
              let text = '空地';
              let free = true;
              if (i >= farm.unlocked) {
                text = '未开垦';
              } else if (p) {
                free = false;
                text = p.mature ? `${p.name} · 可收` : p.name;
              }
              if (!free) {
                hasCrop = true;
              }
              plots.push({ slot: i, text, free });
            }
            // 主页只预览前四块，但后面几块有菜时也不能把整行藏掉
            for (let i = 4; i < all.length; i++) {
              if (all[i]) {
                hasCrop = true;
              }
            }
            // 地全空的时候这行没有信息量，只是白占一块地方
            this.setData({
              plots, hasCrop, level: farm.level, coins: farm.coins || 0,
            });
          }
          if (ov) {
            const nick = ov.nick || {};
            const me = nick.me || meName || '我';
            const ta = nick.ta || taName || 'TA';
            this.setData({
              meName: me,
              taName: ta,
              meInitial: me.slice(0, 1),
              taInitial: ta.slice(0, 1),
              nextDate: ov.nextDate || null,
              treeLevel: (ov.tree && ov.tree.level) || 1,
              bucketDone: (ov.bucket && ov.bucket.done) || 0,
              bucketTotal: (ov.bucket && ov.bucket.total) || 100,
              unreadNotes: (ov.notes && ov.notes.unread) || 0,
              dailyAnswered: !!(ov.daily && ov.daily.answered),
            });
          }
        });
      })
      .catch((err) => {
        console.error('[index] load failed', err);
      });
  },

  /** 三个小游戏入口，没填 AppID 的就是待配置 */
  _setGames() {
    const list = (config.games || []).map((g) => ({
      id: g.id,
      name: g.name,
      desc: g.desc,
      icon: g.icon || '🎮',
      locked: !g.appId && !g.url,
    }));
    this.setData({ games: list });
  },

  /** 最近一条战绩：游戏结束时自己存下来的 */
  _setLastScore() {
    const s = score.readScore();
    if (s && s.at) {
      this.setData({
        lastScore: Object.assign({}, s, {
          time: fmtTime(s.at),
          hasVs: (s.names && s.names.length > 0) || false,
        }),
      });
    } else {
      this.setData({ lastScore: null });
    }
  },

  goBind() {
    navTo('/pages/bind/bind');
  },

  goFarm() {
    navTo('/pages/farm/farm');
  },

  goQuiz() {
    navTo('/pages/quiz/quiz');
  },

  goRank() {
    navTo('/pages/rank/rank');
  },

  goDaily() {
    navTo('/pages/daily/daily');
  },

  goTimeline() {
    navTo('/pages/timeline/timeline');
  },

  goBucket() {
    navTo('/pages/bucket/bucket');
  },

  goOnline() {
    navTo('/pages/online/online');
  },

  /** 被对方解除绑定后，进去时说明清楚，而不是无声地变成空白页 */
  _checkEnded() {
    const user = app.globalData.user || {};
    const at = Number(user.lastEndedAt) || 0;
    if (!at || user.lastEndedByMe) {
      return;
    }
    // 三天前的旧事就别再弹了
    if (Date.now() - at > 3 * 86400000) {
      return;
    }
    const seen = Number(wx.getStorageSync('ended_seen_at')) || 0;
    if (seen === at) {
      return;
    }
    wx.setStorageSync('ended_seen_at', at);
    wx.showModal({
      title: '星球已解除',
      content: `${user.lastEndedBy || 'TA'} 解除了绑定。这里的记录都还在，但你们进不去了。`,
      showCancel: false,
      confirmText: '知道了',
    });
  },

  /** 打开解除绑定的确认弹层 */
  unbind() {
    if (!app.globalData.couple) {
      return;
    }
    this.setData({ unbindOpen: true, unbindInput: '', unbindErr: '' });
  },

  closeUnbind() {
    if (this.data.unbindBusy) {
      return;
    }
    this.setData({ unbindOpen: false, unbindErr: '' });
  },

  /** 点卡片时别穿透到遮罩上 */
  noop() {},

  onUnbindInput(e) {
    this.setData({ unbindInput: e.detail.value, unbindErr: '' });
  },

  /** 真要解除：必须一字不差地打出「解除」 */
  doUnbind() {
    if (this.data.unbindBusy) {
      return;
    }
    if ((this.data.unbindInput || '').trim() !== '解除') {
      this.setData({ unbindErr: '要一字不差地输入「解除」' });
      return;
    }
    this.setData({ unbindErr: '', unbindBusy: true });
    wx.showLoading({ title: '处理中', mask: true });
    db.unbindCouple(app.globalData.openid)
      .then(() => app.refresh())
      .then(() => {
        wx.hideLoading();
        this.setData({ unbindOpen: false, unbindBusy: false, unbindInput: '' });
        wx.showToast({ title: '已经解除了' });
        return this.load();
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ unbindErr: (err && err.message) || '解除失败', unbindBusy: false });
      });
  },

  /** 点名字改称呼，全站跟着变 */
  editNick() {
    const couple = app.globalData.couple;
    if (!couple) {
      return;
    }
    wx.showModal({
      title: 'TA 叫你什么',
      editable: true,
      placeholderText: '比如 小笨蛋',
      success: (r) => {
        if (!r.confirm) {
          return;
        }
        const name = (r.content || '').trim();
        if (!name) {
          wx.showToast({ title: '起个名字吧', icon: 'none' });
          return;
        }
        db.setNick(couple._id, app.globalData.openid, name)
          .then((res) => {
            const nick = res.nick || {};
            this.setData({
              meName: nick.me || this.data.meName,
              meInitial: (nick.me || this.data.meName).slice(0, 1),
            });
            wx.showToast({ title: '改好了' });
          })
          .catch((err) => {
            wx.showToast({ title: err.message || '改不了', icon: 'none' });
          });
      },
    });
  },

  /** 跳到某个小游戏，顺带把情侣信息带过去 */
  goGame(e) {
    const id = e.currentTarget.dataset.id;
    const game = (config.games || []).filter((g) => g.id === id)[0];
    if (!game) {
      return;
    }
    if (game.url) {
      wx.navigateTo({ url: game.url });
      return;
    }
    wx.showToast({ title: '这个游戏还没做好', icon: 'none' });
  },
});
