const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const cfg = require('./crops.js');

/**
 * 农场：查看 / 播种 / 收获 / 偷菜
 * 所有时间与收益判定都在服务端完成，前端只负责展示。
 */
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  try {
    const c = await getCouple(OPENID);
    if (!c) {
      return fail('还没加入星球');
    }
    const role = c.members[0] === OPENID ? 'a' : 'b';
    if (event.action === 'list') {
      return ok(await list(c, OPENID));
    }
    if (event.action === 'plant') {
      return ok(await plant(c, role, event.slot, event.cropId));
    }
    if (event.action === 'harvest') {
      return ok(await harvest(c, role, event.slot));
    }
    if (event.action === 'steal') {
      return ok(await steal(c, role, OPENID, event.slot));
    }
    if (event.action === 'reward') {
      return ok(await reward(c, event.game, event.amount));
    }
    if (event.action === 'buyGuard') {
      return ok(await buyGuard(c, event.guardId));
    }
    if (event.action === 'usePerk') {
      return ok(await usePerk(c, event.type));
    }
    return fail('unknown action');
  } catch (e) {
    return fail(e.message || 'server error');
  }
};

function ok(data) {
  return { ok: true, data };
}

function fail(err) {
  return { ok: false, err };
}

async function getCouple(openid) {
  const res = await db.collection('couple').where({ members: openid }).limit(1).get();
  return res.data[0] || null;
}

async function getFarm(coupleId) {
  const res = await db.collection('farm').where({ coupleId }).limit(1).get();
  if (res.data[0]) {
    return res.data[0];
  }
  const plots = [];
  for (let i = 0; i < cfg.PLOT_COUNT; i++) {
    plots.push(null);
  }
  const add = await db.collection('farm').add({ data: { coupleId, plots } });
  return { _id: add._id, coupleId, plots };
}

async function list(c, openid) {
  const farm = await getFarm(c._id);
  const now = Date.now();
  const exp = c.exp || 0;
  const level = cfg.levelOf(exp);
  const me = await getUser(openid);
  return {
    serverTime: now,
    level,
    exp,
    expToNext: nextExp(exp),
    coins: c.coins || 0,
    myCoins: me.coins || 0,
    credit: c.credit === undefined ? 0 : c.credit,
    perks: c.perks || {},
    guards: cfg.guardView(c.guards),
    lastSteal: (c.stealLog && c.stealLog[0]) || null,
    unlocked: cfg.unlockedPlots(level),
    isNight: cfg.isNight(now),
    plots: (farm.plots || []).map((p) => view(p, now)),
  };
}

async function plant(c, role, slot, cropId) {
  const crop = cfg.getCrop(cropId);
  if (!crop) {
    throw new Error('没有这种种子');
  }
  const level = cfg.levelOf(c.exp || 0);
  if (level < crop.level) {
    throw new Error('星球等级不够');
  }
  if (slot < 0 || slot >= cfg.unlockedPlots(level)) {
    throw new Error('这块地还没开垦');
  }
  const farm = await getFarm(c._id);
  const plots = (farm.plots || []).slice();
  while (plots.length < cfg.PLOT_COUNT) {
    plots.push(null);
  }
  if (plots[slot]) {
    throw new Error('这块地已经种了东西');
  }
  plots[slot] = {
    cropId,
    plantedAt: Date.now(),
    matureMs: crop.matureMs,
    by: role,
    stolen: 0,
    stolenBy: '',
  };
  await db.collection('farm').doc(farm._id).update({ data: { plots } });
  return { slot, plots: plots.map((p) => view(p, Date.now())) };
}

async function harvest(c, role, slot) {
  const farm = await getFarm(c._id);
  const plots = (farm.plots || []).slice();
  const p = plots[slot];
  if (!p) {
    throw new Error('这块地是空的');
  }
  const now = Date.now();
  if (p.plantedAt + p.matureMs > now) {
    throw new Error('还没成熟');
  }
  const crop = cfg.getCrop(p.cropId);
  let value = crop.price;
  if (crop.night && cfg.isNight(now)) {
    value = Math.round(value * (1 + cfg.NIGHT_BONUS));
  }
  let gain = Math.round(value * (1 - (p.stolen || 0)));

  // 作物不只是装饰（文档 3.2）：草莓给情话次数，猫草抽小惊喜，纪念树按天数加码
  const days = c.sinceAt ? Math.floor((now - c.sinceAt) / 86400000) : 0;
  const perk = cfg.perkOf(p.cropId, days);
  const perks = Object.assign({}, c.perks || {});
  if (perk) {
    if (perk.type === 'lovewords') {
      perks.lovewords = (perks.lovewords || 0) + perk.amount;
    } else {
      gain += perk.amount;
    }
  }

  plots[slot] = null;
  const exp = (c.exp || 0) + Math.round(crop.price / 10);
  await db.collection('farm').doc(farm._id).update({ data: { plots } });
  await db.collection('couple').doc(c._id).update({
    data: { coins: _.inc(gain), exp, perks },
  });
  return {
    gain,
    perk,
    perks,
    night: crop.night && cfg.isNight(now),
    exp,
    coins: (c.coins || 0) + gain,
    plots: plots.map((pp) => view(pp, Date.now())),
  };
}

/** 用掉一次情话次数（次数是收草莓攒出来的） */
async function usePerk(c, type) {
  const perks = Object.assign({}, c.perks || {});
  if ((perks[type] || 0) <= 0) {
    throw new Error('没有次数了');
  }
  perks[type] -= 1;
  await db.collection('couple').doc(c._id).update({ data: { perks } });
  return { perks, left: perks[type] };
}

/** 风险留痕，写不进去也不该影响主流程 */
function logRisk(coupleId, type, note) {
  return db.collection('risk_log').add({
    data: { coupleId, type, note, at: Date.now() },
  }).catch(() => null);
}

/**
 * 拦「开小号自偷」（文档 8.1）。
 * 一个人开两个微信，自己种自己偷就能无限刷币。
 * 两端设备指纹一样基本就是同一个人，直接拦掉并留痕。
 */
async function guardSelfSteal(c, openid) {
  if (!c.members || c.members.length < 2) {
    return;
  }
  const us = await db.collection('wx_user').where({ openid: _.in(c.members) }).get();
  const dev = {};
  for (let i = 0; i < us.data.length; i++) {
    dev[us.data[i].openid] = us.data[i].deviceId || '';
  }
  const mine = dev[openid] || '';
  const otherId = c.members[0] === openid ? c.members[1] : c.members[0];
  const other = dev[otherId] || '';
  if (mine && mine === other) {
    await logRisk(c._id, 'self_steal', '两端设备指纹相同，拦了一次偷菜');
    throw new Error('这两块地像是同一个人，偷不了');
  }
}

async function steal(c, role, openid, slot) {
  const farm = await getFarm(c._id);
  const plots = (farm.plots || []).slice();
  const p = plots[slot];
  if (!p) {
    throw new Error('这块地是空的');
  }
  if (p.by === role) {
    throw new Error('不能偷自己种的');
  }
  await guardSelfSteal(c, openid);
  const now = Date.now();
  if (p.plantedAt + p.matureMs > now) {
    throw new Error('还没成熟，偷不了');
  }
  if ((p.stolen || 0) > 0) {
    throw new Error('这个已经被偷过了');
  }
  const crop = cfg.getCrop(p.cropId);
  const guards = Object.assign({}, c.guards || {});

  // 篱笆：直接挡掉这一次，消耗一道
  if ((guards.fence || 0) > 0) {
    guards.fence -= 1;
    await db.collection('couple').doc(c._id).update({ data: { guards } });
    return {
      amount: 0, rate: 0, blocked: 'fence',
      guards: cfg.guardView(guards),
      plots: plots.map((pp) => view(pp, Date.now())),
    };
  }

  let rate = cfg.STEAL_MIN + Math.random() * cfg.STEAL_RANGE;
  let shielded = false;
  if ((guards.cat || 0) > now) {
    rate *= 0.5;
    shielded = true;
  }
  const amount = Math.round(crop.price * rate);
  plots[slot].stolen = rate;
  plots[slot].stolenBy = role;
  await db.collection('farm').doc(farm._id).update({ data: { plots } });
  await db.collection('wx_user').where({ openid }).update({
    data: { coins: _.inc(amount) },
  });

  // 闹钟：记一笔，回来能看见是谁摸的
  let lastSteal = null;
  if (guards.alarm) {
    // who = 下手的人，victim = 被偷的那块地的主人
    lastSteal = { at: now, who: role, victim: p.by, crop: crop.name, amount };
    await db.collection('couple').doc(c._id).update({
      data: { stealLog: _.unshift([lastSteal]) },
    });
  }
  return {
    amount,
    rate,
    shielded,
    alarmed: !!guards.alarm,
    lastSteal,
    guards: cfg.guardView(guards),
    plots: plots.map((pp) => view(pp, Date.now())),
  };
}

/** 买防偷道具，扣星球爱心币 */
async function buyGuard(c, guardId) {
  const g = cfg.getGuard(guardId);
  if (!g) {
    throw new Error('没有这个道具');
  }
  if ((c.coins || 0) < g.price) {
    throw new Error('爱心币不够，还差 ' + (g.price - (c.coins || 0)));
  }
  const guards = Object.assign({}, c.guards || {});
  const now = Date.now();
  if (guardId === 'cat') {
    const base = (guards.cat || 0) > now ? guards.cat : now;
    guards.cat = base + 24 * 3600 * 1000;
  } else if (guardId === 'fence') {
    guards.fence = (guards.fence || 0) + 1;
  } else if (guardId === 'alarm') {
    guards.alarm = true;
  }
  await db.collection('couple').doc(c._id).update({
    data: { coins: _.inc(-g.price), guards },
  });
  return {
    coins: (c.coins || 0) - g.price,
    guards: cfg.guardView(guards),
    bought: guardId,
  };
}

/**
 * 小游戏结算奖励：把成绩换成爱心币。
 * 每个游戏有单次上限，且每天最多领 DAILY_LIMIT 次，防止反复刷。
 */
const REWARD_CAP = {
  gobang: 40,
  drawguess: 40,
  puzzle: 40,
  tapheart: 40,
  story: 30,
};
const DAILY_LIMIT = 3;

async function reward(c, game, amount) {
  const cap = REWARD_CAP[game];
  if (!cap) {
    throw new Error('这个游戏没有奖励');
  }
  const day = dayKey();
  const log = c.rewards || {};
  const today = Object.assign({}, log[day]);
  const used = today[game] || 0;
  if (used >= DAILY_LIMIT) {
    return { coins: c.coins || 0, gain: 0, limited: true, left: 0 };
  }
  const gain = Math.max(0, Math.min(cap, Math.round(amount || 0)));
  today[game] = used + 1;
  log[day] = today;
  await db.collection('couple').doc(c._id).update({
    data: { coins: _.inc(gain), rewards: log },
  });
  return {
    coins: (c.coins || 0) + gain,
    gain,
    limited: false,
    left: DAILY_LIMIT - used - 1,
  };
}

/** 北京时间自然日，用来做每日限次 */
function dayKey() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

async function getUser(openid) {
  const res = await db.collection('wx_user').where({ openid }).limit(1).get();
  if (res.data[0]) {
    return res.data[0];
  }
  const add = await db.collection('wx_user').add({
    data: { openid, nickName: '', avatarUrl: '', coins: 0, createdAt: Date.now() },
  });
  return { _id: add._id, openid, coins: 0 };
}

function view(p, now) {
  if (!p) {
    return null;
  }
  const crop = cfg.getCrop(p.cropId);
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

function nextExp(exp) {
  const lv = cfg.levelOf(exp);
  for (let i = 0; i < cfg.LEVELS.length; i++) {
    if (cfg.LEVELS[i].level === lv + 1) {
      return cfg.LEVELS[i].exp - exp;
    }
  }
  return 0;
}
