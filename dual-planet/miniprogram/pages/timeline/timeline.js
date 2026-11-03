const app = getApp();
const db = require('../../utils/db.js');

const pad = (n) => (n < 10 ? `0${n}` : String(n));

/** 时光轴上不用精确到秒，「刚刚 / 3 小时前 / 11月3日」更好读 */
function relTime(at) {
  const diff = Date.now() - at;
  if (diff < 60000) {
    return '刚刚';
  }
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)} 分钟前`;
  }
  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)} 小时前`;
  }
  const d = new Date(at);
  if (diff < 86400000 * 2) {
    return `昨天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function toneOf(type) {
  const t = String(type || '');
  if (t.indexOf('daily') === 0) {
    return 'pink';
  }
  if (t === 'tree') {
    return 'green';
  }
  if (t === 'note') {
    return 'purple';
  }
  if (t.indexOf('bucket') === 0) {
    return 'orange';
  }
  if (t === 'room') {
    return 'blue';
  }
  return 'gray';
}

Page({
  data: {
    dates: [],
    nextDate: null,
    events: [],
    local: false,
    loading: true,
    mode: 'until',
    modes: [
      { id: 'since', name: '已经多久', desc: '在一起 500 天' },
      { id: 'until', name: '还有多久', desc: '下次见面' },
      { id: 'yearly', name: '每年都有', desc: '生日、周年' },
    ],
  },

  onShow() {
    this.load();
  },

  load() {
    const couple = app.globalData.couple;
    this.setData({ local: app.globalData.local });
    if (!couple) {
      this.setData({ loading: false });
      return Promise.resolve();
    }
    return app
      .ready()
      .then(() => Promise.all([
        db.planetOverview(couple._id, app.globalData.openid),
        db.listEvents(couple._id, 50),
      ]))
      .then((res) => {
        const o = res[0];
        const list = (res[1].events || []).map((e) => Object.assign({}, e, {
          time: relTime(e.at),
          tone: toneOf(e.type),
        }));
        this.setData({
          dates: o.dates || [],
          nextDate: o.nextDate || null,
          events: list,
          loading: false,
        });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  /** 先选日期，再问一句「这是什么日子」 */
  pickDate(e) {
    const at = new Date(`${e.detail.value}T00:00:00`).getTime();
    wx.showModal({
      title: '这是什么日子',
      editable: true,
      placeholderText: '比如 我们在一起',
      confirmText: '记下来',
      success: (r) => {
        if (!r.confirm) {
          return;
        }
        const title = (r.content || '').trim();
        if (!title) {
          wx.showToast({ title: '得起个名字', icon: 'none' });
          return;
        }
        this.add(title, at);
      },
    });
  },

  /** 三类日子算法不同：累计 / 倒数 / 每年 */
  pickMode(e) {
    this.setData({ mode: e.currentTarget.dataset.id });
  },

  /** 点已记下的日子，改它算哪一种 */
  editMode(e) {
    const id = e.currentTarget.dataset.id;
    const couple = app.globalData.couple;
    if (!couple || !id) {
      return;
    }
    const modes = this.data.modes;
    wx.showActionSheet({
      alertText: '这个日子怎么算？',
      itemList: modes.map((m) => `${m.name}（${m.desc}）`),
      success: (r) => {
        const picked = modes[r.tapIndex];
        if (!picked) {
          return;
        }
        db.setDateMode(couple._id, app.globalData.openid, id, picked.id)
          .then((res) => {
            this.setData({ dates: res.dates || [], nextDate: res.nextDate || null });
            wx.showToast({ title: `改成「${picked.name}」了` });
          })
          .catch((err) => {
            wx.showToast({ title: err.message || '改不了', icon: 'none' });
          });
      },
    });
  },

  add(title, at) {
    const couple = app.globalData.couple;
    if (!couple) {
      return;
    }
    db.addDate(couple._id, app.globalData.openid, title, at, this.data.mode)
      .then((res) => {
        this.setData({ dates: res.dates || [], nextDate: res.nextDate || null });
        wx.showToast({ title: '记下了' });
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '记不下', icon: 'none' });
      });
  },

  delDate(e) {
    const id = e.currentTarget.dataset.id;
    const couple = app.globalData.couple;
    wx.showModal({
      title: '删掉这个日子？',
      content: '删了就要重新记一次',
      confirmText: '删掉',
      success: (r) => {
        if (!r.confirm || !couple) {
          return;
        }
        db.delDate(couple._id, app.globalData.openid, id)
          .then((res) => {
            this.setData({ dates: res.dates || [], nextDate: res.nextDate || null });
          })
          .catch((err) => {
            wx.showToast({ title: err.message || '删不掉', icon: 'none' });
          });
      },
    });
  },
});
