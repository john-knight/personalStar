/**
 * 作物配置表
 * 设计原则：
 * 1. 成熟时间越长，单位时间收益越高（鼓励睡前种长周期作物）
 * 2. 高等级作物需要星球等级解锁，构成成长线
 * 3. 夜间（18:00-06:00）收获的作物有额外加成，制造"守夜"动机
 */

/** 夜间收益加成 30% */
const NIGHT_BONUS = 0.3;
/** 每次偷取的比例区间 10%~30% */
const STEAL_MIN = 0.1;
const STEAL_RANGE = 0.2;
/** 一块地最多被偷 1 次 */
const MAX_STEAL = 1;

const CROPS = [
  // 速生档：在线时反复种，周转快
  { id: 'catnip', name: '猫草', icon: '🍃', matureMs: 5 * 60 * 1000, price: 10, level: 1, night: false, color: '#8FD14F', perk: 'gacha' },
  { id: 'clover', name: '四叶草', icon: '🍀', matureMs: 15 * 60 * 1000, price: 35, level: 1, night: false, color: '#5FC27E' },
  { id: 'sunflower', name: '向日葵', icon: '🌻', matureMs: 30 * 60 * 1000, price: 80, level: 1, night: false, color: '#F5C518' },
  // 日常档：几小时，白天种晚上收
  { id: 'strawberry', name: '草莓', icon: '🍓', matureMs: 60 * 60 * 1000, price: 180, level: 1, night: false, color: '#F0658A', perk: 'lovewords' },
  { id: 'starfruit', name: '星星果', icon: '⭐', matureMs: 2 * 60 * 60 * 1000, price: 400, level: 2, night: true, color: '#FFD35C' },
  { id: 'moonflower', name: '月亮花', icon: '🌙', matureMs: 3 * 60 * 60 * 1000, price: 700, level: 2, night: true, color: '#A9B8F5' },
  // 稀有档
  { id: 'lovefruit', name: '爱心果', icon: '💗', matureMs: 4 * 60 * 60 * 1000, price: 1000, level: 3, night: false, color: '#FF8FA8' },
  { id: 'rainbow', name: '彩虹花', icon: '🌈', matureMs: 6 * 60 * 60 * 1000, price: 1800, level: 3, night: false, color: '#7C6BF5' },
  // 长线档
  { id: 'coupletree', name: '情侣树', icon: '🌳', matureMs: 8 * 60 * 60 * 1000, price: 3000, level: 4, night: false, color: '#E86A8A' },
  { id: 'memorial', name: '纪念树', icon: '🌲', matureMs: 24 * 60 * 60 * 1000, price: 12000, level: 5, night: false, color: '#C79A5B', perk: 'anniversary' },
];

/**
 * 作物不只是装饰（文档 3.2）：
 * 草莓换情话次数、猫草抽个小惊喜、纪念树随在一起的天数加码。
 *
 * 猫草那个是白给的，不花钱抽，避开「赌博扭蛋」那条线（文档 8.2）。
 */
const PERKS = {
  lovewords: { name: '情话次数', icon: '💌' },
  gacha: { name: '小惊喜', icon: '🎁' },
  anniversary: { name: '纪念日加成', icon: '🌳' },
};

/**
 * 收获时这块地附带的额外产出，没有就返回 null。
 * 猫草是随机的，所以每次结果不一样。
 */
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

/**
 * 防偷道具
 * cat   看门猫：一段时间里被偷只损失一半
 * fence 篱笆：直接挡掉一次偷取，用完就没
 * alarm 闹钟：被偷时记一笔，回来一眼看到是谁摸走的
 */
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

/** 把存起来的道具状态换算成能直接展示的东西 */
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

/** 等级经验阈值（经验 = 收获作物售价 / 10） */
const LEVELS = [
  { level: 1, exp: 0 },
  { level: 2, exp: 100 },
  { level: 3, exp: 400 },
  { level: 4, exp: 1200 },
  { level: 5, exp: 3000 },
  { level: 6, exp: 8000 },
];

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

/** 下一级还差多少经验，已满级返回 0 */
function expToNext(exp) {
  const lv = levelOf(exp);
  for (let i = 0; i < LEVELS.length; i++) {
    if (LEVELS[i].level === lv + 1) {
      return LEVELS[i].exp - exp;
    }
  }
  return 0;
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

function formatDuration(ms) {
  if (ms <= 0) {
    return '可收获';
  }
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return h + '小时' + m + '分';
  }
  if (m > 0) {
    return m + '分' + s + '秒';
  }
  return s + '秒';
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
  getCrop,
  levelOf,
  expToNext,
  unlockedPlots,
  isNight,
  formatDuration,
};
