/** 抽题逻辑（与 miniprogram/data/quiz.js 的 pickSet 保持一致） */

const DIMS = ['habit', 'interest', 'value', 'intimate', 'future'];
const IDS = {
  habit: ['habit_1', 'habit_2', 'habit_3', 'habit_4', 'habit_5', 'habit_6',
    'habit_7', 'habit_8', 'habit_9', 'habit_10', 'habit_11', 'habit_12'],
  interest: ['interest_1', 'interest_2', 'interest_3', 'interest_4', 'interest_5', 'interest_6',
    'interest_7', 'interest_8', 'interest_9', 'interest_10', 'interest_11', 'interest_12'],
  value: ['value_1', 'value_2', 'value_3', 'value_4', 'value_5', 'value_6',
    'value_7', 'value_8', 'value_9', 'value_10', 'value_11', 'value_12'],
  intimate: ['intimate_1', 'intimate_2', 'intimate_3', 'intimate_4', 'intimate_5', 'intimate_6',
    'intimate_7', 'intimate_8', 'intimate_9', 'intimate_10', 'intimate_11', 'intimate_12'],
  future: ['future_1', 'future_2', 'future_3', 'future_4', 'future_5', 'future_6',
    'future_7', 'future_8', 'future_9', 'future_10', 'future_11', 'future_12'],
};

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

function pickSet(perDim) {
  const n = perDim || 3;
  const set = [];
  for (let i = 0; i < DIMS.length; i++) {
    const picked = shuffle(IDS[DIMS[i]]).slice(0, n);
    for (let j = 0; j < picked.length; j++) {
      set.push(picked[j]);
    }
  }
  return shuffle(set);
}

module.exports = { DIMS, IDS, shuffle, pickSet };
