/**
 * 榜单相关的纯逻辑：称号与昵称脱敏。
 * 云端 cloudfunctions/leaderboard/rank.js 与这里是同一份，改的时候两边一起改。
 */

/** 昵称脱敏：小舟 -> 小*，Alexander -> A*** */
function mask(name) {
  const s = String(name || '');
  if (!s) {
    return 'TA';
  }
  if (s.length === 1) {
    return s;
  }
  let stars = '';
  const n = Math.min(3, s.length - 1);
  for (let i = 0; i < n; i++) {
    stars += '*';
  }
  return s.slice(0, 1) + stars;
}

/** 称号：分数为主，在一起够久再加个后缀 */
function titleOf(score, days) {
  let t = '刚认识';
  if (score >= 90) {
    t = '心有灵犀';
  } else if (score >= 80) {
    t = '默契十足';
  } else if (score >= 70) {
    t = '挺合拍';
  } else if (score >= 60) {
    t = '还在磨合';
  } else {
    t = '各玩各的';
  }
  if (days >= 365) {
    t += ' · 长情';
  } else if (days >= 100) {
    t += ' · 稳定';
  }
  return t;
}

module.exports = { mask, titleOf };
