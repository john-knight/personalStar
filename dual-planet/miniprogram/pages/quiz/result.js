const app = getApp();
const db = require('../../utils/db.js');
const quizData = require('../../data/quiz.js');

const DIMS = quizData.DIMS;

Page({
  data: {
    score: 0,
    dims: [],
    percent: -1,
    samples: 0,
    hit: 0,
    total: 0,
  },

  onLoad() {
    this._values = [0, 0, 0, 0, 0];
    this.load();
  },

  load() {
    const couple = app.globalData.couple;
    if (!couple) {
      return;
    }
    return db
      .quizResult(couple._id)
      .then((res) => {
        if (!res.ready) {
          wx.showToast({ title: '还没有可看的报告', icon: 'none' });
          return;
        }
        // 答完一次就记进时光轴，重复的自动忽略
        db.pushEvent(couple._id, 'quiz', '你们完成了一次默契问答', true).catch(() => {});
        const dims = DIMS.map((d) => ({
          id: d.id,
          name: d.name,
          value: res.result.dims[d.id] || 0,
        }));
        this._values = dims.map((d) => d.value);
        this.setData({
          score: res.result.score,
          dims,
          hit: res.result.hit,
          total: res.result.total,
          // 样本不足时不做瓜分，只报参与数，避免拿 3 个样本吹「超过 67%」
          percent: res.samples >= 10 ? res.percent : -1,
          samples: res.samples,
        });
        this.drawRadar();
        // 结果一出来就先画好卡片，这样点「分享」时图片已经在了
        this.makeCard(() => {});
      })
      .catch((err) => {
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  drawRadar() {
    const query = wx.createSelectorQuery();
    query
      .select('#radar')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) {
          return;
        }
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = (wx.getSystemInfoSync().pixelRatio || 2);
        const w = res[0].width;
        const h = res[0].height;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);
        this._radarCanvas = canvas;
        paintRadar(ctx, w / 2, h / 2, Math.min(w, h) * 0.36, this._values, true);
      });
  },

  /** 生成报告卡图片，回调拿到临时路径 */
  makeCard(done) {
    if (!wx.createOffscreenCanvas) {
      this.exportCanvas(this._radarCanvas, done);
      return;
    }
    const off = wx.createOffscreenCanvas({ type: '2d', width: 600, height: 800 });
    const ctx = off.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 600, 800);

    const role = app.globalData.role;
    const c = app.globalData.couple || {};
    const names = (role === 'a' ? c.aName : c.bName) + ' & ' + (role === 'a' ? c.bName : c.aName);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#1F2329';
    ctx.font = '30px sans-serif';
    ctx.fillText('双人星球 · 默契报告', 300, 70);
    ctx.fillStyle = '#8A9099';
    ctx.font = '22px sans-serif';
    ctx.fillText(names, 300, 110);

    ctx.fillStyle = '#F0658A';
    ctx.font = 'bold 130px sans-serif';
    ctx.fillText(String(this.data.score), 300, 250);
    ctx.fillStyle = '#8A9099';
    ctx.font = '24px sans-serif';
    ctx.fillText('默契分 · ' + this.data.hit + '/' + this.data.total + ' 题一致', 300, 292);

    // 这句是拿来拉新的，样本够才画
    if (this.data.percent >= 0) {
      ctx.fillStyle = '#F0658A';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText(`超过了 ${this.data.percent}% 的情侣`, 300, 345);
    } else {
      ctx.fillStyle = '#A6ACB3';
      ctx.font = '24px sans-serif';
      ctx.fillText(`已有 ${this.data.samples} 对 CP 参与`, 300, 345);
    }

    paintRadar(ctx, 300, 530, 160, this._values, true);

    const now = new Date();
    const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
    ctx.fillStyle = '#C9CDD2';
    ctx.font = '20px sans-serif';
    ctx.fillText(`${now.getFullYear()}.${pad(now.getMonth() + 1)}.${pad(now.getDate())}`, 300, 738);
    ctx.fillStyle = '#A6ACB3';
    ctx.font = '22px sans-serif';
    ctx.fillText('来双人星球，测测你们的默契', 300, 772);

    this.exportCanvas(off, done);
  },

  saveCard() {
    this.makeCard((p) => {
      wx.previewImage({ urls: [p], current: p });
    });
  },

  /** 存到相册，第一次会要授权 */
  saveAlbum() {
    this.makeCard((p) => {
      wx.saveImageToPhotosAlbum({
        filePath: p,
        success: () => {
          wx.showToast({ title: '已存到相册' });
        },
        fail: (err) => {
          const msg = (err && err.errMsg) || '';
          if (msg.indexOf('auth deny') >= 0 || msg.indexOf('authorize') >= 0) {
            wx.showModal({
              title: '需要相册权限',
              content: '去设置里打开「保存到相册」，才能把报告卡存下来',
              confirmText: '去设置',
              success: (r) => {
                if (r.confirm) {
                  wx.openSetting();
                }
              },
            });
            return;
          }
          wx.showToast({ title: '保存失败', icon: 'none' });
        },
      });
    });
  },

  exportCanvas(canvas, done) {
    if (!canvas) {
      wx.showToast({ title: '生成失败', icon: 'none' });
      return;
    }
    wx.canvasToTempFilePath({
      canvas,
      success: (r) => {
        this._cardPath = r.tempFilePath;
        if (done) {
          done(r.tempFilePath);
        }
      },
      fail: () => {
        wx.showToast({ title: '生成失败', icon: 'none' });
      },
    });
  },

  /** 转发：带上报告卡图片 */
  onShareAppMessage() {
    const score = this.data.score;
    let title = `我们默契 ${score} 分，你敢测吗`;
    if (this.data.percent >= 0) {
      title = `我们默契 ${score} 分，超过了 ${this.data.percent}% 的情侣`;
    }
    return {
      title,
      path: '/pages/index/index',
      imageUrl: this._cardPath || '',
    };
  },

  goRank() {
    wx.navigateTo({ url: '/pages/rank/rank' });
  },

  goCustom() {
    wx.navigateTo({ url: '/pages/quiz/custom' });
  },

  again() {
    const couple = app.globalData.couple;
    wx.showLoading({ title: '换一批题' });
    db.quizRestart(couple._id)
      .then(() => {
        wx.hideLoading();
        wx.redirectTo({ url: '/pages/quiz/quiz' });
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: err.message || '失败', icon: 'none' });
      });
  },
});

/** 五边形雷达：cx/cy 中心，r 半径，values 五个 0-100 的值 */
function paintRadar(ctx, cx, cy, r, values, labels) {
  const n = 5;
  // 网格
  for (let g = 1; g <= 4; g++) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = pt(cx, cy, r * (g / 4), i);
      if (i === 0) {
        ctx.moveTo(p[0], p[1]);
      } else {
        ctx.lineTo(p[0], p[1]);
      }
    }
    ctx.closePath();
    ctx.strokeStyle = '#EEEFF1';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // 轴线
  for (let i = 0; i < n; i++) {
    const p = pt(cx, cy, r, i);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(p[0], p[1]);
    ctx.strokeStyle = '#F0F1F3';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // 数据面
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const p = pt(cx, cy, r * (values[i] / 100), i);
    if (i === 0) {
      ctx.moveTo(p[0], p[1]);
    } else {
      ctx.lineTo(p[0], p[1]);
    }
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(240,101,138,0.22)';
  ctx.fill();
  ctx.strokeStyle = '#F0658A';
  ctx.lineWidth = 2;
  ctx.stroke();
  // 顶点
  for (let i = 0; i < n; i++) {
    const p = pt(cx, cy, r * (values[i] / 100), i);
    ctx.beginPath();
    ctx.arc(p[0], p[1], 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#F0658A';
    ctx.fill();
  }
  // 维度名
  if (labels) {
    ctx.fillStyle = '#8A9099';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const p = pt(cx, cy, r + 26, i);
      ctx.fillText(DIMS[i].name, p[0], p[1]);
    }
    ctx.textBaseline = 'alphabetic';
  }
}

function pt(cx, cy, r, i) {
  const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}
