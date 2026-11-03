const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const rankRule = require('./rank.js');

/** 可信分低于这个数就上不了榜（文档 4.4） */
const CREDIT_MIN = 60;

/**
 * 默契榜
 *
 * 分数一律从 quiz_result 里读，不接受前端传分数，
 * 免得有人给自己打 100 分混上第一。
 * 榜上只放脱敏后的昵称，不放头像和 openid。
 */
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  try {
    const c = await getCouple(OPENID);
    if (!c) {
      return fail('还没加入星球');
    }
    if (event.action === 'top') {
      return ok(await top(c));
    }
    if (event.action === 'submit') {
      return ok(await submit(c));
    }
    if (event.action === 'setOnBoard') {
      return ok(await setOnBoard(c, event.on));
    }
    return fail('unknown action');
  } catch (e) {
    return fail(e.message || 'server error');
  }
};

function ok(data) {
  return { ok: true, data };
}

function fail(msg) {
  // 前端 db.js 读的是 err，两个都给
  return { ok: false, err: msg, error: msg };
}

async function getCouple(openid) {
  const res = await db.collection('couple').where({ members: openid }).limit(1).get();
  return res.data[0] || null;
}

/** 取最新一次答完的问卷 */
async function latestScore(coupleId) {
  const res = await db.collection('quiz_result')
    .where({ coupleId })
    .orderBy('at', 'desc')
    .limit(1)
    .get();
  return res.data[0] || null;
}

function daysOf(c) {
  return c.sinceAt ? Math.floor((Date.now() - c.sinceAt) / 86400000) : 0;
}

/** 把最新成绩写进榜（已经在榜上就更新） */
async function submit(c) {
  // 文档 4.4：可信分低于阈值不进正式榜
  const credit = c.credit === undefined ? 0 : c.credit;
  if (credit < CREDIT_MIN) {
    throw new Error('可信分不够，暂时上不了榜');
  }
  const r = await latestScore(c._id);
  if (!r) {
    throw new Error('还没有答完的问卷');
  }
  const days = daysOf(c);
  let title = rankRule.titleOf(r.score, days);
  // 完全没踩过风险项才给这个（不做海王标签，只给自己贴）
  if (credit >= 100) {
    title += ' · 专一 CP';
  }
  const item = {
    coupleId: c._id,
    score: r.score,
    title,
    names: [rankRule.mask(c.aName), rankRule.mask(c.bName)],
    days,
    at: Date.now(),
  };
  const exist = await db.collection('leaderboard')
    .where({ coupleId: c._id })
    .limit(1)
    .get();
  if (exist.data.length) {
    await db.collection('leaderboard').doc(exist.data[0]._id).update({ data: item });
  } else {
    await db.collection('leaderboard').add({ data: item });
  }
  return { score: item.score, title: item.title, days };
}

/** 取榜单前 50，顺带算出自己的名次 */
async function top(c) {
  const res = await db.collection('leaderboard')
    .orderBy('score', 'desc')
    .limit(50)
    .get();
  const list = res.data.map((x, i) => ({
    rank: i + 1,
    score: x.score,
    title: x.title,
    names: x.names || [],
    days: x.days || 0,
    mine: x.coupleId === c._id,
  }));
  const total = await db.collection('leaderboard').count();

  let mine = null;
  for (let i = 0; i < list.length; i++) {
    if (list[i].mine) {
      mine = list[i];
      break;
    }
  }
  // 没排进前 50 就单独数一下前面有多少对
  if (!mine) {
    const r = await latestScore(c._id);
    if (r) {
      const days = daysOf(c);
      const better = await db.collection('leaderboard')
        .where({ score: _.gt(r.score) })
        .count();
      mine = {
        rank: better.total + 1,
        score: r.score,
        title: rankRule.titleOf(r.score, days),
        names: [rankRule.mask(c.aName), rankRule.mask(c.bName)],
        days,
        mine: true,
      };
    }
  }

  let beat = -1;
  if (mine && total.total > 1) {
    beat = Math.max(0, Math.round((1 - (mine.rank - 1) / total.total) * 100));
  }
  const credit = c.credit === undefined ? 0 : c.credit;
  return {
    list,
    mine,
    total: total.total,
    beat,
    onBoard: c.onBoard !== false,
    credit,
    flags: c.flags || [],
    canBoard: credit >= CREDIT_MIN,
  };
}

/** 关掉上榜：立刻从榜上撤下来 */
async function setOnBoard(c, on) {
  const want = !!on;
  await db.collection('couple').doc(c._id).update({ data: { onBoard: want } });
  if (!want) {
    const exist = await db.collection('leaderboard')
      .where({ coupleId: c._id })
      .limit(1)
      .get();
    if (exist.data.length) {
      await db.collection('leaderboard').doc(exist.data[0]._id).remove();
    }
  }
  return { onBoard: want };
}
