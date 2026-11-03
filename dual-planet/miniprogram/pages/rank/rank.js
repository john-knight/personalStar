const app = getApp();
const db = require('../../utils/db.js');

Page({
  data: {
    list: [],
    mine: null,
    total: 0,
    beat: -1,
    onBoard: true,
    local: false,
    loading: true,
    credit: 0,
    canBoard: true,
    flags: [],
  },

  onLoad() {
    this.setData({ local: app.globalData.local });
  },

  onShow() {
    this.load();
  },

  load() {
    const couple = app.globalData.couple;
    if (!couple) {
      this.setData({ loading: false });
      return;
    }
    return db
      .rankTop(couple._id)
      .then((res) => {
        this.setData({
          list: res.list || [],
          mine: res.mine || null,
          total: res.total || 0,
          beat: res.beat === undefined ? -1 : res.beat,
          onBoard: res.onBoard !== false,
          credit: res.credit || 0,
          canBoard: res.canBoard !== false,
          flags: res.flags || [],
          loading: false,
        });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  /** 送一次成绩进榜，分数由云端从答题结果里读 */
  submit() {
    const couple = app.globalData.couple;
    if (!couple) {
      return;
    }
    if (this.data.local) {
      wx.showToast({ title: '联网后才能上榜', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '提交中' });
    db.rankSubmit(couple._id)
      .then((res) => {
        wx.hideLoading();
        if (res && res.skipped) {
          wx.showToast({ title: '联网后才能上榜', icon: 'none' });
          return null;
        }
        wx.showToast({ title: '成绩已上榜' });
        return this.load();
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: err.message || '提交失败', icon: 'none' });
      });
  },

  toggleBoard(e) {
    const couple = app.globalData.couple;
    if (!couple) {
      return;
    }
    const on = !!e.detail.value;
    db.rankSetOnBoard(couple._id, on)
      .then(() => {
        wx.showToast({ title: on ? '已上榜' : '已撤下', icon: 'none' });
        return this.load();
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '设置失败', icon: 'none' });
        this.setData({ onBoard: !on });
      });
  },
});
