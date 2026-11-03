const app = getApp();
const db = require('../../utils/db.js');
const quizData = require('../../data/quiz.js');

Page({
  data: {
    loading: true,
    waiting: false,
    questions: [],
    current: null,
    answers: [],
    index: 0,
    total: 0,
    picked: -1,
    percent: 0,
    code: '',
    local: false,
  },

  onLoad() {
    this.setData({ local: app.globalData.local });
    this.load();
  },

  load() {
    const couple = app.globalData.couple;
    if (!couple) {
      return;
    }
    return db
      .quizCurrent(couple._id, app.globalData.role)
      .then((info) => {
        if (info.status === 'done') {
          wx.redirectTo({ url: '/pages/quiz/result' });
          return;
        }
        const questions = info.questions.map((id) => build(id));
        this.setData({
          questions,
          total: questions.length,
          loading: false,
          code: couple.code || '',
          answers: new Array(questions.length).fill(-1),
        });
        this.show(0);
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err.message || '加载失败', icon: 'none' });
      });
  },

  show(i) {
    this.setData({
      index: i,
      current: this.data.questions[i],
      picked: this.data.answers ? this.data.answers[i] : -1,
      percent: Math.round((i / this.data.questions.length) * 100),
    });
  },

  goCustom() {
    wx.navigateTo({ url: '/pages/quiz/custom' });
  },

  onPick(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const answers = (this.data.answers || []).slice();
    answers[this.data.index] = idx;
    this.setData({ answers, picked: idx });
    setTimeout(() => {
      if (this.data.index + 1 >= this.data.questions.length) {
        this.submit(answers);
      } else {
        this.show(this.data.index + 1);
      }
    }, 200);
  },

  submit(answers) {
    const couple = app.globalData.couple;
    wx.showLoading({ title: '提交中' });
    db.quizSubmit(couple._id, app.globalData.role, answers)
      .then((res) => {
        wx.hideLoading();
        if (res.waiting) {
          this.setData({ waiting: true, answers });
        } else {
          wx.redirectTo({ url: '/pages/quiz/result' });
        }
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: err.message || '提交失败', icon: 'none' });
      });
  },

  /** 本地模式：按 70% 一致率生成对方的答案 */
  mockPartner() {
    const couple = app.globalData.couple;
    wx.showLoading({ title: 'TA 答题中' });
    db.quizMockPartner(couple._id, app.globalData.role, this.data.answers)
      .then(() => {
        wx.hideLoading();
        wx.redirectTo({ url: '/pages/quiz/result' });
      })
      .catch((err) => {
        wx.hideLoading();
        wx.showToast({ title: err.message, icon: 'none' });
      });
  },
});

function build(id) {
  const q = quizData.getQuestion(id);
  return {
    id,
    text: q.text,
    options: q.options.map((t, i) => ({ idx: i, text: t })),
  };
}
