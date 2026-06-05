import {
  type action_wait_oper_Type,
  bet_Type,
  command_Type,
  type HttpRspFlag,
  type player_Type,
  type table_Type,
  type command_player_bet_action_Type,
} from './game_types.js'
import type { game_server_oper_action_post_body_Type } from '../simulator/types.js'
import {
  getMinBetValue,
  getMinRaiseValue,
} from '../utils/sim_utils'

export interface PlayerActionContext {
  getTable: () => table_Type
  getHttpRspFlag: () => HttpRspFlag
  shouldEnterShowdown: boolean
  stage: 'preflop' | 'flop' | 'turn' | 'river'
}

/**
 * 判断当前玩家是否是最后一个需要行动的玩家
 * @param table 牌桌数据
 * @param seatIdx 当前玩家座位索引
 * @returns 如果是最后一个需要行动的玩家返回true，否则返回false
 */
export function isLastOper(table: table_Type, seatIdx: number): boolean {
  if (table.currentPlayerIndex === -1) {
    return false
  }

  if (seatIdx !== table.currentPlayerIndex) {
    return false
  }

  const activePlayers = table.playerList.filter((player) => player.isActive && !player.isFold)

  if (activePlayers.length <= 1) {
    return true
  }

  const actionablePlayers = activePlayers.filter((player) => player.chips > 0 && !player.isAllin)

  if (actionablePlayers.length === 0) {
    return true
  }

  if (actionablePlayers.length === 1) {
    return actionablePlayers[0].seatIdx === seatIdx
  }

  const otherActionablePlayers = actionablePlayers.filter((player) => player.seatIdx !== seatIdx)
  const hasOthersAllActed = otherActionablePlayers.every((player) => player.hasActed)

  if (!hasOthersAllActed) {
    return false
  }

  const maxBet = Math.max(...activePlayers.map((player) => player.curBet || 0))

  const otherActivePlayers = activePlayers.filter((player) => player.seatIdx !== seatIdx)
  const allOthersMatched = otherActivePlayers.every((player) => {
    if (player.isAllin) {
      return true
    }
    return (player.curBet || 0) === maxBet
  })

  return allOthersMatched
}

// 获取等待可选操作列表
export function getWaitOperList(table: table_Type): action_wait_oper_Type[] {
  const waitOperList: action_wait_oper_Type[] = []

  const currentPlayer = table.playerList.find(
    (player) => player.seatIdx === table.currentPlayerIndex
  )
  if (!currentPlayer) {
    return waitOperList
  }

  const isHaveOtherCanOper = table.playerList.find(
    (player) =>
      player.seatIdx != currentPlayer.seatIdx &&
      player.isActive &&
      !player.isFold &&
      !player.isAllin
  )

  if (currentPlayer.canOnlyCallOrFold) {
    waitOperList.push({
      bet_type: bet_Type.fold,
      minChip: 0,
      maxChip: 0,
    })

    const maxBet = table.currentMaxBet || 0
    const currentBet = currentPlayer.curBet || 0
    const callAmount = maxBet - currentBet
    const remainingChips = currentPlayer.chips || 0

    if (callAmount > 0) {
      if (remainingChips > callAmount) {
        waitOperList.push({
          bet_type: bet_Type.call,
          minChip: callAmount + currentBet,
          maxChip: callAmount + currentBet,
          amountToCall: callAmount,
        })
      } else {
        waitOperList.push({
          bet_type: bet_Type.allin,
          minChip: remainingChips + currentBet,
          maxChip: remainingChips + currentBet,
        })
      }
    } else {
      waitOperList.push({
        bet_type: bet_Type.check,
        minChip: 0,
        maxChip: 0,
      })
    }

    return waitOperList
  }

  const maxBet = table.currentMaxBet || 0
  const currentBet = currentPlayer.curBet || 0
  const callAmount = maxBet - currentBet
  const remainingChips = currentPlayer.chips || 0

  let isAllin: boolean = false

  if (currentBet < maxBet) {
    waitOperList.push({
      bet_type: bet_Type.fold,
      minChip: 0,
      maxChip: 0,
    })
  }

  if (currentBet === maxBet) {
    waitOperList.push({
      bet_type: bet_Type.check,
      minChip: 0,
      maxChip: 0,
    })
  }

  if (maxBet > 0 && currentBet < maxBet) {
    if (callAmount >= remainingChips) {
      if (currentPlayer.isAI) {
        waitOperList.push({
          bet_type: bet_Type.call,
          minChip: remainingChips + currentBet,
          maxChip: remainingChips + currentBet,
          amountToCall: remainingChips,
        })
      }
      isAllin = true
    } else {
      waitOperList.push({
        bet_type: bet_Type.call,
        minChip: callAmount + currentBet,
        maxChip: callAmount + currentBet,
        amountToCall: callAmount,
      })
    }
  }

  if (maxBet === 0) {
    const minBetAmount = getMinBetValue(table)

    if (minBetAmount >= remainingChips) {
      isAllin = true
    } else {
      waitOperList.push({
        bet_type: bet_Type.bet,
        minChip: minBetAmount,
        maxChip: remainingChips,
      })
    }
  }

  if (maxBet > 0 && remainingChips > callAmount && isHaveOtherCanOper) {
    const lastRaiseAmount = Math.max(table.lastRaiseInc || 0, getMinRaiseValue(table))
    const minRaiseAmount = Math.min(maxBet + lastRaiseAmount - currentBet, remainingChips)

    const actualMinRaiseAmount = Math.max(minRaiseAmount, callAmount)

    if (actualMinRaiseAmount >= remainingChips) {
      isAllin = true
    } else {
      waitOperList.push({
        bet_type: bet_Type.raise,
        minChip: actualMinRaiseAmount + currentBet,
        maxChip: remainingChips + currentBet,
      })
    }
  }

  if (isAllin) {
    waitOperList.push({
      bet_type: bet_Type.allin,
      minChip: currentPlayer.curBet + remainingChips,
      maxChip: currentPlayer.curBet + remainingChips,
    })
  }

  return waitOperList
}

export enum EnumOperActionCode {
  ERR_EVENT_DATA_EMPTY = 'ERR_EVENT_DATA_EMPTY',
  ERR_CARD_OR_TABLE = 'ERR_CARD_OR_TABLE',
  ERR_NOT_CURRENT_SEAT = 'ERR_NOT_CURRENT_SEAT',
  ERR_PLAYER_INVALID = 'ERR_PLAYER_INVALID',
  ERR_ALREADY_ALLIN = 'ERR_ALREADY_ALLIN',
  ERR_INVALID_OPER_TYPE = 'ERR_INVALID_OPER_TYPE',
  ERR_INVALID_OPER_CHECK = 'ERR_INVALID_OPER_CHECK',
  ERR_INVALID_OPER_CALL = 'ERR_INVALID_OPER_CALL',
  ERR_INVALID_OPER_ALL_IN = 'ERR_INVALID_OPER_ALL_IN',
  ERR_INVALID_OPER_RAISE = 'ERR_INVALID_OPER_RAISE',
  ERR_INVALID_OPER_BET = 'ERR_INVALID_OPER_BET',
  ERR_INVALID_OPER_UNKNOWN = 'ERR_INVALID_OPER_UNKNOWN',
  ERR_TIMEOUT = 'ERR_TIMEOUT',
  SUC = 'SUC',
  ERR_SEQUENCE_ID = 'ERR_SEQUENCE',
}

interface SimTableEventOperAction {
  type: 'oper_action'
  data: game_server_oper_action_post_body_Type
  httpRspFlag: HttpRspFlag
}

export function isCanOperAction(context: PlayerActionContext, event: SimTableEventOperAction) {
  const table = context.getTable()
  const data = event?.data

  if (!data) {
    return { ok: false, code: EnumOperActionCode.ERR_EVENT_DATA_EMPTY }
  }

  if (table.currentBetSequenceId != data.sequenceId) {
    return { ok: false, code: EnumOperActionCode.ERR_SEQUENCE_ID }
  }

  if (data.tableId !== table.tableId || data.cardId !== table.cardId) {
    return { ok: false, code: EnumOperActionCode.ERR_CARD_OR_TABLE }
  }

  if (typeof data.seatIdx === 'number' && data.seatIdx !== table.currentPlayerIndex) {
    return { ok: false, code: EnumOperActionCode.ERR_NOT_CURRENT_SEAT }
  }

  const currentPlayer = table.playerList.find(
    (player) => player.seatIdx === table.currentPlayerIndex
  )
  if (!currentPlayer || !currentPlayer.isActive || currentPlayer.isFold) {
    return { ok: false, code: EnumOperActionCode.ERR_PLAYER_INVALID }
  }

  if (currentPlayer.isAllin) {
    return { ok: false, code: EnumOperActionCode.ERR_ALREADY_ALLIN }
  }

  const operData = data
  if (operData) {
    const { betType, chips } = operData
    const operList = getWaitOperList(table)
    const oper = operList.find((o) => o.bet_type === betType)
    if (!oper && betType != (bet_Type.allin as string)) {
      return { ok: false, code: EnumOperActionCode.ERR_INVALID_OPER_TYPE }
    }

    const bb = table.bb || 1
    const maxBet = table.currentMaxBet || 0
    const curBet = currentPlayer.curBet || 0
    const remain = currentPlayer.chips

    if (betType === (bet_Type.fold as string)) {
      // No extra checks for fold
    } else if (betType === (bet_Type.check as string)) {
      if (curBet !== maxBet) {
        return { ok: false, code: EnumOperActionCode.ERR_INVALID_OPER_CHECK }
      }
    } else if (betType === (bet_Type.call as string)) {
      const need = Math.max(0, maxBet - curBet)
      if (need <= 0) {
        return { ok: false, code: EnumOperActionCode.ERR_INVALID_OPER_CALL }
      }
      if (remain <= 0) {
        return { ok: false, code: EnumOperActionCode.ERR_INVALID_OPER_CALL }
      }
    } else if (betType === (bet_Type.allin as string)) {
      if (remain <= 0) {
        return { ok: false, code: EnumOperActionCode.ERR_INVALID_OPER_ALL_IN }
      }
    } else if (betType === (bet_Type.bet as string)) {
      if (maxBet !== 0) {
        return { ok: false, code: EnumOperActionCode.ERR_INVALID_OPER_BET }
      }
      if (!Number.isInteger(chips) || chips <= 0) {
        return { ok: false, code: EnumOperActionCode.ERR_INVALID_OPER_BET }
      }
      const minBet = Math.max(bb, oper ? oper.minChip : bb)
      if (chips < minBet) {
        return { ok: false, code: EnumOperActionCode.ERR_INVALID_OPER_BET }
      }
      if (chips > remain) {
        return { ok: false, code: EnumOperActionCode.ERR_INVALID_OPER_BET }
      }
      if (oper && (chips < oper.minChip || chips > oper.maxChip)) {
        return { ok: false, code: EnumOperActionCode.ERR_INVALID_OPER_BET }
      }
    } else if (betType === (bet_Type.raise as string)) {
      if (maxBet <= 0) {
        return { ok: false, code: EnumOperActionCode.ERR_INVALID_OPER_RAISE }
      }
      if (!Number.isInteger(chips) || chips <= curBet) {
        return { ok: false, code: EnumOperActionCode.ERR_INVALID_OPER_RAISE }
      }
      if (oper && (chips < oper.minChip || chips > oper.maxChip)) {
        return { ok: false, code: EnumOperActionCode.ERR_INVALID_OPER_RAISE }
      }
    } else {
      return { ok: false, code: EnumOperActionCode.ERR_INVALID_OPER_UNKNOWN }
    }
  }

  const start = table.curBetStartTime || 0
  if (table.betBeyondTime > 0 && start > 0) {
    const nowTs = Date.now()
    if (nowTs - start > table.betBeyondTime * 1000 + 60 * 1000) {
      return { ok: false, code: EnumOperActionCode.ERR_TIMEOUT }
    }
  }

  return { ok: true, code: EnumOperActionCode.SUC }
}

function recordPlayerAction(
  table: table_Type,
  currentPlayer: player_Type,
  betType: bet_Type,
  chipAmount: number,
  isExcept: boolean = false
): void {
  const now = Date.now()

  table.command_list.push(<command_player_bet_action_Type>{
    head: {
      command: command_Type.playerBetAction,
    },
    body: {
      seatIdx: currentPlayer.seatIdx,
      chip: chipAmount,
      pot: table.pot,
      remainChip: currentPlayer.chips,
      isAllin: currentPlayer.isAllin,
      isFold: currentPlayer.isFold,
      curBet: currentPlayer.curBet || 0,
      isAI: currentPlayer.isAI,
      betTime: now,
      bet_type: betType,
      isExcept: isExcept,
      aiResponse: undefined,
    },
  })

  table.aiActionList.push({
    action: currentPlayer.isAllin ? bet_Type.allin : betType,
    seat_no: currentPlayer.seatIdx,
    amount: chipAmount,
  })
}

export function executePlayerAction(
  context: PlayerActionContext,
  operData: game_server_oper_action_post_body_Type,
  isExcept: boolean = false
): void {
  const table = context.getTable()
  const { betType, chips } = operData
  let contributed = 0

  const currentPlayer = table.playerList.find(
    (player) => player.seatIdx === table.currentPlayerIndex
  )

  if (!currentPlayer) {
    return
  }

  currentPlayer.hasActed = true

  if (betType === (bet_Type.fold as string)) {
    currentPlayer.isFold = true
    contributed = 0
    recordPlayerAction(table, currentPlayer, bet_Type.fold, 0, isExcept)
  } else if (betType === (bet_Type.check as string)) {
    contributed = 0
    recordPlayerAction(table, currentPlayer, bet_Type.check, 0, isExcept)
  } else if (betType === (bet_Type.call as string)) {
    const callAmount = table.currentMaxBet - (currentPlayer.curBet || 0)
    const actualCallAmount = Math.min(callAmount, currentPlayer.chips)

    currentPlayer.chips -= actualCallAmount
    currentPlayer.curBet = (currentPlayer.curBet || 0) + actualCallAmount
    table.pot += actualCallAmount

    if (currentPlayer.chips === 0) {
      currentPlayer.isAllin = true
    }

    contributed = actualCallAmount
    recordPlayerAction(table, currentPlayer, bet_Type.call, currentPlayer.curBet, isExcept)
  } else if (betType === (bet_Type.bet as string)) {
    const betAmount = chips

    currentPlayer.chips -= betAmount
    currentPlayer.curBet = betAmount
    table.pot += betAmount
    table.currentMaxBet = currentPlayer.curBet
    table.lastRaiseInc = betAmount

    table.playerList.forEach((player) => {
      if (
        player.seatIdx !== currentPlayer.seatIdx &&
        player.isActive &&
        !player.isFold &&
        !player.isAllin &&
        player.chips > 0
      ) {
        player.hasActed = false
      }
    })
    table.aggressorIdx = currentPlayer.seatIdx

    if (currentPlayer.chips === 0) {
      currentPlayer.isAllin = true
    }

    contributed = betAmount
    recordPlayerAction(table, currentPlayer, bet_Type.bet, betAmount, isExcept)
  } else if (betType === (bet_Type.raise as string)) {
    const totalBetAmount = chips
    const currentBet = currentPlayer.curBet || 0
    const additionalAmount = totalBetAmount - currentBet

    if (additionalAmount <= 0) {
      return
    }

    currentPlayer.chips -= additionalAmount
    currentPlayer.curBet = totalBetAmount
    const prevMaxBet = table.currentMaxBet || 0
    table.pot += additionalAmount
    table.currentMaxBet = currentPlayer.curBet
    table.lastRaiseInc = totalBetAmount - prevMaxBet
    table.isHaveRaise = true

    table.playerList.forEach((player) => {
      if (
        player.seatIdx !== currentPlayer.seatIdx &&
        player.isActive &&
        !player.isFold &&
        !player.isAllin &&
        player.chips > 0
      ) {
        player.hasActed = false
      }
    })

    table.aggressorIdx = currentPlayer.seatIdx

    if (currentPlayer.chips === 0) {
      currentPlayer.isAllin = true
    }

    contributed = additionalAmount
    recordPlayerAction(table, currentPlayer, bet_Type.raise, totalBetAmount, isExcept)
  } else if (betType === (bet_Type.allin as string)) {
    const allinAmount = currentPlayer.chips
    const newTotalBet = (currentPlayer.curBet || 0) + allinAmount
    const currentMaxBet = table.currentMaxBet
    const minRaiseAmount = table.lastRaiseInc || table.bb

    currentPlayer.curBet = newTotalBet
    currentPlayer.chips = 0
    currentPlayer.isAllin = true
    table.pot += allinAmount

    let shouldResetActions = false
    let canRaise = false

    if (newTotalBet <= currentMaxBet) {
      // Incomplete call-in
    } else if (newTotalBet > currentMaxBet + minRaiseAmount) {
      shouldResetActions = true
      canRaise = true

      const oldMaxBet = table.currentMaxBet
      table.currentMaxBet = newTotalBet
      table.isHaveRaise = true
      table.lastRaiseInc = newTotalBet - oldMaxBet
    } else {
      shouldResetActions = true
      canRaise = false
      table.currentMaxBet = newTotalBet
    }

    if (shouldResetActions) {
      table.playerList.forEach((player) => {
        if (
          player.seatIdx !== currentPlayer.seatIdx &&
          player.isActive &&
          !player.isFold &&
          !player.isAllin &&
          player.chips > 0
        ) {
          if (!canRaise) {
            player.canOnlyCallOrFold = !!player.hasActed
          } else {
            player.canOnlyCallOrFold = false
          }
          player.hasActed = false
        }
      })
      table.aggressorIdx = currentPlayer.seatIdx
    }

    contributed = allinAmount
    recordPlayerAction(table, currentPlayer, bet_Type.allin, newTotalBet, isExcept)
  }

  const seatKey = String(currentPlayer.seatIdx)
  table.streetBets[seatKey] = (table.streetBets[seatKey] || 0) + contributed
}

/** 当前轮是否下注完成 */
export function isCurRoundActionComplete(context: PlayerActionContext): boolean {
  const table = context.getTable()

  const activePlayers = table.playerList.filter((player) => player.isActive && !player.isFold)

  if (activePlayers.length <= 1) {
    return true
  }

  const actionablePlayers = activePlayers.filter((player) => player.chips > 0 && !player.isAllin)

  if (actionablePlayers.length === 0) {
    return true
  }

  const isHaveAllin = table.playerList.some((player) => player.isAllin)
  const canOperNum = table.playerList.filter(
    (player) => player.isActive && !player.isFold && !player.isAllin
  ).length
  if (table.currentMaxBet <= 0 && isHaveAllin && canOperNum <= 1) {
    return true
  }

  const hasAllActed = actionablePlayers.every((player) => player.hasActed)
  if (!hasAllActed) {
    return false
  }
  const maxBet = Math.max(...activePlayers.map((player) => player.curBet || 0))

  const allPlayersMatched = activePlayers.every((player) => {
    if (player.isAllin) {
      return true
    }
    return (player.curBet || 0) === maxBet
  })

  return allPlayersMatched
}
