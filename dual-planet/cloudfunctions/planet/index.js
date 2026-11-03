const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const dailyBook = require('./daily.js');

/** 时光轴最多留这么多条 */
const MAX_EVENTS = 200;
/** 纸条最多留这么多张 */
const MAX_NOTES = 50;
/** 纪念日最多 10 个 */
const MAX_DATES = 10;
/** 纸条埋下多久后才能被对方打开 */
const NOTE_DELAY = 30 * 60 * 1000;
/** 合养树：每升一级给多少爱心币 */
const TREE_BONUS = 30;
const MAX_TREE_LEVEL = 10;
/** 一起做的事总数（与 miniprogram/data/bucket.js 对齐） */
const TOTAL_BUCKET = 100;
const BOARD_N = 15;

/**
 * 星球里的「关系类」功能，都挂在这一个云函数上：
 * 每日一问 / 时光轴 / 纪念日 / 纸条 / 合养树 / 一起做的事 / 联机五子棋。
 *
 * 这么做是为了少建一堆云函数，部署一次就够。
 */
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  try {
    const c = await getCouple(OPENID);
    if (!c) {
      return fail('还没加入星球');
    }
    const role = c.members[0] === OPENID ? 'a' : 'b';
    switch (event.action) {
      case 'overview':
        return ok(await overview(c, role));
      case 'nick':
        return ok(await setNick(c, role, event.name));
      case 'dateAdd':
        return ok(await addDate(c, event));
      case 'dateDel':
        return ok(await delDate(c, event.id));
      case 'dateMode':
        return ok(await dateMode(c, event.id, event.mode));
      case 'daily':
        return ok(await daily(c, role));
      case 'dailyAnswer':
        return ok(await dailyAnswer(c, role, event));
      case 'events':
        return ok(await listEvents(c, event.limit));
      case 'eventPush':
        return ok(await pushEvent(c, event));
      case 'noteLeave':
        return ok(await leaveNote(c, role, event.text));
      case 'noteRead':
        return ok(await readNote(c, event.id));
      case 'treeWater':
        return ok(await waterTree(c, role));
      case 'bucketToggle':
        return ok(await toggleBucket(c, role, event.itemId));
      case 'bucketAdd':
        return ok(await bucketAdd(c, role, event.text));
      case 'bucketDel':
        return ok(await bucketDel(c, event.itemId));
      case 'quizList':
        return ok({ list: quizOf(c, role) });
      case 'quizAdd':
        return ok(await quizAdd(c, role, event));
      case 'quizAnswer':
        return ok(await quizAnswer(c, role, event.id, event.choice));
      case 'quizDel':
        return ok(await quizDel(c, role, event.id));
      case 'roomCreate':
        return ok(await roomCreate(c, role));
      case 'roomJoin':
        return ok(await roomJoin(c, role, event.code));
      case 'roomState':
        return ok(await roomState(event.code));
      case 'roomMove':
        return ok(await roomMove(c, role, event));
      default:
        return fail('unknown action');
    }
  } catch (e) {
    return fail(e.message || 'server error');
  }
};

function ok(data) {
  return { ok: true, data };
}

// 前端 db.js 读的是 err，两个字段都给
function fail(msg) {
  return { ok: false, err: msg, error: msg };
}

async function getCouple(openid) {
  const res = await db.collection('couple').where({ members: openid }).limit(1).get();
  return res.data[0] || null;
}

function other(role) {
  return role === 'a' ? 'b' : 'a';
}

/** 称呼：设过就用设的，没设过用注册时的名字 */
function nicksOf(c) {
  const n = c.nicks || {};
  return { a: n.a || c.aName || '我', b: n.b || c.bName || 'TA' };
}

// ---------------------------------------------------------------- 总览

/**
 * 首页一次拉全：称呼、最近的纪念日、今日一问、树、清单进度、纸条、时光轴。
 * 少发几次云调用，异地网络差的时候会舒服很多。
 */
async function overview(c, role) {
  const nicks = nicksOf(c);
  const ta = other(role);
  const dv = datesView((c.dates || []).slice().sort((x, y) => x.at - y.at));
  return {
    nick: { me: nicks[role], ta: nicks[ta] },
    dates: dv.dates,
    nextDate: dv.nextDate,
    daily: await daily(c, role),
    tree: treeOf(c),
    bucket: bucketOf(c),
    notes: notesOf(c, role),
    events: (c.events || []).slice(-3).reverse(),
    days: c.sinceAt ? Math.floor((Date.now() - c.sinceAt) / 86400000) : 0,
  };
}

/** 离最近的一个纪念日还有几天（支持每年循环） */
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

/** 每个日子都带上天数、原始日期、第几次 */
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

// ---------------------------------------------------------------- 称呼

async function setNick(c, role, name) {
  const n = String(name || '').trim().slice(0, 8);
  if (!n) {
    throw new Error('称呼不能为空');
  }
  const nicks = Object.assign({}, c.nicks || {});
  nicks[role] = n;
  await db.collection('couple').doc(c._id).update({ data: { nicks } });
  const all = nicksOf(Object.assign({}, c, { nicks }));
  return { nick: { me: all[role], ta: all[other(role)] } };
}

// ---------------------------------------------------------------- 纪念日

async function addDate(c, ev) {
  const title = String(ev.title || '').trim().slice(0, 12);
  const at = Number(ev.at);
  if (!title) {
    throw new Error('给它起个名字');
  }
  if (!(at > 0)) {
    throw new Error('日期不对');
  }
  const dates = (c.dates || []).slice();
  if (dates.length >= MAX_DATES) {
    throw new Error('纪念日最多 10 个');
  }
  // 兼容旧调用：mode 传 true 或老字段 yearly=true，都当「每年」
  let mode = ev.mode;
  if (mode === true) {
    mode = 'yearly';
  }
  if ((mode === undefined || mode === null) && ev.yearly === true) {
    mode = 'yearly';
  }
  if (mode !== 'since' && mode !== 'yearly') {
    mode = 'until';
  }
  const item = {
    // 带上随机后缀，同一毫秒内加两个也不会重号
    id: 'dt' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
    title,
    at,
    mode,
    yearly: mode === 'yearly',
  };
  dates.push(item);
  await db.collection('couple').doc(c._id).update({ data: { dates } });
  await pushEvent(c, { type: 'date', text: `记下了一个日子：${title}` });
  return datesView(dates);
}

/** 改某个日子的算法（累计 / 倒数 / 每年） */
async function dateMode(c, id, mode) {
  const dates = (c.dates || []).slice();
  const d = dates.filter((x) => x.id === id)[0];
  if (!d) {
    throw new Error('没有这个日子');
  }
  let m = mode;
  if (m !== 'since' && m !== 'yearly') {
    m = 'until';
  }
  d.mode = m;
  d.yearly = m === 'yearly';
  await db.collection('couple').doc(c._id).update({ data: { dates } });
  return datesView(dates);
}

async function delDate(c, id) {
  const dates = (c.dates || []).filter((d) => d.id !== id);
  await db.collection('couple').doc(c._id).update({ data: { dates } });
  return datesView(dates);
}

// ---------------------------------------------------------------- 每日一问

async function daily(c, role) {
  const day = dailyBook.todayKey();
  const q = dailyBook.pickByDay(day);
  const saved = c.daily && c.daily.day === day ? c.daily : null;
  const answers = (saved && saved.answers) || {};
  const mine = answers[role] || null;
  const theirs = answers[other(role)] || null;
  const both = !!(mine && theirs);
  return {
    day,
    qid: q.id,
    q: q.q,
    tag: q.tag,
    options: q.options,
    mine: mine ? mine.choice : -1,
    answered: !!mine,
    // 两个人都答完才把对方的给你看，这是这套玩法的关键
    ta: both ? theirs.choice : -1,
    both,
    same: both ? mine.choice === theirs.choice : false,
  };
}

async function dailyAnswer(c, role, ev) {
  const day = dailyBook.todayKey();
  const q = dailyBook.pickByDay(day);
  const choice = Number(ev.choice);
  if (!(choice >= 0 && choice < q.options.length)) {
    throw new Error('选项不对');
  }
  const at = Date.now();
  if (!c.daily || c.daily.day !== day) {
    // 新的一天，整体重置
    await db.collection('couple').doc(c._id).update({
      data: { daily: { day, qid: q.id, answers: { [role]: { choice, at } } } },
    });
  } else if (c.daily.answers && c.daily.answers[role]) {
    throw new Error('今天已经答过了');
  } else {
    // 用点号路径写，两个人都答不会互相覆盖
    const patch = {};
    patch[`daily.answers.${role}`] = { choice, at };
    await db.collection('couple').doc(c._id).update({ data: patch });
  }

  const fresh = await db.collection('couple').doc(c._id).get();
  const cc = fresh.data;
  const a = (cc.daily && cc.daily.answers) || {};
  if (a.a && a.b) {
    const same = a.a.choice === a.b.choice;
    await pushEvent(cc, {
      type: 'daily-' + day,
      text: same ? '今天的每日一问，你们想到一块去了' : '今天的每日一问，你们想法不太一样',
      once: true,
    });
  }
  return await daily(cc, role);
}

// ---------------------------------------------------------------- 时光轴

async function listEvents(c, limit) {
  const n = Math.min(Math.max(Number(limit) || 50, 1), MAX_EVENTS);
  return { events: (c.events || []).slice(-n).reverse() };
}

async function pushEvent(c, ev) {
  const type = String(ev.type || 'misc').slice(0, 24);
  const text = String(ev.text || '').slice(0, 80);
  if (!text) {
    return { skipped: true };
  }
  if (ev.once) {
    const has = (c.events || []).some((x) => x.type === type);
    if (has) {
      return { skipped: true };
    }
  }
  await db.collection('couple').doc(c._id).update({
    data: { events: _.push({ each: [{ type, text, at: Date.now() }], slice: -MAX_EVENTS }) },
  });
  return { pushed: true };
}

// ---------------------------------------------------------------- 纸条

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

function notesOf(c, role) {
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
  return {
    unread,
    list: views.slice(0, 10),
    total: views.length,
  };
}

async function leaveNote(c, role, text) {
  const t = String(text || '').trim();
  if (!t) {
    throw new Error('写点什么再埋');
  }
  if (t.length > 60) {
    throw new Error('太长啦，60 字以内');
  }
  const notes = c.notes || [];
  if (notes.length >= MAX_NOTES) {
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
  await db.collection('couple').doc(c._id).update({ data: { notes: _.push([note]) } });
  await pushEvent(c, { type: 'note', text: '有人埋了一颗惊喜种子，半小时后发芽' });
  return { note: noteView(note, role, at), notes: notesOf(Object.assign({}, c, { notes: notes.concat([note]) }), role) };
}

async function readNote(c, id) {
  const notes = (c.notes || []).slice();
  let hit = false;
  for (let i = 0; i < notes.length; i++) {
    if (notes[i].id === id && !notes[i].read) {
      notes[i].read = true;
      hit = true;
    }
  }
  if (hit) {
    await db.collection('couple').doc(c._id).update({ data: { notes } });
  }
  return { notes: notesOf(Object.assign({}, c, { notes }), 'a') };
}

// ---------------------------------------------------------------- 合养的树

function treeOf(c) {
  const t = c.tree || {};
  const day = dailyBook.todayKey();
  const level = t.level || 1;
  const aWatered = t.aDay === day;
  const bWatered = t.bDay === day;
  const nicks = nicksOf(c);
  return {
    level,
    maxLevel: MAX_TREE_LEVEL,
    aWatered,
    bWatered,
    // 本轮还差谁
    needA: !aWatered,
    needB: !bWatered,
    totalWater: t.total || 0,
    full: level >= MAX_TREE_LEVEL,
    names: nicks,
    text: level >= MAX_TREE_LEVEL ? '树已经长得很大了' : '两个人各浇一次，它就长一级',
  };
}

async function waterTree(c, role) {
  const day = dailyBook.todayKey();
  const t = Object.assign({ level: 1, aDay: '', bDay: '', total: 0 }, c.tree || {});
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
  const patch = { tree: t };
  if (bonus) {
    patch.coins = _.inc(bonus);
  }
  await db.collection('couple').doc(c._id).update({ data: patch });
  if (leveled) {
    await pushEvent(c, {
      type: 'tree',
      text: `你们一起把树养到了第 ${t.level} 级`,
    });
  }
  return {
    tree: treeOf(Object.assign({}, c, { tree: t })),
    leveled,
    bonus,
    coins: (c.coins || 0) + bonus,
  };
}

// ---------------------------------------------------------------- 一起做的事

function bucketOf(c) {
  const done = c.bucket || {};
  const customs = c.bucketCustom || [];
  const ids = Object.keys(done);
  // 自己加的事也算进总量，不然打钩了进度条不动
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

async function toggleBucket(c, role, itemId) {
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
    map[id] = { by: role, at: Date.now() };
    done = true;
  }
  await db.collection('couple').doc(c._id).update({ data: { bucket: map } });
  if (done) {
    const n = Object.keys(map).length;
    if (n === 1 || n === 10 || n === 50 || n === 100) {
      await pushEvent(c, { type: 'bucket-' + n, text: `一起做的事打钩到第 ${n} 件`, once: true });
    }
  }
  return { bucket: bucketOf(Object.assign({}, c, { bucket: map })), done };
}

/** 自己加一件想一起做的事 */
async function bucketAdd(c, role, text) {
  const t = String(text || '').trim().slice(0, 24);
  if (!t) {
    throw new Error('写一件想一起做的事');
  }
  const customs = (c.bucketCustom || []).slice();
  if (customs.length >= 20) {
    throw new Error('自己加的够多了，最多 20 件');
  }
  let max = 0;
  for (let i = 0; i < customs.length; i++) {
    const n = Number(String(customs[i].id).slice(1)) || 0;
    if (n > max) {
      max = n;
    }
  }
  const item = {
    id: 'c' + (max + 1), t, by: role, at: Date.now(),
  };
  customs.push(item);
  await db.collection('couple').doc(c._id).update({ data: { bucketCustom: customs } });
  await pushEvent(c, { type: 'bucket-custom', text: '清单里多了一件你们自己的事', once: true });
  return { bucket: bucketOf(Object.assign({}, c, { bucketCustom: customs })), item };
}

/** 删掉自己加的一件 */
async function bucketDel(c, itemId) {
  const id = String(itemId || '');
  const customs = (c.bucketCustom || []).filter((x) => x.id !== id);
  const map = Object.assign({}, c.bucket || {});
  delete map[id];
  await db.collection('couple').doc(c._id).update({ data: { bucketCustom: customs, bucket: map } });
  return { bucket: bucketOf(Object.assign({}, c, { bucketCustom: customs, bucket: map })) };
}

// ---------------------------------------------------------------- 自己出题
//
// 两个人互相出题，单独算猜中率，不进默契榜——自己写的题不该影响排名。

const MAX_QUIZ_CUSTOM = 20;

function quizOf(c, role) {
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

async function quizAdd(c, role, event) {
  const t = String(event.text || '').trim().slice(0, 40);
  if (!t) {
    throw new Error('把题写出来');
  }
  const opts = [];
  const src = event.options || [];
  for (let i = 0; i < src.length; i++) {
    const v = String(src[i] || '').trim().slice(0, 20);
    if (v) {
      opts.push(v);
    }
  }
  if (opts.length < 2) {
    throw new Error('至少写两个选项');
  }
  const n = Number(event.choice);
  if (!(n >= 0 && n < opts.length)) {
    throw new Error('先选一个你的答案');
  }
  const quizzes = (c.quizzes || []).slice();
  if (quizzes.length >= MAX_QUIZ_CUSTOM) {
    throw new Error('出的题够多了，先删几道');
  }
  let max = 0;
  for (let i = 0; i < quizzes.length; i++) {
    const v = Number(String(quizzes[i].id).slice(1)) || 0;
    if (v > max) {
      max = v;
    }
  }
  const answers = {};
  answers[role] = n;
  const q = {
    id: 'q' + (max + 1), text: t, options: opts, by: role, answers, at: Date.now(),
  };
  quizzes.push(q);
  await db.collection('couple').doc(c._id).update({ data: { quizzes } });
  await pushEvent(c, { type: 'quiz-custom', text: '有人出了一道只有你们俩懂的题', once: true });
  return { list: quizOf(Object.assign({}, c, { quizzes }), role) };
}

async function quizAnswer(c, role, id, choice) {
  const quizzes = (c.quizzes || []).slice();
  const q = quizzes.filter((x) => x.id === id)[0];
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
  await db.collection('couple').doc(c._id).update({ data: { quizzes } });
  const ta = role === 'a' ? 'b' : 'a';
  if (ans[ta] !== undefined && ans[ta] !== null) {
    await pushEvent(c, {
      type: 'quiz-custom-result',
      text: ans[ta] === n ? '自定义题：你们想到一块去了' : '自定义题：想法不太一样',
      once: true,
    });
  }
  return { list: quizOf(Object.assign({}, c, { quizzes }), role) };
}

async function quizDel(c, role, id) {
  const quizzes = (c.quizzes || []).slice();
  const q = quizzes.filter((x) => x.id === id)[0];
  if (!q) {
    throw new Error('没有这道题');
  }
  if (q.by !== role) {
    throw new Error('只能删自己出的题');
  }
  const left = quizzes.filter((x) => x.id !== id);
  await db.collection('couple').doc(c._id).update({ data: { quizzes: left } });
  return { list: quizOf(Object.assign({}, c, { quizzes: left }), role) };
}

// ---------------------------------------------------------------- 联机五子棋

function newCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

async function findRoom(code) {
  const res = await db.collection('room')
    .where({ code: String(code || '').toUpperCase() })
    .limit(1)
    .get();
  return res.data[0] || null;
}

function roomView(r) {
  const board = r.board || {};
  const keys = Object.keys(board);
  const moves = [];
  for (let i = 0; i < keys.length; i++) {
    const p = keys[i].split(',');
    moves.push({ x: Number(p[0]), y: Number(p[1]), who: board[keys[i]] });
  }
  return {
    code: r.code,
    status: r.status,
    turn: r.turn,
    winner: r.winner || '',
    host: r.host,
    guest: r.guest || '',
    moves,
    count: moves.length,
  };
}

async function roomCreate(c, role) {
  const code = newCode();
  await db.collection('room').add({
    data: {
      code,
      coupleId: c._id,
      host: role,
      guest: '',
      board: {},
      turn: 'a',
      status: 'waiting',
      winner: '',
      at: Date.now(),
    },
  });
  const r = await findRoom(code);
  return { room: roomView(r) };
}

async function roomJoin(c, role, code) {
  const r = await findRoom(code);
  if (!r) {
    throw new Error('房间不存在');
  }
  if (r.status !== 'waiting') {
    throw new Error('这局已经开始了');
  }
  if (r.host === role) {
    throw new Error('这是你开的房间，等 TA 进来');
  }
  await db.collection('room').doc(r._id).update({
    data: { guest: role, status: 'playing', at: Date.now() },
  });
  const fresh = await findRoom(code);
  return { room: roomView(fresh) };
}

async function roomState(code) {
  const r = await findRoom(code);
  if (!r) {
    throw new Error('房间不存在');
  }
  return { room: roomView(r) };
}

async function roomMove(c, role, ev) {
  const r = await findRoom(ev.code);
  if (!r) {
    throw new Error('房间不存在');
  }
  if (r.status !== 'playing') {
    throw new Error('这局还没开始');
  }
  if (r.turn !== role) {
    throw new Error('还没到你');
  }
  const x = Number(ev.x);
  const y = Number(ev.y);
  if (!(x >= 0 && x < BOARD_N && y >= 0 && y < BOARD_N)) {
    throw new Error('下到棋盘外面了');
  }
  const key = `${x},${y}`;
  const board = Object.assign({}, r.board || {});
  if (board[key]) {
    throw new Error('这里已经有子了');
  }
  board[key] = role;
  const patch = { board, turn: other(role), at: Date.now() };
  if (checkWin(board, x, y, role)) {
    patch.status = 'over';
    patch.winner = role;
  } else if (Object.keys(board).length >= BOARD_N * BOARD_N) {
    patch.status = 'over';
    patch.winner = 'draw';
  }
  await db.collection('room').doc(r._id).update({ data: patch });
  const fresh = await findRoom(ev.code);
  if (patch.winner) {
    await pushEvent(c, {
      type: 'room',
      text: patch.winner === 'draw' ? '联机五子棋下成平局' : '联机五子棋分出胜负了',
    });
  }
  return { room: roomView(fresh) };
}

/** 胜负只在服务端判，前端说了不算 */
function checkWin(board, x, y, role) {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let d = 0; d < dirs.length; d++) {
    const dx = dirs[d][0];
    const dy = dirs[d][1];
    let n = 1;
    for (let s = -1; s <= 1; s += 2) {
      let i = x + dx * s;
      let j = y + dy * s;
      while (i >= 0 && i < BOARD_N && j >= 0 && j < BOARD_N && board[`${i},${j}`] === role) {
        n++;
        i += dx * s;
        j += dy * s;
      }
    }
    if (n >= 5) {
      return true;
    }
  }
  return false;
}
