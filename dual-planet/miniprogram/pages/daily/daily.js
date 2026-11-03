const app = getApp();
const db = require('../../utils/db.js');

Page({
  data: {
    daily: null,
    local: false,
    loading: true,
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
      .then(() => db.getDaily(couple._id, app.globalData.openid))
      .then((d) => {
        this.setData({ daily: d, loading: false });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  choose(e) {
    const couple = app.globalData.couple;
    if (!couple || !this.data.daily) {
      return;
    }
    if (this.data.daily.answered) {
      wx.showToast({ title: '今天答过啦，明天再来', icon: 'none' });
      return;
    }
    const idx = Number(e.currentTarget.dataset.index);
    wx.showLoading({ title: '提交中' });
    db.answerDaily(couple._id, app.globalData.openid, idx)
      .then((d) => {
        wx.hideLoading();
        this.setData({ daily: d });
        wx.vibrateShort({ type: 'light' });
        if (d.both) {
          wx.showToast({ title: d.same ? '你们想到一块去了' : 'TA 也答完了', icon: 'none' });
        }
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: err.message || '提交失败', icon: 'none' });
      });
  },

  /** 本地模式：假装 TA 也答了，用来看「互相看到答案」 */
  mockTa() {
    const couple = app.globalData.couple;
    if (!couple) {
      return;
    }
    db.mockDailyPartner(couple._id, app.globalData.openid)
      .then((d) => {
        this.setData({ daily: d });
        wx.showToast({ title: 'TA 答好了', icon: 'none' });
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '模拟失败', icon: 'none' });
      });
  },

  goTimeline() {
    wx.navigateTo({ url: '/pages/timeline/timeline' });
  },
});
