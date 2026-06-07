// ============================================================
// 评测用手牌 fixture 构建器
// 生成可通过 nl_to_hand 校验的确定性牌谱结构
// ============================================================

type PlayerInput = {
  seat_no: number
  position_tag: string
  hole_card_list?: string
  name?: string
}

/**
 * 构建 6 人桌 preflop open-fold 标准合法牌谱。
 *
 * @param params - 可覆盖 Hero 座位、手牌、open 金额等
 */
export function build6MaxOpenFold(params: {
  heroSeat?: number
  heroCards?: string
  heroPosition?: string
  openAmount?: number
  bigBlind?: number
  gameuuid?: string
}) {
  const heroSeat = params.heroSeat ?? 3
  const heroCards = params.heroCards ?? 'AhAs'
  const heroPosition = params.heroPosition ?? 'UTG'
  const openAmount = params.openAmount ?? 6
  const bigBlind = params.bigBlind ?? 2
  const positions: PlayerInput[] = [
    { seat_no: 0, position_tag: 'BTN' },
    { seat_no: 1, position_tag: 'SB' },
    { seat_no: 2, position_tag: 'BB' },
    { seat_no: 3, position_tag: 'UTG' },
    { seat_no: 4, position_tag: 'HJ' },
    { seat_no: 5, position_tag: 'CO' },
  ]

  const players = positions.map((p) => ({
    id: p.seat_no + 1,
    seat_no: p.seat_no,
    stack: 200,
    name: p.seat_no === heroSeat ? 'HERO' : `opp_${p.seat_no}`,
    position_tag: p.seat_no === heroSeat ? heroPosition : p.position_tag,
    hole_card_list: p.seat_no === heroSeat ? heroCards : '',
  }))

  const preflopOrder = [3, 4, 5, 0, 1, 2]
  const heroIndex = preflopOrder.indexOf(heroSeat)
  const actions: Array<{ action: string; seat_no: number; amount: number }> = []
  for (let i = 0; i < preflopOrder.length; i += 1) {
    const seat = preflopOrder[i]!
    if (i < heroIndex) {
      actions.push({ action: 'fold', seat_no: seat, amount: 0 })
    } else if (i === heroIndex) {
      actions.push({ action: 'raise', seat_no: seat, amount: openAmount })
    } else {
      actions.push({ action: 'fold', seat_no: seat, amount: 0 })
    }
  }

  return {
    gameuuid: params.gameuuid ?? `eval-6max-${heroSeat}`,
    roomid: 'eval-room',
    big_blind: bigBlind,
    ante: 0,
    dealer_seat: 0,
    sb_seat: 1,
    bb_seat: 2,
    straddle_seat: -1,
    players,
    actions,
    result: {
      players: players.map((p) => ({
        seat_no: p.seat_no,
        stack: 0,
        hole_card_list: p.hole_card_list,
      })),
    },
  }
}

/**
 * 构建带翻牌的 6 人桌牌谱（Hero CO open，BB call，flop c-bet fold）。
 */
export function build6MaxFlopCbetFold() {
  const hand = build6MaxOpenFold({
    heroSeat: 5,
    heroCards: 'KhKd',
    heroPosition: 'CO',
    openAmount: 6,
    gameuuid: 'eval-flop-cbet',
  })

  const heroSeat = 5
  hand.actions = [
    { action: 'fold', seat_no: 3, amount: 0 },
    { action: 'fold', seat_no: 4, amount: 0 },
    { action: 'raise', seat_no: heroSeat, amount: 6 },
    { action: 'fold', seat_no: 0, amount: 0 },
    { action: 'fold', seat_no: 1, amount: 0 },
    { action: 'call', seat_no: 2, amount: 4 },
    { action: '4cAcQc', seat_no: -1, amount: 0 },
    { action: 'check', seat_no: 2, amount: 0 },
    { action: 'bet', seat_no: heroSeat, amount: 10 },
    { action: 'fold', seat_no: 2, amount: 0 },
  ]

  return hand
}

/**
 * 构建 Heads-Up 合法牌谱。
 */
export function buildHeadsUpHand() {
  return {
    gameuuid: 'eval-hu-001',
    roomid: 'eval-room-hu',
    big_blind: 2,
    ante: 0,
    dealer_seat: 0,
    sb_seat: 0,
    bb_seat: 1,
    straddle_seat: -1,
    players: [
      { id: 1, seat_no: 0, stack: 200, name: 'opp_0', position_tag: 'BTN', hole_card_list: '' },
      { id: 2, seat_no: 1, stack: 200, name: 'HERO', position_tag: 'BB', hole_card_list: 'AhKd' },
    ],
    actions: [
      { action: 'raise', seat_no: 1, amount: 6 },
      { action: 'fold', seat_no: 0, amount: 0 },
    ],
    result: {
      players: [
        { seat_no: 0, stack: 0, hole_card_list: '' },
        { seat_no: 1, stack: 0, hole_card_list: 'AhKd' },
      ],
    },
  }
}

/**
 * 构建 Schema 会通过但 simulate 会失败的牌谱（行动顺序错误）。
 */
export function buildInvalidSimulationHand() {
  const hand = build6MaxOpenFold({ gameuuid: 'eval-invalid-sim' })
  // BB 在 UTG open 之前行动，违反行动顺序
  hand.actions = [
    { action: 'raise', seat_no: 2, amount: 6 },
    { action: 'raise', seat_no: 3, amount: 6 },
    { action: 'fold', seat_no: 4, amount: 0 },
    { action: 'fold', seat_no: 5, amount: 0 },
    { action: 'fold', seat_no: 0, amount: 0 },
    { action: 'fold', seat_no: 1, amount: 0 },
  ]
  return hand
}

/**
 * 构建 Schema 校验失败的牌谱（玩家数不足，autofix 无法修复）。
 */
export function buildSchemaInvalidHand() {
  return {
    gameuuid: 'eval-schema-invalid',
    roomid: 'eval-room',
    big_blind: 2,
    ante: 0,
    dealer_seat: 0,
    sb_seat: 1,
    bb_seat: 2,
    straddle_seat: -1,
    players: [
      { id: 1, seat_no: 0, stack: 200, name: 'HERO', position_tag: 'BTN', hole_card_list: 'AhAs' },
    ],
    actions: [{ action: 'fold', seat_no: 0, amount: 0 }],
    result: { players: [{ seat_no: 0, stack: 0, hole_card_list: 'AhAs' }] },
  }
}
