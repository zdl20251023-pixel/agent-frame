import { describe, expect, it } from 'bun:test'
import { LatestHandSchema } from '../../../src/features/agent-tools/tool_nl_to_hand'
import {
  runPostParseAutoFix,
  runPreParseAutoFix,
} from '../../../src/features/agent-tools/autofix_pipeline'

describe('autofix_pipeline', () => {
  it('should normalize schema-level aliases and formats before parsing', () => {
    const raw = {
      gameuuid: '',
      roomid: '',
      big_blind: '2',
      ante: '0',
      dealer_seat: '0',
      sb_seat: '1',
      bb_seat: '2',
      straddle_seat: '-1',
      players: [
        { id: '1', seat_no: '0', stack: '200', name: 'BTN', position_tag: 'button', hole_call_list: 'A♥K♦' },
        { id: '2', seat_no: '1', stack: '200', name: 'small blind', position_tag: 'small blind', hole_card_list: '' },
        { id: '3', seat_no: '2', stack: '200', name: 'big blind', position_tag: 'big blind', hole_card_list: '' },
      ],
      actions: [
        { action: 'raise_to', seat_no: '0', amount: '6' },
        { action: 'folds', seat_no: '1', amount: '0' },
        { action: 'all-in', seat_no: '2', amount: '0' },
      ],
      result: {
        players: [
          { seat_no: '0', stack: '0', hole_call_list: 'A_hearts K_diamonds' },
          { seat_no: '1', stack: '0', hole_card_list: '' },
          { seat_no: '2', stack: '0', hole_card_list: '' },
        ],
      },
    }

    const fixed = runPreParseAutoFix(raw)
    const parsed = LatestHandSchema.safeParse(fixed.fixed)

    expect(parsed.success).toBe(true)
    expect(fixed.patches.length).toBeGreaterThan(0)
    if (!parsed.success) return

    expect(parsed.data.big_blind).toBe(2)
    expect(parsed.data.players[0]?.position_tag).toBe('BTN')
    expect(parsed.data.players[0]?.hole_card_list).toBe('AhKd')
    expect(parsed.data.actions[0]?.action).toBe('raise')
    expect(parsed.data.actions[1]?.action).toBe('fold')
    expect(parsed.data.actions[2]?.action).toBe('allin')
    expect(parsed.data.result.players[0]?.hole_card_list).toBe('AhKd')
  })

  it('should fix derived blinds, position tags, names and zero-amount actions after parsing', () => {
    const parsed = LatestHandSchema.parse({
      gameuuid: 'uuid-autofix',
      roomid: 'room-autofix',
      big_blind: 2,
      ante: 0,
      dealer_seat: 1,
      sb_seat: 1,
      bb_seat: 2,
      straddle_seat: -1,
      players: [
        { id: 3, seat_no: 2, stack: 200, name: 'BB', position_tag: 'BB', hole_card_list: '' },
        { id: 1, seat_no: 0, stack: 200, name: 'BTN', position_tag: 'BTN', hole_card_list: 'AhKd' },
        { id: 2, seat_no: 1, stack: 200, name: 'SB', position_tag: 'SB', hole_card_list: '' },
      ],
      actions: [
        { action: 'fold', seat_no: 0, amount: 6 },
        { action: 'check', seat_no: 1, amount: 2 },
      ],
      result: {
        players: [
          { seat_no: 0, stack: 0, hole_card_list: 'AhKd' },
          { seat_no: 1, stack: 0, hole_card_list: '' },
          { seat_no: 2, stack: 0, hole_card_list: '' },
        ],
      },
    })

    const fixed = runPostParseAutoFix(parsed)

    expect(fixed.fixed.sb_seat).toBe(2)
    expect(fixed.fixed.bb_seat).toBe(0)
    expect(fixed.fixed.players.map((p) => p.seat_no)).toEqual([0, 1, 2])
    expect(fixed.fixed.players.find((p) => p.seat_no === 1)?.position_tag).toBe('BTN')
    expect(fixed.fixed.players.find((p) => p.seat_no === 2)?.position_tag).toBe('SB')
    expect(fixed.fixed.players.find((p) => p.seat_no === 0)?.position_tag).toBe('BB')
    expect(fixed.fixed.players.find((p) => p.seat_no === 0)?.name).toBe('HERO')
    expect(fixed.fixed.actions[0]?.amount).toBe(0)
    expect(fixed.fixed.actions[1]?.amount).toBe(0)
  })
})

