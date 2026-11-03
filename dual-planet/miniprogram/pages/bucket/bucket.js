const app = getApp();
const db = require('../../utils/db.js');
const bucket = require('../../data/bucket.js');

Page({
  data: {
    groups: [],
    done: 0,
    total: 100,
    percent: 0,
    local: false,
    loading: true,
    input: '',
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
      .then(() => db.listBucket(couple._id, app.globalData.openid))
      .then((b) => {
        this.setData(Object.assign({ loading: false }, this.build(b)));
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  /** 把「打钩记录」摊成按组的结构 */
  build(b) {
    const map = b.map || {};
    const role = app.globalData.role;
    const groups = bucket.BUCKET_GROUPS.map((g) => {
      let done = 0;
      const items = [];
      for (let i = 0; i < bucket.BUCKET_ITEMS.length; i++) {
        const it = bucket.BUCKET_ITEMS[i];
        if (it.g !== g.id) {
          continue;
        }
        const hit = map[it.id];
        if (hit) {
          done++;
        }
        items.push({
          id: it.id,
          t: it.t,
          done: !!hit,
          who: hit ? (hit.by === role ? '你' : 'TA') : '',
        });
      }
      return {
        id: g.id, name: g.name, icon: g.icon, items, done, total: items.length,
      };
    });

    // 自己加的排最后，单独一组
    const customs = b.customs || [];
    if (customs.length) {
      const items = [];
      for (let i = 0; i < customs.length; i++) {
        const x = customs[i];
        const hit = map[x.id];
        items.push({
          id: x.id,
          t: x.t,
          done: !!hit,
          custom: true,
          who: hit ? (hit.by === role ? '你' : 'TA') : '',
        });
      }
      groups.push({
        id: 'custom',
        name: '我们自己的',
        icon: '✍️',
        items,
        done: items.filter((x) => x.done).length,
        total: items.length,
      });
    }

    return {
      groups,
      done: b.done || 0,
      total: b.total || 100,
      percent: b.percent || 0,
    };
  },

  toggle(e) {
    const id = e.currentTarget.dataset.id;
    const couple = app.globalData.couple;
    if (!couple) {
      return;
    }
    db.toggleBucket(couple._id, app.globalData.openid, id)
      .then((res) => {
        this.setData(this.build(res.bucket));
        if (res.done) {
          wx.vibrateShort({ type: 'light' });
        }
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '改不了', icon: 'none' });
      });
  },

  onInput(e) {
    this.setData({ input: e.detail.value });
  },

  /** 自己加一件 */
  addItem() {
    const couple = app.globalData.couple;
    const text = (this.data.input || '').trim();
    if (!couple) {
      return;
    }
    if (!text) {
      wx.showToast({ title: '写一件想一起做的事', icon: 'none' });
      return;
    }
    db.addBucketItem(couple._id, app.globalData.openid, text)
      .then((res) => {
        this.setData(Object.assign({ input: '' }, this.build(res.bucket)));
        wx.vibrateShort({ type: 'light' });
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '加不了', icon: 'none' });
      });
  },

  delItem(e) {
    const couple = app.globalData.couple;
    const id = e.currentTarget.dataset.id;
    if (!couple || !id) {
      return;
    }
    wx.showModal({
      title: '删掉这一件？',
      content: '打钩记录也会一起没',
      success: (r) => {
        if (!r.confirm) {
          return;
        }
        db.delBucketItem(couple._id, app.globalData.openid, id)
          .then((res) => this.setData(this.build(res.bucket)))
          .catch((err) => {
            wx.showToast({ title: err.message || '删不了', icon: 'none' });
          });
      },
    });
  },
});
