/**
 * 全局配置
 * 拿到小程序 AppID 并开通云开发后，把 cloudEnv 填成你的云环境 ID 即可真机联机。
 */
module.exports = {
  /** 云开发环境 ID，留空则使用默认环境 */
  cloudEnv: '',
  /** 强制本地模拟（调试 UI 时用；留 false 则优先走云开发，失败自动降级） */
  useLocalMock: false,
  /**
   * 小游戏入口。都直接做在小程序里（pages/ 下面的页面），不依赖 AppID。
   * 每个游戏结算时自己记一笔战绩，主页「最近战绩」能看到。
   */
  games: [
    { id: 'gobang', name: '五子棋', desc: 'TA 不在也能练', icon: '⚫', url: '/pages/gobang/gobang' },
    { id: 'drawguess', name: '你画我猜', desc: '画一笔给 TA 猜', icon: '✏️', url: '/pages/drawguess/drawguess' },
    // 以下都直接做在小程序里，赢了的爱心币当场进星球
    { id: 'puzzle', name: '合照拼图', desc: '用你们的照片', icon: '🧩', url: '/pages/puzzle/puzzle' },
    { id: 'tapheart', name: '点爱心', desc: '比比谁手快', icon: '💗', url: '/pages/tapheart/tapheart' },
    { id: 'story', name: '故事接龙', desc: '一人一句写故事', icon: '📖', url: '/pages/story/story' },
  ],
};
