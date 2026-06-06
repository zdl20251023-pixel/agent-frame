import type { LanguageModel, UIMessage } from 'ai'
import type { ToolDefinition } from '../model-client/model-client.types.js'
import type { ToolFactoryContext } from './tool-factory.js'
import { createAgentToolDefinition, toToolFactory } from './tool-factory.js'
import { toolRegistry } from './tool-factory.js'
import {
  createNlToHandTool,
  NL_TO_HAND_DESCRIPTION,
  NlToHandToolInputSchema,
} from '../../features/agent-tools/tool_nl_to_hand'
import { pokerPromptProvider } from '../../features/agent-tools/poker-prompt-provider'
import type { PromptProvider } from '../../features/agent-tools/prompt-provider'

// ============================================================
// nl_to_hand Tool Bridge
//
// 作用：
// - 将 features/agent-tools 里已实现的 AI SDK tool 包装为框架 ToolDefinition。
// - 让 Agent 可以通过 ToolRegistry 构建工具，再交给 ModelClient.stream({ tools })。
// - 通过 AgentToolDefinition 沉淀通用桥接模式，后续其他业务工具可复用。
// ============================================================

type NlToHandToolOptions = {
  promptProvider?: PromptProvider
  messages?: UIMessage[]
  innerRepairModel?: LanguageModel
  firstModelStreamStartedAt?: number
}

function readOptions(ctx: ToolFactoryContext): NlToHandToolOptions {
  const raw = ctx.extra?.nlToHandOptions
  if (!raw || typeof raw !== 'object') return {}
  return raw as NlToHandToolOptions
}

export const nlToHandAgentTool = createAgentToolDefinition<unknown, unknown>({
  name: 'nl_to_hand',
  description: NL_TO_HAND_DESCRIPTION,
  schema: NlToHandToolInputSchema,
  parameters: {
    type: 'object',
    properties: {
      _reasoning: {
        type: 'string',
        description: '生成牌谱前的简要推理过程，用于辅助工具校验。',
      },
      game_hand: {
        type: 'object',
        description: '待校验的牌谱候选对象。工具会先做确定性 autofix，再执行严格 Schema 校验。',
      },
    },
    required: ['game_hand'],
  },
  execute: async (input: unknown, ctx: ToolFactoryContext) => {
    const options = readOptions(ctx)
    const sdkTool = createNlToHandTool({
      promptProvider: options.promptProvider ?? pokerPromptProvider,
      messages: options.messages,
      innerRepairModel: options.innerRepairModel,
      firstModelStreamStartedAt: options.firstModelStreamStartedAt,
    }) as any

    return sdkTool.execute(input)
  },
})

export const nlToHandToolFactory = toToolFactory(nlToHandAgentTool)

export function createNlToHandModelTool(ctx: ToolFactoryContext): ToolDefinition {
  return nlToHandAgentTool.toModelToolDefinition(ctx)
}

export function getNlToHandPluginToolDefinition() {
  return {
    id: nlToHandAgentTool.name,
    name: nlToHandAgentTool.name,
    description: nlToHandAgentTool.description,
    parameters: nlToHandAgentTool.parameters ?? nlToHandAgentTool.schema,
  }
}

toolRegistry.register('nl_to_hand', nlToHandToolFactory)

