import { describe, expect, it } from 'bun:test'
import { CapabilityRouter } from '../../../src/capabilities/capability-router.js'
import {
  NL_TO_HAND_AGENT_ID,
  RESEARCH_AGENT_ID,
  SUPERVISOR_AGENT_ID,
} from '../../../src/ai/agents/agent-ids.js'

describe('CapabilityRouter', () => {
  const router = new CapabilityRouter()

  it('should keep explicitly selected professional agent', () => {
    const result = router.resolve({
      requestedAgentId: RESEARCH_AGENT_ID,
      input: { message: '6人桌，Hero UTG AhAs open到6，后面都弃牌，转成牌谱' },
    })

    expect(result.type).toBe('agent')
    if (result.type !== 'agent') return
    expect(result.agentId).toBe(RESEARCH_AGENT_ID)
    expect(result.source).toBe('explicit')
  })

  it('should route high-confidence poker hand to nl-to-hand-agent from default entry', () => {
    const result = router.resolve({
      requestedAgentId: SUPERVISOR_AGENT_ID,
      input: { message: '6人桌，1/2，Hero UTG AhAs open到6，后面都弃牌，帮我生成标准牌谱' },
    })

    expect(result.type).toBe('agent')
    if (result.type !== 'agent') return
    expect(result.agentId).toBe(NL_TO_HAND_AGENT_ID)
    expect(result.source).toBe('heuristic')
    expect(result.confidence).toBeGreaterThanOrEqual(0.72)
  })

  it('should keep default supervisor for general chat', () => {
    const result = router.resolve({
      input: { message: '帮我总结一下这个项目的架构' },
    })

    expect(result.type).toBe('agent')
    if (result.type !== 'agent') return
    expect(result.agentId).toBe(SUPERVISOR_AGENT_ID)
    expect(result.source).toBe('default')
  })
})
