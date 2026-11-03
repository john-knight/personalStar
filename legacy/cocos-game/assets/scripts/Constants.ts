/** 设计分辨率（竖屏） */
export const DESIGN_WIDTH = 750;
export const DESIGN_HEIGHT = 1334;

/** 运行时可视区域半宽 / 半高，由 Game 初始化时写入 */
export const Field = {
    halfW: DESIGN_WIDTH / 2,
    halfH: DESIGN_HEIGHT / 2,
};

/** 深度（米）与屏幕像素的换算关系 */
export const WORLD = {
    pixelsPerMeter: 2.4,
    /** 钩子固定停在屏幕中心偏上的比例位置 */
    hookAnchorRatio: 0.16,
};

/** 钩子：匀速下潜；回弹速度随渔获重量变化 */
export const HOOK = {
    radius: 14,
    /** 匀速下潜速度（像素/秒） */
    sinkSpeed: 200,
    /** 空钩回弹 ≈3.1 倍 */
    riseEmpty: 620,
    /** 小鱼回弹 ≈3.5 倍，几乎不浪费时间 */
    riseSmall: 700,
    /** 中鱼回弹 ≈2.5 倍 */
    riseMid: 500,
    /** 大鱼回弹 ≈1.25 倍，带挣扎上拉 */
    riseBig: 250,
    followLerp: 9,
};

/** 一趟挂得越多，倍率越高 */
export const COMBO = {
    counts: [1, 2, 3, 4],
    multipliers: [1, 1.5, 2, 3],
};

/** 单局时长（秒） */
export const ROUND = {
    duration: 60,
};

/** 鱼线等级：深度上限（米）与升级花费 */
export const LINE = {
    lengths: [300, 600, 1000, 1500, 2000],
    costs: [0, 400, 1500, 5000, 15000],
};

/** 鱼群生成范围 */
export const FISH = {
    aheadMeters: 900,
    behindMeters: 300,
};

/** 存档 key */
export const SAVE_KEY = {
    best: 'deepfish.best',
    coins: 'deepfish.coins',
    lineLevel: 'deepfish.lineLevel',
};
