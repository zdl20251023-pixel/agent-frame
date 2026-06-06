import { describe, expect, it } from 'bun:test'
import { registerBuiltinPlugins } from '../../../src/plugins/builtin-plugins.js'
import { pluginRegistry } from '../../../src/plugins/plugin-registry.js'
import {
  nlToHandAgentTool,
  toolRegistry,
} from '../../../src/ai/tools/index.js'

const validHand = {
  gameuuid: 'uuid-tool-bridge',
  roomid: 'room-tool-bridge',
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
    { id: 6, seat_no: 5, stack: 200, name: 'opp_5', position_tag: 'CO', hole_card_list: '' },
  ],
  actions: [
    { action: 'raise', seat_no: 3, amount: 6 },
    { action: 'fold', seat_no: 4, amount: 0 },
    { action: 'fold', seat_no: 5, amount: 0 },
    { action: 'fold', seat_no: 0, amount: 0 },
    { action: 'fold', seat_no: 1, amount: 0 },
    { action: 'fold', seat_no: 2, amount: 0 },
  ],
  result: {
    players: [
      { seat_no: 0, stack: 0, hole_card_list: '' },
      { seat_no: 1, stack: 0, hole_card_list: '' },
      { seat_no: 2, stack: 0, hole_card_list: '' },
      { seat_no: 3, stack: 0, hole_card_list: 'AhAs' },
      { seat_no: 4, stack: 0, hole_card_list: '' },
      { seat_no: 5, stack: 0, hole_card_list: '' },
    ],
  },
}

describe('Tool Bridge', () => {
  it('should expose nl_to_hand as a reusable AgentToolDefinition', () => {
    expect(nlToHandAgentTool.name).toBe('nl_to_hand')
    expect(nlToHandAgentTool.schema).toBeTruthy()
    expect(nlToHandAgentTool.toModelToolDefinition({}).name).toBe('nl_to_hand')
  })

  it('should build and execute nl_to_hand through the runtime ToolRegistry', async () => {
    const tool = toolRegistry.build('nl_to_hand', {})
    const output = await tool.execute({ game_hand: validHand })

    expect(typeof output).toBe('string')
    expect(output).toContain('合法')
  })

  it('should register nl_to_hand tool metadata in PluginRegistry discovery', () => {
    registerBuiltinPlugins()

    const tool = pluginRegistry.listTools().find((item) => item.id === 'nl_to_hand')

    expect(tool?.name).toBe('nl_to_hand')
    expect(tool?.parameters).toBeTruthy()
    expect((tool?.parameters as { type?: string }).type).toBe('object')
  })
})
