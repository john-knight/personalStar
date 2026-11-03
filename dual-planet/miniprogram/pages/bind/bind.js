const app = getApp();
const db = require('../../utils/db.js');

Page({
  data: {
    mode: 'create',
    myName: '',
    inputCode: '',
    code: '',
    local: false,
  },

  onLoad() {
    this.setData({ local: app.globalData.local });
  },

  switchMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode });
  },

  onInputName(e) {
    this.setData({ myName: e.detail.value });
  },

  onInputCode(e) {
    this.setData({ inputCode: e.detail.value.toUpperCase() });
  },

  create() {
    if (!this.data.myName) {
      return;
    }
    wx.showLoading({ title: '创建中' });
    db.createCouple(app.globalData.openid, this.data.myName)
      .then((res) => {
        wx.hideLoading();
        this.setData({ code: res.code });
        return app.refresh();
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: err.message || '创建失败', icon: 'none' });
      });
  },

  join() {
    if (!this.data.inputCode || !this.data.myName) {
      return;
    }
    wx.showLoading({ title: '加入中' });
    db.joinCouple(app.globalData.openid, this.data.inputCode, this.data.myName)
      .then(() => app.refresh())
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '绑定成功' });
        setTimeout(() => wx.navigateBack(), 600);
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: err.message || '加入失败', icon: 'none' });
      });
  },

  copyCode() {
    wx.setClipboardData({
      data: this.data.code,
      success: () => wx.showToast({ title: '已复制' }),
    });
  },

  /** 本地模式下模拟对方加入，用来单机演示双人效果 */
  mockJoin() {
    db.mockPartnerJoin(app.globalData.openid).then(() => {
      return app.refresh();
    }).then(() => {
      wx.showToast({ title: 'TA 已加入' });
      setTimeout(() => wx.navigateBack(), 600);
    });
  },
});
