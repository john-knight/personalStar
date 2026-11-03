/**
 * 小游戏 → 小程序主页的桥梁：成绩落地 + 返回小程序。
 *
 * 三个小游戏（五子棋 / 你画我猜 / 深海钓鱼）各存一份，实现保持一致。
 * 这个文件刻意不依赖 cc，可以直接用 node 跑测试。
 */

/** 三个游戏统一的战绩结构 */
export interface ScoreResult {
    /** 游戏标识：gobang / drawguess / deepfish */
    game: string;
    /** 显示名 */
    title: string;
    /** 0 平局或单人 / 1 玩家一胜 / 2 玩家二（或电脑）胜 */
    winner: number;
    /** 两位玩家名 */
    names: string[];
    /** 比分 */
    score: number[];
    /** 一句话描述 */
    detail: string;
    /** 时间戳 */
    at: number;
}

export const STORE_KEY = 'dualplanet.scores';
export const LAST_KEY = 'dualplanet.lastScore';

/** 小游戏里 wx 是全局对象，浏览器预览时没有 */
function wxApi(): any {
    const g: any = typeof globalThis !== 'undefined' ? globalThis : {};
    if (typeof g.wx !== 'undefined' && g.wx) {
        return g.wx;
    }
    return null;
}

/** 最近 20 条战绩，最新在前 */
export function loadScores(): ScoreResult[] {
    try {
        const w = wxApi();
        const raw = w && w.getStorageSync
            ? w.getStorageSync(STORE_KEY)
            : localStorage.getItem(STORE_KEY);
        if (!raw) {
            return [];
        }
        const list = JSON.parse(raw);
        return Array.isArray(list) ? list : [];
    } catch (e) {
        return [];
    }
}

/** 存一条战绩到本地（本地模式下也能留痕） */
export function saveScore(result: ScoreResult): void {
    const list = loadScores();
    list.unshift(result);
    while (list.length > 20) {
        list.pop();
    }
    const rawList = JSON.stringify(list);
    const rawLast = JSON.stringify(result);
    try {
        const w = wxApi();
        if (w && w.setStorageSync) {
            w.setStorageSync(STORE_KEY, rawList);
            w.setStorageSync(LAST_KEY, rawLast);
            return;
        }
        localStorage.setItem(STORE_KEY, rawList);
        localStorage.setItem(LAST_KEY, rawLast);
    } catch (e) {
        console.warn('[Bridge] saveScore failed', e);
    }
}

export function makeResult(
    game: string,
    title: string,
    winner: number,
    names: string[],
    score: number[],
    detail: string,
): ScoreResult {
    return { game, title, winner, names, score, detail, at: Date.now() };
}

/**
 * 回传战绩并返回小程序。
 * 只有被小程序用 navigateToMiniProgram 打开时才跳得回去；
 * 直接打开的小游戏只能先落地到本地，返回 false 由调用方提示。
 */
export function backHome(result: ScoreResult): boolean {
    saveScore(result);
    const w = wxApi();
    if (w && typeof w.navigateBackMiniProgram === 'function') {
        try {
            w.navigateBackMiniProgram({ extraData: result });
            return true;
        } catch (e) {
            console.warn('[Bridge] navigateBackMiniProgram failed', e);
        }
    }
    return false;
}
