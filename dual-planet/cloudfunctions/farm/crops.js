/**
 * 作物配置（云函数自包含副本，必须与 miniprogram/data/crops.js 保持一致）
 * 服务端校验依赖这张表，前端传来的价格一律不信任。
 */

const NIGHT_BONUS = 0.3;
const STEAL_MIN = 0.1;
const STEAL_RANGE = 0.2;
const MAX_STEAL = 1;
const PLOT_COUNT = 6;

const CROPS = [
  { id: 'catnip', name: '猫草', matureMs: 5 * 60 * 1000, price: 10, level: 1, night: false, perk: 'gacha' },
  { id: 'clover', name: '四叶草', matureMs: 15 * 60 * 1000, price: 35, level: 1, night: false },
  { id: 'sunflower', name: '向日葵', matureMs: 30 * 60 * 1000, price: 80, level: 1, night: false },
  { id: 'strawberry', name: '草莓', matureMs: 60 * 60 * 1000, price: 180, level: 1, night: false, perk: 'lovewords' },
  { id: 'starfruit', name: '星星果', matureMs: 2 * 60 * 60 * 1000, price: 400, level: 2, night: true },
  { id: 'moonflower', name: '月亮花', matureMs: 3 * 60 * 60 * 1000, price: 700, level: 2, night: true },
  { id: 'lovefruit', name: '爱心果', matureMs: 4 * 60 * 60 * 1000, price: 1000, level: 3, night: false },
  { id: 'rainbow', name: '彩虹花', matureMs: 6 * 60 * 60 * 1000, price: 1800, level: 3, night: false },
  { id: 'coupletree', name: '情侣树', matureMs: 8 * 60 * 60 * 1000, price: 3000, level: 4, night: false },
  { id: 'memorial', name: '纪念树', matureMs: 24 * 60 * 60 * 1000, price: 12000, level: 5, night: false, perk: 'anniversary' },
];

/**
 * 作物不只是装饰（文档 3.2）：
 * 草莓换情话次数、猫草抽个小惊喜、纪念树随在一起的天数加码。
 * 猫草那个是白给的，不花钱抽，避开「赌博扭蛋」那条线（文档 8.2）。
 */
const PERKS = {
  lovewords: { name: '情话次数', icon: '💌' },
  gacha: { name: '小惊喜', icon: '🎁' },
  anniversary: { name: '纪念日加成', icon: '🌳' },
};

/** 收获时的附带产出，没有就返回 null。猫草是随机的 */
function perkOf(cropId, days) {
  const c = getCrop(cropId);
  if (!c || !c.perk) {
    return null;
  }
  if (c.perk === 'lovewords') {
    return { type: 'lovewords', amount: 1, text: '情话 ×1' };
  }
  if (c.perk === 'anniversary') {
    const d = days || 0;
    const bonus = Math.min(120, Math.floor(d / 10) * 10);
    return {
      type: 'anniversary',
      amount: bonus,
      text: bonus > 0 ? `在一起 ${d} 天，多给 ${bonus} 币` : `在一起 ${d} 天，纪念树收好了`,
    };
  }
  if (c.perk === 'gacha') {
    const r = Math.random();
    if (r < 0.6) {
      const n = 10 + Math.floor(Math.random() * 21);
      return { type: 'gacha', amount: n, text: `小惊喜 +${n} 币` };
    }
    if (r < 0.9) {
      return { type: 'lovewords', amount: 1, text: '小惊喜：情话 ×1' };
    }
    return { type: 'gacha', amount: 0, text: '小惊喜：这次是空的' };
  }
  return null;
}

const LEVELS = [
  { level: 1, exp: 0 },
  { level: 2, exp: 100 },
  { level: 3, exp: 400 },
  { level: 4, exp: 1200 },
  { level: 5, exp: 3000 },
  { level: 6, exp: 8000 },
];

/** 防偷道具：与小程序 data/crops.js 保持一致 */
const GUARDS = [
  { id: 'cat', name: '看门猫', icon: '🐱', price: 200, desc: '24 小时里被偷只损失一半' },
  { id: 'fence', name: '篱笆', icon: '🚧', price: 150, desc: '挡掉下一次偷取，用完就没' },
  { id: 'alarm', name: '闹钟', icon: '⏰', price: 100, desc: '被偷时记一笔，谁偷的一眼看到' },
];

function getGuard(id) {
  for (let i = 0; i < GUARDS.length; i++) {
    if (GUARDS[i].id === id) {
      return GUARDS[i];
    }
  }
  return null;
}

function guardView(g) {
  const now = Date.now();
  const raw = g || {};
  return {
    cat: (raw.cat || 0) > now ? raw.cat : 0,
    catLeft: Math.max(0, (raw.cat || 0) - now),
    fence: raw.fence || 0,
    alarm: !!raw.alarm,
  };
}

function getCrop(id) {
  for (let i = 0; i < CROPS.length; i++) {
    if (CROPS[i].id === id) {
      return CROPS[i];
    }
  }
  return null;
}

function levelOf(exp) {
  let lv = 1;
  for (let i = 0; i < LEVELS.length; i++) {
    if (exp >= LEVELS[i].exp) {
      lv = LEVELS[i].level;
    }
  }
  return lv;
}

function unlockedPlots(level) {
  if (level >= 5) {
    return 6;
  }
  if (level >= 3) {
    return 5;
  }
  return 4;
}

function isNight(now) {
  const h = (new Date(now).getUTCHours() + 8) % 24;
  return h >= 18 || h < 6;
}

module.exports = {
  CROPS,
  LEVELS,
  GUARDS,
  PERKS,
  perkOf,
  getGuard,
  guardView,
  NIGHT_BONUS,
  STEAL_MIN,
  STEAL_RANGE,
  MAX_STEAL,
  PLOT_COUNT,
  getCrop,
  levelOf,
  unlockedPlots,
  isNight,
};
