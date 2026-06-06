import type { LatestHandType } from './tool_nl_to_hand'

// ============================================================
// autofix_pipeline — 自然语言转牌谱确定性修复流水线
//
// 设计原则：
// - 只修复确定性、低风险问题，例如字段别名、牌面格式、数值类型、位置映射。
// - 不擅自修改重复牌、缺失公共牌、行动顺序等事实性问题，这些应交给校验器或用户确认。
// - pre-parse 阶段处理可能导致 Zod Schema 失败的问题。
// - post-parse 阶段处理已具备 LatestHandType 后的结构一致性问题。
// ============================================================

export type AutoFixPatch = {
  path: string
  reason: string
  before: unknown
  after: unknown
}

type MutableRecord = Record<string, unknown>

const POSITION_MAPPING: Record<number, string[]> = {
  2: ['SB/BTN', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['BTN', 'SB', 'BB', 'UTG'],
  5: ['BTN', 'SB', 'BB', 'UTG', 'CO'],
  6: ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'],
  7: ['BTN', 'SB', 'BB', 'UTG', 'LJ', 'HJ', 'CO'],
  8: ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'LJ', 'HJ', 'CO'],
  9: ['BTN', 'SB', 'BB', 'UTG', 'UTG1', 'UTG2', 'LJ', 'HJ', 'CO'],
}

const POSITION_ALIASES: Record<string, string> = {
  BUTTON: 'BTN',
  DEALER: 'BTN',
  BU: 'BTN',
  BTN: 'BTN',
  SMALLBLIND: 'SB',
  SMALL_BLIND: 'SB',
  SB: 'SB',
  BIGBLIND: 'BB',
  BIG_BLIND: 'BB',
  BB: 'BB',
  UTG: 'UTG',
  HJ: 'HJ',
  HIJACK: 'HJ',
  CO: 'CO',
  CUTOFF: 'CO',
  LJ: 'LJ',
  LOJACK: 'LJ',
}

const ACTION_ALIASES: Record<string, string> = {
  all_in: 'allin',
  'all-in': 'allin',
  allin: 'allin',
  shove: 'allin',
  jam: 'allin',
  raises: 'raise',
  raised: 'raise',
  raise_to: 'raise',
  bet_to: 'bet',
  calls: 'call',
  called: 'call',
  checks: 'check',
  checked: 'check',
  folds: 'fold',
  folded: 'fold',
}

const NUMERIC_TOP_LEVEL_FIELDS = [
  'big_blind',
  'ante',
  'dealer_seat',
  'sb_seat',
  'bb_seat',
  'straddle_seat',
] as const

/**
 * Schema 解析前修复。
 *
 * @param input - 大模型生成的原始 game_hand 候选，可能还包含字符串数字、字段别名等。
 * @returns 修复后的未知对象和 patch 列表；调用方再交给 LatestHandSchema 校验。
 */
export function runPreParseAutoFix(input: unknown): { fixed: unknown; patches: AutoFixPatch[] } {
  const patches: AutoFixPatch[] = []
  const fixed = cloneJson(input)
  if (!isRecord(fixed)) return { fixed, patches }

  ensureStringField(fixed, 'gameuuid', 'autofix-game', patches)
  ensureStringField(fixed, 'roomid', 'autofix-room', patches)
  ensureNumericTopLevelFields(fixed, patches)

  const players = ensureArrayField<MutableRecord>(fixed, 'players', patches)
  const actions = ensureArrayField<MutableRecord>(fixed, 'actions', patches)
  const result = ensureRecordField(fixed, 'result', patches)
  const resultPlayers = ensureArrayField<MutableRecord>(result, 'players', patches)

  normalizePlayersPreParse(players, fixed, patches)
  normalizeActionsPreParse(actions, patches)
  normalizeResultPlayersPreParse(resultPlayers, players, patches)

  if (resultPlayers.length === 0 && players.length > 0) {
    for (const player of players) {
      resultPlayers.push({
        seat_no: player.seat_no,
        stack: 0,
        hole_card_list: typeof player.hole_card_list === 'string' ? player.hole_card_list : '',
      })
    }
    patches.push({
      path: 'result.players',
      reason: '根据 players 补齐缺失的 result.players',
      before: [],
      after: resultPlayers,
    })
  }

  return { fixed, patches }
}

/**
 * Schema 解析后修复。
 *
 * @param hand - 已通过 LatestHandSchema 的牌谱对象。
 * @returns 修复后的 LatestHandType 和 patch 列表。
 */
export function runPostParseAutoFix(hand: LatestHandType): { fixed: LatestHandType; patches: AutoFixPatch[] } {
  const patches: AutoFixPatch[] = []
  const fixed = cloneJson(hand) as LatestHandType

  fixed.players.sort((a, b) => a.seat_no - b.seat_no)
  fixed.result.players.sort((a, b) => a.seat_no - b.seat_no)

  fixBlindSeats(fixed, patches)
  fixPositionTags(fixed, patches)
  normalizePlayersPostParse(fixed, patches)
  normalizeActionsPostParse(fixed, patches)
  normalizeResultPlayersPostParse(fixed, patches)

  return { fixed, patches }
}

/**
 * 输出修复摘要，避免在主流程里打印完整大对象。
 */
export function logAutoFixSummary(stage: string, patches: AutoFixPatch[]): void {
  if (patches.length === 0) {
    console.info(`[autofix_pipeline] stage=${stage}, no patches`)
    return
  }
  console.info(
    `[autofix_pipeline] stage=${stage}, patches=${patches.length}, paths=${patches.map((p) => p.path).join(', ')}`
  )
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isRecord(value: unknown): value is MutableRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function ensureStringField(
  obj: MutableRecord,
  key: string,
  fallback: string,
  patches: AutoFixPatch[],
): void {
  if (typeof obj[key] === 'string' && obj[key]) return
  const before = obj[key]
  obj[key] = fallback
  patches.push({ path: key, reason: '补齐缺失的字符串字段', before, after: fallback })
}

function ensureRecordField(obj: MutableRecord, key: string, patches: AutoFixPatch[]): MutableRecord {
  if (isRecord(obj[key])) return obj[key] as MutableRecord
  const before = obj[key]
  obj[key] = {}
  patches.push({ path: key, reason: '补齐缺失的对象字段', before, after: obj[key] })
  return obj[key] as MutableRecord
}

function ensureArrayField<T extends MutableRecord>(
  obj: MutableRecord,
  key: string,
  patches: AutoFixPatch[],
): T[] {
  if (Array.isArray(obj[key])) return obj[key] as T[]
  const before = obj[key]
  obj[key] = []
  patches.push({ path: key, reason: '补齐缺失的数组字段', before, after: [] })
  return obj[key] as T[]
}

function ensureNumericTopLevelFields(obj: MutableRecord, patches: AutoFixPatch[]): void {
  for (const field of NUMERIC_TOP_LEVEL_FIELDS) {
    const before = obj[field]
    const after = toInteger(before)
    if (after !== undefined && after !== before) {
      obj[field] = after
      patches.push({ path: field, reason: '将顶层数值字段归一为整数', before, after })
    }
  }

  if (obj.big_blind === undefined) obj.big_blind = 2
  if (obj.ante === undefined) obj.ante = 0
  if (obj.dealer_seat === undefined) obj.dealer_seat = 0
  if (obj.straddle_seat === undefined) obj.straddle_seat = -1
}

function normalizePlayersPreParse(
  players: MutableRecord[],
  root: MutableRecord,
  patches: AutoFixPatch[],
): void {
  const bigBlind = toInteger(root.big_blind) ?? 2
  for (let index = 0; index < players.length; index++) {
    const player = players[index]
    renameHoleCardAlias(player, `players[${index}]`, patches)
    normalizeIntegerField(player, 'id', `players[${index}].id`, patches)
    normalizeIntegerField(player, 'seat_no', `players[${index}].seat_no`, patches)
    normalizeIntegerField(player, 'stack', `players[${index}].stack`, patches)

    if (player.id === undefined) {
      player.id = index + 1
      patches.push({ path: `players[${index}].id`, reason: '补齐玩家 id', before: undefined, after: player.id })
    }
    if (player.seat_no === undefined) {
      player.seat_no = index
      patches.push({ path: `players[${index}].seat_no`, reason: '按数组顺序补齐 seat_no', before: undefined, after: index })
    }
    if (player.stack === undefined) {
      player.stack = bigBlind * 100
      patches.push({ path: `players[${index}].stack`, reason: '按 100BB 补齐玩家初始筹码', before: undefined, after: player.stack })
    }

    normalizeStringField(player, 'position_tag', `players[${index}].position_tag`, normalizePositionTag, patches)
    normalizeStringField(player, 'hole_card_list', `players[${index}].hole_card_list`, normalizeCardString, patches)
  }
}

function normalizeActionsPreParse(actions: MutableRecord[], patches: AutoFixPatch[]): void {
  for (let index = 0; index < actions.length; index++) {
    const action = actions[index]
    normalizeIntegerField(action, 'seat_no', `actions[${index}].seat_no`, patches)
    normalizeIntegerField(action, 'amount', `actions[${index}].amount`, patches)
    if (action.amount === undefined) action.amount = 0

    const seatNo = toInteger(action.seat_no)
    if (typeof action.action === 'string') {
      const before = action.action
      action.action = seatNo === -1 ? normalizeCardString(action.action) : normalizeActionName(action.action)
      if (action.action !== before) {
        patches.push({
          path: `actions[${index}].action`,
          reason: seatNo === -1 ? '归一化公共牌牌面字符串' : '归一化玩家动作别名',
          before,
          after: action.action,
        })
      }
    }
  }
}

function normalizeResultPlayersPreParse(
  resultPlayers: MutableRecord[],
  players: MutableRecord[],
  patches: AutoFixPatch[],
): void {
  const playerBySeat = new Map<number, MutableRecord>()
  for (const player of players) {
    const seatNo = toInteger(player.seat_no)
    if (seatNo !== undefined) playerBySeat.set(seatNo, player)
  }

  for (let index = 0; index < resultPlayers.length; index++) {
    const resultPlayer = resultPlayers[index]
    renameHoleCardAlias(resultPlayer, `result.players[${index}]`, patches)
    normalizeIntegerField(resultPlayer, 'seat_no', `result.players[${index}].seat_no`, patches)
    normalizeIntegerField(resultPlayer, 'stack', `result.players[${index}].stack`, patches)
    if (resultPlayer.stack === undefined) resultPlayer.stack = 0
    normalizeStringField(resultPlayer, 'hole_card_list', `result.players[${index}].hole_card_list`, normalizeCardString, patches)

    if (resultPlayer.hole_card_list === undefined) {
      const player = playerBySeat.get(toInteger(resultPlayer.seat_no) ?? -1)
      resultPlayer.hole_card_list = typeof player?.hole_card_list === 'string' ? player.hole_card_list : ''
    }
  }
}

function normalizePlayersPostParse(hand: LatestHandType, patches: AutoFixPatch[]): void {
  for (const player of hand.players) {
    const expectedName = player.hole_card_list ? 'HERO' : `opp_${player.seat_no}`
    if (player.name !== expectedName) {
      patches.push({
        path: `players[seat=${player.seat_no}].name`,
        reason: '按手牌可见性归一化玩家展示名',
        before: player.name,
        after: expectedName,
      })
      player.name = expectedName
    }
  }
}

function normalizeActionsPostParse(hand: LatestHandType, patches: AutoFixPatch[]): void {
  for (let index = 0; index < hand.actions.length; index++) {
    const action = hand.actions[index]
    if (['check', 'fold', 'allin'].includes(action.action) && action.amount !== 0) {
      patches.push({
        path: `actions[${index}].amount`,
        reason: `${action.action} 动作金额固定为 0`,
        before: action.amount,
        after: 0,
      })
      action.amount = 0
    }
  }
}

function normalizeResultPlayersPostParse(hand: LatestHandType, patches: AutoFixPatch[]): void {
  const resultBySeat = new Map(hand.result.players.map((player) => [player.seat_no, player]))
  for (const player of hand.players) {
    if (resultBySeat.has(player.seat_no)) continue
    const newResultPlayer = { seat_no: player.seat_no, stack: 0, hole_card_list: player.hole_card_list }
    hand.result.players.push(newResultPlayer)
    patches.push({
      path: 'result.players',
      reason: `补齐 seat=${player.seat_no} 的结算玩家`,
      before: undefined,
      after: newResultPlayer,
    })
  }
  hand.result.players.sort((a, b) => a.seat_no - b.seat_no)
}

function fixBlindSeats(hand: LatestHandType, patches: AutoFixPatch[]): void {
  const seats = hand.players.map((p) => p.seat_no).sort((a, b) => a - b)
  const dealerIdx = seats.indexOf(hand.dealer_seat)
  if (dealerIdx < 0) return

  const expectedSb = seats[(dealerIdx + 1) % seats.length]
  const expectedBb = seats[(dealerIdx + 2) % seats.length]
  if (expectedSb === undefined || expectedBb === undefined) return

  if (hand.sb_seat !== expectedSb) {
    patches.push({ path: 'sb_seat', reason: '根据 dealer_seat 和玩家顺序修正 SB 座位', before: hand.sb_seat, after: expectedSb })
    hand.sb_seat = expectedSb
  }
  if (hand.bb_seat !== expectedBb) {
    patches.push({ path: 'bb_seat', reason: '根据 dealer_seat 和玩家顺序修正 BB 座位', before: hand.bb_seat, after: expectedBb })
    hand.bb_seat = expectedBb
  }
}

function fixPositionTags(hand: LatestHandType, patches: AutoFixPatch[]): void {
  const expected = buildExpectedPositionTagBySeat(hand.players, hand.dealer_seat)
  if (!expected) return

  for (const player of hand.players) {
    const expectedTag = expected.get(player.seat_no)
    if (!expectedTag || player.position_tag === expectedTag) continue
    patches.push({
      path: `players[seat=${player.seat_no}].position_tag`,
      reason: '根据 dealer_seat 和座位顺序修正位置标签',
      before: player.position_tag,
      after: expectedTag,
    })
    player.position_tag = expectedTag
  }
}

function buildExpectedPositionTagBySeat(
  players: LatestHandType['players'],
  dealerSeat: number,
): Map<number, string> | null {
  const seats = players.map((p) => p.seat_no).sort((a, b) => a - b)
  const dealerIdx = seats.indexOf(dealerSeat)
  const mapping = POSITION_MAPPING[players.length]
  if (dealerIdx < 0 || !mapping) return null

  const orderedSeats = [...seats.slice(dealerIdx), ...seats.slice(0, dealerIdx)]
  const result = new Map<number, string>()
  for (let i = 0; i < orderedSeats.length; i++) {
    const seat = orderedSeats[i]
    const tag = mapping[i]
    if (seat === undefined || tag === undefined) return null
    result.set(seat, tag)
  }
  return result
}

function renameHoleCardAlias(obj: MutableRecord, basePath: string, patches: AutoFixPatch[]): void {
  if (obj.hole_card_list !== undefined || obj.hole_call_list === undefined) return
  obj.hole_card_list = obj.hole_call_list
  delete obj.hole_call_list
  patches.push({
    path: `${basePath}.hole_card_list`,
    reason: '修正常见字段名误写 hole_call_list',
    before: { hole_call_list: obj.hole_card_list },
    after: obj.hole_card_list,
  })
}

function normalizeIntegerField(
  obj: MutableRecord,
  field: string,
  path: string,
  patches: AutoFixPatch[],
): void {
  const before = obj[field]
  const after = toInteger(before)
  if (after === undefined || after === before) return
  obj[field] = after
  patches.push({ path, reason: '将字段归一为整数', before, after })
}

function normalizeStringField(
  obj: MutableRecord,
  field: string,
  path: string,
  normalize: (value: string) => string,
  patches: AutoFixPatch[],
): void {
  if (typeof obj[field] !== 'string') return
  const before = obj[field]
  const after = normalize(before)
  if (after === before) return
  obj[field] = after
  patches.push({ path, reason: '归一化字符串字段', before, after })
}

function toInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value)
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().replace(/bb$/i, '')
  if (!normalized) return undefined
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined
}

function normalizePositionTag(value: string): string {
  const compact = value.trim().replace(/[\s/-]/g, '_').toUpperCase()
  return POSITION_ALIASES[compact] ?? compact
}

function normalizeActionName(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '_')
  return ACTION_ALIASES[normalized] ?? normalized
}

function normalizeCardString(value: string): string {
  let normalized = value
    .replace(/10/gi, 'T')
    .replace(/hearts?|红桃|♥/gi, 'h')
    .replace(/diamonds?|方片|方块|♦/gi, 'd')
    .replace(/clubs?|梅花|♣/gi, 'c')
    .replace(/spades?|黑桃|♠/gi, 's')
    .replace(/[^2-9TJQKAtjqkahdcs]/g, '')

  const cards: string[] = []
  for (let index = 0; index + 1 < normalized.length; index += 2) {
    const rank = normalized[index]?.toUpperCase()
    const suit = normalized[index + 1]?.toLowerCase()
    if (!rank || !suit || !/[2-9TJQKA]/.test(rank) || !/[hdcs]/.test(suit)) {
      return value
    }
    cards.push(`${rank}${suit}`)
  }
  normalized = cards.join('')
  return normalized || value
}
