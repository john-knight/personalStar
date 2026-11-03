const app = getApp();
const db = require('../../utils/db.js');

Page({
  data: {
    local: false,
    loading: true,
    list: [],
    total: 0,
    both: 0,
    hit: 0,
    waitMe: 0,
    max: 20,
    formOpen: false,
    text: '',
    options: ['', '', '', ''],
    choice: -1,
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
      .then(() => db.quizCustomList(couple._id, app.globalData.openid))
      .then((res) => {
        this.setData(Object.assign({ loading: false }, res.list));
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  openForm() {
    if (this.data.total >= this.data.max) {
      wx.showToast({ title: `最多 ${this.data.max} 道，先删几道`, icon: 'none' });
      return;
    }
    this.setData({
      formOpen: true, text: '', options: ['', '', '', ''], choice: -1,
    });
  },

  closeForm() {
    this.setData({ formOpen: false });
  },

  onText(e) {
    this.setData({ text: e.detail.value });
  },

  onOption(e) {
    const i = Number(e.currentTarget.dataset.i);
    const options = this.data.options.slice();
    options[i] = e.detail.value;
    this.setData({ options });
  },

  /** 勾「这是我的答案」 */
  pickMine(e) {
    this.setData({ choice: Number(e.currentTarget.dataset.i) });
  },

  save() {
    const couple = app.globalData.couple;
    if (!couple) {
      return;
    }
    db.quizCustomAdd(
      couple._id, app.globalData.openid,
      this.data.text, this.data.options, this.data.choice,
    )
      .then((res) => {
        this.setData(Object.assign({ formOpen: false }, res.list));
        wx.vibrateShort({ type: 'light' });
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '出不了', icon: 'none' });
      });
  },

  answer(e) {
    const couple = app.globalData.couple;
    const id = e.currentTarget.dataset.id;
    const i = Number(e.currentTarget.dataset.i);
    if (!couple || !id) {
      return;
    }
    db.quizCustomAnswer(couple._id, app.globalData.openid, id, i)
      .then((res) => {
        this.setData(res.list);
        const item = (res.list.list || []).filter((x) => x.id === id)[0];
        if (item && item.both) {
          wx.showModal({
            title: item.same ? '想到一块去了' : '不太一样',
            content: item.same ? '你们选了同一个，这一分算你们的' : '下次再猜猜 TA 会选哪个',
            showCancel: false,
            confirmText: '好',
          });
        }
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '答不了', icon: 'none' });
      });
  },

  del(e) {
    const couple = app.globalData.couple;
    const id = e.currentTarget.dataset.id;
    if (!couple || !id) {
      return;
    }
    wx.showModal({
      title: '删掉这道题？',
      content: '两个人就都看不到了',
      success: (r) => {
        if (!r.confirm) {
          return;
        }
        db.quizCustomDel(couple._id, app.globalData.openid, id)
          .then((res) => this.setData(res.list))
          .catch((err) => {
            wx.showToast({ title: err.message || '删不了', icon: 'none' });
          });
      },
    });
  },
});
