import {
  type table_Type,
  table_state_Type,
  CARD_VALUES,
} from '../core/game_types.js'

/**
 * 根据牌面计算牌值
 * @param rank 牌面（A, 2-10, J, Q, K）
 * @returns 牌值（A=1, 2=2, ..., K=13）
 */
export function getCardValue(rank: string): number {
  switch (rank) {
    case '2':
      return 2
    case '3':
      return 3
    case '4':
      return 4
    case '5':
      return 5
    case '6':
      return 6
    case '7':
      return 7
    case '8':
      return 8
    case '9':
      return 9
    case 'T':
      return CARD_VALUES.TEN
    case 'J':
      return CARD_VALUES.JACK
    case 'Q':
      return CARD_VALUES.QUEEN
    case 'K':
      return CARD_VALUES.KING
    case 'A':
      return CARD_VALUES.ACE_HIGH
    default:
      console.warn(`未知的牌面: ${rank}，默认返回1`)
      return 1
  }
}

export function getDefaultTableInfo(tableId: string = ''): table_Type {
  // 定义默认的牌桌配置
  const defaultTableData: table_Type = {
    tableId: tableId, // 桌子ID，通常由调用方设置
    createTime: Date.now(), // 牌桌创建时间
    isCanDestroy: false, // 是否可以被销毁
    canDestroyTime: 0, // 能够销毁时间，isCanDestroy=true时，canDestroyTime=now(), now()-canDestroyTime >= 1分钟，执行销毁
    state: table_state_Type.init, // 牌桌状态默认状态为：初始
    subState: table_state_Type.init, // 牌桌子状态默认状态为：初始
    createUid: 0, // 默认0为系统创建
    seatCount: 2, // 默认2人桌
    sb: 1, // 小盲默认1
    bb: 2, // 大盲默认2（通常是小盲的2倍）
    sbSeatIdx: 0, // 小盲位置默认1号座位(2人桌小盲位置默认和庄家位相同)
    bbSeatIdx: 1, // 大盲位置默认0号座位(2人桌大盲位默认和庄家位不同)
    btnSeatIdx: 0, // 庄家位置默认1号座位（2人桌的最后一个位置）
    ante: 0, // 前注默认为0
    isStraddle: false, // 抓注默认为0
    playerList: [], // 玩家列表默认为空
    winners: [], // 赢家列表
    cardId: '', // 牌局ID默认为空
    deck: [], // 洗牌未发的牌
    board: [], // 公共牌默认为空
    pot: 0, // 奖池默认为0
    pots: [], // 实时分层奖池默认为[]
    settlementTimeline: [], // 结算时间线（按奖池顺序逐步结算，供前端播放）
    contributions: {}, // 整手牌累计投入：seatIdx -> 金额 默认为{}
    streetBets: {}, // 当前轮的投入：seatIdx -> 金额 默认为{}
    oddChipPolicy: { type: 'dealer_clockwise' }, // 奇偶分池策略默认为dealer_clockwise 从庄位顺时针
    lastRaiseInc: 0, // 当前玩家加注金额
    currentPlayerIndex: -1, // 当前下注玩家索引默认为-1
    currentOperList: [], // 当前下注玩家可以操作的列表
    currentMaxBet: 0, // 当前最高下注
    curBetStartTime: 0, // 下注开始时间默认为0
    continueFoldSeatIdxList: [], // 等待弃牌的玩家索引列表，默认为空
    currentBetSequenceId: 0,
    isHaveRaise: false, // 是否有人加注过
    reqStartTime: 0, // 请求开始时间默认为0
    betBeyondTime: 0, // 下注超时时间默认0，无限时间
    isAutoStartGame: false, // 是否自动开始游戏
    isAutoNextGame: false, // 是否自动下一局游戏
    isHaveManualStartGame: false, // 是否已经手动开始游戏
    isCanMannulContinueGame: true, // 是否可以手动继续游戏
    isWaitMannulContinueGame: false, // 是否等待手动继续游戏
    isAdvanceResponseOnWaitAI: true, // 是否提前返回
    isHaveShowHoldCardInAheadOfStreetOver: false, // 是否提前亮过牌
    command_list: [], // 命令列表
    aiActionList: [], // AI服需要的玩家行为列表
    showHoldCard: {}, // 玩家亮牌
    aggressorIdx: -1, // 进攻玩家索引位置， -1表示未设置
    isFoldFastNextHand: false, // 是否弃牌快速进入下一手
    maxHands: 0, // 最大局数
    totalHands: 0, // 当前局数

    // ------------------复盘玩法相关-----------------
    isCanSetCard: false, // 是否需要提前设置牌
    predealHands: [], // 预发手牌
    predefinedStreets: {
      flop: [], // flop默认为空
      turn: [], // turn默认为空
      river: [], // river默认为空
    },
  }
  return defaultTableData
}

/**
 * 获取straddle大小
 */
export function getStraddleValue(table: table_Type): number {
  return table.bb * 2
}

/**
 * 获取straddle位置
 * straddle位置在大盲注下一个有效玩家位置（顺时针方向）
 * @param table 牌桌数据
 * @returns straddle玩家的座位索引，如果没有有效位置则返回-1
 */
export function getStraddleSeatIdx(table: table_Type): number {
  if (!table.isStraddle) {
    return -1
  }

  if (table.seatCount < 4) {
    return -1
  }

  if (!table.playerList || table.playerList.length === 0 || table.bbSeatIdx < 0) {
    return -1
  }

  const seatCount = table.seatCount
  let checkSeatIdx = (table.bbSeatIdx + 1) % seatCount

  for (let i = 0; i < seatCount; i++) {
    const player = table.playerList.find((p) => p.seatIdx === checkSeatIdx)

    if (
      player &&
      player.isActive &&
      (player.initChips || 0) > 0 &&
      checkSeatIdx !== table.bbSeatIdx
    ) {
      return checkSeatIdx
    }

    checkSeatIdx = (checkSeatIdx + 1) % seatCount
  }

  return -1
}

/**
 * 获取最小下注额度
 */
export function getMinBetValue(table: table_Type): number {
  return table.isStraddle ? getStraddleValue(table) : table.bb
}

/**
 * 获取最小加注额度
 */
export function getMinRaiseValue(table: table_Type): number {
  return table.isStraddle ? getStraddleValue(table) : table.bb
}

/** 获取连续弃牌座位编号列表 */
export function getContinueFoldSeatList(table: table_Type): number[] {
  const curBetSeatIdx = table.currentPlayerIndex
  if (curBetSeatIdx < 0) {
    return []
  }
  const curBetPlayer = table.playerList[curBetSeatIdx]
  if (!curBetPlayer) {
    return []
  }
  const seatList: number[] = []
  const seatCount = table.seatCount
  const currentMaxBet = table.currentMaxBet || 0

  if (curBetPlayer.id != table.createUid) {
    seatList.push(curBetSeatIdx)
  }

  let checkSeatIdx = (curBetSeatIdx + 1) % seatCount

  while (checkSeatIdx !== curBetSeatIdx) {
    const player = table.playerList.find((p) => p.seatIdx === checkSeatIdx)

    if (player) {
      if (player.id === table.createUid) {
        break
      }

      if (
        player.isActive &&
        !player.isFold &&
        !player.isAllin &&
        !player.hasActed &&
        (player.curBet || 0) < currentMaxBet
      ) {
        seatList.push(checkSeatIdx)
      } else {
        break
      }
    }

    checkSeatIdx = (checkSeatIdx + 1) % seatCount
  }
  return seatList
}
