import { resources, JsonAsset } from 'cc';

export interface FishSpecies {
    id: string;
    name: string;
    minDepth: number;
    maxDepth: number;
    weight: number;
    value: number;
    size: number;
    color: number[];
    speed: number;
    /** 掠食者：碰到会咬断鱼线，本趟渔获全部损失 */
    hostile?: boolean;
}

export interface FishConfig {
    maxDepth: number;
    species: FishSpecies[];
    spawn: {
        count: number;
        aheadMeters: number;
        behindMeters: number;
    };
}

let config: FishConfig | null = null;

export function loadFishConfig(): Promise<FishConfig> {
    return new Promise((resolve, reject) => {
        if (config) {
            resolve(config);
            return;
        }
        resources.load('data/fish', JsonAsset, (err, asset) => {
            if (err || !asset) {
                reject(err ?? new Error('load fish config failed'));
                return;
            }
            config = asset.json as FishConfig;
            resolve(config);
        });
    });
}

export function getFishConfig(): FishConfig {
    if (!config) {
        throw new Error('fish config not loaded');
    }
    return config;
}

/** 按深度筛选 + 稀有度权重随机取一个鱼种 */
export function pickSpecies(depth: number): FishSpecies {
    const list = getFishConfig().species;
    const matched = list.filter((s) => depth >= s.minDepth && depth <= s.maxDepth);
    const pool = matched.length > 0 ? matched : closestSpecies(list, depth);
    let total = 0;
    for (const s of pool) {
        total += s.weight;
    }
    let roll = Math.random() * total;
    for (const s of pool) {
        roll -= s.weight;
        if (roll <= 0) {
            return s;
        }
    }
    return pool[pool.length - 1];
}

function closestSpecies(list: FishSpecies[], depth: number): FishSpecies[] {
    let best = list[0];
    let bestDist = Number.MAX_VALUE;
    for (const s of list) {
        const dist = depth < s.minDepth ? s.minDepth - depth : depth - s.maxDepth;
        if (dist < bestDist) {
            bestDist = dist;
            best = s;
        }
    }
    return [best];
}
