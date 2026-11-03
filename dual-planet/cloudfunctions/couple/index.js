const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

/** 情侣关系：加载 / 创建 / 加入 / 资料更新 */
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  try {
    if (event.action === 'load') {
      return ok(await load(OPENID));
    }
    if (event.action === 'create') {
      return ok(await create(OPENID, event.myName));
    }
    if (event.action === 'join') {
      return ok(await join(OPENID, event.code, event.myName));
    }
    if (event.action === 'profile') {
      return ok(await profile(OPENID, event));
    }
    if (event.action === 'unbind') {
      return ok(await unbind(OPENID));
    }
    if (event.action === 'device') {
      return ok(await device(OPENID, event));
    }
    return fail('unknown action');
  } catch (e) {
    return fail(e.message || 'server error');
  }
};

function ok(data) {
  return { ok: true, data };
}

// 前端 db.js 读的是 err，这里两个都给，省得哪边对不上就变成 "cloud error"
function fail(msg) {
  return { ok: false, err: msg, error: msg };
}

async function getCouple(openid) {
  const res = await db.collection('couple').where({ members: openid }).limit(1).get();
  return res.data[0] || null;
}

/** 风险留痕，写不进去也不该影响主流程 */
function logRisk(coupleId, type, note) {
  return db.collection('risk_log').add({
    data: { coupleId, type, note, at: Date.now() },
  }).catch(() => null);
}

/**
 * 上报设备指纹，顺手算一次可信分。
 *
 * 文档 4.4：可信分综合双方不同微信、关系存续、设备 / IP 不重合，
 * 低于阈值不进正式榜。
 *
 * 说明：不做「查某人是不是海王」这种公开挂人（见文档 8.2），
 * 这里只是给自己的关系打个分，决定能不能上榜。
 */
async function device(openid, event) {
  const deviceId = String(event.deviceId || '');
  const patch = {
    deviceId,
    model: event.model || '',
    deviceAt: Date.now(),
  };
  const users = await db.collection('wx_user').where({ openid }).limit(1).get();
  if (users.data.length) {
    await db.collection('wx_user').doc(users.data[0]._id).update({ data: patch });
  } else {
    await db.collection('wx_user').add({
      data: Object.assign({ openid, createdAt: Date.now() }, patch),
    });
  }

  const c = await getCouple(openid);
  if (!c || c.members.length < 2) {
    return { credit: 0, flags: [], checked: false };
  }

  // 两端是不是同一台手机：一个人开两个号自己跟自己玩
  const us = await db.collection('wx_user').where({ openid: _.in(c.members) }).get();
  const ids = us.data.map((u) => u.deviceId || '').filter((x) => !!x);
  const sameDevice = ids.length >= 2 && ids[0] === ids[1];

  const days = c.sinceAt ? Math.floor((Date.now() - c.sinceAt) / 86400000) : 0;
  const flags = [];
  let credit = 100;
  if (sameDevice) {
    flags.push('同一台设备');
    credit -= 60;
  }
  if (days < 1) {
    flags.push('刚认识');
    credit -= 15;
  }
  if (credit < 0) {
    credit = 0;
  }

  await db.collection('couple').doc(c._id).update({
    data: { credit, flags, deviceCheckedAt: Date.now() },
  });
  if (sameDevice) {
    await logRisk(c._id, 'same_device', '两端设备指纹相同，像是同一个人开两个号');
  }
  return { credit, flags, sameDevice };
}

/** 拉取用户与所属情侣关系 */
async function load(openid) {
  const users = await db.collection('wx_user').where({ openid }).limit(1).get();
  let user = users.data[0];
  if (!user) {
    const res = await db.collection('wx_user').add({
      data: { openid, nickName: '', avatarUrl: '', createdAt: Date.now() },
    });
    user = { _id: res._id, openid, nickName: '', avatarUrl: '', createdAt: Date.now() };
  }
  const couples = await db.collection('couple').where({ members: openid }).limit(1).get();
  const couple = couples.data[0] || null;
  let role = '';
  if (couple) {
    role = couple.members[0] === openid ? 'a' : 'b';
  }
  return { user, couple, role };
}

async function create(openid, myName) {
  // 一人同时只能有一个活跃关系
  const exist = await db.collection('couple').where({ members: openid }).limit(1).get();
  if (exist.data.length) {
    return { couple: exist.data[0], code: exist.data[0].code };
  }
  const code = newCode();
  const sinceAt = Date.now();
  const res = await db.collection('couple').add({
    data: {
      members: [openid],
      aName: myName || '我',
      bName: '',
      code,
      level: 1,
      coins: 100,
      sinceAt,
      status: 'waiting',
    },
  });
  const couple = {
    _id: res._id,
    members: [openid],
    aName: myName || '我',
    bName: '',
    code,
    level: 1,
    coins: 100,
    sinceAt,
    status: 'waiting',
  };
  await db.collection('farm').add({
    data: { coupleId: res._id, plots: [null, null, null, null] },
  });
  return { couple, code };
}

async function join(openid, code, myName) {
  const res = await db.collection('couple').where({ code: (code || '').toUpperCase() }).limit(1).get();
  const c = res.data[0];
  if (!c || c.status === 'ended') {
    throw new Error('邀请码不存在');
  }
  if (c.members.length >= 2) {
    throw new Error('这个星球已经有两个人啦');
  }
  if (c.members.indexOf(openid) >= 0) {
    throw new Error('你已经在里面了');
  }
  await db.collection('couple').doc(c._id).update({
    data: {
      members: _.push(openid),
      bName: myName || 'TA',
      status: 'active',
    },
  });
  return {
    couple: Object.assign({}, c, {
      members: c.members.concat([openid]),
      bName: myName || 'TA',
      status: 'active',
    }),
  };
}

/**
 * 解除绑定。
 *
 * 不删数据：菜地、时光轴、纪念日、出过的题都留在 couple 文档里，只是
 * members 清空、status 改成 ended——两个人都查不到，也就进不去了。
 * 之所以不物理删除，是因为误操作、或者以后想做「翻看旧时光」都还有余地。
 *
 * 单方面就能解绑（分手本来就是单方面的事），但另一方下次进来会收到提示，
 * 不会毫无征兆地回到空白页。
 */
async function unbind(openid) {
  const c = await getCouple(openid);
  if (!c) {
    throw new Error('还没有绑定的关系');
  }
  const role = c.members[0] === openid ? 'a' : 'b';
  const who = (role === 'a' ? c.aName : c.bName) || 'TA';
  const partner = c.members.filter((x) => x !== openid)[0] || '';

  await db.collection('couple').doc(c._id).update({
    data: {
      status: 'ended',
      endedAt: Date.now(),
      endedBy: role,
      endedByName: who,
      archivedMembers: c.members,
      // 清空 members，所有 where({ members: openid }) 就再也查不到它了
      members: [],
      // 邀请码作废，免得别人拿旧码加进来
      code: `ENDED${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    },
  });

  await logRisk(c._id, 'unbind', `${who} 解除了绑定`);

  // 给双方留个痕迹，下次进来能知道发生了什么。
  // 分开写是为了区分「自己解除的」和「被解除的」——自己被解除的那方才需要提示。
  const now = Date.now();
  await db.collection('wx_user').where({ openid }).update({
    data: { lastEndedAt: now, lastEndedBy: who, lastEndedByMe: true },
  }).catch(() => null);
  if (partner) {
    await db.collection('wx_user').where({ openid: partner }).update({
      data: { lastEndedAt: now, lastEndedBy: who, lastEndedByMe: false },
    }).catch(() => null);
  }

  return { couple: null, role: '', partnerName: who };
}

async function profile(openid, event) {
  const data = {
    nickName: event.nickName || '',
    avatarUrl: event.avatarUrl || '',
  };
  const users = await db.collection('wx_user').where({ openid }).limit(1).get();
  if (users.data.length) {
    await db.collection('wx_user').doc(users.data[0]._id).update({ data });
    return Object.assign({}, users.data[0], data);
  }
  const res = await db.collection('wx_user').add({
    data: Object.assign({ openid, createdAt: Date.now() }, data),
  });
  return Object.assign({ _id: res._id, openid }, data);
}

function newCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}
