/**
 * 统一数据访问层
 * 有云开发环境时走云函数；检测不到云环境时自动降级到本地模拟，
 * 保证没有 AppID 的情况下也能完整跑通 UI 与交互流程。
 */

const LOCAL_KEY = 'dualplanet.store';
let _cfg = { cloudEnv: '', useLocalMock: false };
let _local = false;

// ---------------------------------------------------------------- 初始化

function init(cfg) {
  _cfg = cfg || _cfg;
  if (_cfg.useLocalMock) {
    _local = true;
    return;
  }
  if (typeof wx === 'undefined' || !wx.cloud || !wx.cloud.init) {
    _local = true;
    return;
  }
  try {
    wx.cloud.init({ env: _cfg.cloudEnv || undefined, traceUser: true });
    _local = false;
  } catch (e) {
    console.warn('[db] cloud init failed -> local', e);
    _local = true;
  }
}

function isLocal() {
  return _local;
}

// ---------------------------------------------------------------- 云调用

function callFn(name, data) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name,
      data,
      success: (res) => {
        const r = res.result;
        if (r && r.ok) {
          resolve(r.data);
        } else {
          reject(new Error((r && r.err) || 'cloud error'));
        }
      },
      fail: (err) => reject(err),
    });
  });
}

/** 云优先，失败自动降级到本地 */
function withFallback(cloudFn, localFn) {
  if (_local) {
    return Promise.resolve().then(localFn);
  }
  return cloudFn().catch((err) => {
    console.warn('[db] fallback to local:', err && err.message);
    _local = true;
    return Promise.resolve().then(localFn);
  });
}

// ---------------------------------------------------------------- 本地存储

function readLocal() {
  if (typeof wx === 'undefined' || !wx.getStorageSync) {
    return { users: {}, couples: {}, farms: {} };
  }
  const raw = wx.getStorageSync(LOCAL_KEY);
  if (raw && typeof raw === 'object') {
    if (!raw.users) raw.users = {};
    if (!raw.couples) raw.couples = {};
    if (!raw.farms) raw.farms = {};
    return raw;
  }
  return { users: {}, couples: {}, farms: {} };
}

function writeLocal(store) {
  if (typeof wx !== 'undefined' && wx.setStorageSync) {
    wx.setStorageSync(LOCAL_KEY, store);
  }
}

function newId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function newCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

// ---------------------------------------------------------------- 对外 API

/** 微信登录，返回 openid */
function login() {
  return withFallback(
    () => callFn('login', {}).then((d) => d.openid),
    () => 'local_openid',
  );
}

/** 拉取用户与情侣关系 */
function loadUser(openid) {
  return withFallback(
    () => callFn('couple', { action: 'load', openid }),
    () => localLoadUser(openid),
  );
}

/** 创建情侣空间，返回邀请码 */
function createCouple(openid, myName) {
  return withFallback(
    () => callFn('couple', { action: 'create', openid, myName }),
    () => localCreateCouple(openid, myName),
  );
}

/** 用邀请码加入 */
function joinCouple(openid, code, myName) {
  return withFallback(
    () => callFn('couple', { action: 'join', openid, code, myName }),
    () => localJoinCouple(openid, code, myName),
  );
}

/**
 * 解除绑定。
 *
 * 故意不用 withFallback：那是「云端挂了就用本地」的语义，用在解绑上会出大问题——
 * 云端没成功、本地却当成功，用户以为解绑了，实际两边状态不一致。
 * 所以联网时就必须真的成功才算成功。
 */
function unbindCouple(openid) {
  if (_local) {
    return Promise.resolve().then(() => localUnbind(openid));
  }
  return callFn('couple', { action: 'unbind', openid });
}

function updateProfile(openid, nickName, avatarUrl) {
  return withFallback(
    () => callFn('couple', { action: 'profile', openid, nickName, avatarUrl }),
    () => {
      const store = readLocal();
      if (!store.users[openid]) {
        store.users[openid] = { openid, createdAt: Date.now() };
      }
      store.users[openid].nickName = nickName;
      store.users[openid].avatarUrl = avatarUrl;
      writeLocal(store);
      return store.users[openid];
    },
  );
}

// ---------------------------------------------------------------- 本地实现

function localLoadUser(openid) {
  const store = readLocal();
  if (!store.users[openid]) {
    store.users[openid] = { openid, nickName: '', avatarUrl: '', createdAt: Date.now() };
  }
  let couple = null;
  let role = '';
  const keys = Object.keys(store.couples);
  for (let i = 0; i < keys.length; i++) {
    const c = store.couples[keys[i]];
    const idx = c.members.indexOf(openid);
    if (idx >= 0) {
      couple = c;
      role = idx === 0 ? 'a' : 'b';
    }
  }
  writeLocal(store);
  return { user: store.users[openid], couple, role };
}

function localCreateCouple(openid, myName) {
  const store = readLocal();
  const id = newId('c_');
  const couple = {
    _id: id,
    members: [openid],
    aName: myName || '我',
    bName: '',
    code: newCode(),
    level: 1,
    coins: 100,
    sinceAt: Date.now(),
    status: 'waiting',
  };
  store.couples[id] = couple;
  store.users[openid] = Object.assign({}, store.users[openid], {
    openid,
    nickName: myName,
    createdAt: (store.users[openid] && store.users[openid].createdAt) || Date.now(),
  });
  store.farms[id] = { coupleId: id, plots: [null, null, null, null] };
  writeLocal(store);
  return { couple, code: couple.code };
}

function localJoinCouple(openid, code, myName) {
  const store = readLocal();
  const keys = Object.keys(store.couples);
  for (let i = 0; i < keys.length; i++) {
    const c = store.couples[keys[i]];
    if (c.code !== code || c.status === 'ended') {
      continue;
    }
    if (c.members.length >= 2) {
      throw new Error('这个星球已经有两个人啦');
    }
    if (c.members.indexOf(openid) >= 0) {
      throw new Error('你已经在里面了');
    }
    c.members.push(openid);
    c.bName = myName || 'TA';
    c.status = 'active';
    store.users[openid] = Object.assign({}, store.users[openid], {
      openid,
      nickName: myName,
      createdAt: (store.users[openid] && store.users[openid].createdAt) || Date.now(),
    });
    writeLocal(store);
    return { couple: c };
  }
  throw new Error('邀请码不存在');
}

/**
 * 本地版的解除绑定：只归档，不删数据。
 * members 清空之后，localLoadUser 就再也找不到这段关系了。
 */
function localUnbind(openid) {
  const store = readLocal();
  const keys = Object.keys(store.couples);
  for (let i = 0; i < keys.length; i++) {
    const c = store.couples[keys[i]];
    const idx = c.members.indexOf(openid);
    if (idx < 0) {
      continue;
    }
    const role = idx === 0 ? 'a' : 'b';
    const who = (role === 'a' ? c.aName : c.bName) || 'TA';
    const partner = c.members.filter((x) => x !== openid)[0] || '';
    const now = Date.now();
    c.status = 'ended';
    c.endedAt = now;
    c.endedBy = role;
    c.endedByName = who;
    c.archivedMembers = c.members.slice();
    c.members = [];
    // 邀请码作废，免得别人拿旧码加进来
    c.code = `ENDED${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    // 自己解除的不需要提示，被解除的那方才需要
    store.users[openid] = Object.assign(
      { openid, createdAt: now },
      store.users[openid],
      { lastEndedAt: now, lastEndedBy: who, lastEndedByMe: true },
    );
    if (partner) {
      store.users[partner] = Object.assign(
        { openid: partner, createdAt: now },
        store.users[partner],
        { lastEndedAt: now, lastEndedBy: who, lastEndedByMe: false },
      );
    }
    writeLocal(store);
    return { couple: null, role: '', partnerName: who };
  }
  throw new Error('还没有绑定的关系');
}

/** 仅本地模拟用：让一个虚拟对象加入，方便单机演示双人效果 */
function mockPartnerJoin(openid) {
  if (!_local) {
    return Promise.resolve(null);
  }
  const store = readLocal();
  const keys = Object.keys(store.couples);
  for (let i = 0; i < keys.length; i++) {
    const c = store.couples[keys[i]];
    if (c.members.length < 2 && c.members.indexOf(openid) === 0) {
      c.members.push('local_partner');
      c.bName = c.bName || 'TA';
      c.status = 'active';
      writeLocal(store);
      return Promise.resolve({ couple: c });
    }
  }
  return Promise.resolve(null);
}

const crops = require('../data/crops.js');
const PLOT_COUNT = 6;

// ---------------------------------------------------------------- 农场

function getFarm(coupleId, openid) {
  return withFallback(
    () => callFn('farm', { action: 'list', coupleId, openid }),
    () => localGetFarm(coupleId, openid),
  );
}

function plant(coupleId, openid, slot, cropId) {
  return withFallback(
    () => callFn('farm', { action: 'plant', coupleId, openid, slot, cropId }),
    () => localPlant(coupleId, openid, slot, cropId),
  );
}

function harvest(coupleId, openid, slot) {
  return withFallback(
    () => callFn('farm', { action: 'harvest', coupleId, openid, slot }),
    () => localHarvest(coupleId, openid, slot),
  );
}

/** 用掉一次情话次数（次数是收草莓攒出来的） */
function usePerk(coupleId, type) {
  if (_local) {
    return Promise.resolve().then(() => {
      const store = readLocal();
      const c = store.couples[coupleId];
      if (!c) {
        throw new Error('还没加入星球');
      }
      c.perks = c.perks || {};
      if ((c.perks[type] || 0) <= 0) {
        throw new Error('没有次数了');
      }
      c.perks[type] -= 1;
      writeLocal(store);
      return { perks: c.perks, left: c.perks[type] };
    });
  }
  return callFn('farm', { action: 'usePerk', coupleId, type });
}

/**
 * 上报设备指纹，云端拿它算可信分（拦「开小号自偷」）。
 * 只存一个本地生成的随机号，不取通讯录、位置这些敏感东西。
 */
function ensureDeviceId() {
  const KEY = 'dualplanet.deviceId';
  let id = '';
  try {
    id = wx.getStorageSync(KEY) || '';
  } catch (e) {
    id = '';
  }
  if (!id) {
    id = 'd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
    try {
      wx.setStorageSync(KEY, id);
    } catch (e) {
      console.warn('[db] save deviceId failed', e);
    }
  }
  return id;
}

function reportDevice() {
  const id = ensureDeviceId();
  if (_local) {
    return Promise.resolve({ local: true, credit: 0, flags: [] });
  }
  let model = '';
  try {
    const info = wx.getSystemInfoSync();
    model = `${info.brand || ''} ${info.model || ''}`.trim();
  } catch (e) {
    model = '';
  }
  return callFn('couple', { action: 'device', deviceId: id, model });
}

/**
 * 默契榜。
 * 本地模拟模式里没有别的 CP，直接给空榜——不做假数据充数，
 * 免得看着像有很多人其实只有自己。
 */
function rankTop(coupleId) {
  if (_local) {
    return Promise.resolve({
      list: [], mine: null, total: 0, beat: -1, onBoard: true, local: true,
    });
  }
  return callFn('leaderboard', { action: 'top', coupleId });
}

/** 把最新一次答题成绩送进榜（分数由云端从 quiz_result 读，前端说了不算） */
function rankSubmit(coupleId) {
  if (_local) {
    return Promise.resolve({ local: true, skipped: true });
  }
  return callFn('leaderboard', { action: 'submit', coupleId });
}

/** 上榜开关：关掉就从榜上撤下来 */
function rankSetOnBoard(coupleId, on) {
  if (_local) {
    return Promise.resolve({ onBoard: !!on, local: true });
  }
  return callFn('leaderboard', { action: 'setOnBoard', coupleId, on: !!on });
}

/** 买防偷道具，扣星球爱心币 */
function buyGuard(coupleId, openid, guardId) {
  return withFallback(
    () => callFn('farm', { action: 'buyGuard', coupleId, openid, guardId }),
    () => localBuyGuard(coupleId, guardId),
  );
}

/**
 * 小游戏结算：把成绩换成爱心币。
 * 云函数没有 reward 这个 action 时（还没部署）就用本地实现，
 * 但不会把整个 db 降级成本地模式。
 */
function addCoins(coupleId, openid, amount, game) {
  if (_local) {
    return Promise.resolve().then(() => localAddCoins(coupleId, amount, game));
  }
  return callFn('farm', { action: 'reward', coupleId, openid, amount, game })
    .catch((err) => {
      console.warn('[db] reward 走本地:', err && err.message);
      return localAddCoins(coupleId, amount, game);
    });
}

function steal(coupleId, openid, slot) {
  return withFallback(
    () => callFn('farm', { action: 'steal', coupleId, openid, slot }),
    () => localSteal(coupleId, openid, slot),
  );
}

// ---------------------------------------------------------------- 农场本地实现

function ensureFarm(store, coupleId) {
  if (!store.farms[coupleId]) {
    const plots = [];
    for (let i = 0; i < PLOT_COUNT; i++) {
      plots.push(null);
    }
    store.farms[coupleId] = { coupleId, plots };
  }
  return store.farms[coupleId];
}

function plotView(p, now) {
  if (!p) {
    return null;
  }
  const crop = crops.getCrop(p.cropId);
  const remain = Math.max(0, p.plantedAt + p.matureMs - now);
  return {
    cropId: p.cropId,
    name: crop ? crop.name : '',
    price: crop ? crop.price : 0,
    remain,
    mature: remain <= 0,
    by: p.by,
    stolen: p.stolen || 0,
    stolenBy: p.stolenBy || '',
  };
}

function localGetFarm(coupleId, openid) {
  const store = readLocal();
  const c = store.couples[coupleId] || {};
  const farm = ensureFarm(store, coupleId);
  const now = Date.now();
  const exp = c.exp || 0;
  const user = store.users[openid] || {};
  writeLocal(store);
  return {
    serverTime: now,
    level: crops.levelOf(exp),
    exp,
    expToNext: crops.expToNext(exp),
    coins: c.coins || 0,
    myCoins: user.coins || 0,
    guards: crops.guardView(c.guards),
    perks: c.perks || {},
    lastSteal: (c.stealLog && c.stealLog[0]) || null,
    unlocked: crops.unlockedPlots(crops.levelOf(exp)),
    isNight: crops.isNight(now),
    plots: farm.plots.map((p) => plotView(p, now)),
  };
}

function localPlant(coupleId, openid, slot, cropId) {
  const crop = crops.getCrop(cropId);
  if (!crop) {
    throw new Error('没有这种种子');
  }
  const store = readLocal();
  const c = store.couples[coupleId];
  if (!c) {
    throw new Error('还没加入星球');
  }
  const level = crops.levelOf(c.exp || 0);
  if (level < crop.level) {
    throw new Error('星球等级不够');
  }
  if (slot < 0 || slot >= crops.unlockedPlots(level)) {
    throw new Error('这块地还没开垦');
  }
  const farm = ensureFarm(store, coupleId);
  if (farm.plots[slot]) {
    throw new Error('这块地已经种了东西');
  }
  farm.plots[slot] = {
    cropId,
    plantedAt: Date.now(),
    matureMs: crop.matureMs,
    by: c.members.indexOf(openid) === 0 ? 'a' : 'b',
    stolen: 0,
    stolenBy: '',
  };
  writeLocal(store);
  const now = Date.now();
  return { slot, plots: farm.plots.map((p) => plotView(p, now)) };
}

function localHarvest(coupleId, openid, slot) {
  const store = readLocal();
  const c = store.couples[coupleId];
  if (!c) {
    throw new Error('还没加入星球');
  }
  const farm = ensureFarm(store, coupleId);
  const p = farm.plots[slot];
  if (!p) {
    throw new Error('这块地是空的');
  }
  const now = Date.now();
  if (p.plantedAt + p.matureMs > now) {
    throw new Error('还没成熟');
  }
  const crop = crops.getCrop(p.cropId);
  const night = crop.night && crops.isNight(now);
  let value = crop.price;
  if (night) {
    value = Math.round(value * (1 + crops.NIGHT_BONUS));
  }
  let gain = Math.round(value * (1 - (p.stolen || 0)));
  // 作物不只是装饰：草莓给情话次数，猫草抽小惊喜，纪念树按天数加码
  const days = c.sinceAt ? Math.floor((now - c.sinceAt) / 86400000) : 0;
  const perk = crops.perkOf(p.cropId, days);
  c.perks = c.perks || {};
  if (perk) {
    if (perk.type === 'lovewords') {
      c.perks.lovewords = (c.perks.lovewords || 0) + perk.amount;
    } else {
      gain += perk.amount;
    }
  }
  farm.plots[slot] = null;
  c.coins = (c.coins || 0) + gain;
  c.exp = (c.exp || 0) + Math.round(crop.price / 10);
  writeLocal(store);
  return {
    gain,
    perk,
    perks: c.perks,
    night,
    exp: c.exp,
    coins: c.coins,
    plots: farm.plots.map((pp) => plotView(pp, now)),
  };
}

function localSteal(coupleId, openid, slot) {
  const store = readLocal();
  const c = store.couples[coupleId];
  if (!c) {
    throw new Error('还没加入星球');
  }
  return stealByRole(store, coupleId, c.members.indexOf(openid) === 0 ? 'a' : 'b', slot, openid);
}

/** 与云端 reward 同规则：单次上限 + 每天 3 次 */
const REWARD_CAP = {
  gobang: 40,
  drawguess: 40,
  puzzle: 40,
  tapheart: 40,
  story: 30,
};
const DAILY_LIMIT = 3;

function localBuyGuard(coupleId, guardId) {
  const store = readLocal();
  const c = store.couples[coupleId];
  if (!c) {
    throw new Error('还没加入星球');
  }
  const g = crops.getGuard(guardId);
  if (!g) {
    throw new Error('没有这个道具');
  }
  if ((c.coins || 0) < g.price) {
    throw new Error('爱心币不够，还差 ' + (g.price - (c.coins || 0)));
  }
  c.coins = (c.coins || 0) - g.price;
  c.guards = c.guards || {};
  if (guardId === 'cat') {
    // 还在生效就往后续，不浪费
    const base = (c.guards.cat || 0) > Date.now() ? c.guards.cat : Date.now();
    c.guards.cat = base + 24 * 3600 * 1000;
  } else if (guardId === 'fence') {
    c.guards.fence = (c.guards.fence || 0) + 1;
  } else if (guardId === 'alarm') {
    c.guards.alarm = true;
  }
  writeLocal(store);
  return { coins: c.coins, guards: crops.guardView(c.guards), bought: guardId };
}

function localAddCoins(coupleId, amount, game) {
  const store = readLocal();
  const c = store.couples[coupleId];
  if (!c) {
    throw new Error('还没加入星球');
  }
  const cap = REWARD_CAP[game];
  if (!cap) {
    throw new Error('这个游戏没有奖励');
  }
  const day = localDayKey();
  if (!c.rewards) {
    c.rewards = {};
  }
  const today = Object.assign({}, c.rewards[day]);
  const used = today[game] || 0;
  if (used >= DAILY_LIMIT) {
    writeLocal(store);
    return { coins: c.coins || 0, gain: 0, limited: true, left: 0 };
  }
  const gain = Math.max(0, Math.min(cap, Math.round(amount || 0)));
  today[game] = used + 1;
  c.rewards[day] = today;
  c.coins = (c.coins || 0) + gain;
  // 保留最近 7 天的记录就够了
  const keys = Object.keys(c.rewards).sort();
  while (keys.length > 7) {
    delete c.rewards[keys.shift()];
  }
  writeLocal(store);
  return { coins: c.coins, gain, limited: false, left: DAILY_LIMIT - used - 1 };
}

function localDayKey() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

function stealByRole(store, coupleId, role, slot, openid) {
  const c = store.couples[coupleId];
  const farm = ensureFarm(store, coupleId);
  const p = farm.plots[slot];
  if (!p) {
    throw new Error('这块地是空的');
  }
  if (p.by === role) {
    throw new Error('不能偷自己种的');
  }
  const now = Date.now();
  if (p.plantedAt + p.matureMs > now) {
    throw new Error('还没成熟，偷不了');
  }
  if ((p.stolen || 0) > 0) {
    throw new Error('这个已经被偷过了');
  }
  const crop = crops.getCrop(p.cropId);
  const guards = c.guards || {};

  // 篱笆：直接挡掉这一次，消耗一道
  if ((guards.fence || 0) > 0) {
    guards.fence -= 1;
    c.guards = guards;
    writeLocal(store);
    return {
      amount: 0, rate: 0, blocked: 'fence',
      guards: crops.guardView(guards),
      plots: farm.plots.map((pp) => plotView(pp, now)),
    };
  }

  let rate = crops.STEAL_MIN + Math.random() * crops.STEAL_RANGE;
  // 看门猫：损失减半
  let shielded = false;
  if ((guards.cat || 0) > now) {
    rate *= 0.5;
    shielded = true;
  }
  const amount = Math.round(crop.price * rate);
  p.stolen = rate;
  p.stolenBy = role;
  if (openid && store.users[openid]) {
    store.users[openid].coins = (store.users[openid].coins || 0) + amount;
  }

  // 闹钟：记一笔，回来能看见是谁摸的
  let lastSteal = null;
  if (guards.alarm) {
    // who = 下手的人，victim = 被偷的那块地的主人
    lastSteal = { at: now, who: role, victim: p.by, crop: crop.name, amount };
    c.stealLog = [lastSteal].concat(c.stealLog || []).slice(0, 5);
  }
  writeLocal(store);
  return {
    amount, rate, shielded, alarmed: !!guards.alarm, lastSteal,
    guards: crops.guardView(guards),
    plots: farm.plots.map((pp) => plotView(pp, now)),
  };
}

/** 本地模式专用：以对方身份偷一把，用来演示偷菜流程 */
function mockSteal(coupleId, openid, slot) {
  if (!_local) {
    return Promise.reject(new Error('仅本地模式可用'));
  }
  const store = readLocal();
  const c = store.couples[coupleId];
  const other = c.members.indexOf(openid) === 0 ? 'b' : 'a';
  return Promise.resolve().then(() => stealByRole(store, coupleId, other, slot, ''));
}

/** 本地模式专用：让对方种下一棵已经成熟的作物，用来演示偷菜 */
function mockPartnerPlant(coupleId, openid, cropId) {
  if (!_local) {
    return Promise.reject(new Error('仅本地模式可用'));
  }
  const store = readLocal();
  const c = store.couples[coupleId];
  if (!c) {
    return Promise.reject(new Error('还没加入星球'));
  }
  const crop = crops.getCrop(cropId);
  const farm = ensureFarm(store, coupleId);
  const limit = crops.unlockedPlots(crops.levelOf(c.exp || 0));
  let slot = -1;
  for (let i = 0; i < limit; i++) {
    if (!farm.plots[i]) {
      slot = i;
      break;
    }
  }
  if (slot < 0) {
    return Promise.reject(new Error('没有空地了'));
  }
  farm.plots[slot] = {
    cropId,
    plantedAt: Date.now() - crop.matureMs,
    matureMs: crop.matureMs,
    by: c.members.indexOf(openid) === 0 ? 'b' : 'a',
    stolen: 0,
    stolenBy: '',
  };
  writeLocal(store);
  const now = Date.now();
  return Promise.resolve({ slot, plots: farm.plots.map((p) => plotView(p, now)) });
}

const quizData = require('../data/quiz.js');

// ---------------------------------------------------------------- 默契问答

function quizCurrent(coupleId, role) {
  return withFallback(
    () => callFn('quiz', { action: 'current', coupleId }),
    () => localQuizCurrent(coupleId, role),
  );
}

function quizSubmit(coupleId, role, answers) {
  return withFallback(
    () => callFn('quiz', { action: 'submit', coupleId, answers }),
    () => localQuizSubmit(coupleId, role, answers),
  );
}

function quizResult(coupleId) {
  return withFallback(
    () => callFn('quiz', { action: 'result', coupleId }),
    () => localQuizResult(coupleId),
  );
}

function quizRestart(coupleId) {
  return withFallback(
    () => callFn('quiz', { action: 'restart', coupleId }),
    () => localQuizRestart(coupleId),
  );
}

/** 本地模式专用：按 70% 一致率生成对方的答案 */
function quizMockPartner(coupleId, role, myAnswers) {
  if (!_local) {
    return Promise.reject(new Error('仅本地模式可用'));
  }
  const store = readLocal();
  const rec = store.quizzes[coupleId];
  const otherRole = role === 'a' ? 'b' : 'a';
  const answers = [];
  for (let i = 0; i < rec.questions.length; i++) {
    const id = rec.questions[i];
    if (Math.random() < 0.7) {
      answers.push(matchOption(id, myAnswers[i], role, otherRole));
    } else {
      answers.push(diffOption(id, myAnswers[i], role, otherRole));
    }
  }
  return localQuizSubmit(coupleId, otherRole, answers);
}

// ---------------------------------------------------------------- 问答本地实现

function ensureQuiz(store, coupleId) {
  if (!store.quizzes) {
    store.quizzes = {};
  }
  if (!store.quizzes[coupleId]) {
    store.quizzes[coupleId] = {
      questions: quizData.pickSet(3),
      answers: { a: null, b: null },
      status: 'answering',
      result: null,
    };
  }
  return store.quizzes[coupleId];
}

function localQuizCurrent(coupleId, role) {
  const store = readLocal();
  const rec = ensureQuiz(store, coupleId);
  writeLocal(store);
  const other = role === 'a' ? 'b' : 'a';
  const mine = rec.answers[role];
  return {
    questions: rec.questions,
    myAnswers: mine || [],
    myDone: !!(mine && mine.length === rec.questions.length),
    partnerDone: !!(rec.answers[other] && rec.answers[other].length === rec.questions.length),
    status: rec.status,
    result: rec.result,
  };
}

function localQuizSubmit(coupleId, role, answers) {
  const store = readLocal();
  const rec = ensureQuiz(store, coupleId);
  rec.answers[role] = answers;
  const other = role === 'a' ? 'b' : 'a';
  const otherAns = rec.answers[other];
  let result = rec.result;
  let status = rec.status;
  if (otherAns && otherAns.length === rec.questions.length) {
    const a = role === 'a' ? answers : otherAns;
    const b = role === 'a' ? otherAns : answers;
    result = calcQuiz(rec.questions, a, b);
    status = 'done';
    if (!store.quizResults) {
      store.quizResults = [];
    }
    store.quizResults.push({ coupleId, score: result.score });
  }
  rec.result = result;
  rec.status = status;
  store.quizzes[coupleId] = rec;
  writeLocal(store);
  return { waiting: status !== 'done', result, status };
}

function localQuizResult(coupleId) {
  const store = readLocal();
  const rec = ensureQuiz(store, coupleId);
  if (rec.status !== 'done' || !rec.result) {
    return { ready: false };
  }
  const all = store.quizResults || [];
  const score = rec.result.score;
  const below = all.filter((r) => r.score < score).length;
  return {
    ready: true,
    result: rec.result,
    samples: all.length,
    percent: all.length > 0 ? Math.round((below / all.length) * 100) : -1,
  };
}

function localQuizRestart(coupleId) {
  const store = readLocal();
  store.quizzes[coupleId] = {
    questions: quizData.pickSet(3),
    answers: { a: null, b: null },
    status: 'answering',
    result: null,
  };
  writeLocal(store);
  return { ok: true };
}

function calcQuiz(questions, ansA, ansB) {
  const total = {};
  const hit = {};
  let hitCount = 0;
  for (let i = 0; i < questions.length; i++) {
    const id = questions[i];
    const dim = id.split('_')[0];
    const na = quizData.normalize(id, ansA[i], 'a');
    const nb = quizData.normalize(id, ansB[i], 'b');
    const same = na === nb;
    if (same) {
      hitCount++;
    }
    if (!total[dim]) {
      total[dim] = 0;
      hit[dim] = 0;
    }
    total[dim]++;
    if (same) {
      hit[dim]++;
    }
  }
  const dims = {};
  const keys = Object.keys(total);
  for (let i = 0; i < keys.length; i++) {
    dims[keys[i]] = Math.round((hit[keys[i]] / total[keys[i]]) * 100);
  }
  return {
    score: Math.round((hitCount / questions.length) * 100),
    dims,
    hit: hitCount,
    total: questions.length,
  };
}

/** 找到与对方答案归一化后一致的选项下标 */
function matchOption(id, myIdx, myRole, otherRole) {
  const target = quizData.normalize(id, myIdx, myRole);
  const q = quizData.getQuestion(id);
  for (let j = 0; j < q.options.length; j++) {
    if (quizData.normalize(id, j, otherRole) === target) {
      return j;
    }
  }
  return myIdx;
}

/** 找一个归一化后不一致的选项下标 */
function diffOption(id, myIdx, myRole, otherRole) {
  const target = quizData.normalize(id, myIdx, myRole);
  const q = quizData.getQuestion(id);
  const candidates = [];
  for (let j = 0; j < q.options.length; j++) {
    if (quizData.normalize(id, j, otherRole) !== target) {
      candidates.push(j);
    }
  }
  if (!candidates.length) {
    return myIdx;
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ================================================================ 关系类功能
//
// 称呼 / 纪念日 / 每日一问 / 时光轴 / 纸条 / 合养树 / 一起做的事 / 联机五子棋
// 云端统一走 planet 云函数；本地模式直接挂在 couple 对象上，玩法一样。

const dailyBook = require('../data/daily.js');

const NOTE_DELAY = 30 * 60 * 1000;
const TREE_BONUS = 30;
const MAX_TREE_LEVEL = 10;
const TOTAL_BUCKET = 100;
const MAX_EVENTS = 200;

function roleIn(c, openid) {
  return c.members && c.members[0] === openid ? 'a' : 'b';
}

/** 本地模式下改完 couple 自动落盘 */
function withLocal(coupleId, fn) {
  return Promise.resolve().then(() => {
    const store = readLocal();
    const c = store.couples[coupleId];
    if (!c) {
      throw new Error('还没加入星球');
    }
    const out = fn(c, store);
    writeLocal(store);
    return out;
  });
}

function nicksOf(c) {
  const n = c.nicks || {};
  return { a: n.a || c.aName || '我', b: n.b || c.bName || 'TA' };
}

/** 离最近的一个纪念日还有几天，支持每年循环 */
/**
 * 三种日子，算法不一样：
 *   since  —— 已经多久（第一次见面、在一起），算距今
 *   until  —— 还有多久（下次见面、考试），算倒数
 *   yearly —— 每年都有（生日、周年），永远指向下一个周年，并标出这是第几次
 * 老数据只有 yearly 布尔，这里做一次推导，不用迁移。
 */
function modeOf(d) {
  if (d.mode === 'since' || d.mode === 'until' || d.mode === 'yearly') {
    return d.mode;
  }
  if (d.yearly) {
    return 'yearly';
  }
  return (Number(d.at) || 0) <= Date.now() ? 'since' : 'until';
}

/** 原始日期怎么读：每年循环的去掉年份，跨年的补上年份 */
function dateTextOf(at, mode) {
  const d = new Date(at);
  const md = `${d.getMonth() + 1}月${d.getDate()}日`;
  if (mode === 'yearly') {
    return `每年 ${md}`;
  }
  if (d.getFullYear() === new Date().getFullYear()) {
    return md;
  }
  return `${d.getFullYear()}年${md}`;
}

function dayLeft(d) {
  const now = Date.now();
  const mode = modeOf(d);
  const at = Number(d.at) || 0;

  if (mode === 'since') {
    const days = Math.floor((now - at) / 86400000);
    return {
      mode,
      at,
      nextAt: at,
      left: days,
      days,
      text: days >= 0 ? `已经 ${days} 天` : `还有 ${-days} 天`,
      past: false,
      timesText: '',
      sinceText: '',
    };
  }

  let nextAt = at;
  if (mode === 'yearly') {
    const src = new Date(at);
    const cur = new Date();
    nextAt = new Date(cur.getFullYear(), src.getMonth(), src.getDate()).getTime();
    if (nextAt < now - 86400000) {
      nextAt = new Date(cur.getFullYear() + 1, src.getMonth(), src.getDate()).getTime();
    }
  }

  const left = Math.ceil((nextAt - now) / 86400000);
  let text = '';
  if (left > 0) {
    text = `还有 ${left} 天`;
  } else if (left === 0) {
    text = '就是今天';
  } else {
    text = `已经过去 ${-left} 天`;
  }

  // 第几次：从原始那年开始数，原始日期在未来时不算
  let timesText = '';
  // 每年循环的日子，除了「还有几天到周年」，也把「已经多少天」算出来
  let sinceText = '';
  if (mode === 'yearly') {
    const n = new Date(nextAt).getFullYear() - new Date(at).getFullYear() + 1;
    if (n >= 2) {
      timesText = `第 ${n} 次`;
    }
    const passed = Math.floor((now - at) / 86400000);
    if (passed >= 0) {
      sinceText = `已经 ${passed} 天`;
    }
  }

  return {
    mode,
    at,
    nextAt,
    left,
    days: mode === 'yearly' ? 0 : left,
    text,
    past: mode === 'until' && left < 0,
    timesText,
    sinceText,
  };
}

/** 顶部大字只挑「往后要到的日子」，累计型的日子不该占这个位置 */
function nextOf(dates) {
  if (!dates || !dates.length) {
    return null;
  }
  let best = null;
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    const info = dayLeft(d);
    if (info.mode === 'since' || info.past) {
      continue;
    }
    if (!best || info.left < best.left) {
      best = {
        id: d.id,
        title: d.title,
        left: info.left,
        at: info.nextAt,
        text: info.text,
        timesText: info.timesText,
      };
    }
  }
  return best;
}

/** 每个日子都带上天数、原始日期、第几次，列表里才看得明白 */
function datesView(dates) {
  const list = dates || [];
  const next = nextOf(list);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    const info = dayLeft(d);
    out.push({
      id: d.id,
      title: d.title,
      at: d.at,
      mode: info.mode,
      yearly: info.mode === 'yearly',
      dateText: dateTextOf(d.at, info.mode),
      nextAt: info.nextAt,
      left: info.left,
      days: info.days,
      text: info.text,
      timesText: info.timesText,
      sinceText: info.sinceText,
      past: info.past,
      isNext: !!(next && next.id === d.id),
    });
  }
  return { dates: out, nextDate: next };
}

function dailyView(c, role) {
  const day = dailyBook.todayKey();
  const q = dailyBook.pickByDay(day);
  const saved = c.daily && c.daily.day === day ? c.daily : null;
  const answers = (saved && saved.answers) || {};
  const mine = answers[role] || null;
  const theirs = answers[role === 'a' ? 'b' : 'a'] || null;
  const both = !!(mine && theirs);
  return {
    day,
    qid: q.id,
    q: q.q,
    tag: q.tag,
    options: q.options,
    mine: mine ? mine.choice : -1,
    answered: !!mine,
    ta: both ? theirs.choice : -1,
    both,
    same: both ? mine.choice === theirs.choice : false,
  };
}

function treeView(c) {
  const t = c.tree || {};
  const day = dailyBook.todayKey();
  const level = t.level || 1;
  const aWatered = t.aDay === day;
  const bWatered = t.bDay === day;
  return {
    level,
    maxLevel: MAX_TREE_LEVEL,
    aWatered,
    bWatered,
    needA: !aWatered,
    needB: !bWatered,
    totalWater: t.total || 0,
    full: level >= MAX_TREE_LEVEL,
    names: nicksOf(c),
    text: level >= MAX_TREE_LEVEL ? '树已经长得很大了' : '两个人各浇一次，它就长一级',
  };
}

function bucketView(c) {
  const done = c.bucket || {};
  const customs = c.bucketCustom || [];
  const ids = Object.keys(done);
  // 自己加的事也算进总量，不然打钩了进度条不动，看着像没生效
  const total = TOTAL_BUCKET + customs.length;
  const out = [];
  for (let i = 0; i < customs.length; i++) {
    const x = customs[i];
    out.push({
      id: x.id, t: x.t, by: x.by, at: x.at, done: !!done[x.id],
    });
  }
  return {
    total,
    base: TOTAL_BUCKET,
    done: ids.length,
    percent: total ? Math.round((ids.length / total) * 100) : 0,
    ids,
    map: done,
    customs: out,
  };
}

function noteView(n, role, now) {
  const mine = n.from === role;
  const open = mine || now >= n.openAt;
  return {
    id: n.id,
    mine,
    open,
    text: open ? n.text : '',
    fromText: mine ? '你' : 'TA',
    at: n.at,
    openAt: n.openAt,
    leftMs: Math.max(0, n.openAt - now),
    read: !!n.read,
  };
}

function notesView(c, role) {
  const now = Date.now();
  const list = (c.notes || []).slice().reverse();
  const views = [];
  let unread = 0;
  for (let i = 0; i < list.length; i++) {
    const v = noteView(list[i], role, now);
    if (v.open && !v.mine && !v.read) {
      unread++;
    }
    views.push(v);
  }
  return { unread, list: views.slice(0, 10), total: views.length };
}

function pushLocalEvent(c, type, text, once) {
  c.events = c.events || [];
  if (once) {
    for (let i = 0; i < c.events.length; i++) {
      if (c.events[i].type === type) {
        return;
      }
    }
  }
  c.events.push({ type, text: String(text).slice(0, 80), at: Date.now() });
  if (c.events.length > MAX_EVENTS) {
    c.events = c.events.slice(-MAX_EVENTS);
  }
}

/** 首页一次拉全 */
function planetOverview(coupleId, openid) {
  if (_local) {
    return Promise.resolve().then(() => {
      const store = readLocal();
      const c = store.couples[coupleId];
      if (!c) {
        throw new Error('还没加入星球');
      }
      const role = roleIn(c, openid);
      const ta = role === 'a' ? 'b' : 'a';
      const nicks = nicksOf(c);
      const dv = datesView((c.dates || []).slice().sort((x, y) => x.at - y.at));
      return {
        nick: { me: nicks[role], ta: nicks[ta] },
        dates: dv.dates,
        nextDate: dv.nextDate,
        daily: dailyView(c, role),
        tree: treeView(c),
        bucket: bucketView(c),
        notes: notesView(c, role),
        events: (c.events || []).slice(-3).reverse(),
        days: c.sinceAt ? Math.floor((Date.now() - c.sinceAt) / 86400000) : 0,
      };
    });
  }
  return callFn('planet', { action: 'overview', coupleId });
}

/** 设置我对自己的称呼，TA 那边看到的就是这个 */
function setNick(coupleId, openid, name) {
  if (_local) {
    return withLocal(coupleId, (c) => {
      const n = String(name || '').trim().slice(0, 8);
      if (!n) {
        throw new Error('称呼不能为空');
      }
      const role = roleIn(c, openid);
      c.nicks = Object.assign({}, c.nicks || {});
      c.nicks[role] = n;
      const all = nicksOf(c);
      return { nick: { me: all[role], ta: all[role === 'a' ? 'b' : 'a'] } };
    });
  }
  return callFn('planet', { action: 'nick', coupleId, name });
}

function addDate(coupleId, openid, title, at, mode) {
  // 兼容旧调用：传 true 当「每年」，其余按「还有多久」
  let m = mode;
  if (m === true) {
    m = 'yearly';
  }
  if (m !== 'since' && m !== 'yearly') {
    m = 'until';
  }
  if (_local) {
    return withLocal(coupleId, (c) => {
      const t = String(title || '').trim().slice(0, 12);
      const ts = Number(at);
      if (!t) {
        throw new Error('给它起个名字');
      }
      if (!(ts > 0)) {
        throw new Error('日期不对');
      }
      c.dates = c.dates || [];
      if (c.dates.length >= 10) {
        throw new Error('纪念日最多 10 个');
      }
      c.dates.push({
        // 带上随机后缀，同一毫秒内加两个也不会重号
        id: 'dt' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
        title: t,
        at: ts,
        mode: m,
        yearly: m === 'yearly',
      });
      pushLocalEvent(c, 'date', `记下了一个日子：${t}`);
      return datesView(c.dates);
    });
  }
  return callFn('planet', {
    action: 'dateAdd', coupleId, title, at, mode: m,
  });
}

/** 改某个日子的算法（累计 / 倒数 / 每年），不用删了重记 */
function setDateMode(coupleId, openid, id, mode) {
  let m = mode;
  if (m !== 'since' && m !== 'yearly') {
    m = 'until';
  }
  if (_local) {
    return withLocal(coupleId, (c) => {
      const d = (c.dates || []).filter((x) => x.id === id)[0];
      if (!d) {
        throw new Error('没有这个日子');
      }
      d.mode = m;
      d.yearly = m === 'yearly';
      return datesView(c.dates);
    });
  }
  return callFn('planet', {
    action: 'dateMode', coupleId, id, mode: m,
  });
}

function delDate(coupleId, openid, id) {
  if (_local) {
    return withLocal(coupleId, (c) => {
      c.dates = (c.dates || []).filter((d) => d.id !== id);
      return datesView(c.dates);
    });
  }
  return callFn('planet', { action: 'dateDel', coupleId, id });
}

function getDaily(coupleId, openid) {
  if (_local) {
    return Promise.resolve().then(() => {
      const store = readLocal();
      const c = store.couples[coupleId];
      if (!c) {
        throw new Error('还没加入星球');
      }
      return dailyView(c, roleIn(c, openid));
    });
  }
  return callFn('planet', { action: 'daily', coupleId });
}

function answerDaily(coupleId, openid, choice) {
  if (_local) {
    return withLocal(coupleId, (c) => {
      const role = roleIn(c, openid);
      const day = dailyBook.todayKey();
      const q = dailyBook.pickByDay(day);
      const n = Number(choice);
      if (!(n >= 0 && n < q.options.length)) {
        throw new Error('选项不对');
      }
      if (!c.daily || c.daily.day !== day) {
        c.daily = { day, qid: q.id, answers: {} };
      }
      if (c.daily.answers[role]) {
        throw new Error('今天已经答过了');
      }
      c.daily.answers[role] = { choice: n, at: Date.now() };
      const other = role === 'a' ? 'b' : 'a';
      if (c.daily.answers[other]) {
        const same = c.daily.answers[other].choice === n;
        pushLocalEvent(c, 'daily-' + day, same ? '今天的每日一问，你们想到一块去了' : '今天的每日一问，你们想法不太一样', true);
      }
      return dailyView(c, role);
    });
  }
  return callFn('planet', { action: 'dailyAnswer', coupleId, choice });
}

/** 本地模式专用：假装 TA 也答了，用来看「互相看到答案」的效果 */
function mockDailyPartner(coupleId, openid, choice) {
  if (!_local) {
    return Promise.reject(new Error('只有本地模式能模拟'));
  }
  return withLocal(coupleId, (c) => {
    const role = roleIn(c, openid) === 'a' ? 'b' : 'a';
    const day = dailyBook.todayKey();
    const q = dailyBook.pickByDay(day);
    if (!c.daily || c.daily.day !== day) {
      c.daily = { day, qid: q.id, answers: {} };
    }
    const pick = choice === undefined ? Math.floor(Math.random() * q.options.length) : Number(choice);
    c.daily.answers[role] = { choice: pick, at: Date.now() };
    return dailyView(c, roleIn(c, openid));
  });
}

function listEvents(coupleId, limit) {
  if (_local) {
    return Promise.resolve().then(() => {
      const store = readLocal();
      const c = store.couples[coupleId];
      if (!c) {
        throw new Error('还没加入星球');
      }
      const n = Math.min(Math.max(Number(limit) || 50, 1), MAX_EVENTS);
      return { events: (c.events || []).slice(-n).reverse() };
    });
  }
  return callFn('planet', { action: 'events', coupleId, limit });
}

/** 记一笔时光轴。once=true 时同类型只记第一次 */
function pushEvent(coupleId, type, text, once) {
  if (_local) {
    return withLocal(coupleId, (c) => {
      pushLocalEvent(c, type, text, once);
      return { pushed: true };
    });
  }
  return callFn('planet', {
    action: 'eventPush', coupleId, type, text, once: !!once,
  });
}

function listNotes(coupleId, openid) {
  if (_local) {
    return Promise.resolve().then(() => {
      const store = readLocal();
      const c = store.couples[coupleId];
      if (!c) {
        throw new Error('还没加入星球');
      }
      return notesView(c, roleIn(c, openid));
    });
  }
  return callFn('planet', { action: 'overview', coupleId }).then((o) => o.notes);
}

function leaveNote(coupleId, openid, text) {
  if (_local) {
    return withLocal(coupleId, (c) => {
      const role = roleIn(c, openid);
      const t = String(text || '').trim();
      if (!t) {
        throw new Error('写点什么再埋');
      }
      if (t.length > 60) {
        throw new Error('太长啦，60 字以内');
      }
      c.notes = c.notes || [];
      if (c.notes.length >= 50) {
        throw new Error('纸条太多了，先清一些');
      }
      const at = Date.now();
      const note = {
        id: 'n' + at.toString(36) + Math.floor(Math.random() * 1000),
        from: role,
        text: t,
        at,
        openAt: at + NOTE_DELAY,
        read: false,
      };
      c.notes.push(note);
      pushLocalEvent(c, 'note', '有人埋了一颗惊喜种子，半小时后发芽');
      return { note: noteView(note, role, at), notes: notesView(c, role) };
    });
  }
  return callFn('planet', { action: 'noteLeave', coupleId, text });
}

function readNote(coupleId, openid, id) {
  if (_local) {
    return withLocal(coupleId, (c) => {
      const role = roleIn(c, openid);
      c.notes = (c.notes || []).map((n) => (n.id === id ? Object.assign({}, n, { read: true }) : n));
      return { notes: notesView(c, role) };
    });
  }
  return callFn('planet', { action: 'noteRead', coupleId, id });
}

function getTree(coupleId, openid) {
  if (_local) {
    return Promise.resolve().then(() => {
      const store = readLocal();
      const c = store.couples[coupleId];
      if (!c) {
        throw new Error('还没加入星球');
      }
      return treeView(c);
    });
  }
  return callFn('planet', { action: 'overview', coupleId }).then((o) => o.tree);
}

/** 浇水：每人每天一次，两个人都浇了树才长一级 */
function waterTree(coupleId, openid) {
  if (_local) {
    return withLocal(coupleId, (c) => {
      const role = roleIn(c, openid);
      const day = dailyBook.todayKey();
      const t = Object.assign({
        level: 1, aDay: '', bDay: '', total: 0,
      }, c.tree || {});
      if ((t.level || 1) >= MAX_TREE_LEVEL) {
        throw new Error('树已经长到最高啦');
      }
      if (t[role + 'Day'] === day) {
        throw new Error('今天浇过了，明天再来');
      }
      t[role + 'Day'] = day;
      t.total = (t.total || 0) + 1;
      let bonus = 0;
      let leveled = false;
      if (t.aDay === day && t.bDay === day) {
        t.level = (t.level || 1) + 1;
        t.aDay = '';
        t.bDay = '';
        bonus = TREE_BONUS;
        leveled = true;
      }
      c.tree = t;
      if (bonus) {
        c.coins = (c.coins || 0) + bonus;
      }
      if (leveled) {
        pushLocalEvent(c, 'tree', `你们一起把树养到了第 ${t.level} 级`);
      }
      return {
        tree: treeView(c), leveled, bonus, coins: c.coins || 0,
      };
    });
  }
  return callFn('planet', { action: 'treeWater', coupleId });
}

function listBucket(coupleId, openid) {
  if (_local) {
    return Promise.resolve().then(() => {
      const store = readLocal();
      const c = store.couples[coupleId];
      if (!c) {
        throw new Error('还没加入星球');
      }
      return bucketView(c);
    });
  }
  return callFn('planet', { action: 'overview', coupleId }).then((o) => o.bucket);
}

function toggleBucket(coupleId, openid, itemId) {
  if (_local) {
    return withLocal(coupleId, (c) => {
      const id = String(itemId || '');
      // b = 官方清单，c = 自己加的
      if (!/^[bc]\d{1,3}$/.test(id)) {
        throw new Error('没有这一件');
      }
      const map = Object.assign({}, c.bucket || {});
      let done = false;
      if (map[id]) {
        delete map[id];
      } else {
        map[id] = { by: roleIn(c, openid), at: Date.now() };
        done = true;
      }
      c.bucket = map;
      if (done) {
        const n = Object.keys(map).length;
        if (n === 1 || n === 10 || n === 50 || n === 100) {
          pushLocalEvent(c, 'bucket-' + n, `一起做的事打钩到第 ${n} 件`, true);
        }
      }
      return { bucket: bucketView(c), done };
    });
  }
  return callFn('planet', { action: 'bucketToggle', coupleId, itemId });
}

/** 自己加一件想一起做的事（最多 20 条） */
function addBucketItem(coupleId, openid, text) {
  if (_local) {
    return withLocal(coupleId, (c) => {
      const t = String(text || '').trim().slice(0, 24);
      if (!t) {
        throw new Error('写一件想一起做的事');
      }
      c.bucketCustom = c.bucketCustom || [];
      if (c.bucketCustom.length >= 20) {
        throw new Error('自己加的够多了，最多 20 件');
      }
      let max = 0;
      for (let i = 0; i < c.bucketCustom.length; i++) {
        const n = Number(String(c.bucketCustom[i].id).slice(1)) || 0;
        if (n > max) {
          max = n;
        }
      }
      const item = {
        id: 'c' + (max + 1),
        t,
        by: roleIn(c, openid),
        at: Date.now(),
      };
      c.bucketCustom.push(item);
      pushLocalEvent(c, 'bucket-custom', '清单里多了一件你们自己的事', true);
      return { bucket: bucketView(c), item };
    });
  }
  return callFn('planet', { action: 'bucketAdd', coupleId, text });
}

/** 删掉自己加的一件（同时清掉它的打钩记录） */
function delBucketItem(coupleId, openid, itemId) {
  if (_local) {
    return withLocal(coupleId, (c) => {
      c.bucketCustom = (c.bucketCustom || []).filter((x) => x.id !== itemId);
      const map = Object.assign({}, c.bucket || {});
      delete map[itemId];
      c.bucket = map;
      return { bucket: bucketView(c) };
    });
  }
  return callFn('planet', { action: 'bucketDel', coupleId, itemId });
}

// ---------------------------------------------------------------- 自己出题
//
// 不替代那 60 道正式题，是两个人互相出题。
// 单独算一套「猜中率」，不进默契榜——自己写的题不该影响排名。

const MAX_QUIZ_CUSTOM = 20;

function quizCustomView(c, role) {
  const ta = role === 'a' ? 'b' : 'a';
  const src = (c.quizzes || []).slice().reverse();
  const list = [];
  let both = 0;
  let hit = 0;
  let waitMe = 0;
  for (let i = 0; i < src.length; i++) {
    const q = src[i];
    const ans = q.answers || {};
    const a = ans[role];
    const b = ans[ta];
    const answered = a !== undefined && a !== null;
    const paired = answered && b !== undefined && b !== null;
    if (paired) {
      both++;
      if (a === b) {
        hit++;
      }
    }
    if (!answered) {
      waitMe++;
    }
    list.push({
      id: q.id,
      text: q.text,
      options: q.options,
      byMe: q.by === role,
      byText: q.by === role ? '你' : 'TA',
      mine: answered ? a : -1,
      ta: paired ? b : -1,
      answered,
      both: paired,
      same: paired ? a === b : false,
      state: !answered ? 'need' : (paired ? (a === b ? 'same' : 'diff') : 'wait'),
    });
  }
  return {
    list, total: src.length, both, hit, waitMe, max: MAX_QUIZ_CUSTOM,
  };
}

function quizCustomList(coupleId, openid) {
  if (_local) {
    return Promise.resolve().then(() => {
      const store = readLocal();
      const c = store.couples[coupleId];
      if (!c) {
        throw new Error('还没加入星球');
      }
      // 和增删改保持同一个形状：调用方永远读 res.list
      return { list: quizCustomView(c, roleIn(c, openid)) };
    });
  }
  return callFn('planet', { action: 'quizList', coupleId });
}

/** 出一道题：写题干 + 选项，顺手把「我的答案」也记下 */
function quizCustomAdd(coupleId, openid, text, options, choice) {
  if (_local) {
    return withLocal(coupleId, (c) => {
      const role = roleIn(c, openid);
      const t = String(text || '').trim().slice(0, 40);
      if (!t) {
        throw new Error('把题写出来');
      }
      const opts = [];
      const src = options || [];
      for (let i = 0; i < src.length; i++) {
        const v = String(src[i] || '').trim().slice(0, 20);
        if (v) {
          opts.push(v);
        }
      }
      if (opts.length < 2) {
        throw new Error('至少写两个选项');
      }
      const n = Number(choice);
      if (!(n >= 0 && n < opts.length)) {
        throw new Error('先选一个你的答案');
      }
      c.quizzes = c.quizzes || [];
      if (c.quizzes.length >= MAX_QUIZ_CUSTOM) {
        throw new Error('出的题够多了，先删几道');
      }
      let max = 0;
      for (let i = 0; i < c.quizzes.length; i++) {
        const v = Number(String(c.quizzes[i].id).slice(1)) || 0;
        if (v > max) {
          max = v;
        }
      }
      const q = {
        id: 'q' + (max + 1),
        text: t,
        options: opts,
        by: role,
        answers: {},
        at: Date.now(),
      };
      q.answers[role] = n;
      c.quizzes.push(q);
      pushLocalEvent(c, 'quiz-custom', '有人出了一道只有你们俩懂的题', true);
      return { list: quizCustomView(c, role), item: { id: q.id } };
    });
  }
  return callFn('planet', {
    action: 'quizAdd', coupleId, text, options, choice,
  });
}

/** 答 TA 出的题 */
function quizCustomAnswer(coupleId, openid, id, choice) {
  if (_local) {
    return withLocal(coupleId, (c) => {
      const role = roleIn(c, openid);
      const q = (c.quizzes || []).filter((x) => x.id === id)[0];
      if (!q) {
        throw new Error('没有这道题');
      }
      const n = Number(choice);
      if (!(n >= 0 && n < q.options.length)) {
        throw new Error('选项不对');
      }
      const ans = Object.assign({}, q.answers || {});
      if (ans[role] !== undefined && ans[role] !== null) {
        throw new Error('这道题你已经答过了');
      }
      ans[role] = n;
      q.answers = ans;
      const ta = role === 'a' ? 'b' : 'a';
      if (ans[ta] !== undefined && ans[ta] !== null) {
        pushLocalEvent(c, 'quiz-custom-result', ans[ta] === n ? '自定义题：你们想到一块去了' : '自定义题：想法不太一样', true);
      }
      return { list: quizCustomView(c, role) };
    });
  }
  return callFn('planet', {
    action: 'quizAnswer', coupleId, id, choice,
  });
}

/** 删掉自己出的题 */
function quizCustomDel(coupleId, openid, id) {
  if (_local) {
    return withLocal(coupleId, (c) => {
      const role = roleIn(c, openid);
      const q = (c.quizzes || []).filter((x) => x.id === id)[0];
      if (!q) {
        throw new Error('没有这道题');
      }
      if (q.by !== role) {
        throw new Error('只能删自己出的题');
      }
      c.quizzes = c.quizzes.filter((x) => x.id !== id);
      return { list: quizCustomView(c, role) };
    });
  }
  return callFn('planet', { action: 'quizDel', coupleId, id });
}

// 联机对战必须有云端，本地模式做不了「两台手机同一个房间」
function roomCreate(coupleId) {
  if (_local) {
    return Promise.reject(new Error('联机要联网才能用'));
  }
  return callFn('planet', { action: 'roomCreate', coupleId });
}

function roomJoin(coupleId, code) {
  if (_local) {
    return Promise.reject(new Error('联机要联网才能用'));
  }
  return callFn('planet', { action: 'roomJoin', coupleId, code });
}

function roomState(coupleId, code) {
  if (_local) {
    return Promise.reject(new Error('联机要联网才能用'));
  }
  return callFn('planet', { action: 'roomState', coupleId, code });
}

function roomMove(coupleId, code, x, y) {
  if (_local) {
    return Promise.reject(new Error('联机要联网才能用'));
  }
  return callFn('planet', {
    action: 'roomMove', coupleId, code, x, y,
  });
}

module.exports = {
  init,
  isLocal,
  login,
  loadUser,
  createCouple,
  joinCouple,
  unbindCouple,
  updateProfile,
  mockPartnerJoin,
  getFarm,
  plant,
  harvest,
  steal,
  buyGuard,
  usePerk,
  addCoins,
  rankTop,
  rankSubmit,
  rankSetOnBoard,
  reportDevice,
  mockSteal,
  mockPartnerPlant,
  quizCurrent,
  quizSubmit,
  quizResult,
  quizRestart,
  quizMockPartner,
  // 关系类功能
  planetOverview,
  setNick,
  addDate,
  delDate,
  setDateMode,
  getDaily,
  answerDaily,
  mockDailyPartner,
  listEvents,
  pushEvent,
  listNotes,
  leaveNote,
  readNote,
  getTree,
  waterTree,
  listBucket,
  toggleBucket,
  addBucketItem,
  delBucketItem,
  quizCustomList,
  quizCustomAdd,
  quizCustomAnswer,
  quizCustomDel,
  roomCreate,
  roomJoin,
  roomState,
  roomMove,
};
