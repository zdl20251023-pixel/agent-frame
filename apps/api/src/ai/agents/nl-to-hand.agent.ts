import type { AgentInput, AgentOutput, ArtifactVersion, ToolInvocation } from '@agent-frame/shared'
import {
  ARTIFACT_TYPES,
  EVENT_TYPES,
  MODEL_STREAM_EVENT_TYPES,
  STEP_TYPES,
  TOOL_INVOCATION_PHASE,
  TOOL_INVOCATION_STATUS,
} from '@agent-frame/shared'
import { createHash } from 'node:crypto'
import type { RunContext } from '../../runtime/run-manager.js'
import type { RunStore } from '../../runtime/stores/run-store.js'
import type { ArtifactStore } from '../../artifacts/artifact-store.js'
import type { ModelClient } from '../model-client/model-client.js'
import { RunEventEmitter } from '../../runtime/event-emitter.js'
import { StepManager } from '../../runtime/step-manager.js'
import { artifactCreatedEvent, artifactVersionCreatedEvent } from '../../artifacts/artifact-events.js'
import type { LatestHandType } from '../../features/agent-tools/tool_nl_to_hand'
import {
  POKER_OUTER_SYSTEM_PROMPT,
  pokerPromptProvider,
} from '../../features/agent-tools/poker-prompt-provider'
import { models } from '../models.js'
import { toolRegistry } from '../tools/index.js'
import { NL_TO_HAND_AGENT_ID } from './agent-ids.js'
import { generateToolInvocationId, generateVersionId, now } from '../../shared/utils/id.js'
import { logger } from '../../shared/observability/logger.js'
import { SessionsRepository } from '../../features/sessions/sessions.repository.js'

// ============================================================
// NlToHandAgent — 自然语言转牌谱专用 Agent
//
// 设计说明：
// - 本 Agent 是方案 A 增强版的业务入口，专门负责自然语言牌局结构化。
// - 当前阶段通过 ToolRegistry + ModelClient.stream({ tools }) 使用 nl_to_hand 工具。
// - 工具调用过程仍映射回框架统一的 Step / AgentEvent / Artifact。
// ============================================================

export { NL_TO_HAND_AGENT_ID }

type NlToHandPayload = {
  message?: string
  command?: HandHistoryCommand
}

type HandHistoryCommand =
  | { type: 'create_from_nl'; rawText?: string }
  | { type: 'patch_from_nl'; artifactId?: string; baseVersionId?: string; patchText?: string }
  | { type: 'replace_json'; artifactId?: string; baseVersionId?: string; gameHand: unknown }

type ResolvedHandHistoryCommandContext = {
  type: 'patch_from_nl'
  artifactId: string
  baseVersionId: string
  baseGameHand: unknown
}

type ToolPreview = {
  playerCount?: number
  bigBlind?: number
  heroPosition?: string
  heroCards?: string
  actionCount?: number
  hasFlop?: boolean
  hasTurn?: boolean
  hasRiver?: boolean
}

type ToolResultPreview = {
  status: 'success' | 'failed'
  validationCode?: string
  errorStep?: number
  errorPosition?: string
  errorReason?: string
  fixPath?: string
  askUser?: string
  artifactId?: string
  versionId?: string
}

export class NlToHandAgent {
  readonly agentId = NL_TO_HAND_AGENT_ID
  private stepManager: StepManager

  constructor(
    private modelClient: ModelClient,
    private store: RunStore,
    private artifactStore: ArtifactStore,
    private sessionsRepository?: SessionsRepository,
  ) {
    this.stepManager = new StepManager(store)
  }

  async execute(
    input: AgentInput<NlToHandPayload>,
    context: RunContext,
  ): Promise<AgentOutput<{ answer: string; artifactId?: string; toolStatus?: string }>> {
    const { runId, traceId, payload } = input
    const log = logger.child({ runId, traceId, agentId: this.agentId })
    const emitter = new RunEventEmitter(this.store)
    const userMessage = this.extractMessage(payload)
    const commandContext = await this.resolveCommandContext(payload, context.sessionId)
    const prompt = this.buildPrompt(userMessage, input.conversationContext?.promptText, commandContext)

    const modelStep = await this.stepManager.startStep({
      runId,
      type: STEP_TYPES.MODEL_CALL,
      agentId: this.agentId,
      input: { model: 'deepseek.chat', purpose: 'nl_to_hand_outer_generation' },
    })

    await emitter.emit({
      type: EVENT_TYPES.MESSAGE_DELTA,
      runId,
      agentId: this.agentId,
      delta: '正在解析牌局并生成候选牌谱...\n',
      timestamp: now(),
    })

    let fullText = ''
    let lastToolInput: unknown
    let lastToolOutput: unknown
    let lastToolStepId: string | undefined
    let lastToolInvocation: ToolInvocation | undefined

    try {
      const firstModelStreamStartedAt = Date.now()
      const nlToHandTool = toolRegistry.build('nl_to_hand', {
        extra: {
          nlToHandOptions: {
            promptProvider: pokerPromptProvider,
            messages: [],
            innerRepairModel: this.getRepairModel(),
            firstModelStreamStartedAt,
          },
        },
      })

      for await (const event of this.modelClient.stream({
        model: 'deepseek.chat',
        system: POKER_OUTER_SYSTEM_PROMPT,
        prompt,
        tools: [nlToHandTool],
        maxSteps: 3,
        temperature: 0.2,
        maxTokens: 4096,
        signal: context.signal,
        metadata: { runId, agentId: this.agentId, traceId, stepId: modelStep.id },
      })) {
        if (context.signal.aborted || input.signal?.aborted) break

        if (event.type === MODEL_STREAM_EVENT_TYPES.TEXT_DELTA) {
          fullText += event.delta
          await emitter.emit({
            type: EVENT_TYPES.MESSAGE_DELTA,
            runId,
            agentId: this.agentId,
            delta: event.delta,
            timestamp: now(),
          })
          continue
        }

        if (event.type === MODEL_STREAM_EVENT_TYPES.TOOL_CALL) {
          lastToolInput = event.input
          const preview = this.buildToolPreview(lastToolInput)
          const inputHash = this.hashUnknown(lastToolInput)
          const idempotencyKey = this.buildToolIdempotencyKey(runId, event.toolName, inputHash)
          const toolStep = await this.stepManager.startStep({
            runId,
            type: STEP_TYPES.TOOL_CALL,
            agentId: this.agentId,
            parentStepId: modelStep.id,
            input: {
              toolName: event.toolName,
              toolCallId: event.toolCallId,
              idempotencyKey,
              preview,
              rawInput: lastToolInput,
            },
          })
          lastToolStepId = toolStep.id
          lastToolInvocation = await this.store.createToolInvocation({
            id: generateToolInvocationId(),
            runId,
            stepId: toolStep.id,
            toolName: event.toolName,
            idempotencyKey,
            inputHash,
            inputPreview: preview,
          })
          await this.store.updateToolInvocation(lastToolInvocation.id, {
            status: TOOL_INVOCATION_STATUS.RUNNING,
            phase: TOOL_INVOCATION_PHASE.PRE_PARSE_AUTOFIX,
            heartbeatAt: now(),
          })
          await emitter.emit({
            type: EVENT_TYPES.TOOL_CALL,
            runId,
            stepId: toolStep.id,
            toolInvocationId: lastToolInvocation.id,
            agentId: this.agentId,
            toolName: event.toolName,
            input: preview,
            timestamp: now(),
          })
          await emitter.emit({
            type: EVENT_TYPES.MESSAGE_DELTA,
            runId,
            agentId: this.agentId,
            delta: '已生成候选牌谱，正在调用校验工具...\n',
            timestamp: now(),
          })
          continue
        }

        if (event.type === MODEL_STREAM_EVENT_TYPES.TOOL_RESULT) {
          lastToolOutput = event.output
          const preview = this.buildToolResultPreview(lastToolOutput)
          if (lastToolInvocation) {
            await this.store.updateToolInvocation(lastToolInvocation.id, {
              status: TOOL_INVOCATION_STATUS.RUNNING,
              phase: TOOL_INVOCATION_PHASE.SIMULATE_HAND,
              heartbeatAt: now(),
            })
          }
          if (lastToolStepId) {
            await this.stepManager.completeStep(lastToolStepId, {
              toolName: event.toolName,
              toolInvocationId: lastToolInvocation?.id,
              preview,
              rawOutput: lastToolOutput,
            })
          }
          await emitter.emit({
            type: EVENT_TYPES.TOOL_RESULT,
            runId,
            stepId: lastToolStepId,
            toolInvocationId: lastToolInvocation?.id,
            agentId: this.agentId,
            toolName: event.toolName,
            output: preview,
            timestamp: now(),
          })
        }
      }

      await this.stepManager.completeStep(modelStep.id, {
        textLength: fullText.length,
        toolCalled: Boolean(lastToolOutput),
      })
    } catch (err) {
      await this.stepManager.failStep(modelStep.id, err)
      if (lastToolStepId) await this.stepManager.failStep(lastToolStepId, err)
      if (lastToolInvocation) {
        await this.store.updateToolInvocation(lastToolInvocation.id, {
          status: TOOL_INVOCATION_STATUS.FAILED,
          phase: TOOL_INVOCATION_PHASE.COMPLETED,
          errorCode: err instanceof Error ? err.name : 'TOOL_INVOCATION_FAILED',
          errorMessage: err instanceof Error ? err.message : String(err),
          finishedAt: now(),
        })
      }
      log.error('[NlToHandAgent] outer model/tool execution failed', {
        errorCode: err instanceof Error ? err.message : 'NL_TO_HAND_FAILED',
      })
      throw err
    }

    const toolOutputText = this.stringifyToolOutput(lastToolOutput)
    const isValid = toolOutputText.startsWith('合法')
    const artifactInfo = lastToolOutput
      ? await this.tryCreateHandHistoryArtifact({
        runId,
        sessionId: context.sessionId,
        userMessage,
        finalText: fullText,
        toolInput: lastToolInput,
        toolOutputText,
        status: isValid ? 'valid' : 'draft',
        toolStepId: lastToolStepId,
        toolInvocation: lastToolInvocation,
        commandContext,
        emitter,
        log,
      })
      : undefined

    if (lastToolInvocation && !artifactInfo) {
      await this.store.updateToolInvocation(lastToolInvocation.id, {
        status: TOOL_INVOCATION_STATUS.SUCCEEDED,
        phase: TOOL_INVOCATION_PHASE.COMPLETED,
        finishedAt: now(),
      })
    }

    if (!fullText.trim()) {
      fullText = this.buildFallbackAnswer(toolOutputText)
      await emitter.emit({
        type: EVENT_TYPES.MESSAGE_DELTA,
        runId,
        agentId: this.agentId,
        delta: fullText,
        timestamp: now(),
      })
    }

    return {
      output: {
        answer: fullText,
        artifactId: artifactInfo?.artifactId,
        toolStatus: isValid ? 'success' : lastToolOutput ? 'failed' : 'not_called',
      },
    }
  }

  private getRepairModel() {
    return (models['deepseek.chat'] ?? models['fast.chat'] ?? models.default).model
  }

  private extractMessage(payload: NlToHandPayload): string {
    return typeof payload?.message === 'string' ? payload.message : ''
  }

  private buildPrompt(
    userMessage: string,
    contextPrompt?: string,
    commandContext?: ResolvedHandHistoryCommandContext,
  ): string {
    return [
      contextPrompt ? `[会话上下文]\n${contextPrompt}` : '',
      commandContext?.baseGameHand
        ? [
          '[当前正在编辑的基础牌谱 JSON]',
          JSON.stringify(commandContext.baseGameHand),
          '',
          '[编辑指令]',
          '用户本轮是在修改上一版 hand_history。请优先保留基础牌谱中未被用户明确修改的字段，只根据当前用户描述做最小必要变更。',
          `baseArtifactId=${commandContext.artifactId}`,
          `baseVersionId=${commandContext.baseVersionId}`,
        ].join('\n')
        : '',
      '[当前用户牌局描述]',
      userMessage,
      '',
      '请判断当前用户是否在描述一手德州扑克牌局。',
      '如果是，请调用 nl_to_hand 工具完成结构化与校验；如果不是，请简短说明该模式只处理牌局转牌谱。',
    ].filter(Boolean).join('\n')
  }

  private buildToolPreview(input: unknown): ToolPreview {
    const gameHand = this.extractGameHand(input)
    const hero = gameHand?.players?.find((player) => player.hole_card_list)
    const boardActions = gameHand?.actions?.filter((action) => action.seat_no === -1) ?? []

    return {
      playerCount: gameHand?.players?.length,
      bigBlind: gameHand?.big_blind,
      heroPosition: hero?.position_tag,
      heroCards: hero?.hole_card_list || undefined,
      actionCount: gameHand?.actions?.length,
      hasFlop: boardActions.some((action) => action.action.length === 6),
      hasTurn: boardActions.length >= 2,
      hasRiver: boardActions.length >= 3,
    }
  }

  private buildToolResultPreview(output: unknown): ToolResultPreview {
    const text = this.stringifyToolOutput(output)
    return {
      status: text.startsWith('合法') ? 'success' : 'failed',
      validationCode: this.matchBracketValue(text, '错误码'),
      errorStep: this.matchBracketValue(text, '出错步骤') ? Number(this.matchBracketValue(text, '出错步骤')) : undefined,
      errorPosition: this.matchBracketValue(text, '出错位置'),
      errorReason: this.matchBracketValue(text, '错误原因'),
      fixPath: this.matchFixPath(text),
      askUser: this.matchAskUser(text),
    }
  }

  private async tryCreateHandHistoryArtifact(params: {
    runId: string
    sessionId?: string
    userMessage: string
    finalText: string
    toolInput: unknown
    toolOutputText: string
    status: 'valid' | 'draft'
    toolStepId?: string
    toolInvocation?: ToolInvocation
    commandContext?: ResolvedHandHistoryCommandContext
    emitter: RunEventEmitter
    log: ReturnType<typeof logger.child>
  }): Promise<{ artifactId: string; versionId: string } | undefined> {
    const gameHand = this.extractGameHand(params.toolInput)
    if (!gameHand) return undefined

    const artifactStep = await this.stepManager.startStep({
      runId: params.runId,
      type: STEP_TYPES.ARTIFACT_CREATE,
      agentId: this.agentId,
      parentStepId: params.toolStepId,
      input: { artifactType: ARTIFACT_TYPES.HAND_HISTORY },
    })

    try {
      const preview = this.buildToolPreview(params.toolInput)
      const idempotencyKey = params.toolInvocation
        ? `${params.toolInvocation.idempotencyKey}:artifact`
        : undefined
      const content = {
        rawUserText: params.userMessage,
        gameHand,
        validation: this.buildArtifactValidation(params.toolOutputText),
        handHistoryState: {
          status: params.status === 'valid' ? 'valid' : 'draft',
          baseArtifactId: params.commandContext?.artifactId,
          baseVersionId: params.commandContext?.baseVersionId,
          commandType: params.commandContext?.type ?? 'create_from_nl',
        },
        renderedMarkdown: params.finalText,
        toolResultText: params.toolOutputText,
        assumptions: [],
        createdBy: {
          runId: params.runId,
          agentId: this.agentId,
          toolName: 'nl_to_hand',
          toolInvocationId: params.toolInvocation?.id,
        },
      }

      const isPatch = Boolean(params.commandContext?.artifactId && params.commandContext.baseVersionId)
      const artifactTitle = this.buildArtifactTitle(preview, params.status)
      const createArtifactInput = {
        runId: params.runId,
        type: ARTIFACT_TYPES.HAND_HISTORY,
        title: artifactTitle,
        idempotencyKey,
        metadata: {
          source: 'nl_to_hand',
          status: params.status,
          state: params.status === 'valid' ? 'valid' : 'draft',
          toolInvocationId: params.toolInvocation?.id,
          idempotencyKey,
          summary: artifactTitle,
          ...preview,
        },
      }
      const artifactContext = { runId: params.runId, stepId: artifactStep.id, agentId: this.agentId, idempotencyKey }
      const recoveryPayload = isPatch
        ? {
          kind: 'create_artifact_version',
          artifactId: params.commandContext!.artifactId,
          baseVersionId: params.commandContext!.baseVersionId,
          content,
          context: { runId: params.runId, stepId: artifactStep.id, agentId: this.agentId },
          diffSummary: params.userMessage.slice(0, 500),
        }
        : {
          kind: 'create_artifact_with_version',
          artifactInput: createArtifactInput,
          content,
          context: artifactContext,
        }

      if (params.toolInvocation) {
        await this.store.updateToolInvocation(params.toolInvocation.id, {
          status: TOOL_INVOCATION_STATUS.RUNNING,
          phase: TOOL_INVOCATION_PHASE.ARTIFACT_WRITE,
          recoveryPayload,
          heartbeatAt: now(),
        })
      }

      const result = isPatch
        ? await this.createPatchedHandHistoryVersion({
          artifactId: params.commandContext!.artifactId,
          baseVersionId: params.commandContext!.baseVersionId,
          runId: params.runId,
          stepId: artifactStep.id,
          content,
          diffSummary: params.userMessage,
        })
        : await this.artifactStore.createArtifactWithVersion(
          createArtifactInput,
          content,
          artifactContext,
        )

      const { artifact, version } = result

      await this.stepManager.completeStep(artifactStep.id, {
        artifactId: artifact.id,
        versionId: version.id,
        toolInvocationId: params.toolInvocation?.id,
      })
      if (params.toolInvocation) {
        await this.store.updateToolInvocation(params.toolInvocation.id, {
          status: TOOL_INVOCATION_STATUS.SUCCEEDED,
          phase: TOOL_INVOCATION_PHASE.COMPLETED,
          outputRef: artifact.id,
          finishedAt: now(),
        })
      }
      if (!isPatch) {
        await params.emitter.emit(artifactCreatedEvent({
          runId: params.runId,
          artifactId: artifact.id,
          artifactType: ARTIFACT_TYPES.HAND_HISTORY,
          title: artifact.title,
        }))
      }
      await params.emitter.emit(artifactVersionCreatedEvent({
        runId: params.runId,
        artifactId: artifact.id,
        versionId: version.id,
        version: version.version,
      }))

      await this.updateActiveHandHistoryState(params.sessionId, {
        artifactId: artifact.id,
        versionId: version.id,
        status: params.status === 'valid' ? (isPatch ? 'patched' : 'valid') : 'draft',
        updatedByRunId: params.runId,
      })

      return { artifactId: artifact.id, versionId: version.id }
    } catch (err) {
      await this.stepManager.failStep(artifactStep.id, err)
      if (params.toolInvocation) {
        await this.store.updateToolInvocation(params.toolInvocation.id, {
          status: TOOL_INVOCATION_STATUS.FAILED,
          phase: TOOL_INVOCATION_PHASE.ARTIFACT_WRITE,
          errorCode: 'ARTIFACT_SAVE_FAILED',
          errorMessage: err instanceof Error ? err.message : String(err),
          finishedAt: now(),
        })
      }
      params.log.error('[NlToHandAgent] failed to save hand history artifact', {
        errorCode: 'ARTIFACT_SAVE_FAILED',
      })
      return undefined
    }
  }

  private extractGameHand(input: unknown): LatestHandType | undefined {
    if (!input || typeof input !== 'object') return undefined
    const maybeInput = input as { game_hand?: LatestHandType }
    return maybeInput.game_hand
  }

  private stringifyToolOutput(output: unknown): string {
    if (typeof output === 'string') return output
    if (output === undefined || output === null) return ''
    return JSON.stringify(output)
  }

  private async createPatchedHandHistoryVersion(params: {
    artifactId: string
    baseVersionId: string
    runId: string
    stepId: string
    content: unknown
    diffSummary: string
  }): Promise<{ artifact: NonNullable<Awaited<ReturnType<ArtifactStore['getArtifact']>>>; version: ArtifactVersion }> {
    const artifact = await this.artifactStore.getArtifact(params.artifactId)
    if (!artifact) throw new Error(`Base hand_history artifact not found: ${params.artifactId}`)
    const versions = await this.artifactStore.listVersions(params.artifactId)
    const nextVersion = versions.reduce((max, item) => Math.max(max, item.version), 0) + 1
    const version = await this.artifactStore.createVersion({
      id: generateVersionId(),
      artifactId: params.artifactId,
      version: nextVersion,
      content: params.content,
      createdByRunId: params.runId,
      createdByStepId: params.stepId,
      createdByAgentId: this.agentId,
      parentVersionId: params.baseVersionId,
      diffSummary: params.diffSummary.slice(0, 500),
    })
    await this.artifactStore.setCurrentVersion(params.artifactId, version.id)
    return {
      artifact: {
        ...artifact,
        currentVersionId: version.id,
        updatedAt: now(),
      },
      version,
    }
  }

  private async resolveCommandContext(
    payload: NlToHandPayload,
    sessionId?: string,
  ): Promise<ResolvedHandHistoryCommandContext | undefined> {
    const command = payload.command
    if (!command || command.type === 'create_from_nl') return undefined

    if (command.type === 'replace_json') {
      return undefined
    }

    const active = command.artifactId && command.baseVersionId
      ? { artifactId: command.artifactId, versionId: command.baseVersionId }
      : sessionId && this.sessionsRepository
        ? await this.sessionsRepository.getActiveHandHistory(sessionId)
        : undefined

    if (!active) return undefined
    const version = await this.artifactStore.getVersion(active.versionId)
    const baseGameHand = this.extractGameHandFromVersion(version)
    if (!version || !baseGameHand) return undefined

    return {
      type: 'patch_from_nl',
      artifactId: active.artifactId,
      baseVersionId: version.id,
      baseGameHand,
    }
  }

  private extractGameHandFromVersion(version: ArtifactVersion | null): unknown | undefined {
    if (!version || !version.content || typeof version.content !== 'object') return undefined
    const content = version.content as { gameHand?: unknown }
    return content.gameHand
  }

  private async updateActiveHandHistoryState(
    sessionId: string | undefined,
    state: {
      artifactId: string
      versionId: string
      status: 'draft' | 'valid' | 'invalid_needs_user_input' | 'patched'
      updatedByRunId: string
    },
  ): Promise<void> {
    if (!sessionId || !this.sessionsRepository) return
    await this.sessionsRepository.updateActiveHandHistory(sessionId, state)
  }

  private buildToolIdempotencyKey(runId: string, toolName: string, inputHash: string): string {
    return `${runId}:${toolName}:${inputHash}`
  }

  private hashUnknown(value: unknown): string {
    return createHash('sha256').update(this.stableStringify(value)).digest('hex')
  }

  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value)
    if (Array.isArray(value)) return `[${value.map((item) => this.stableStringify(item)).join(',')}]`
    const obj = value as Record<string, unknown>
    return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${this.stableStringify(obj[key])}`).join(',')}}`
  }

  private matchBracketValue(text: string, label: string): string | undefined {
    const match = text.match(new RegExp(`\\[${label}\\]\\s*([^\\n]+)`))
    return match?.[1]?.trim()
  }

  private matchFixPath(text: string): string | undefined {
    return text.match(/fix_path=([^|\n]+)/)?.[1]?.trim()
  }

  private matchAskUser(text: string): string | undefined {
    return text.match(/3\. 请求用户补充：([^\n]+)/)?.[1]?.trim()
  }

  private buildArtifactValidation(toolOutputText: string) {
    const ok = toolOutputText.startsWith('合法')
    return {
      ok,
      code: ok ? 'OK' : this.matchBracketValue(toolOutputText, '错误码'),
      message: ok ? '合法' : toolOutputText,
      step: this.matchBracketValue(toolOutputText, '出错步骤')
        ? Number(this.matchBracketValue(toolOutputText, '出错步骤'))
        : undefined,
      errorPosition: this.matchBracketValue(toolOutputText, '出错位置'),
      errorReason: this.matchBracketValue(toolOutputText, '错误原因'),
      fixPath: this.matchFixPath(toolOutputText),
      askUser: this.matchAskUser(toolOutputText),
    }
  }

  private buildFallbackAnswer(toolOutputText: string): string {
    if (!toolOutputText) {
      return '我没有成功触发牌谱工具。请确认当前消息是在描述一手德州扑克牌局。'
    }
    if (toolOutputText.startsWith('合法')) {
      return '牌谱已校验合法，但外层模型没有生成牌谱摘要。请查看本次 Run 的工具结果或 Artifact。'
    }
    return toolOutputText
  }

  private buildArtifactTitle(preview: ToolPreview, status: 'valid' | 'draft' = 'valid'): string {
    const parts = [
      status === 'draft' ? '待补充牌谱' : undefined,
      preview.playerCount ? `${preview.playerCount}人桌` : '牌谱',
      preview.heroPosition ? `Hero ${preview.heroPosition}` : undefined,
      preview.heroCards,
    ].filter(Boolean)
    return parts.join(' · ')
  }
}

