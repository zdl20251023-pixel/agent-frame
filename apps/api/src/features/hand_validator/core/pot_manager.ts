import { randomInt } from 'node:crypto'
import type { player_Type, table_Type } from './game_types.js'

/**
 * 将当前轮投注并入整手牌累计（防御式编程）
 * @param table 牌桌对象
 */
export function mergeStreetToContributions(table: table_Type): void {
  for (const [seatStr, amt] of Object.entries(table.streetBets || {})) {
    if (!amt || amt <= 0) {
      continue
    }
    const prev = table.contributions[seatStr] || 0
    table.contributions[seatStr] = prev + amt
  }
  table.streetBets = {}
}

/**
 * 重建主池与边池（幂等）
 * @param table 牌桌对象
 */
export function rebuildPots(table: table_Type): void {
  const contribMap = new Map<number, number>()
  for (const [seatStr, amt] of Object.entries(table.contributions || {})) {
    const seat = Number(seatStr)
    if (amt && amt > 0) {
      contribMap.set(seat, amt)
    }
  }
  if (contribMap.size === 0) {
    table.pots = []
    table.pot = 0
    return
  }

  const validPlayerContribs = new Map<number, number>()
  const foldedPlayerContribs = new Map<number, number>()

  for (const [seatIdx, amount] of contribMap.entries()) {
    const player = table.playerList.find((p) => p.seatIdx === seatIdx)
    if (player && player.isActive && (player.isAllin || !player.isFold)) {
      validPlayerContribs.set(seatIdx, amount)
    } else if (player && player.isActive && player.isFold) {
      foldedPlayerContribs.set(seatIdx, amount)
    }
  }

  if (validPlayerContribs.size === 0) {
    table.pots = []
    table.pot = 0
    return
  }

  const validContributions = Array.from(validPlayerContribs.values())
  const uniqueCaps = Array.from(new Set(validContributions)).sort((a, b) => a - b)

  const pots: {
    id: number
    amount: number
    cap: number | null
    contributors: Record<string, number>
  }[] = []

  let prevCap = 0
  let potId = 0

  for (const cap of uniqueCaps) {
    const layerWidth = cap - prevCap
    if (layerWidth <= 0) {
      prevCap = cap
      continue
    }

    const potContrib: Record<string, number> = {}
    let potAmount = 0

    for (const [seatIdx, totalContrib] of validPlayerContribs.entries()) {
      if (totalContrib >= cap) {
        potContrib[String(seatIdx)] = layerWidth
        potAmount += layerWidth
      }
    }

    for (const [seatIdx, totalContrib] of foldedPlayerContribs.entries()) {
      if (totalContrib >= prevCap) {
        const foldedLayerContrib = Math.min(layerWidth, totalContrib - prevCap)
        if (foldedLayerContrib > 0) {
          potContrib[String(seatIdx)] = foldedLayerContrib
          potAmount += foldedLayerContrib
        }
      }
    }

    if (potAmount > 0) {
      pots.push({
        id: potId++,
        amount: potAmount,
        cap,
        contributors: potContrib,
      })
    }

    prevCap = cap
  }

  if (pots.length === 0) {
    const potContrib: Record<string, number> = {}
    let potAmount = 0

    for (const [s, v] of contribMap.entries()) {
      potContrib[String(s)] = v
      potAmount += v
    }

    pots.push({
      id: potId,
      amount: potAmount,
      cap: null,
      contributors: potContrib,
    })
  }

  table.pots = pots
  table.pot = pots.reduce((sum, p) => sum + p.amount, 0)
}

/**
 * 计算该池的合格座位（贡献者 ∩ 未弃牌活跃）
 * @param table 牌桌对象
 * @param pot 单个奖池
 * @returns 合格的 seatIdx 列表
 */
export function eligibleSeatsForPot(
  table: table_Type,
  pot: { contributors: Record<string, number> }
): number[] {
  const contributorSeats = Object.keys(pot.contributors || {}).map((s) => Number(s))
  const aliveSeats = table.playerList.filter((p) => p.isActive && !p.isFold).map((p) => p.seatIdx)
  const aliveSet = new Set(aliveSeats)
  return contributorSeats.filter((s) => aliveSet.has(s))
}

/**
 * 简易比牌比较函数（基于已在 calcBestCardType 计算好的 handRank/handCompareValues）
 */
function compareByStoredHand(a: player_Type, b: player_Type): number {
  if (a.handRank > b.handRank) {
    return 1
  }
  if (a.handRank < b.handRank) {
    return -1
  }

  const va: number[] = Array.isArray(a.handCompareValues) ? a.handCompareValues : []
  const vb: number[] = Array.isArray(b.handCompareValues) ? b.handCompareValues : []
  for (let i = 0; i < Math.max(va.length, vb.length); i++) {
    const x: number = va[i] ?? 0
    const y: number = vb[i] ?? 0
    if (x > y) {
      return 1
    }
    if (x < y) {
      return -1
    }
  }
  return 0
}

/**
 * 结算时间线的步骤类型（用于前端播放表现）
 */
export interface PotSettlementStep {
  potId: number
  potAmount: number
  eligibleSeats: number[]
  settleMode: 'singleWinner' | 'multiSplit'
  winners: number[]
  baseAmountPerWinner: number
  odd: number
  distributions: Array<{
    seatIdx: number
    amount: number
    kind: 'base' | 'odd'
  }>
}

/** 计算余筹发放顺序 */
function computeOddOrder(table: table_Type, winnerSeats: number[]): number[] {
  const type = table.oddChipPolicy?.type || 'dealer_clockwise'
  const seats = table.playerList.map((p) => p.seatIdx).sort((a, b) => a - b)
  const start = Math.max(0, seats.indexOf(table.btnSeatIdx))
  const clockwise = seats.slice(start).concat(seats.slice(0, start))
  const winnerSet = new Set(winnerSeats)

  switch (type) {
    case 'dealer_clockwise':
      return clockwise.filter((s) => winnerSet.has(s))
    case 'first_winner_clockwise': {
      const firstIdx = clockwise.findIndex((s) => winnerSet.has(s))
      const order =
        firstIdx >= 0 ? clockwise.slice(firstIdx).concat(clockwise.slice(0, firstIdx)) : clockwise
      return order.filter((s) => winnerSet.has(s))
    }
    case 'random': {
      const shuffled = [...winnerSeats]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = randomInt(0, i + 1)
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      return shuffled
    }
    default:
      return clockwise.filter((s) => winnerSet.has(s))
  }
}

/**
 * 生成按奖池顺序的“结算时间线”，用于前端逐步播放
 */
export function resolveShowdownTimeline(table: table_Type): PotSettlementStep[] {
  const steps: PotSettlementStep[] = []

  const pots =
    Array.isArray(table.pots) && table.pots.length > 0
      ? table.pots
      : [{ id: 0, amount: table.pot || 0, cap: null, contributors: table.contributions || {} }]

  for (const pot of pots) {
    const amount = pot.amount || 0
    if (amount <= 0) {
      continue
    }

    const seats = eligibleSeatsForPot(table, pot)
    if (seats.length === 0) {
      continue
    }

    // 单人池
    if (seats.length === 1) {
      const s = seats[0]
      steps.push({
        potId: pot.id,
        potAmount: amount,
        eligibleSeats: seats,
        settleMode: 'singleWinner',
        winners: [s],
        baseAmountPerWinner: amount,
        odd: 0,
        distributions: [{ seatIdx: s, amount, kind: 'base' }],
      })
      continue
    }

    // 多人池
    const players = seats
      .map((s) => table.playerList.find((p) => p.seatIdx === s))
      .filter((p): p is player_Type => !!p)
    players.sort((a, b) => {
      const r = compareByStoredHand(a, b)
      return r === 1 ? -1 : r === -1 ? 1 : 0
    })
    const best = players[0]
    const winners = players.filter((p) => compareByStoredHand(p, best) === 0).map((p) => p.seatIdx)

    const base = Math.floor(amount / winners.length)
    const odd = amount - base * winners.length

    const distributions: Array<{ seatIdx: number; amount: number; kind: 'base' | 'odd' }> = []
    for (const w of winners) {
      if (base > 0) {
        distributions.push({ seatIdx: w, amount: base, kind: 'base' })
      }
    }
    if (odd > 0) {
      const order = computeOddOrder(table, winners)
      let remain = odd
      while (remain > 0) {
        for (const s of order) {
          distributions.push({ seatIdx: s, amount: 1, kind: 'odd' })
          remain--
          if (remain === 0) {
            break
          }
        }
      }
    }

    steps.push({
      potId: pot.id,
      potAmount: amount,
      eligibleSeats: seats,
      settleMode: 'multiSplit',
      winners,
      baseAmountPerWinner: base,
      odd,
      distributions,
    })
  }

  return steps
}
