/**
 * Fisher-Yates 洗牌实现（验证对象）
 *
 * 本文件是被验证的算法本身，尽量保持最小实现，避免与验证逻辑耦合。
 * 随机源使用 Node.js crypto.randomInt(min, max)，官方保证：
 *   - 返回值在 [min, max) 区间内均匀分布；
 *   - 实现避免了模偏差（modulo bias）。
 *
 * 参考：
 *   - Knuth Shuffle: https://algs4.cs.princeton.edu/code/javadoc/edu/princeton/cs/algs4/Knuth.html
 *   - Node.js crypto.randomInt: https://nodejs.org/api/crypto.html#cryptorandomintmin-max-callback
 */

import { randomInt } from 'node:crypto';

/** 牌面点数：0=2 ... 8=T, 9=J, 10=Q, 11=K, 12=A */
export type Rank = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** 花色：0=梅花(c) 1=方片(d) 2=红桃(h) 3=黑桃(s) */
export type Suit = 0 | 1 | 2 | 3;

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
export const SUITS = ['c', 'd', 'h', 's'] as const;

/** 创建一副有序的 52 张牌。 */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 0; rank < 13; rank++) {
      deck.push({ rank: rank as Rank, suit: suit as Suit });
    }
  }
  return deck;
}

/**
 * 标准 Fisher-Yates 洗牌（原地）。
 *
 * 从数组末尾 i=51 开始，到 i=1 结束：
 *   - 每一步在 [0, i] 中等概率选一个 j（randomInt(0, i+1) 返回 [0, i+1) 即 [0, i]）；
 *   - 交换 deck[i] 与 deck[j]。
 *
 * 任意完整牌序的概率为 1/52 * 1/51 * ... * 1/2 = 1/52!。
 */
/** 随机整数函数签名：验证时可注入"记录包装"，默认使用 crypto.randomInt。 */
export type Rng = (min: number, max: number) => number;

const cryptoRandomInt: Rng = (min, max) => randomInt(min, max);

export function shuffleDeck(deck: Card[], rng: Rng = cryptoRandomInt): Card[] {
  for (let i = deck.length - 1; i >= 1; i--) {
    const j = rng(0, i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** 创建并洗一副新牌。 */
export function createAndShuffleDeck(rng: Rng = cryptoRandomInt): Card[] {
  return shuffleDeck(createDeck(), rng);
}
