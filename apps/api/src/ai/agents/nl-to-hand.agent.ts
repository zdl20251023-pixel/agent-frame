import { streamText, stepCountIs } from 'ai'
import type { AgentInput, AgentOutput } from '@agent-frame/shared'
import { ARTIFACT_TYPES, EVENT_TYPES, STEP_TYPES } from '@agent-frame/shared'
import type { RunContext } from '../../runtime/run-manager.js'
import type { RunStore } from '../../runtime/stores/run-store.js'
import type { ArtifactStore } from '../../artifacts/artifact-store.js'
import { RunEventEmitter } from '../../runtime/event-emitter.js'
import { StepManager } from '../../runtime/step-manager.js'
import { artifactCreatedEvent, artifactVersionCreatedEvent } from '../../artifacts/artifact-events.js'
import { createNlToHandTool, type LatestHandType } from '../../features/agent-tools/tool_nl_to_hand'
import {
  POKER_OUTER_SYSTEM_PROMPT,
  pokerPromptProvider,
} from '../../features/agent-tools/poker-prompt-provider'
import { models } from '../models.js'
import { NL_TO_HAND_AGENT_ID } from './agent-ids.js'
import { now } from '../../shared/utils/id.js'
import { logger } from '../../shared/observability/logger.js'

// ============================================================
// NlToHandAgent — 自然语言转牌谱专用 Agent
//
// 设计说明：
// - 本 Agent 是方案 A 增强版的业务入口，专门负责自然语言牌局结构化。
// - 当前阶段直接使用 Vercel AI SDK 的 tools 能力，避免先重构全局 ModelClient。
// - 工具调用过程仍映射回框架统一的 Step / AgentEvent / Artifact。
// ============================================================

export { NL_TO_HAND_AGENT_ID }

type NlToHandPayload = {
  message?: string
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
    private store: RunStore,
    private artifactStore: ArtifactStore,
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
    const prompt = this.buildPrompt(userMessage, input.conversationContext?.promptText)

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

    try {
      const firstModelStreamStartedAt = Date.now()
      const result = streamText({
        model: this.getOuterModel(),
        system: POKER_OUTER_SYSTEM_PROMPT,
        prompt,
        tools: {
          nl_to_hand: createNlToHandTool({
            promptProvider: pokerPromptProvider,
            messages: [],
            innerRepairModel: this.getRepairModel(),
            firstModelStreamStartedAt,
          }),
        },
        stopWhen: stepCountIs(3),
        temperature: 0.2,
        maxOutputTokens: 4096,
        abortSignal: context.signal,
      } as never)

      for await (const part of result.fullStream) {
        if (context.signal.aborted || input.signal?.aborted) break

        const raw = part as any
        if (raw.type === 'text-delta') {
          const delta = String(raw.text ?? raw.textDelta ?? '')
          if (!delta) continue
          fullText += delta
          await emitter.emit({
            type: EVENT_TYPES.MESSAGE_DELTA,
            runId,
            agentId: this.agentId,
            delta,
            timestamp: now(),
          })
          continue
        }

        if (raw.type === 'tool-call') {
          lastToolInput = raw.input ?? raw.args
          const preview = this.buildToolPreview(lastToolInput)
          const toolStep = await this.stepManager.startStep({
            runId,
            type: STEP_TYPES.TOOL_CALL,
            agentId: this.agentId,
            parentStepId: modelStep.id,
            input: {
              toolName: raw.toolName ?? 'nl_to_hand',
              toolCallId: raw.toolCallId,
              preview,
              rawInput: lastToolInput,
            },
          })
          lastToolStepId = toolStep.id
          await emitter.emit({
            type: EVENT_TYPES.TOOL_CALL,
            runId,
            stepId: toolStep.id,
            agentId: this.agentId,
            toolName: raw.toolName ?? 'nl_to_hand',
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

        if (raw.type === 'tool-result') {
          lastToolOutput = raw.output ?? raw.result
          const preview = this.buildToolResultPreview(lastToolOutput)
          if (lastToolStepId) {
            await this.stepManager.completeStep(lastToolStepId, {
              toolName: raw.toolName ?? 'nl_to_hand',
              preview,
              rawOutput: lastToolOutput,
            })
          }
          await emitter.emit({
            type: EVENT_TYPES.TOOL_RESULT,
            runId,
            stepId: lastToolStepId,
            agentId: this.agentId,
            toolName: raw.toolName ?? 'nl_to_hand',
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
        userMessage,
        finalText: fullText,
        toolInput: lastToolInput,
        toolOutputText,
        status: isValid ? 'valid' : 'draft',
        toolStepId: lastToolStepId,
        emitter,
        log,
      })
      : undefined

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

  private getOuterModel() {
    return (models['deepseek.chat'] ?? models['fast.chat'] ?? models.default).model
  }

  private getRepairModel() {
    return (models['deepseek.chat'] ?? models['fast.chat'] ?? models.default).model
  }

  private extractMessage(payload: NlToHandPayload): string {
    return typeof payload?.message === 'string' ? payload.message : ''
  }

  private buildPrompt(userMessage: string, contextPrompt?: string): string {
    return [
      contextPrompt ? `[会话上下文]\n${contextPrompt}` : '',
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
    userMessage: string
    finalText: string
    toolInput: unknown
    toolOutputText: string
    status: 'valid' | 'draft'
    toolStepId?: string
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
      const { artifact, version } = await this.artifactStore.createArtifactWithVersion(
        {
          runId: params.runId,
          type: ARTIFACT_TYPES.HAND_HISTORY,
          title: this.buildArtifactTitle(preview, params.status),
          metadata: {
            source: 'nl_to_hand',
            status: params.status,
            summary: this.buildArtifactTitle(preview, params.status),
            ...preview,
          },
        },
        {
          rawUserText: params.userMessage,
          gameHand,
          validation: this.buildArtifactValidation(params.toolOutputText),
          renderedMarkdown: params.finalText,
          toolResultText: params.toolOutputText,
          assumptions: [],
          createdBy: {
            runId: params.runId,
            agentId: this.agentId,
            toolName: 'nl_to_hand',
          },
        },
        { runId: params.runId, stepId: artifactStep.id, agentId: this.agentId },
      )

      await this.stepManager.completeStep(artifactStep.id, {
        artifactId: artifact.id,
        versionId: version.id,
      })
      await params.emitter.emit(artifactCreatedEvent({
        runId: params.runId,
        artifactId: artifact.id,
        artifactType: ARTIFACT_TYPES.HAND_HISTORY,
        title: artifact.title,
      }))
      await params.emitter.emit(artifactVersionCreatedEvent({
        runId: params.runId,
        artifactId: artifact.id,
        versionId: version.id,
        version: version.version,
      }))

      return { artifactId: artifact.id, versionId: version.id }
    } catch (err) {
      await this.stepManager.failStep(artifactStep.id, err)
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

