// Standalone types and constants for Hand History Validator

// ==================== Constants from game_constants.ts ====================
export const CARD_VALUES = {
  ACE_LOW: 1,
  ACE_HIGH: 14,
  JACK: 11,
  QUEEN: 12,
  KING: 13,
  TEN: 10,
} as const

export const HAND_RANKS = {
  HIGH_CARD: 1,
  ONE_PAIR: 2,
  TWO_PAIR: 3,
  THREE_OF_A_KIND: 4,
  STRAIGHT: 5,
  FLUSH: 6,
  FULL_HOUSE: 7,
  FOUR_OF_A_KIND: 8,
  STRAIGHT_FLUSH: 9,
  ROYAL_FLUSH: 10,
} as const

export const ROYAL_FLUSH_VALUES = [
  CARD_VALUES.ACE_HIGH,
  CARD_VALUES.KING,
  CARD_VALUES.QUEEN,
  CARD_VALUES.JACK,
  CARD_VALUES.TEN,
] as const

export const WHEEL_STRAIGHT_VALUES = [
  CARD_VALUES.ACE_HIGH,
  5,
  4,
  3,
  2,
] as const

export const FLUSH_RANK_WEIGHTS = {
  FIRST_CARD: 10000,
  SECOND_CARD: 1000,
  THIRD_CARD: 100,
  FOURTH_CARD: 10,
  FIFTH_CARD: 1,
} as const

// ==================== Types from basic.ts ====================
export enum table_state_Type {
  root = 'root',
  init = 'init',
  preflop = 'preflop',
  flop = 'flop',
  turn = 'turn',
  river = 'river',
  showdown = 'showdown',
  payout = 'payout',
  waitAddChips = 'waitAddChips',
  end = 'end',
}

export enum bet_Type {
  check = 'check',
  bet = 'bet',
  fold = 'fold',
  raise = 'raise',
  call = 'call',
  allin = 'allin',
  sb = 'sb',
  bb = 'bb',
  ante = 'ante',
  straddle = 'straddle',
}

export enum command_Type {
  default = 'default',
  updatePlayerChips = 'updatePlayerChips',
  updateDealerAndBlinds = 'updateDealerAndBlinds',
  updatePlayerSeatNames = 'updatePlayerSeatNames',
  dealHoldCards = 'dealHoldCards',
  dealBoard = 'dealBoard',
  dealFlop = 'dealFlop',
  dealTurn = 'dealTurn',
  dealRiver = 'dealRiver',
  waitPlayerBet = 'waitPlayerBet',
  bet = 'bet',
  postAnte = 'postAnte',
  postStraddle = 'postStraddle',
  postSmallBlind = 'postSmallBlind',
  postBigBlind = 'postBigBlind',
  playerBetAction = 'playerBetAction',
  updateMainAndSidePots = 'updateMainAndSidePots',
  revealHoldCards = 'revealHoldCards',
  payout = 'payout',
  waitContinueHand = 'waitContinueHand',
  refundChips = 'refundChips',
  waitAddChips = 'waitAddChips',
  endHand = 'endHand',
}

export enum ApiType {
  default = 'default',
  create_table = 'create_table',
  start_game = 'start_game',
  oper_action = 'oper_action',
  continue_game = 'continue_game',
  next_game = 'next_game',
  set_fold_fast_next_hand = 'set_fold_fast_next_hand',
  get_table = 'get_table',
  get_hand_history = 'get_hand_history',
  add_chips = 'add_chips',
  get_report = 'get_report',
  quit_game = 'quit_game',
  set_hold_card = 'set_hold_card',
  set_board = 'set_board',
  set_all_board = 'set_all_board',
  back = 'back',
  get_suggestion = 'get_suggestion',
  continue_fold = 'continue_fold',
  test_ai = 'test_ai',
  ai_return_exception = 'ai_return_exception',
}

export interface HttpRspFlag {
  apiType: ApiType
  uid: number
  tableId: string
  actionId: string
  reqStartTime: number
}

// ==================== Types from card.ts ====================
export interface card_Type {
  suit: string
  rank: string
  value: number
}

// ==================== Types from player.ts ====================
export interface player_Type {
  id: number
  name: string
  isHero: boolean
  isAI: boolean
  seatIdx: number
  seatName: string
  fixInitChips: number
  initChips: number
  chips: number
  winChips: number
  addChips: number
  totalPendingChips: number
  curBet: number
  holdCards: card_Type[]
  isFold: boolean
  isAllin: boolean
  isActive: boolean
  hasActed: boolean
  canOnlyCallOrFold: boolean
  handRank: number
  handDescription: string
  isWinner: boolean
  handCompareValues: number[]
}

// ==================== Types from action.ts ====================
export interface action_wait_oper_Type {
  bet_type: bet_Type
  minChip: number
  maxChip: number
  amountToCall?: number
}

// ==================== Types from command.ts ====================
export interface command_player_bet_action_Type {
  head: {
    command: command_Type
  }
  body: {
    seatIdx: number
    chip: number
    pot: number
    remainChip: number
    isAllin: boolean
    isFold: boolean
    curBet: number
    isAI: boolean
    betTime: number
    bet_type: bet_Type
    isExcept: boolean
    aiResponse?: any
  }
}

// ==================== Types from table.ts ====================
export interface table_Type {
  tableId: string
  createTime: number
  isCanDestroy: boolean
  canDestroyTime: number
  state: table_state_Type
  subState: table_state_Type
  createUid: number
  seatCount: number
  sb: number
  bb: number
  sbSeatIdx: number
  bbSeatIdx: number
  btnSeatIdx: number
  ante: number
  isStraddle: boolean
  playerList: player_Type[]
  winners: Array<{ seatIdx: number; winAmount: number }>
  cardId: string
  deck: card_Type[]
  board: card_Type[]
  pot: number
  pots: Array<{
    id: number
    amount: number
    cap: number | null
    contributors: Record<string, number>
  }>
  settlementTimeline: any[] // Filled dynamically by resolveShowdownTimeline
  contributions: Record<string, number>
  streetBets: Record<string, number>
  oddChipPolicy: {
    type: 'dealer_clockwise' | 'first_winner_clockwise' | 'random'
  }
  lastRaiseInc: number
  currentPlayerIndex: number
  currentOperList: action_wait_oper_Type[]
  currentMaxBet: number
  curBetStartTime: number
  continueFoldSeatIdxList: number[]
  currentBetSequenceId: number
  isHaveRaise: boolean
  reqStartTime: number
  betBeyondTime: number
  isAutoStartGame: boolean
  isAutoNextGame: boolean
  isHaveManualStartGame: boolean
  isCanMannulContinueGame: boolean
  isWaitMannulContinueGame: boolean
  isAdvanceResponseOnWaitAI: boolean
  isHaveShowHoldCardInAheadOfStreetOver: boolean
  command_list: command_player_bet_action_Type[]
  aiActionList: Array<{
    action: string
    seat_no?: number
    amount?: number
  }>
  showHoldCard: Record<number, string>
  aggressorIdx: number
  isFoldFastNextHand: boolean
  maxHands: number
  totalHands: number

  // Review (Gamelog replay) specific configurations
  isCanSetCard: boolean
  predealHands: Record<number, card_Type[]>
  predefinedStreets: {
    flop: card_Type[]
    turn: card_Type[]
    river: card_Type[]
  }
}
