import { describe, it, expect } from 'bun:test'
import { validateHandHistory } from '../../src/features/hand_validator/index.js'
import { HandValidationErrorCode } from '../../src/features/hand_validator/simulator/types.js'

describe('Hand Validator Unit Tests', () => {
  const validHandJson = {
    gameuuid: 'uuid-001',
    roomid: 'room-001',
    big_blind: 2,
    ante: 0,
    dealer_seat: 0,
    sb_seat: 1,
    bb_seat: 2,
    straddle_seat: -1,
    players: [
      { id: 1, seat_no: 0, stack: 200, name: 'opp_0', position_tag: 'BTN', hole_card_list: '' },
      { id: 2, seat_no: 1, stack: 200, name: 'opp_1', position_tag: 'SB', hole_card_list: '' },
      { id: 3, seat_no: 2, stack: 200, name: 'opp_2', position_tag: 'BB', hole_card_list: '' },
      { id: 4, seat_no: 3, stack: 200, name: 'HERO', position_tag: 'UTG', hole_card_list: 'AhAs' },
      { id: 5, seat_no: 4, stack: 200, name: 'opp_4', position_tag: 'HJ', hole_card_list: '' },
      { id: 6, seat_no: 5, stack: 200, name: 'opp_5', position_tag: 'CO', hole_card_list: '' }
    ],
    actions: [
      { action: 'raise', seat_no: 3, amount: 6 },
      { action: 'fold', seat_no: 4, amount: 0 },
      { action: 'fold', seat_no: 5, amount: 0 },
      { action: 'fold', seat_no: 0, amount: 0 },
      { action: 'fold', seat_no: 1, amount: 0 },
      { action: 'fold', seat_no: 2, amount: 0 }
    ],
    result: {
      players: [
        { seat_no: 0, stack: 0, hole_card_list: '' },
        { seat_no: 1, stack: 0, hole_card_list: '' },
        { seat_no: 2, stack: 0, hole_card_list: '' },
        { seat_no: 3, stack: 0, hole_card_list: 'AhAs' },
        { seat_no: 4, stack: 0, hole_card_list: '' },
        { seat_no: 5, stack: 0, hole_card_list: '' }
      ]
    }
  }

  it('should validate a valid hand history with all players folding to open raise', () => {
    const result = validateHandHistory(validHandJson)
    expect(result.ok).toBe(true)
  })

  it('should fail validation if schema is invalid (e.g. missing action field in actions)', () => {
    const invalidSchemaJson = {
      ...validHandJson,
      actions: [
        { seat_no: 3, amount: 6 }, // missing action field
      ]
    }
    const result = validateHandHistory(invalidSchemaJson)
    expect(result.ok).toBe(false)
    expect(result.code).toBe(HandValidationErrorCode.SCHEMA_INVALID)
  })

  it('should fail validation if there is a duplicate card', () => {
    const duplicateCardJson = {
      ...validHandJson,
      players: [
        { id: 1, seat_no: 0, stack: 200, name: 'opp_0', position_tag: 'BTN', hole_card_list: 'AhKs' },
        { id: 2, seat_no: 1, stack: 200, name: 'opp_1', position_tag: 'SB', hole_card_list: '' },
        { id: 3, seat_no: 2, stack: 200, name: 'opp_2', position_tag: 'BB', hole_card_list: '' },
        { id: 4, seat_no: 3, stack: 200, name: 'HERO', position_tag: 'UTG', hole_card_list: 'AhAs' }, // duplicate Ah!
        { id: 5, seat_no: 4, stack: 200, name: 'opp_4', position_tag: 'HJ', hole_card_list: '' },
        { id: 6, seat_no: 5, stack: 200, name: 'opp_5', position_tag: 'CO', hole_card_list: '' }
      ]
    }
    const result = validateHandHistory(duplicateCardJson)
    expect(result.ok).toBe(false)
    expect(result.code).toBe(HandValidationErrorCode.SEMANTIC_INVALID)
    expect(result.message).toContain('牌面重复')
  })

  it('should fail validation on out of turn action', () => {
    const outOfTurnJson = {
      ...validHandJson,
      actions: [
        { action: 'fold', seat_no: 4, amount: 0 }, // seat 4 should not act first (UTG/seat 3 is next to BB)
      ]
    }
    const result = validateHandHistory(outOfTurnJson)
    expect(result.ok).toBe(false)
    expect(result.code).toBe(HandValidationErrorCode.MACHINE_REJECTED)
    expect(result.message).toContain('不是当前应行动的玩家')
  })

  it('should validate a multi-street showdown hand history with split pot', () => {
    const multiStreetHandJson = {
      gameuuid: 'uuid-multi-001',
      roomid: 'room-001',
      big_blind: 2,
      ante: 0,
      dealer_seat: 0,
      sb_seat: 1,
      bb_seat: 2,
      straddle_seat: -1,
      players: [
        { id: 1, seat_no: 0, stack: 200, name: 'BTN_Player', position_tag: 'BTN', hole_card_list: 'KhKs' },
        { id: 2, seat_no: 1, stack: 200, name: 'SB_Player', position_tag: 'SB', hole_card_list: 'QhQs' },
        { id: 3, seat_no: 2, stack: 200, name: 'BB_Player', position_tag: 'BB', hole_card_list: 'AhAs' }
      ],
      actions: [
        // Preflop: BTN raises, SB calls, BB calls
        { action: 'raise', seat_no: 0, amount: 6 },
        { action: 'call', seat_no: 1, amount: 6 },
        { action: 'call', seat_no: 2, amount: 6 },
        // Flop Deal
        { action: '2c3c4d', seat_no: -1, amount: 0 },
        // Flop Action: SB checks, BB checks, BTN bets, SB calls, BB calls
        { action: 'check', seat_no: 1, amount: 0 },
        { action: 'check', seat_no: 2, amount: 0 },
        { action: 'bet', seat_no: 0, amount: 10 },
        { action: 'call', seat_no: 1, amount: 10 },
        { action: 'call', seat_no: 2, amount: 10 },
        // Turn Deal
        { action: '5h', seat_no: -1, amount: 0 },
        // Turn Action: Everyone checks
        { action: 'check', seat_no: 1, amount: 0 },
        { action: 'check', seat_no: 2, amount: 0 },
        { action: 'check', seat_no: 0, amount: 0 },
        // River Deal
        { action: '6s', seat_no: -1, amount: 0 },
        // River Action: SB checks, BB bets 20, BTN folds, SB calls 20
        { action: 'check', seat_no: 1, amount: 0 },
        { action: 'bet', seat_no: 2, amount: 20 },
        { action: 'fold', seat_no: 0, amount: 0 },
        { action: 'call', seat_no: 1, amount: 20 }
      ],
      result: {
        players: [
          { seat_no: 0, stack: 184, hole_card_list: 'KhKs' },
          { seat_no: 1, stack: 208, hole_card_list: 'QhQs' },
          { seat_no: 2, stack: 208, hole_card_list: 'AhAs' }
        ]
      }
    }

    const result = validateHandHistory(multiStreetHandJson)
    expect(result.ok).toBe(true)
  })
})
