/**
 * 牌型评估工具函数
 * 职责：比牌、牌型判断、最佳牌组合提取
 * 独立于状态机，可被多个模块复用
 */

import {
  CARD_VALUES,
  FLUSH_RANK_WEIGHTS,
  HAND_RANKS,
  ROYAL_FLUSH_VALUES,
  WHEEL_STRAIGHT_VALUES,
  type card_Type,
} from '../core/game_types.js'

/**
 * 德州扑克牌型枚举，从小到大排序
 * 使用统一常量定义
 */
export enum HandRank {
  HighCard = HAND_RANKS.HIGH_CARD - 1, // 高牌 (0)
  OnePair = HAND_RANKS.ONE_PAIR - 1, // 一对 (1)
  TwoPair = HAND_RANKS.TWO_PAIR - 1, // 两对 (2)
  ThreeOfAKind = HAND_RANKS.THREE_OF_A_KIND - 1, // 三条 (3)
  Straight = HAND_RANKS.STRAIGHT - 1, // 顺子 (4)
  Flush = HAND_RANKS.FLUSH - 1, // 同花 (5)
  FullHouse = HAND_RANKS.FULL_HOUSE - 1, // 葫芦 (6)
  FourOfAKind = HAND_RANKS.FOUR_OF_A_KIND - 1, // 四条 (7)
  StraightFlush = HAND_RANKS.STRAIGHT_FLUSH - 1, // 同花顺 (8)
  RoyalFlush = HAND_RANKS.ROYAL_FLUSH - 1, // 皇家同花顺 (9)
}

/**
 * 牌型描述映射
 */
const HandDescriptions = {
  [HandRank.HighCard]: '高牌',
  [HandRank.OnePair]: '一对',
  [HandRank.TwoPair]: '两对',
  [HandRank.ThreeOfAKind]: '三条',
  [HandRank.Straight]: '顺子',
  [HandRank.Flush]: '同花',
  [HandRank.FullHouse]: '葫芦',
  [HandRank.FourOfAKind]: '四条',
  [HandRank.StraightFlush]: '同花顺',
  [HandRank.RoyalFlush]: '皇家同花顺',
}

/**
 * 手牌详细信息接口
 */
export interface HandDetails {
  rank: HandRank
  description: string
  // 用于比较的关键值数组，按重要性排序
  compareValues: number[]
  // 最佳牌型对应的5张牌,设计成可选，是为了方便迭代改动较小，这里比牌算法已经稳定了
  best5Cards?: card_Type[]
}

/**
 * 牌型分析的基础数据结构
 */
interface CardAnalysis {
  sortedCards: card_Type[] // 按点数从大到小排序的牌
  suits: { [key: string]: card_Type[] } // 按花色分组的牌
  flushSuits: string[] // 有5张或以上牌的花色
  valueCounts: { [key: string]: number } // 每个点数的数量统计
  values: number[] // 去重后按从大到小排序的点数
  pairs: number[] // 对子的点数（从大到小）
  threes: number[] // 三条的点数（从大到小）
  fours: number[] // 四条的点数（从大到小）
}

/**
 * 输入验证和基础数据分析
 * @param cards 7张牌
 * @returns 分析结果
 */
function analyzeCards(cards: card_Type[]): CardAnalysis {
  // 检查重复牌
  const cardKeys = cards.map((card) => `${card.suit}${card.rank}`)
  if (new Set(cardKeys).size !== cardKeys.length) {
    throw new Error(`analyzeCards 发现重复牌 cardKeys=${JSON.stringify(cardKeys)}`)
  }

  // 验证牌的有效性
  for (const card of cards) {
    if (!card.suit || !card.rank || !card.value) {
      throw new Error(`analyzeCards 无效的牌: ${JSON.stringify(card)}`)
    }
    if (card.value < 2 || card.value > CARD_VALUES.ACE_HIGH) {
      throw new Error(`analyzeCards 牌值超出范围: ${card.value}`)
    }
  }

  // 按照点数从大到小排序
  const sortedCards = [...cards].sort((a, b) => b.value - a.value)

  // 按花色分组
  const suits: { [key: string]: card_Type[] } = {}
  for (const card of sortedCards) {
    if (!suits[card.suit]) {
      suits[card.suit] = []
    }
    suits[card.suit].push(card)
  }

  // 找到所有可能的同花（5张或以上）
  const flushSuits = Object.keys(suits).filter((suit) => suits[suit].length >= 5)

  // 统计每个点数的数量
  const valueCounts: { [key: string]: number } = {}
  for (const card of sortedCards) {
    valueCounts[card.value] = (valueCounts[card.value] || 0) + 1
  }

  // 去重并排序的点数
  const values = Array.from(new Set(sortedCards.map((card) => card.value))).sort((a, b) => b - a)

  // 分类统计
  const pairs = Object.keys(valueCounts)
    .filter((value) => valueCounts[value] === 2)
    .map(Number)
    .sort((a, b) => b - a)
  const threes = Object.keys(valueCounts)
    .filter((value) => valueCounts[value] === 3)
    .map(Number)
    .sort((a, b) => b - a)
  const fours = Object.keys(valueCounts)
    .filter((value) => valueCounts[value] === 4)
    .map(Number)
    .sort((a, b) => b - a)

  return {
    sortedCards,
    suits,
    flushSuits,
    valueCounts,
    values,
    pairs,
    threes,
    fours,
  }
}

/**
 * 根据牌型等级和比较值确定需要的点数
 * @param rank 牌型等级
 * @param compareValues 比较值数组
 * @returns 需要的点数数组（可能有重复，表示需要多张）
 */
function getRequiredValuesForRank(rank: number, compareValues: number[]): number[] {
  switch (rank) {
    case HandRank.RoyalFlush: // 皇家同花顺
      return [...ROYAL_FLUSH_VALUES]
    case HandRank.StraightFlush: {
      // 同花顺
      const high = compareValues[0]
      // 检查是否是轮子（A-5-4-3-2）
      if (high === 5) {
        return [...WHEEL_STRAIGHT_VALUES]
      }
      // 常规同花顺
      return [high, high - 1, high - 2, high - 3, high - 4]
    }
    case HandRank.FourOfAKind: // 四条
      return [
        compareValues[0],
        compareValues[0],
        compareValues[0],
        compareValues[0],
        compareValues[1],
      ]
    case HandRank.FullHouse: // 葫芦
      return [
        compareValues[0],
        compareValues[0],
        compareValues[0],
        compareValues[1],
        compareValues[1],
      ]
    case HandRank.Flush: // 同花
      return compareValues.slice(0, 5)
    case HandRank.Straight: {
      // 顺子
      const high = compareValues[0]
      // 检查是否是轮子（A-5-4-3-2）
      if (high === 5) {
        return [...WHEEL_STRAIGHT_VALUES]
      }
      // 常规顺子
      return [high, high - 1, high - 2, high - 3, high - 4]
    }
    case HandRank.ThreeOfAKind: // 三条
      return [
        compareValues[0],
        compareValues[0],
        compareValues[0],
        compareValues[1],
        compareValues[2],
      ]
    case HandRank.TwoPair: // 两对
      return [
        compareValues[0],
        compareValues[0],
        compareValues[1],
        compareValues[1],
        compareValues[2],
      ]
    case HandRank.OnePair: // 一对
      return [
        compareValues[0],
        compareValues[0],
        compareValues[1],
        compareValues[2],
        compareValues[3],
      ]
    case HandRank.HighCard: // 高牌
      return compareValues.slice(0, 5)
    default:
      return []
  }
}

/**
 * 从7张牌中提取最佳5张牌
 * @param allCards 所有7张牌
 * @param requiredValues 需要的点数数组（可能有重复）
 * @param rank 牌型等级（用于特殊处理同花和同花顺）
 * @param analysis 牌型分析数据
 * @returns 提取的5张牌
 */
function extractBest5CardsFromAll(
  allCards: card_Type[],
  requiredValues: number[],
  rank: number,
  analysis: CardAnalysis
): card_Type[] {
  const result: card_Type[] = []
  const used = new Set<string>()

  // 对于同花和同花顺，需要确保花色一致
  if (
    rank === HandRank.Flush ||
    rank === HandRank.StraightFlush ||
    rank === HandRank.RoyalFlush
  ) {
    // 找到同花的花色
    const flushSuit = analysis.flushSuits[0]
    if (flushSuit) {
      const flushCards = analysis.suits[flushSuit].sort((a, b) => b.value - a.value)

      // 对于每个需要的点数，从同花牌中选择
      for (const value of requiredValues) {
        const availableCards = flushCards.filter(
          (card) => card.value === value && !used.has(`${card.suit}${card.rank}`)
        )

        if (availableCards.length === 0) {
          continue
        }

        // 选择第一张可用的牌
        const selected = availableCards[0]
        result.push(selected)
        used.add(`${selected.suit}${selected.rank}`)
      }

      if (result.length === 5) {
        return result
      }
    }
  }

  // 对于其他牌型，直接按点数选择
  for (const value of requiredValues) {
    const availableCards = allCards.filter(
      (card) => card.value === value && !used.has(`${card.suit}${card.rank}`)
    )

    if (availableCards.length === 0) {
      continue
    }

    // 选择第一张可用的牌
    const selected = availableCards[0]
    result.push(selected)
    used.add(`${selected.suit}${selected.rank}`)
  }

  return result
}

/**
 * 计算最佳5张牌组合（公共接口）
 * @param allCards 所有7张牌
 * @param rank 牌型等级
 * @param compareValues 比较值数组
 * @param analysis 牌型分析数据
 * @returns 最佳5张牌
 */
function calculateBest5Cards(
  allCards: card_Type[],
  rank: number,
  compareValues: number[],
  analysis: CardAnalysis
): card_Type[] {
  // 根据牌型等级和比较值确定需要的点数
  const requiredValues = getRequiredValuesForRank(rank, compareValues)

  // 从7张牌中提取这5张牌
  return extractBest5CardsFromAll(allCards, requiredValues, rank, analysis)
}

/**
 * 检查皇家同花顺
 * @param analysis 牌型分析数据
 * @returns 皇家同花顺信息或null
 */
function checkRoyalFlush(analysis: CardAnalysis): HandDetails | null {
  if (analysis.flushSuits.length === 0) {
    return null
  }

  for (const suit of analysis.flushSuits) {
    const flushCards = analysis.suits[suit]
    const flushValues = flushCards.map((card) => card.value)

    // 检查是否包含皇家同花顺的所有牌：A(14), K(13), Q(12), J(11), 10(10)
    const hasRoyalCards = ROYAL_FLUSH_VALUES.every((value) => flushValues.includes(value))

    if (hasRoyalCards) {
      return {
        rank: HandRank.RoyalFlush,
        description: HandDescriptions[HandRank.RoyalFlush],
        compareValues: [CARD_VALUES.ACE_HIGH], // 皇家同花顺都是A高，无需比较
      }
    }
  }

  return null
}

/**
 * 检查同花顺
 * @param analysis 牌型分析数据
 * @returns 同花顺信息或null
 */
function checkStraightFlush(analysis: CardAnalysis): HandDetails | null {
  if (analysis.flushSuits.length === 0) {
    return null
  }

  let bestStraightFlushHigh = 0

  for (const suit of analysis.flushSuits) {
    const flushCards = analysis.suits[suit].sort((a, b) => b.value - a.value)
    const uniqueFlushValues = Array.from(new Set(flushCards.map((card) => card.value))).sort(
      (a, b) => b - a
    )

    // 检查常规同花顺
    for (let i = 0; i <= uniqueFlushValues.length - 5; i++) {
      if (uniqueFlushValues[i] - uniqueFlushValues[i + 4] === 4) {
        const currentStraightFlushHigh = uniqueFlushValues[i]
        if (currentStraightFlushHigh > bestStraightFlushHigh) {
          bestStraightFlushHigh = currentStraightFlushHigh
        }
        break
      }
    }

    // 检查A-5-4-3-2轮子同花顺
    if (WHEEL_STRAIGHT_VALUES.every((value) => uniqueFlushValues.includes(value))) {
      if (bestStraightFlushHigh === 0) {
        bestStraightFlushHigh = 5 // 轮子同花顺是5高
      }
    }
  }

  if (bestStraightFlushHigh > 0) {
    return {
      rank: HandRank.StraightFlush,
      description: `${HandDescriptions[HandRank.StraightFlush]} (${bestStraightFlushHigh}高)`,
      compareValues: [bestStraightFlushHigh],
    }
  }

  return null
}

/**
 * 检查四条
 * @param analysis 牌型分析数据
 * @returns 四条信息或null
 */
function checkFourOfAKind(analysis: CardAnalysis): HandDetails | null {
  if (analysis.fours.length === 0) {
    return null
  }

  const fourValue = analysis.fours[0]
  // 找到最大的踢脚牌（不是四条的牌）
  const kickers = Object.keys(analysis.valueCounts)
    .map(Number)
    .filter((value) => value !== fourValue)
    .sort((a, b) => b - a)

  const kicker = kickers.length > 0 ? kickers[0] : 0

  return {
    rank: HandRank.FourOfAKind,
    description: `${HandDescriptions[HandRank.FourOfAKind]} (${fourValue})`,
    compareValues: [fourValue, kicker],
  }
}

/**
 * 检查葫芦
 * @param analysis 牌型分析数据
 * @returns 葫芦信息或null
 */
function checkFullHouse(analysis: CardAnalysis): HandDetails | null {
  if (analysis.threes.length === 0) {
    return null
  }

  let pairValue = null
  const threeValue = analysis.threes[0] // 最大的三条

  if (analysis.threes.length > 1) {
    // 两个或更多三条，选择最大的做三条，第二大的做对子
    pairValue = analysis.threes[1]
  } else if (analysis.pairs.length > 0) {
    // 一个三条配对子，选择最大的对子
    const availablePairs = analysis.pairs.filter((pairVal) => pairVal !== threeValue)
    if (availablePairs.length > 0) {
      pairValue = availablePairs[0]
    }
  }

  if (pairValue !== null) {
    return {
      rank: HandRank.FullHouse,
      description: `${HandDescriptions[HandRank.FullHouse]} (${threeValue}配${pairValue})`,
      compareValues: [threeValue, pairValue],
    }
  }

  return null
}

/**
 * 检查同花
 * @param analysis 牌型分析数据
 * @returns 同花信息或null
 */
function checkFlush(analysis: CardAnalysis): HandDetails | null {
  if (analysis.flushSuits.length === 0) {
    return null
  }

  let bestFlushCards: card_Type[] = []
  let bestFlushRank = -1

  for (const suit of analysis.flushSuits) {
    const flushCards = analysis.suits[suit].sort((a, b) => b.value - a.value)
    const top5 = flushCards.slice(0, 5)

    // 计算同花强度
    const currentFlushRank =
      top5[0].value * FLUSH_RANK_WEIGHTS.FIRST_CARD +
      top5[1].value * FLUSH_RANK_WEIGHTS.SECOND_CARD +
      top5[2].value * FLUSH_RANK_WEIGHTS.THIRD_CARD +
      top5[3].value * FLUSH_RANK_WEIGHTS.FOURTH_CARD +
      top5[4].value * FLUSH_RANK_WEIGHTS.FIFTH_CARD

    if (currentFlushRank > bestFlushRank) {
      bestFlushRank = currentFlushRank
      bestFlushCards = top5
    }
  }

  if (bestFlushCards.length > 0) {
    const topFiveFlush = bestFlushCards.map((card) => card.value).sort((a, b) => b - a)
    return {
      rank: HandRank.Flush,
      description: `${HandDescriptions[HandRank.Flush]} (${topFiveFlush[0]}高)`,
      compareValues: topFiveFlush,
    }
  }

  return null
}

/**
 * 检查顺子
 * @param analysis 牌型分析数据
 * @returns 顺子信息或null
 */
function checkStraight(analysis: CardAnalysis): HandDetails | null {
  // 检查常规顺子
  for (let i = 0; i <= analysis.values.length - 5; i++) {
    if (analysis.values[i] - analysis.values[i + 4] === 4) {
      const straightHighCard = analysis.values[i]
      return {
        rank: HandRank.Straight,
        description: `${HandDescriptions[HandRank.Straight]} (${straightHighCard}高)`,
        compareValues: [straightHighCard],
      }
    }
  }

  // 检查A-5-4-3-2顺子
  if (WHEEL_STRAIGHT_VALUES.every((value) => analysis.values.includes(value))) {
    return {
      rank: HandRank.Straight,
      description: `${HandDescriptions[HandRank.Straight]} (5高)`,
      compareValues: [5],
    }
  }

  return null
}

/**
 * 检查三条
 * @param analysis 牌型分析数据
 * @returns 三条信息或null
 */
function checkThreeOfAKind(analysis: CardAnalysis): HandDetails | null {
  if (analysis.threes.length === 0) {
    return null
  }

  const threeValue = analysis.threes[0]
  // 排除三条的牌值，选择最大的两张踢脚牌
  const kickers = Object.keys(analysis.valueCounts)
    .map(Number)
    .filter((value) => value !== threeValue)
    .sort((a, b) => b - a)
    .slice(0, 2)

  // 确保有足够的踢脚牌
  while (kickers.length < 2) {
    kickers.push(0)
  }

  return {
    rank: HandRank.ThreeOfAKind,
    description: `${HandDescriptions[HandRank.ThreeOfAKind]} (${threeValue}) 配 ${JSON.stringify(kickers)}`,
    compareValues: [threeValue, ...kickers],
  }
}

/**
 * 检查两对
 * @param analysis 牌型分析数据
 * @returns 两对信息或null
 */
function checkTwoPair(analysis: CardAnalysis): HandDetails | null {
  if (analysis.pairs.length < 2) {
    return null
  }

  // 选择最大的两个对子
  const topTwoPairs = analysis.pairs.slice(0, 2)
  // 排除对子的牌值，选择最大的踢脚牌
  const usedValues = new Set(topTwoPairs)
  const availableKickers = Object.keys(analysis.valueCounts)
    .map(Number)
    .filter((value) => !usedValues.has(value))
    .sort((a, b) => b - a)

  const kicker = availableKickers.length > 0 ? availableKickers[0] : 0

  return {
    rank: HandRank.TwoPair,
    description: `${HandDescriptions[HandRank.TwoPair]} (${topTwoPairs[0]}和${topTwoPairs[1]}) 配${kicker}`,
    compareValues: [topTwoPairs[0], topTwoPairs[1], kicker],
  }
}

/**
 * 检查一对
 * @param analysis 牌型分析数据
 * @returns 一对信息或null
 */
function checkOnePair(analysis: CardAnalysis): HandDetails | null {
  if (analysis.pairs.length === 0) {
    return null
  }

  const pairValue = analysis.pairs[0] // 选择最大的对子
  // 排除对子的牌值，选择最大的三张踢脚牌
  const kickers = Object.keys(analysis.valueCounts)
    .map(Number)
    .filter((value) => value !== pairValue)
    .sort((a, b) => b - a)
    .slice(0, 3)

  // 确保有足够的踢脚牌
  while (kickers.length < 3) {
    kickers.push(0)
  }

  return {
    rank: HandRank.OnePair,
    description: `${HandDescriptions[HandRank.OnePair]} (${pairValue}) 配 ${JSON.stringify(kickers)}`,
    compareValues: [pairValue, ...kickers],
  }
}

/**
 * 检查高牌
 * @param analysis 牌型分析数据
 * @returns 高牌信息
 */
function checkHighCard(analysis: CardAnalysis): HandDetails {
  const highCards = analysis.sortedCards.slice(0, 5).map((card) => card.value)

  // 确保有足够的牌
  while (highCards.length < 5) {
    highCards.push(0)
  }

  return {
    rank: HandRank.HighCard,
    description: `${HandDescriptions[HandRank.HighCard]} (${highCards[0]})`,
    compareValues: highCards,
  }
}

/**
 * 计算牌型 - 总入口函数
 * @param cards 7张牌（2张底牌 + 5张公共牌）
 * @returns 牌型详细信息
 */
export function evaluateHand(cards: card_Type[]): HandDetails | null {
  console.debug(`evaluateHand ${cards.map((card) => card.value).join(' ')}  evaluateHand start`)

  try {
    // 分析牌的基础数据
    const analysis = analyzeCards(cards)

    console.debug(
      `${cards.map((card) => card.value).join(' ')} analysis=${JSON.stringify(analysis)}  evaluateHand end`
    )

    // 按照牌型优先级依次检查，找到最大的就返回

    // 1. 皇家同花顺
    const royalFlush = checkRoyalFlush(analysis)
    if (royalFlush) {
      const best5Cards = calculateBest5Cards(
        cards,
        royalFlush.rank,
        royalFlush.compareValues,
        analysis
      )
      return {
        ...royalFlush,
        best5Cards,
      }
    }

    // 2. 同花顺
    const straightFlush = checkStraightFlush(analysis)
    if (straightFlush) {
      const best5Cards = calculateBest5Cards(
        cards,
        straightFlush.rank,
        straightFlush.compareValues,
        analysis
      )
      return {
        ...straightFlush,
        best5Cards,
      }
    }

    // 3. 四条
    const fourOfAKind = checkFourOfAKind(analysis)
    if (fourOfAKind) {
      const best5Cards = calculateBest5Cards(
        cards,
        fourOfAKind.rank,
        fourOfAKind.compareValues,
        analysis
      )
      return {
        ...fourOfAKind,
        best5Cards,
      }
    }

    // 4. 葫芦
    const fullHouse = checkFullHouse(analysis)
    if (fullHouse) {
      const best5Cards = calculateBest5Cards(cards, fullHouse.rank, fullHouse.compareValues, analysis)
      return {
        ...fullHouse,
        best5Cards,
      }
    }

    // 5. 同花
    const flush = checkFlush(analysis)
    if (flush) {
      const best5Cards = calculateBest5Cards(cards, flush.rank, flush.compareValues, analysis)
      return {
        ...flush,
        best5Cards,
      }
    }

    // 6. 顺子
    const straight = checkStraight(analysis)
    if (straight) {
      const best5Cards = calculateBest5Cards(cards, straight.rank, straight.compareValues, analysis)
      return {
        ...straight,
        best5Cards,
      }
    }

    // 7. 三条
    const threeOfAKind = checkThreeOfAKind(analysis)
    if (threeOfAKind) {
      const best5Cards = calculateBest5Cards(
        cards,
        threeOfAKind.rank,
        threeOfAKind.compareValues,
        analysis
      )
      return {
        ...threeOfAKind,
        best5Cards,
      }
    }

    // 8. 两对
    const twoPair = checkTwoPair(analysis)
    if (twoPair) {
      const best5Cards = calculateBest5Cards(cards, twoPair.rank, twoPair.compareValues, analysis)
      return {
        ...twoPair,
        best5Cards,
      }
    }

    // 9. 一对
    const onePair = checkOnePair(analysis)
    if (onePair) {
      const best5Cards = calculateBest5Cards(cards, onePair.rank, onePair.compareValues, analysis)
      return {
        ...onePair,
        best5Cards,
      }
    }

    // 10. 高牌
    const highCard = checkHighCard(analysis)
    const best5Cards = calculateBest5Cards(cards, highCard.rank, highCard.compareValues, analysis)
    return {
      ...highCard,
      best5Cards,
    }
  } catch (error) {
    console.error('evaluateHand error:', error)
    return null
  }
}

/**
 * 根据牌型等级和比较值确定需要的点数
 * @param rank 牌型等级
 * @param compareValues 比较值数组
 * @returns 需要的点数数组（可能有重复，表示需要多张）
 */
function getRequiredValues(rank: number, compareValues: number[]): number[] {
  switch (rank) {
    case HandRank.RoyalFlush: // 皇家同花顺
      return [...ROYAL_FLUSH_VALUES]
    case HandRank.StraightFlush: {
      // 同花顺
      const high = compareValues[0]
      // 检查是否是轮子（A-5-4-3-2）
      if (high === 5 && WHEEL_STRAIGHT_VALUES.every((v) => compareValues.includes(v))) {
        return [...WHEEL_STRAIGHT_VALUES]
      }
      // 常规同花顺
      return [high, high - 1, high - 2, high - 3, high - 4]
    }
    case HandRank.FourOfAKind: // 四条
      return [
        compareValues[0],
        compareValues[0],
        compareValues[0],
        compareValues[0],
        compareValues[1],
      ]
    case HandRank.FullHouse: // 葫芦
      return [
        compareValues[0],
        compareValues[0],
        compareValues[0],
        compareValues[1],
        compareValues[1],
      ]
    case HandRank.Flush: // 同花
      return compareValues.slice(0, 5)
    case HandRank.Straight: {
      // 顺子
      const high = compareValues[0]
      // 检查是否是轮子（A-5-4-3-2）
      if (high === 5) {
        return [...WHEEL_STRAIGHT_VALUES]
      }
      // 常规顺子
      return [high, high - 1, high - 2, high - 3, high - 4]
    }
    case HandRank.ThreeOfAKind: // 三条
      return [
        compareValues[0],
        compareValues[0],
        compareValues[0],
        compareValues[1],
        compareValues[2],
      ]
    case HandRank.TwoPair: // 两对
      return [
        compareValues[0],
        compareValues[0],
        compareValues[1],
        compareValues[1],
        compareValues[2],
      ]
    case HandRank.OnePair: // 一对
      return [
        compareValues[0],
        compareValues[0],
        compareValues[1],
        compareValues[2],
        compareValues[3],
      ]
    case HandRank.HighCard: // 高牌
      return compareValues.slice(0, 5)
    default:
      return []
  }
}

/**
 * 优化公共牌使用：对于手牌，尝试用公共牌替换，如果替换后不影响牌型，就替换
 * @param best5Cards 当前最佳的5张牌
 * @param board 公共牌
 * @param boardSet 公共牌集合
 * @param originalRank 原始牌型等级
 * @param originalCompareValues 原始比较值
 * @returns 优化后的5张牌
 */
function optimizeBoardCardUsage(
  best5Cards: card_Type[],
  board: card_Type[],
  boardSet: Set<string>,
  originalRank: number,
  originalCompareValues: number[]
): card_Type[] {
  const optimized = [...best5Cards]

  // 对于每张手牌，尝试用公共牌替换
  for (let i = 0; i < optimized.length; i++) {
    const currentCard = optimized[i]
    const isHoldCard = !boardSet.has(`${currentCard.suit}${currentCard.rank}`)

    if (!isHoldCard) {
      continue // 已经是公共牌，跳过
    }

    // 查找相同点数的公共牌（且不在当前5张牌中）
    const boardReplacement = board.find(
      (card) =>
        card.value === currentCard.value &&
        !optimized.some((c) => `${c.suit}${c.rank}` === `${card.suit}${card.rank}`)
    )

    if (!boardReplacement) {
      continue // 没有可替换的公共牌
    }

    // 尝试替换
    optimized[i] = boardReplacement

    // 验证替换后牌型不变
    // 注意：这里需要重新评估，但为了性能，我们可以只检查关键条件
    // 对于大多数牌型，只要点数相同，替换后牌型不会变
    // 但对于同花和同花顺，需要确保花色一致
    if (
      originalRank === HandRank.Flush ||
      originalRank === HandRank.StraightFlush ||
      originalRank === HandRank.RoyalFlush
    ) {
      // 同花或同花顺：需要确保替换后的牌在同一花色
      const flushSuit = optimized[0].suit
      const allSameSuit = optimized.every((card) => card.suit === flushSuit)
      if (!allSameSuit) {
        // 替换失败，恢复原牌
        optimized[i] = currentCard
        continue
      }
    }

    // 对于其他牌型，只要点数相同，替换后牌型不会变
    // 但为了安全，我们可以快速验证：检查替换后的5张牌是否仍然满足原始牌型的要求
    const newRequiredValues = getRequiredValues(originalRank, originalCompareValues)
    const newCardValues = optimized.map((card) => card.value).sort((a, b) => b - a)
    const requiredValuesSorted = [...newRequiredValues].sort((a, b) => b - a)

    // 检查是否仍然满足要求（对于非同花牌型，只需要点数匹配）
    if (
      originalRank !== HandRank.Flush &&
      originalRank !== HandRank.StraightFlush &&
      originalRank !== HandRank.RoyalFlush
    ) {
      // 对于非同花牌型，检查点数是否匹配
      let matches = true
      for (let j = 0; j < requiredValuesSorted.length; j++) {
        if (newCardValues[j] !== requiredValuesSorted[j]) {
          matches = false
          break
        }
      }
      if (!matches) {
        // 替换失败，恢复原牌
        optimized[i] = currentCard
        continue
      }
    }

    // 替换成功，保持替换
  }

  return optimized
}

/**
 * 提取组成最大牌的5张牌，并区分公共牌 and 手牌
 * 新思路：利用 evaluateHand 的返回信息快速确定最大牌型组合，然后优化公共牌使用
 * @param holdCards 玩家的手牌（2张）
 * @param board 公共牌（5张）
 * @returns [组成最大牌的公共牌, 组成最大牌的手牌]
 */
export function extractBestHandCards(
  holdCards: card_Type[],
  board: card_Type[]
): [card_Type[], card_Type[]] {
  if (!holdCards || holdCards.length === 0 || !board || board.length === 0) {
    return [[], []]
  }

  const allCards = [...holdCards, ...board]
  const handDetails = evaluateHand(allCards)
  if (!handDetails || !handDetails.best5Cards) {
    return [[], []]
  }

  // 调试信息：输出识别出的牌型
  console.debug(
    `extractBestHandCards: handRank=${handDetails.rank}, description=${handDetails.description}, compareValues=${JSON.stringify(handDetails.compareValues)}`
  )

  // 创建公共牌集合，用于快速查找
  const boardSet = new Set(board.map((card) => `${card.suit}${card.rank}`))
  const holdCardsSet = new Set(holdCards.map((card) => `${card.suit}${card.rank}`))

  // 直接使用 evaluateHand 返回的 best5Cards
  const best5Cards = handDetails.best5Cards

  console.debug(
    `extractBestHandCards: best5Cards=${best5Cards.map((c) => `${c.rank}${c.suit}`).join(' ')}`
  )

  // 优化公共牌使用：对于手牌，尝试用公共牌替换
  const optimizedCards = optimizeBoardCardUsage(
    best5Cards,
    board,
    boardSet,
    handDetails.rank,
    handDetails.compareValues
  )

  // 调试信息：输出提取的牌
  console.debug(
    `extractBestHandCards: optimizedCards=${optimizedCards.map((c) => `${c.rank}${c.suit}`).join(' ')}`
  )

  // 区分公共牌和手牌
  const boardCards: card_Type[] = []
  const holdCardsInBest: card_Type[] = []

  for (const card of optimizedCards) {
    const cardKey = `${card.suit}${card.rank}`
    if (boardSet.has(cardKey)) {
      boardCards.push(card)
    } else if (holdCardsSet.has(cardKey)) {
      holdCardsInBest.push(card)
    }
  }

  return [boardCards, holdCardsInBest]
}
