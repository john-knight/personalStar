const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const META = require('./meta.js');
const QUIZ = require('./quiz-data.js');

/** 默契问答：取题 / 提交 / 结果 / 重开 */
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  try {
    const c = await getCouple(OPENID);
    if (!c) {
      return fail('还没加入星球');
    }
    const role = c.members[0] === OPENID ? 'a' : 'b';
    if (event.action === 'current') {
      return ok(await current(c, role));
    }
    if (event.action === 'submit') {
      return ok(await submit(c, role, event.answers));
    }
    if (event.action === 'result') {
      return ok(await result(c));
    }
    if (event.action === 'restart') {
      return ok(await restart(c));
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

async function getRec(coupleId) {
  const res = await db.collection('quiz').where({ coupleId }).limit(1).get();
  if (res.data[0]) {
    return res.data[0];
  }
  const set = QUIZ.pickSet(3);
  const add = await db.collection('quiz').add({
    data: {
      coupleId,
      questions: set,
      answers: { a: null, b: null },
      status: 'answering',
      result: null,
      createdAt: Date.now(),
    },
  });
  return {
    _id: add._id,
    coupleId,
    questions: set,
    answers: { a: null, b: null },
    status: 'answering',
    result: null,
  };
}

async function current(c, role) {
  const rec = await getRec(c._id);
  const other = role === 'a' ? 'b' : 'a';
  const mine = rec.answers[role];
  return {
    questions: rec.questions,
    myAnswers: mine || [],
    partnerDone: !!(rec.answers[other] && rec.answers[other].length === rec.questions.length),
    myDone: !!(mine && mine.length === rec.questions.length),
    status: rec.status,
    result: rec.result,
  };
}

async function submit(c, role, answers) {
  if (!answers || !answers.length) {
    throw new Error('答案为空');
  }
  const rec = await getRec(c._id);
  if (answers.length !== rec.questions.length) {
    throw new Error('题目数量不对');
  }
  const other = role === 'a' ? 'b' : 'a';
  const update = { answers: {} };
  update.answers[role] = answers;
  const otherAns = rec.answers[other];

  let result = rec.result;
  let status = rec.status;
  if (otherAns && otherAns.length === rec.questions.length) {
    const a = role === 'a' ? answers : otherAns;
    const b = role === 'a' ? otherAns : answers;
    result = calc(rec.questions, a, b);
    status = 'done';
    await db.collection('quiz_result').add({
      data: { coupleId: c._id, score: result.score, createdAt: Date.now() },
    });
  }
  const data = { answers: update.answers };
  data.status = status;
  if (result) {
    data.result = result;
  }
  await db.collection('quiz').doc(rec._id).update({ data });
  return { waiting: status !== 'done', result, status };
}

async function result(c) {
  const rec = await getRec(c._id);
  if (rec.status !== 'done' || !rec.result) {
    return { ready: false };
  }
  const score = rec.result.score;
  const total = await db.collection('quiz_result').count();
  const below = await db.collection('quiz_result').where({ score: _.lt(score) }).count();
  const n = total.total || 0;
  return {
    ready: true,
    result: rec.result,
    samples: n,
    percent: n > 0 ? Math.round((below.total / n) * 100) : -1,
  };
}

async function restart(c) {
  const rec = await getRec(c._id);
  await db.collection('quiz').doc(rec._id).update({
    data: {
      questions: QUIZ.pickSet(3),
      answers: { a: null, b: null },
      status: 'answering',
      result: null,
    },
  });
  return { ok: true };
}

/** 归一化后逐题比较，按维度统计命中率 */
function calc(questions, ansA, ansB) {
  const total = {};
  const hit = {};
  let hitCount = 0;
  for (let i = 0; i < questions.length; i++) {
    const id = questions[i];
    const meta = META[id];
    if (!meta) {
      continue;
    }
    const na = normalize(id, ansA[i], 'a');
    const nb = normalize(id, ansB[i], 'b');
    const same = na === nb;
    if (same) {
      hitCount++;
    }
    if (!total[meta.dim]) {
      total[meta.dim] = 0;
      hit[meta.dim] = 0;
    }
    total[meta.dim]++;
    if (same) {
      hit[meta.dim]++;
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

/** 「我 / TA」型选项按角色换算成 a / b 再比较 */
function normalize(id, idx, role) {
  const meta = META[id];
  if (!meta || !meta.swap) {
    return 'n' + idx;
  }
  if (idx === 0) {
    return role === 'a' ? 'a' : 'b';
  }
  if (idx === 1) {
    return role === 'a' ? 'b' : 'a';
  }
  return 'n' + idx;
}
