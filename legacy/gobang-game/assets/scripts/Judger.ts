/**
 * 五子棋规则：纯逻辑，不依赖引擎，可单独跑测试
 * 0 空 / 1 黑 / 2 白
 */

export type Cell = 0 | 1 | 2;

/** 四个方向：横、竖、左下-右上、左上-右下 */
const DIRS: Array<[number, number]> = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
];

export type BoardData = Cell[][];

export function createBoard(n: number): BoardData {
    const b: BoardData = [];
    for (let y = 0; y < n; y++) {
        const row: Cell[] = [];
        for (let x = 0; x < n; x++) {
            row.push(0);
        }
        b.push(row);
    }
    return b;
}

export function opponent(v: Cell): Cell {
    return v === 1 ? 2 : 1;
}

/** 落子，成功返回 true（越界或已有子返回 false） */
export function place(b: BoardData, x: number, y: number, v: Cell): boolean {
    if (y < 0 || y >= b.length || x < 0 || x >= b.length) {
        return false;
    }
    if (b[y][x] !== 0) {
        return false;
    }
    b[y][x] = v;
    return true;
}

/**
 * 判断落子后是否获胜。返回连成的连线坐标（用于高亮），未获胜返回空数组。
 * 只以最后一手为中心向四个方向统计，O(1)。
 */
export function checkWin(b: BoardData, x: number, y: number, v: Cell, winLen = 5): Array<[number, number]> {
    for (let d = 0; d < DIRS.length; d++) {
        const [dx, dy] = DIRS[d];
        const line: Array<[number, number]> = [[x, y]];

        for (let s = 1; s < winLen; s++) {
            const nx = x + dx * s;
            const ny = y + dy * s;
            if (nx < 0 || nx >= b.length || ny < 0 || ny >= b.length) {
                break;
            }
            if (b[ny][nx] !== v) {
                break;
            }
            line.push([nx, ny]);
        }
        for (let s = 1; s < winLen; s++) {
            const nx = x - dx * s;
            const ny = y - dy * s;
            if (nx < 0 || nx >= b.length || ny < 0 || ny >= b.length) {
                break;
            }
            if (b[ny][nx] !== v) {
                break;
            }
            line.unshift([nx, ny]);
        }
        if (line.length >= winLen) {
            return line;
        }
    }
    return [];
}

export function isFull(b: BoardData): boolean {
    for (let y = 0; y < b.length; y++) {
        for (let x = 0; x < b.length; x++) {
            if (b[y][x] === 0) {
                return false;
            }
        }
    }
    return true;
}

/** 序列化棋局（联机同步用）：每格 0/1/2 拼成字符串 */
export function serialize(b: BoardData): string {
    return b.map((row) => row.join('')).join('');
}

export function deserialize(s: string, n: number): BoardData {
    const b = createBoard(n);
    for (let i = 0; i < s.length && i < n * n; i++) {
        const y = Math.floor(i / n);
        const x = i % n;
        const c = Number(s[i]);
        b[y][x] = (c === 1 || c === 2 ? c : 0) as Cell;
    }
    return b;
}
