/**
 * 五子棋 AI：纯逻辑，不依赖引擎，可以脱离 Cocos 单独跑测试。
 * 策略是「对每个候选点算进攻分 + 防守分」，取最高。
 * 不做深层搜索，但能保证：能连五就连五、对手要连五必堵、优先做活三/堵活三。
 */

const DIRS: Array<[number, number]> = [[1, 0], [0, 1], [1, 1], [1, -1]];

/** 棋型分：数量级拉开，保证优先级天然正确 */
const S = {
    five: 1000000,
    live4: 100000,   // 两端空
    rush4: 10000,    // 一端空
    live3: 8000,
    sleep3: 1000,
    live2: 800,
    sleep2: 100,
    live1: 50,
};

function at(data: number[][], x: number, y: number, n: number): number {
    if (x < 0 || y < 0 || x >= n || y >= n) {
        return -1;
    }
    return data[y][x];
}

function scoreOf(count: number, opens: number): number {
    if (count >= 5) {
        return S.five;
    }
    if (count === 4) {
        return opens === 2 ? S.live4 : (opens === 1 ? S.rush4 : 0);
    }
    if (count === 3) {
        return opens === 2 ? S.live3 : (opens === 1 ? S.sleep3 : 0);
    }
    if (count === 2) {
        return opens === 2 ? S.live2 : (opens === 1 ? S.sleep2 : 0);
    }
    if (count === 1) {
        return opens === 2 ? S.live1 : 0;
    }
    return 0;
}

/** 假设在 (x,y) 放 v，四个方向合计的棋型分 */
export function shapeScore(data: number[][], x: number, y: number, v: number, n: number): number {
    let total = 0;
    for (let d = 0; d < DIRS.length; d++) {
        const dx = DIRS[d][0];
        const dy = DIRS[d][1];
        let count = 1;
        let openA = false;
        let openB = false;
        for (let i = 1; i < 5; i++) {
            const c = at(data, x + dx * i, y + dy * i, n);
            if (c === v) {
                count++;
                continue;
            }
            openA = c === 0;
            break;
        }
        for (let i = 1; i < 5; i++) {
            const c = at(data, x - dx * i, y - dy * i, n);
            if (c === v) {
                count++;
                continue;
            }
            openB = c === 0;
            break;
        }
        total += scoreOf(count, (openA ? 1 : 0) + (openB ? 1 : 0));
    }
    return total;
}

/**
 * 选一个落点；棋盘空时走天元。
 * level=1 简单：只在无关胜负的位置留出破绽，仍会连五、会堵四
 * level=2 困难（默认）：完全按评分最优
 */
export function bestMove(data: number[][], me: number, n: number, level?: number): { x: number; y: number } | null {
    const foe = me === 1 ? 2 : 1;
    const center = (n - 1) / 2;
    const hard = level !== 1;
    // 简单档防守没那么警觉
    const defendWeight = hard ? 0.9 : 0.45;
    let occupied = false;
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if (data[y][x] !== 0) {
                occupied = true;
                break;
            }
        }
        if (occupied) {
            break;
        }
    }
    if (!occupied) {
        return { x: Math.round(center), y: Math.round(center) };
    }

    const list: Array<{ x: number; y: number; score: number }> = [];
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            if (data[y][x] !== 0) {
                continue;
            }
            // 只考虑已有棋子周围 2 格，省算力也避免在无意义的位置落子
            let near = false;
            for (let dy = -2; dy <= 2 && !near; dy++) {
                for (let dx = -2; dx <= 2; dx++) {
                    if (dx === 0 && dy === 0) {
                        continue;
                    }
                    if (at(data, x + dx, y + dy, n) > 0) {
                        near = true;
                        break;
                    }
                }
            }
            if (!near) {
                continue;
            }
            // 防守权重略低于进攻：同样是活四，自己成五优先于堵对方
            const attack = shapeScore(data, x, y, me, n);
            const defend = shapeScore(data, x, y, foe, n);
            const noise = hard ? 0 : Math.random() * 400;
            const score = attack + defend * defendWeight
                + (n - Math.abs(x - center) - Math.abs(y - center)) * 0.5 + noise;
            list.push({ x, y, score });
        }
    }
    if (list.length === 0) {
        return null;
    }
    list.sort((a, b) => b.score - a.score);
    // 简单档：轮不到胜负关键时，有几率走出次优点（否则太难打）
    if (!hard && list.length > 3 && list[0].score < 50000 && Math.random() < 0.4) {
        const alt = list[1 + Math.floor(Math.random() * 3)];
        return { x: alt.x, y: alt.y };
    }
    return { x: list[0].x, y: list[0].y };
}
