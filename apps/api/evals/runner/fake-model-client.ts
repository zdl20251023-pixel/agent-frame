// ============================================================
// FakeEvalModelClient — 确定性评测用 ModelClient
// 根据 evalCaseId 从注册表返回预置 tool 调用，无需外部 API
// ============================================================

import { MODEL_STREAM_EVENT_TYPES } from '@agent-frame/shared'
import type { ModelClient } from '../../src/ai/model-client/model-client.js'
import type {
  EmbedInput,
  EmbedOutput,
  GenerateInput,
  GenerateObjectInput,
  GenerateOutput,
  ModelStreamEvent,
  StreamInput,
} from '../../src/ai/model-client/model-client.types.js'

/** 单条用例的 Fake 响应配置 */
export type FakeCaseFixture = {
  mustCallTool: boolean
  game_hand?: unknown
  textDelta?: string
}

/** 用例 ID → fixture 注册表 */
export type FakeFixtureRegistry = Map<string, FakeCaseFixture>

/**
 * 创建可注入 fixture 注册表的 Fake ModelClient。
 * eval-runner 在每条用例执行前写入当前 caseId 对应配置。
 */
export function createFakeEvalModelClient(registry: FakeFixtureRegistry): ModelClient {
  return {
    async generate(_input: GenerateInput): Promise<GenerateOutput> {
      return { text: '' }
    },

    async *stream(input: StreamInput): AsyncIterable<ModelStreamEvent> {
      const caseId = typeof input.metadata?.evalCaseId === 'string'
        ? input.metadata.evalCaseId
        : undefined
      const fixture = caseId ? registry.get(caseId) : undefined
      const mustCallTool = fixture?.mustCallTool ?? true
      const textDelta = fixture?.textDelta ?? '评测 FakeModel 正在处理牌局描述。\n'
      const timestamp = new Date().toISOString()

      yield {
        type: MODEL_STREAM_EVENT_TYPES.TEXT_DELTA,
        delta: textDelta,
        timestamp,
      }

      if (!mustCallTool) {
        yield {
          type: MODEL_STREAM_EVENT_TYPES.TEXT_DELTA,
          delta: '当前输入不像牌局描述，未调用 nl_to_hand 工具。',
          timestamp,
        }
        yield { type: MODEL_STREAM_EVENT_TYPES.MODEL_COMPLETED, timestamp }
        return
      }

      const tool = input.tools?.find((item) => item.name === 'nl_to_hand')
      if (!tool) throw new Error('nl_to_hand tool not found in stream input')

      if (!fixture?.game_hand) {
        throw new Error(`FakeModel fixture missing game_hand for case: ${caseId ?? 'unknown'}`)
      }

      const toolInput = { game_hand: fixture.game_hand }
      const toolCallId = `fake-tool-${caseId ?? 'unknown'}`

      yield {
        type: MODEL_STREAM_EVENT_TYPES.TOOL_CALL,
        toolCallId,
        toolName: 'nl_to_hand',
        input: toolInput,
        timestamp,
      }

      const output = await tool.execute(toolInput)
      yield {
        type: MODEL_STREAM_EVENT_TYPES.TOOL_RESULT,
        toolCallId,
        toolName: 'nl_to_hand',
        output,
        timestamp,
      }

      const outputText = typeof output === 'string' ? output : JSON.stringify(output)
      const suffix = outputText.startsWith('合法')
        ? '牌谱已校验通过。'
        : '牌谱校验未通过，已保存 draft。'

      yield {
        type: MODEL_STREAM_EVENT_TYPES.TEXT_DELTA,
        delta: suffix,
        timestamp,
      }
      yield { type: MODEL_STREAM_EVENT_TYPES.MODEL_COMPLETED, timestamp }
    },

    async generateObject<T>(_input: GenerateObjectInput): Promise<T> {
      throw new Error('FakeEvalModelClient does not support generateObject in eval mode')
    },

    async embed(_input: EmbedInput): Promise<EmbedOutput> {
      return { embeddings: [] }
    },
  }
}
