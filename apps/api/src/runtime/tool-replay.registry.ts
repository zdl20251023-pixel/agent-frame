import { runPreParseAutoFix, runPostParseAutoFix } from '../features/agent-tools/autofix_pipeline.js'
import { LatestHandSchema } from '../features/agent-tools/tool_nl_to_hand.js'
import { simulateHand } from '../features/hand_validator/simulator/hand_simulator.js'

// ============================================================
// ToolReplayRegistry — 确定性 Tool 重放注册表
// ============================================================

export type ToolReplayOptions = {
  innerRepairMode?: 'disabled' | 'inner_repair'
}

export type ToolReplayResult = {
  ok: boolean
  output?: unknown
  errorCode?: string
  errorMessage?: string
}

export type ToolReplayHandler = (
  input: unknown,
  options: ToolReplayOptions,
) => Promise<ToolReplayResult>

class ToolReplayRegistryImpl {
  private handlers = new Map<string, ToolReplayHandler>()

  register(toolName: string, handler: ToolReplayHandler): void {
    this.handlers.set(toolName, handler)
  }

  async replay(
    toolName: string,
    input: unknown,
    options: ToolReplayOptions = {},
  ): Promise<ToolReplayResult> {
    const handler = this.handlers.get(toolName)
    if (!handler) {
      return {
        ok: false,
        errorCode: 'TOOL_REPLAY_NOT_SUPPORTED',
        errorMessage: `No replay handler registered for tool "${toolName}".`,
      }
    }
    try {
      return await handler(input, options)
    } catch (err) {
      return {
        ok: false,
        errorCode: 'TOOL_REPLAY_ERROR',
        errorMessage: err instanceof Error ? err.message : String(err),
      }
    }
  }
}

export const toolReplayRegistry = new ToolReplayRegistryImpl()

async function replayNlToHandBaseline(input: unknown): Promise<ToolReplayResult> {
  const raw = input && typeof input === 'object' ? input as { game_hand?: unknown } : {}
  const gameHand = raw.game_hand ?? input
  const preFix = runPreParseAutoFix(gameHand)
  const parsed = LatestHandSchema.safeParse(preFix.fixed)
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: 'SCHEMA_INVALID',
      errorMessage: parsed.error.issues[0]?.message ?? 'Schema validation failed',
    }
  }
  const postFix = runPostParseAutoFix(parsed.data)
  const result = simulateHand(postFix.fixed)
  if (!result.ok) {
    return {
      ok: false,
      errorCode: result.code ?? 'SIMULATE_FAILED',
      errorMessage: result.message,
    }
  }
  return { ok: true, output: postFix.fixed }
}

toolReplayRegistry.register('nl_to_hand', async (input) => replayNlToHandBaseline(input))
