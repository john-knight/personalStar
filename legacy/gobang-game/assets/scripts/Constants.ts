import { Color } from 'cc';

/** 棋盘规格 */
export const BOARD = {
    /** 15×15 标准五子棋 */
    n: 15,
    /** 连成几子获胜 */
    winLen: 5,
};

/** 配色：与小程序「双人星球」保持一致（米白底 + 单一强调色） */
export const COLOR = {
    page: new Color(247, 248, 250, 255),
    board: new Color(250, 246, 240, 255),
    boardEdge: new Color(232, 226, 216, 255),
    line: new Color(214, 205, 192, 255),
    black: new Color(48, 48, 56, 255),
    white: new Color(252, 252, 252, 255),
    blackEdge: new Color(30, 30, 36, 255),
    whiteEdge: new Color(206, 200, 192, 255),
    accent: new Color(240, 101, 138, 255),
    text: new Color(31, 35, 41, 255),
    muted: new Color(138, 144, 153, 255),
    panel: new Color(255, 255, 255, 255),
    mask: new Color(31, 35, 41, 110),
};

/** 本地存档键 */
export const SAVE_KEY = 'gobang.stats.v1';

/** 两位玩家（情侣） */
export const PLAYERS = [
    { id: 1, name: '小舟', color: COLOR.black, edge: COLOR.blackEdge },
    { id: 2, name: '小鹿', color: COLOR.white, edge: COLOR.whiteEdge },
];

/** 人机模式里对手的名字 */
export const AI_NAME = '电脑';

/** 对手按钮的三档文案，顺序与 Game 的 _aiLevel 对应 */
export const OPPONENT_TEXT = ['对手：小鹿', '电脑·简单', '电脑·困难'];
