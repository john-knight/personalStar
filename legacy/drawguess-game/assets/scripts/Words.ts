/** 词库：一个条目 = 一个可画可猜的词 */
export interface WordItem {
    id: string;
    text: string;
    cat: string;
}

const RAW: Array<[string, string]> = [
    ['动物', '猫 狗 兔子 熊猫 大象 长颈鹿 企鹅 章鱼 蝴蝶 蜗牛 鲸鱼 老虎 孔雀 刺猬 骆驼 袋鼠 乌龟 狐狸 蜜蜂 青蛙 '
        + '斑马 牦牛 考拉 松鼠 海豚 鳄鱼 火烈鸟 猫头鹰 水母 螃蟹 龙虾 瓢虫 蜻蜓 蝙蝠 犀牛 河马 树懒 蚂蚁 蟒蛇 鲨鱼'],
    ['食物', '冰淇淋 火锅 寿司 披萨 炸鸡 珍珠奶茶 棉花糖 草莓 西瓜 泡面 烤红薯 月饼 棒棒糖 荷包蛋 生日蛋糕 麻辣烫 三明治 饺子 糖葫芦 牛油果 '
        + '汉堡 煎饼果子 烤串 拉面 包子 粽子 麻婆豆腐 芝士 布丁 华夫饼 蛋挞 可颂 抹茶蛋糕 咖啡 气泡水 关东煮 章鱼小丸子 酸梅汤 桂花糕 蛋黄酥'],
    ['日常', '雨伞 牙刷 闹钟 眼镜 钥匙 手机 购物车 书包 拖鞋 台灯 耳机 吉他 相机 电风扇 洗衣机 镜子 梳子 水壶 计算器 耳机线 '
        + '雨鞋 电饭锅 微波炉 吹风机 剃须刀 指甲刀 剪刀 手表 项链 抱枕 花瓶 打火机 自行车 快递盒 搓衣板 灯泡 遥控器 插排 垃圾桶 拖把'],
    ['场景', '打喷嚏 遛狗 堆雪人 放风筝 做鬼脸 游泳 爬山 熬夜 搬家 看电影 赶地铁 晒衣服 洗头发 吹泡泡 钓鱼 抓娃娃 睡懒觉 打扫卫生 排队 淋雨 '
        + '潜泳 蹦极 露营 划船 打雪仗 堆沙堡 过生日 路边烧烤 洗车 剪头发 遛猫 追剧 通宵加班 骑车兜风 睡衣趴 排队取号 健身打卡 一起做饭 大扫除 逛超市'],
    ['其他', '彩虹 流星 台风 迷宫 拥抱 初雪 晚霞 失眠 发呆 快递 月光 影子 二维码 日出 云朵 星星 贝壳 陀螺 沙漏 风铃 '
        + '风向标 望远镜 万花筒 摩天轮 热气球 篝火 脚印 心电图 指纹 折纸 拼图 积木 魔方 年轮 涟漪 极光 龙卷风 火山 冰山 绿洲'],
];

const WORDS: WordItem[] = [];
(function build(): void {
    for (let i = 0; i < RAW.length; i++) {
        const cat = RAW[i][0];
        const list = RAW[i][1].split(' ');
        for (let j = 0; j < list.length; j++) {
            const text = list[j].trim();
            if (!text) {
                continue;
            }
            WORDS.push({ id: cat + '_' + text, text, cat });
        }
    }
})();

function shuffle<T>(arr: T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
    }
    return a;
}

/** 抽 N 个词供画画的人挑，used 里的不再出 */
export function pickDrawChoices(count: number, used: string[]): WordItem[] {
    const usedSet: { [k: string]: boolean } = {};
    for (let i = 0; i < used.length; i++) {
        usedSet[used[i]] = true;
    }
    const pool = WORDS.filter((w) => !usedSet[w.id]);
    const src = pool.length >= count ? pool : WORDS;
    return shuffle(src).slice(0, count);
}

/** 猜词候选：正确答案 + 干扰项（优先同类别，不够再从别类补） */
export function pickCandidates(correct: WordItem, count: number): string[] {
    const same = WORDS.filter((w) => w.cat === correct.cat && w.id !== correct.id);
    const other = WORDS.filter((w) => w.cat !== correct.cat && w.id !== correct.id);
    const list: WordItem[] = shuffle(same);
    if (list.length < count - 1) {
        list.push.apply(list, shuffle(other).slice(0, count - 1 - list.length));
    }
    const texts = list.slice(0, count - 1).map((w) => w.text);
    texts.push(correct.text);
    return shuffle(texts);
}

export function totalWords(): number {
    return WORDS.length;
}

export function allWords(): WordItem[] {
    return WORDS;
}
