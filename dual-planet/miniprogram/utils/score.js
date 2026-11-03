/**
 * 战绩记录
 *
 * 最早这些战绩是靠独立小游戏包 wx.navigateBackMiniProgram 回传的。
 * 现在游戏都做在小程序里了，由游戏自己结算时写一笔，
 * 主页「最近战绩」卡直接读这里。
 */
const KEY = 'dualplanet.lastScore';

/**
 * @param game   游戏 id，和 config.js 里的保持一致
 * @param title  卡片上的名字，如「五子棋」
 * @param names  两个人的名字（没有对手就传 []）
 * @param score  比分数组（没有比分就传 []）
 * @param detail 一行补充说明
 */
function saveScore(game, title, names, score, detail) {
  const item = {
    game,
    title,
    names: names || [],
    score: score || [],
    detail: detail || '',
    at: Date.now(),
  };
  try {
    wx.setStorageSync(KEY, JSON.stringify(item));
  } catch (e) {
    console.warn('[score] save failed', e);
  }
  // 顺手写进内存，主页不用再读一遍存储
  try {
    const app = getApp();
    if (app && app.globalData) {
      app.globalData.lastScore = item;
    }
  } catch (e) {
    console.warn('[score] getApp failed', e);
  }
  return item;
}

/** 读最近一条战绩，没有就是 null */
function readScore() {
  try {
    const app = getApp();
    if (app && app.globalData && app.globalData.lastScore) {
      return app.globalData.lastScore;
    }
  } catch (e) {
    console.warn('[score] getApp failed', e);
  }
  try {
    const raw = wx.getStorageSync(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

module.exports = { saveScore, readScore, KEY };
