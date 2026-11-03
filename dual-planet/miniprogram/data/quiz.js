/**
 * 默契问答题库：五维各 6 题，共 30 题，每局随机抽 15 题（每维 3 题）
 * swap=true 的题目代表前两个选项是「我 / TA」，需要按角色归一化后再比较，
 * 否则 A 答「我」与 B 答「TA」（同一个意思）会被误判为不一致。
 */

const DIMS = [
  { id: 'habit', name: '生活习惯' },
  { id: 'interest', name: '兴趣爱好' },
  { id: 'value', name: '价值观' },
  { id: 'intimate', name: '亲密关系' },
  { id: 'future', name: '未来规划' },
];

const QUESTIONS = [
  // 生活习惯
  { id: 'habit_1', dim: 'habit', text: '你们一般几点互道晚安？', options: ['22 点前', '23 点左右', '凌晨以后', '不一定'], swap: false },
  { id: 'habit_2', dim: 'habit', text: '家里的卫生谁收拾得多？', options: ['我', 'TA', '差不多', '谁看不下去谁收拾'], swap: true },
  { id: 'habit_3', dim: 'habit', text: '你们更常怎么解决吃饭？', options: ['点外卖', '自己做饭', '出去吃', '随便凑合'], swap: false },
  { id: 'habit_4', dim: 'habit', text: '周末你们更常做什么？', options: ['宅着', '出门逛', '运动', '补觉'], swap: false },
  { id: 'habit_5', dim: 'habit', text: '你们俩谁更晚睡？', options: ['我', 'TA', '差不多', '一起熬到很晚'], swap: true },
  { id: 'habit_6', dim: 'habit', text: '一起出门时谁订计划？', options: ['我', 'TA', '一起商量', '从不做计划'], swap: true },
  { id: 'habit_7', dim: 'habit', text: '家里谁洗澡先？', options: ['我', 'TA', '一起洗', '不一定'], swap: true },
  { id: 'habit_8', dim: 'habit', text: '家里的饭谁做得多？', options: ['我', 'TA', '外卖为生', '一起做'], swap: true },
  { id: 'habit_9', dim: 'habit', text: '睡觉时要不要留灯？', options: ['全黑才行', '留个小夜灯', '随便', '必须全黑才睡得着'], swap: false },
  { id: 'habit_10', dim: 'habit', text: '夏天空调你俩开几度？', options: ['26 度正好', '22 度以下', '吹自然风', '看谁先抢到遥控器'], swap: false },
  { id: 'habit_11', dim: 'habit', text: '谁更容易赖床？', options: ['我', 'TA', '差不多', '两个都起得早'], swap: true },
  { id: 'habit_12', dim: 'habit', text: '点外卖最常点什么？', options: ['麻辣烫', '炸鸡汉堡', '粉面', '轻食沙拉'], swap: false },
  // 兴趣爱好
  { id: 'interest_1', dim: 'interest', text: '你们最爱一起看什么？', options: ['电影', '剧', '综艺', '短视频'], swap: false },
  { id: 'interest_2', dim: 'interest', text: '你们谁更爱拍照？', options: ['我', 'TA', '差不多', '都不爱'], swap: true },
  { id: 'interest_3', dim: 'interest', text: '一起听歌时更常听什么？', options: ['流行', '古风', '说唱', '随机播放'], swap: false },
  { id: 'interest_4', dim: 'interest', text: '你们更喜欢的旅行方式？', options: ['说走就走', '提前做攻略', '躺酒店', '都不喜欢'], swap: false },
  { id: 'interest_5', dim: 'interest', text: '你们谁更爱打游戏？', options: ['我', 'TA', '差不多', '都不玩'], swap: true },
  { id: 'interest_6', dim: 'interest', text: '熬夜时你们更常在做什么？', options: ['刷剧', '打游戏', '聊天', '什么都不做'], swap: false },
  { id: 'interest_7', dim: 'interest', text: '一起刷手机更常看什么？', options: ['搞笑段子', '美食', '旅行攻略', '猫猫狗狗'], swap: false },
  { id: 'interest_8', dim: 'interest', text: '你们谁更能吃辣？', options: ['我', 'TA', '都不行', '都很行'], swap: true },
  { id: 'interest_9', dim: 'interest', text: '唱歌时谁唱得多？', options: ['我', 'TA', '都不唱', '抢麦唱'], swap: true },
  { id: 'interest_10', dim: 'interest', text: '最想去哪种地方旅行？', options: ['海岛', '古城', '雪山', '城市里到处逛'], swap: false },
  { id: 'interest_11', dim: 'interest', text: '一起看的电影更常是？', options: ['爱情片', '悬疑', '科幻', '动画'], swap: false },
  { id: 'interest_12', dim: 'interest', text: '你们谁更爱运动？', options: ['我', 'TA', '一起去', '都不爱'], swap: true },
  // 价值观
  { id: 'value_1', dim: 'value', text: '有了余钱更愿意？', options: ['存起来', '及时行乐', '投资自己', '给重要的人'], swap: false },
  { id: 'value_2', dim: 'value', text: '你们闹分歧时通常？', options: ['讲道理', '先冷静', '先服软', '吵到底'], swap: false },
  { id: 'value_3', dim: 'value', text: '你们觉得最重要的是？', options: ['健康', '自由', '家人', '钱'], swap: false },
  { id: 'value_4', dim: 'value', text: '你们谁更会管钱？', options: ['我', 'TA', '一起管', '各管各的'], swap: true },
  { id: 'value_5', dim: 'value', text: '你们更讨厌哪种感觉？', options: ['被催促', '被误解', '被忽视', '被欺骗'], swap: false },
  { id: 'value_6', dim: 'value', text: '做重要决定时你们？', options: ['很果断', '很纠结', '先问对方', '靠感觉'], swap: false },
  { id: 'value_7', dim: 'value', text: '朋友借钱你们怎么看？', options: ['能帮就帮', '看自己能力', '一般不借', '先问对方意见'], swap: false },
  { id: 'value_8', dim: 'value', text: '你们谁更怕孤独？', options: ['我', 'TA', '两个都怕', '两个都不怕'], swap: true },
  { id: 'value_9', dim: 'value', text: '加班到很晚，你更希望？', options: ['有人等我', '有人来接', '别打扰我', '一起吐槽老板'], swap: false },
  { id: 'value_10', dim: 'value', text: '承诺和感觉你更看重？', options: ['承诺', '感觉', '两个都要', '没想过'], swap: false },
  { id: 'value_11', dim: 'value', text: '钱不够时你们更愿意？', options: ['先省着', '去借', '问家里', '一起想办法'], swap: false },
  { id: 'value_12', dim: 'value', text: '被别人误解时你会？', options: ['解释清楚', '懒得解释', '让对方自己想', '先发火再说'], swap: false },
  // 亲密关系
  { id: 'intimate_1', dim: 'intimate', text: '吵架后一般谁先低头？', options: ['我', 'TA', '看情况', '谁都不'], swap: true },
  { id: 'intimate_2', dim: 'intimate', text: '你们谁更黏人？', options: ['我', 'TA', '差不多', '都不黏'], swap: true },
  { id: 'intimate_3', dim: 'intimate', text: '表达爱更多的是？', options: ['我', 'TA', '差不多', '都不太表达'], swap: true },
  { id: 'intimate_4', dim: 'intimate', text: '你们最常因为什么闹别扭？', options: ['小事', '钱', '异性朋友', '家务'], swap: false },
  { id: 'intimate_5', dim: 'intimate', text: '生气时谁先开口？', options: ['我', 'TA', '看情况', '都沉默'], swap: true },
  { id: 'intimate_6', dim: 'intimate', text: '你们一天联系多少次？', options: ['随时', '早晚各一次', '一天几次', '想起才联系'], swap: false },
  { id: 'intimate_7', dim: 'intimate', text: '多久想见对方一次？', options: ['天天都想', '一周一次', '有空就见', '看情况'], swap: false },
  { id: 'intimate_8', dim: 'intimate', text: '你们谁更爱吃醋？', options: ['我', 'TA', '两个都吃', '两个都不'], swap: true },
  { id: 'intimate_9', dim: 'intimate', text: '睡前最后一句通常是？', options: ['晚安', '爱你', '明天见', '不说直接睡'], swap: false },
  { id: 'intimate_10', dim: 'intimate', text: '闹别扭最长会多久？', options: ['当天就好', '一两天', '一周以上', '看谁先撑不住'], swap: false },
  { id: 'intimate_11', dim: 'intimate', text: '你们谁更会制造惊喜？', options: ['我', 'TA', '两个都会', '两个都不太会'], swap: true },
  { id: 'intimate_12', dim: 'intimate', text: '对方加班到很晚你会？', options: ['等 TA 回来', '先睡', '送个夜宵', '打完电话就行'], swap: false },
  // 未来规划
  { id: 'future_1', dim: 'future', text: '你们想要孩子吗？', options: ['想要', '不想要', '还没想好', '顺其自然'], swap: false },
  { id: 'future_2', dim: 'future', text: '你们想住在哪里？', options: ['大城市', '老家', '海边小城', '还没定'], swap: false },
  { id: 'future_3', dim: 'future', text: '你们想养宠物吗？', options: ['想', '不想', '看情况', '已经养了'], swap: false },
  { id: 'future_4', dim: 'future', text: '你们谁更想早点结婚？', options: ['我', 'TA', '两个都急', '两个都不急'], swap: true },
  { id: 'future_5', dim: 'future', text: '最想一起做的事？', options: ['一起旅行', '买房子', '开家小店', '现在这样就很好'], swap: false },
  { id: 'future_6', dim: 'future', text: '老了以后想？', options: ['回老家', '住海边', '跟着孩子', '没想过'], swap: false },
  { id: 'future_7', dim: 'future', text: '你想过几岁结婚吗？', options: ['25 岁前', '30 岁前', '35 岁前', '完全不着急'], swap: false },
  { id: 'future_8', dim: 'future', text: '纪念日更想怎么过？', options: ['出去吃顿好的', '在家做顿饭', '互相送礼物', '一起出去走走'], swap: false },
  { id: 'future_9', dim: 'future', text: '以后家务怎么分？', options: ['我多做点', 'TA 多做点', '谁有空谁做', '严格轮流'], swap: true },
  { id: 'future_10', dim: 'future', text: '以后想住得离父母多近？', options: ['住一起', '住同一个小区', '同城就好', '住远一点'], swap: false },
  { id: 'future_11', dim: 'future', text: '以后家里谁管钱？', options: ['我', 'TA', '一起管', '各管各的'], swap: true },
  { id: 'future_12', dim: 'future', text: '十年后最想实现的是？', options: ['有自己的房子', '财务自由', '身体都健康', '一家人还在一起'], swap: false },
];

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/** 每维随机抽 perDim 题，打乱后返回 */
function pickSet(perDim) {
  const n = perDim || 3;
  const byDim = {};
  for (let i = 0; i < DIMS.length; i++) {
    byDim[DIMS[i].id] = [];
  }
  for (let i = 0; i < QUESTIONS.length; i++) {
    byDim[QUESTIONS[i].dim].push(QUESTIONS[i]);
  }
  const set = [];
  for (let i = 0; i < DIMS.length; i++) {
    const picked = shuffle(byDim[DIMS[i].id]).slice(0, n);
    for (let j = 0; j < picked.length; j++) {
      set.push(picked[j].id);
    }
  }
  return shuffle(set);
}

function getQuestion(id) {
  for (let i = 0; i < QUESTIONS.length; i++) {
    if (QUESTIONS[i].id === id) {
      return QUESTIONS[i];
    }
  }
  return null;
}

/**
 * 归一化答案：把「我 / TA」型选项按角色换算成 a / b，便于双方面直接比较
 */
function normalize(id, idx, role) {
  const q = getQuestion(id);
  if (!q || !q.swap) {
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

module.exports = {
  DIMS,
  QUESTIONS,
  pickSet,
  getQuestion,
  shuffle,
  normalize,
};
