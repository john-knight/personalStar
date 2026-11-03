import { Color } from 'cc';

export const COLOR = {
    bg: new Color(247, 248, 250, 255),
    paper: new Color(255, 255, 255, 255),
    panel: new Color(255, 255, 255, 255),
    border: new Color(232, 234, 239, 255),
    text: new Color(44, 46, 51, 255),
    muted: new Color(138, 143, 152, 255),
    accent: new Color(255, 107, 157, 255),
    accentDark: new Color(230, 80, 130, 255),
    teal: new Color(78, 205, 196, 255),
    gold: new Color(255, 196, 78, 255),
    mask: new Color(31, 35, 41, 120),
    disabled: new Color(203, 206, 212, 255),
};

/** 画笔颜色：够用就好，太多反而选择困难 */
export const PENS: Color[] = [
    new Color(44, 46, 51, 255),      // 墨黑
    new Color(255, 107, 157, 255),   // 玫红
    new Color(78, 205, 196, 255),    // 青
    new Color(255, 196, 78, 255),    // 暖黄
    new Color(126, 137, 255, 255),   // 蓝紫
    new Color(120, 178, 90, 255),    // 草绿
];

/** 笔宽档位（像素，会按棋盘尺寸缩放） */
export const PEN_WIDTHS = [4, 9, 16];

export const PLAYERS = [
    { name: '小舟', color: new Color(255, 107, 157, 255) },
    { name: '小鹿', color: new Color(78, 205, 196, 255) },
];

/** 每回合作画秒数 */
export const DRAW_SECONDS = 60;
/** 一轮几回合（每人画同样多次） */
export const ROUNDS = 6;
/** 猜词时的候选数量（含正确答案） */
export const CANDIDATES = 6;

/** 笔迹采样最小间距（画布像素）：小于这个距离的点丢弃，压数据量 */
export const MIN_POINT_GAP = 2;
