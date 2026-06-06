import { describe, expect, it } from 'bun:test'
import {
  ARTIFACT_TYPES,
  EVENT_TYPES,
  MODEL_STREAM_EVENT_TYPES,
  RUN_STATUS,
  TOOL_INVOCATION_PHASE,
  TOOL_INVOCATION_STATUS,
} from '@agent-frame/shared'
import type { ModelClient } from '../../src/ai/model-client/model-client.js'
import type {
  GenerateInput,
  GenerateObjectInput,
  GenerateOutput,
  ModelStreamEvent,
  StreamInput,
} from '../../src/ai/model-client/model-client.types.js'
import { NlToHandAgent } from '../../src/ai/agents/nl-to-hand.agent.js'
import { NL_TO_HAND_AGENT_ID } from '../../src/ai/agents/agent-ids.js'
import { RunManager } from '../../src/runtime/run-manager.js'
import { MemoryRunStore } from '../../src/runtime/stores/memory-run-store.js'
import { MemoryArtifactStore } from '../../src/artifacts/artifact-store.memory.js'

const validHand = {
  gameuuid: 'uuid-run-integration',
  roomid: 'room-run-integration',
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

class FakeNlToHandModelClient implements ModelClient {
  async generate(_input: GenerateInput): Promise<GenerateOutput> {
    return { text: '' }
  }

  async *stream(input: StreamInput): AsyncIterable<ModelStreamEvent> {
    const tool = input.tools?.find((item) => item.name === 'nl_to_hand')
    if (!tool) throw new Error('nl_to_hand tool not found')

    const toolInput = { game_hand: validHand }
    yield {
      type: MODEL_STREAM_EVENT_TYPES.TEXT_DELTA,
      delta: '已收到牌局描述，准备生成牌谱。\n',
      timestamp: new Date().toISOString(),
    }
    yield {
      type: MODEL_STREAM_EVENT_TYPES.TOOL_CALL,
      toolCallId: 'tool-call-fake-001',
      toolName: 'nl_to_hand',
      input: toolInput,
      timestamp: new Date().toISOString(),
    }

    const output = await tool.execute(toolInput)
    yield {
      type: MODEL_STREAM_EVENT_TYPES.TOOL_RESULT,
      toolCallId: 'tool-call-fake-001',
      toolName: 'nl_to_hand',
      output,
      timestamp: new Date().toISOString(),
    }
    yield {
      type: MODEL_STREAM_EVENT_TYPES.TEXT_DELTA,
      delta: '牌谱已校验通过。',
      timestamp: new Date().toISOString(),
    }
    yield {
      type: MODEL_STREAM_EVENT_TYPES.MODEL_COMPLETED,
      timestamp: new Date().toISOString(),
    }
  }

  async generateObject<T>(_input: GenerateObjectInput): Promise<T> {
    throw new Error('generateObject should not be called in this integration test')
  }

  async embed(): Promise<{ embeddings: number[][]; usage?: { inputTokens?: number } }> {
    return { embeddings: [] }
  }
}

describe('nl-to-hand Run integration', () => {
  it('should create tool invocation and hand_history artifact for a valid hand', async () => {
    const runStore = new MemoryRunStore()
    const artifactStore = new MemoryArtifactStore()
    const agent = new NlToHandAgent(new FakeNlToHandModelClient(), runStore, artifactStore)
    const runManager = new RunManager(runStore, {
      agentId: NL_TO_HAND_AGENT_ID,
      execute: (input, context) => agent.execute(input as Parameters<typeof agent.execute>[0], context),
    })

    const created = await runManager.createRun({
      agentId: NL_TO_HAND_AGENT_ID,
      input: { message: '6人桌，1/2，Hero UTG AhAs open到6，后面都弃牌' },
    })
    const completed = await waitForRun(runStore, created.id)

    expect(completed.status).toBe(RUN_STATUS.COMPLETED)
    expect((completed.output as { toolStatus?: string }).toolStatus).toBe('success')

    const events = await runStore.listEvents(created.id)
    expect(events.some((event) => event.type === EVENT_TYPES.TOOL_CALL)).toBe(true)
    expect(events.some((event) => event.type === EVENT_TYPES.TOOL_RESULT)).toBe(true)
    expect(events.some((event) => event.type === EVENT_TYPES.ARTIFACT_CREATED)).toBe(true)

    const invocations = await runStore.listToolInvocations(created.id)
    expect(invocations).toHaveLength(1)
    expect(invocations[0]?.status).toBe(TOOL_INVOCATION_STATUS.SUCCEEDED)
    expect(invocations[0]?.phase).toBe(TOOL_INVOCATION_PHASE.COMPLETED)
    expect(invocations[0]?.outputRef).toBeTruthy()

    const artifacts = await artifactStore.listArtifactsByRun(created.id)
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]?.type).toBe(ARTIFACT_TYPES.HAND_HISTORY)
    expect(artifacts[0]?.id).toBe(invocations[0]?.outputRef)
  })

  it('should reuse the same artifact for the same idempotency key', async () => {
    const artifactStore = new MemoryArtifactStore()
    const context = {
      runId: 'run-idempotency',
      stepId: 'step-idempotency',
      agentId: NL_TO_HAND_AGENT_ID,
      idempotencyKey: 'run-idempotency:nl_to_hand:same-input:artifact',
    }

    const first = await artifactStore.createArtifactWithVersion(
      { runId: context.runId, type: ARTIFACT_TYPES.HAND_HISTORY, title: 'first' },
      { ok: true },
      context,
    )
    const second = await artifactStore.createArtifactWithVersion(
      { runId: context.runId, type: ARTIFACT_TYPES.HAND_HISTORY, title: 'second' },
      { ok: true },
      context,
    )

    expect(second.artifact.id).toBe(first.artifact.id)
    expect(second.version.id).toBe(first.version.id)
    expect(await artifactStore.listArtifactsByRun(context.runId)).toHaveLength(1)
  })

  it('should append a new version for patch_from_nl command', async () => {
    const runStore = new MemoryRunStore()
    const artifactStore = new MemoryArtifactStore()
    const agent = new NlToHandAgent(new FakeNlToHandModelClient(), runStore, artifactStore)
    const runManager = new RunManager(runStore, {
      agentId: NL_TO_HAND_AGENT_ID,
      execute: (input, context) => agent.execute(input as Parameters<typeof agent.execute>[0], context),
    })

    const firstRun = await runManager.createRun({
      agentId: NL_TO_HAND_AGENT_ID,
      input: {
        message: '6人桌，1/2，Hero UTG AhAs open到6，后面都弃牌',
        command: { type: 'create_from_nl', rawText: '6人桌，1/2，Hero UTG AhAs open到6，后面都弃牌' },
      },
    })
    const firstCompleted = await waitForRun(runStore, firstRun.id)
    const firstArtifactId = (firstCompleted.output as { artifactId?: string }).artifactId
    expect(firstArtifactId).toBeTruthy()
    const firstArtifact = await artifactStore.getArtifact(firstArtifactId!)
    const firstVersionId = firstArtifact?.currentVersionId
    expect(firstVersionId).toBeTruthy()

    const secondRun = await runManager.createRun({
      agentId: NL_TO_HAND_AGENT_ID,
      input: {
        message: '把这手牌改成同样行动线，但仍然使用当前基础牌谱未提到的字段',
        command: {
          type: 'patch_from_nl',
          artifactId: firstArtifactId,
          baseVersionId: firstVersionId,
          patchText: '把这手牌改成同样行动线，但仍然使用当前基础牌谱未提到的字段',
        },
      },
    })
    const secondCompleted = await waitForRun(runStore, secondRun.id)

    expect((secondCompleted.output as { artifactId?: string }).artifactId).toBe(firstArtifactId)
    const versions = await artifactStore.listVersions(firstArtifactId!)
    expect(versions).toHaveLength(2)
    expect(versions[1]?.parentVersionId).toBe(firstVersionId)
    expect(versions[1]?.version).toBe(2)
  })
})

async function waitForRun(runStore: MemoryRunStore, runId: string) {
  for (let i = 0; i < 40; i += 1) {
    const run = await runStore.getRun(runId)
    if (run && run.status !== RUN_STATUS.QUEUED && run.status !== RUN_STATUS.RUNNING) return run
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(`Run did not finish: ${runId}`)
}
