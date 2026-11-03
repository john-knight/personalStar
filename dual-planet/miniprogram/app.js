const config = require('./config.js');
const db = require('./utils/db.js');

App({
  globalData: {
    openid: '',
    user: null,
    couple: null,
    role: '',
    local: false,
    /** 最近一条战绩，由 utils/score.js 在游戏结算时写入 */
    lastScore: null,
  },

  onLaunch() {
    this._ready = this._boot();
  },

  /** 页面调用：等待初始化完成，拿到 { user, couple, role } */
  ready() {
    return this._ready || Promise.resolve(null);
  },

  _boot() {
    db.init(config);
    return db
      .login()
      .then((openid) => {
        this.globalData.openid = openid;
        this.globalData.local = db.isLocal();
        return db.loadUser(openid);
      })
      .then((res) => {
        this.globalData.user = res.user;
        this.globalData.couple = res.couple;
        this.globalData.role = res.role;
        // 上报设备指纹，云端拿它算可信分（拦开小号自偷）
        db.reportDevice().catch((e) => {
          console.warn('[app] reportDevice failed', e && e.message);
        });
        return res;
      })
      .catch((err) => {
        console.error('[app] init failed', err);
        return null;
      });
  },

  /** 数据有变动时刷新全局缓存 */
  refresh() {
    return db.loadUser(this.globalData.openid).then((res) => {
      this.globalData.user = res.user;
      this.globalData.couple = res.couple;
      this.globalData.role = res.role;
      return res;
    });
  },
});
