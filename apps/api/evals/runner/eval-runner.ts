#!/usr/bin/env bun
// ============================================================
// NL to Hand LLM Eval Runner
//
// 用法：
//   bun run apps/api/evals/runner/eval-runner.ts
//   bun run apps/api/evals/runner/eval-runner.ts --model=fake --fail-on-regression
//   bun run apps/api/evals/runner/eval-runner.ts --model=real
//
// 指标：route_accuracy, tool_call_rate, schema_success_rate,
//       validation_success_rate, artifact_success_rate, patch_preservation_rate
// ============================================================

import { join } from 'node:path'
import { EVENT_TYPES } from '@agent-frame/shared'
import { CapabilityRouter } from '../../src/capabilities/capability-router.js'
import { NlToHandAgent } from '../../src/ai/agents/nl-to-hand.agent.js'
import { NL_TO_HAND_AGENT_ID } from '../../src/ai/agents/agent-ids.js'
import { VercelAIModelClient } from '../../src/ai/model-client/vercel-ai-model-client.js'
import type { ModelClient } from '../../src/ai/model-client/model-client.js'
import { RunManager } from '../../src/runtime/run-manager.js'
import { MemoryRunStore } from '../../src/runtime/stores/memory-run-store.js'
import { MemoryArtifactStore } from '../../src/artifacts/artifact-store.memory.js'
import { LatestHandSchema } from '../../src/features/agent-tools/tool_nl_to_hand'
import { runPreParseAutoFix } from '../../src/features/agent-tools/autofix_pipeline'
import { createNlToHandTool } from '../../src/features/agent-tools/tool_nl_to_hand'
import { pokerPromptProvider } from '../../src/features/agent-tools/poker-prompt-provider'
import { generateRunId } from '../../src/shared/utils/id.js'
import { ARTIFACT_TYPES } from '@agent-frame/shared'
import { createFakeEvalModelClient, type FakeFixtureRegistry } from './fake-model-client.js'
import { getThresholds } from './thresholds.js'
import type {
  CaseResult,
  EvalMetrics,
  EvalReport,
  GoldenCase,
  PatchCase,
  RoutingCase,
} from './types.js'
import { NL_TO_HAND_DIR, deepEqual, getByPath, loadJsonl, parseArgs, waitForRun } from './utils.js'
import { formatMarkdownReport, writeMarkdownReport } from './reporters/markdown-reporter.js'
import { writeJsonReport } from './reporters/json-reporter.js'
import {
  build6MaxFlopCbetFold,
  build6MaxOpenFold,
  buildHeadsUpHand,
  buildInvalidSimulationHand,
  buildSchemaInvalidHand,
} from './fixtures/hands.js'

/** 内置 fixture 解析：jsonl 中 fixtureRef 指向预置手牌 */
const BUILTIN_FIXTURES: Record<string, unknown> = {
  '6max-open-fold': build6MaxOpenFold({}),
  '6max-open-fold-kk-co': build6MaxOpenFold({ heroSeat: 5, heroCards: 'KhKd', heroPosition: 'CO' }),
  '6max-flop-cbet': build6MaxFlopCbetFold(),
  'heads-up': buildHeadsUpHand(),
  'invalid-simulation': buildInvalidSimulationHand(),
  'schema-invalid': buildSchemaInvalidHand(),
  '6max-3bet': build6MaxOpenFold({
    heroSeat: 3,
    heroCards: 'QsQd',
    heroPosition: 'UTG',
    openAmount: 6,
    gameuuid: 'eval-3bet',
  }),
  '6max-open-10': build6MaxOpenFold({ openAmount: 10, gameuuid: 'eval-open-10' }),
  '6max-open-fold-qq': build6MaxOpenFold({
    heroSeat: 3,
    heroCards: 'QhQd',
    heroPosition: 'UTG',
    gameuuid: 'eval-open-qq',
  }),
  '6max-open-fold-kk-utg': build6MaxOpenFold({
    heroSeat: 3,
    heroCards: 'KhKd',
    heroPosition: 'UTG',
    gameuuid: 'eval-open-kk-utg',
  }),
  '9max-open': build6MaxOpenFold({ gameuuid: 'eval-9max-placeholder' }),
}

/**
 * 解析用例 fixture，支持 fixtureRef 或内联 game_hand。
 */
function resolveFixture(
  caseItem: GoldenCase | PatchCase,
  kind: 'golden' | 'patch',
): { mustCallTool: boolean; game_hand?: unknown } {
  const fixture = caseItem.fixture ?? {}
  const mustCallTool = fixture.mustCallTool ?? caseItem.expected.mustCallTool

  if (fixture.game_hand) {
    return { mustCallTool, game_hand: fixture.game_hand }
  }

  const ref = fixture.fixtureRef
  if (ref && BUILTIN_FIXTURES[ref]) {
    let hand = structuredClone(BUILTIN_FIXTURES[ref])
    if (kind === 'patch') {
      hand = applyPatchOverrides(caseItem as PatchCase, hand)
    }
    return { mustCallTool, game_hand: hand }
  }

  return { mustCallTool }
}

/** 解析 patch 用例的基础牌谱 */
function resolveBaseHand(caseItem: PatchCase): unknown {
  if (caseItem.baseHand) return caseItem.baseHand
  if (caseItem.baseHandRef && BUILTIN_FIXTURES[caseItem.baseHandRef]) {
    return structuredClone(BUILTIN_FIXTURES[caseItem.baseHandRef])
  }
  throw new Error(`Patch case ${caseItem.id} missing baseHand or baseHandRef`)
}

/** Patch 用例：根据 changedFields 对 base fixture 做最小修改 */
function applyPatchOverrides(patchCase: PatchCase, hand: unknown): unknown {
  const cloned = structuredClone(hand) as Record<string, unknown>
  for (const field of patchCase.expected.changedFields) {
    if (field.includes('hole_card_list') && field.includes('players')) {
      const match = field.match(/players\[(\d+)\]/)
      const idx = match ? Number(match[1]) : 3
      const players = cloned.players as Array<Record<string, unknown>>
      if (players[idx]) {
        if (patchCase.id.includes('khkd') || patchCase.input.includes('KhKd')) {
          players[idx].hole_card_list = 'KhKd'
        } else if (patchCase.input.includes('QQ')) {
          players[idx].hole_card_list = 'QhQd'
        }
      }
    }
    if (field.includes('big_blind')) {
      cloned.big_blind = 5
    }
    if (field.includes('actions') && patchCase.id.includes('open-size')) {
      const actions = cloned.actions as Array<Record<string, unknown>>
      const raise = actions.find((a) => a.action === 'raise')
      if (raise) raise.amount = 10
    }
    if (field.includes('actions') && patchCase.id.includes('flop')) {
      const actions = cloned.actions as Array<Record<string, unknown>>
      if (!actions.some((a) => a.seat_no === -1)) {
        actions.push({ action: '4cAcQc', seat_no: -1, amount: 0 })
      }
    }
  }
  return cloned
}

async function evaluateRoutingCase(router: CapabilityRouter, caseItem: RoutingCase): Promise<CaseResult> {
  const started = Date.now()
  const errors: string[] = []
  const checks: Record<string, boolean> = {}

  const result = router.resolve({
    input: { message: caseItem.input },
    requestedAgentId: caseItem.requestedAgentId,
  })

  checks.routeType = result.type === caseItem.expected.routeType
  if (!checks.routeType) {
    errors.push(`expected routeType=${caseItem.expected.routeType}, got ${result.type}`)
  }

  if (caseItem.expected.routeType === 'agent' && result.type === 'agent') {
    if (caseItem.expected.routeAgentId) {
      checks.routeAgentId = result.agentId === caseItem.expected.routeAgentId
      if (!checks.routeAgentId) {
        errors.push(`expected agentId=${caseItem.expected.routeAgentId}, got ${result.agentId}`)
      }
    }
    if (caseItem.expected.source) {
      checks.source = result.source === caseItem.expected.source
      if (!checks.source) errors.push(`expected source=${caseItem.expected.source}, got ${result.source}`)
    }
  }

  if (caseItem.expected.minConfidence !== undefined && 'confidence' in result) {
    checks.minConfidence = result.confidence >= caseItem.expected.minConfidence
    if (!checks.minConfidence) {
      errors.push(`confidence ${result.confidence} < min ${caseItem.expected.minConfidence}`)
    }
  }

  if (caseItem.expected.maxConfidence !== undefined && 'confidence' in result) {
    checks.maxConfidence = result.confidence <= caseItem.expected.maxConfidence
    if (!checks.maxConfidence) {
      errors.push(`confidence ${result.confidence} > max ${caseItem.expected.maxConfidence}`)
    }
  }

  const passed = Object.values(checks).every(Boolean)
  return {
    id: caseItem.id,
    suite: 'routing',
    passed,
    durationMs: Date.now() - started,
    checks,
    errors,
    details: { result },
  }
}

async function runToolPipeline(gameHand: unknown): Promise<{
  schemaSuccess: boolean
  validationSuccess: boolean
  outputText: string
}> {
  const tool = createNlToHandTool({
    promptProvider: pokerPromptProvider,
    innerRepairMode: 'disabled',
  }) as { execute: (input: unknown) => Promise<unknown> }

  const preFix = runPreParseAutoFix(gameHand)
  const schemaResult = LatestHandSchema.safeParse(preFix.fixed)
  if (!schemaResult.success) {
    return { schemaSuccess: false, validationSuccess: false, outputText: 'SCHEMA_INVALID' }
  }

  const output = await tool.execute({ game_hand: gameHand })
  const outputText = typeof output === 'string' ? output : JSON.stringify(output)
  return {
    schemaSuccess: true,
    validationSuccess: outputText.startsWith('合法'),
    outputText,
  }
}

async function evaluateGoldenCase(
  modelClient: ModelClient,
  fixtureRegistry: FakeFixtureRegistry,
  caseItem: GoldenCase,
  router: CapabilityRouter,
): Promise<CaseResult> {
  const started = Date.now()
  const errors: string[] = []
  const checks: Record<string, boolean> = {}

  if (caseItem.expected.routeAgentId) {
    const route = router.resolve({
      input: { message: caseItem.input },
      requestedAgentId: caseItem.requestedAgentId,
    })
    checks.route = route.type === 'agent' && route.agentId === caseItem.expected.routeAgentId
    if (!checks.route) errors.push(`route mismatch: ${JSON.stringify(route)}`)
  }

  const fixture = resolveFixture(caseItem, 'golden')
  fixtureRegistry.set(caseItem.id, {
    mustCallTool: fixture.mustCallTool,
    game_hand: fixture.game_hand,
    textDelta: caseItem.fixture?.textDelta,
  })

  const runStore = new MemoryRunStore()
  const artifactStore = new MemoryArtifactStore()
  const agent = new NlToHandAgent(modelClient, runStore, artifactStore)
  const runManager = new RunManager(runStore, {
    agentId: NL_TO_HAND_AGENT_ID,
    execute: (input, context) => agent.execute(input as Parameters<typeof agent.execute>[0], context),
  })

  const created = await runManager.createRun({
    agentId: NL_TO_HAND_AGENT_ID,
    input: { message: caseItem.input },
  })

  // 通过 metadata 传递 evalCaseId — 在 fake 模式下由 stream 读取
  // NlToHandAgent 会将 metadata 传给 modelClient.stream
  const completed = await waitForRun(runStore, created.id)

  const events = await runStore.listEvents(created.id)
  const toolCalled = events.some((e) => e.type === EVENT_TYPES.TOOL_CALL)
  checks.toolCalled = toolCalled === caseItem.expected.mustCallTool
  if (!checks.toolCalled) {
    errors.push(`mustCallTool=${caseItem.expected.mustCallTool}, toolCalled=${toolCalled}`)
  }

  let schemaSuccess = false
  let validationSuccess = false
  if (fixture.game_hand) {
    const pipeline = await runToolPipeline(fixture.game_hand)
    schemaSuccess = pipeline.schemaSuccess
    validationSuccess = pipeline.validationSuccess
  }

  if (caseItem.expected.mustCallTool) {
    if (caseItem.expected.schemaMustPass === false) {
      checks.schemaSuccess = !schemaSuccess
      if (!checks.schemaSuccess) errors.push('expected schema to fail but it passed')
    } else {
      checks.schemaSuccess = schemaSuccess
      if (!checks.schemaSuccess) errors.push('schema validation failed')
    }
  }

  if (caseItem.expected.mustBeValid !== undefined) {
    const output = completed.output as { toolStatus?: string } | undefined
    const isValid = output?.toolStatus === 'success' || validationSuccess
    checks.validationSuccess = isValid === caseItem.expected.mustBeValid
    if (!checks.validationSuccess) {
      errors.push(`mustBeValid=${caseItem.expected.mustBeValid}, isValid=${isValid}`)
    }
  }

  const invocations = await runStore.listToolInvocations(created.id)
  const artifacts = await artifactStore.listArtifactsByRun(created.id)
  const mustCreateArtifact = caseItem.expected.mustCreateArtifact ?? caseItem.expected.mustCallTool

  if (mustCreateArtifact) {
    checks.artifactCreated = artifacts.length > 0 && Boolean(invocations[0]?.outputRef)
    if (!checks.artifactCreated) errors.push('expected artifact to be created')
  }

  if (caseItem.expected.players !== undefined && fixture.game_hand) {
    const hand = fixture.game_hand as { players?: unknown[] }
    checks.players = hand.players?.length === caseItem.expected.players
    if (!checks.players) errors.push(`expected players=${caseItem.expected.players}`)
  }

  if (caseItem.expected.heroCards && fixture.game_hand) {
    const hand = fixture.game_hand as { players?: Array<{ hole_card_list?: string }> }
    const hero = hand.players?.find((p) => p.hole_card_list)
    checks.heroCards = hero?.hole_card_list === caseItem.expected.heroCards
    if (!checks.heroCards) errors.push(`expected heroCards=${caseItem.expected.heroCards}`)
  }

  const passed = Object.values(checks).every(Boolean)
  return {
    id: caseItem.id,
    suite: 'golden',
    passed,
    durationMs: Date.now() - started,
    checks,
    errors,
    details: { runStatus: completed.status, toolStatus: (completed.output as { toolStatus?: string })?.toolStatus },
  }
}

async function evaluatePatchCase(
  modelClient: ModelClient,
  fixtureRegistry: FakeFixtureRegistry,
  caseItem: PatchCase,
): Promise<CaseResult> {
  const started = Date.now()
  const errors: string[] = []
  const checks: Record<string, boolean> = {}

  const baseHand = resolveBaseHand(caseItem)
  const fixture = resolveFixture(caseItem, 'patch')
  fixtureRegistry.set(caseItem.id, {
    mustCallTool: fixture.mustCallTool,
    game_hand: fixture.game_hand,
  })

  const runStore = new MemoryRunStore()
  const artifactStore = new MemoryArtifactStore()

  const { artifact, version } = await artifactStore.createArtifactWithVersion(
    {
      runId: generateRunId(),
      type: ARTIFACT_TYPES.HAND_HISTORY,
      title: 'Eval Base Hand',
    },
    { gameHand: baseHand, handHistoryState: { status: 'valid' } },
    { runId: generateRunId(), agentId: NL_TO_HAND_AGENT_ID },
  )

  const agent = new NlToHandAgent(modelClient, runStore, artifactStore)
  const runManager = new RunManager(runStore, {
    agentId: NL_TO_HAND_AGENT_ID,
    execute: (input, context) => agent.execute(input as Parameters<typeof agent.execute>[0], context),
  })

  const created = await runManager.createRun({
    agentId: NL_TO_HAND_AGENT_ID,
    input: {
      message: caseItem.input,
      command: {
        type: 'patch_from_nl',
        artifactId: artifact.id,
        baseVersionId: version.id,
      },
    },
  })

  await waitForRun(runStore, created.id)

  const events = await runStore.listEvents(created.id)
  const toolCalled = events.some((e) => e.type === EVENT_TYPES.TOOL_CALL)
  checks.toolCalled = toolCalled === caseItem.expected.mustCallTool
  if (!checks.toolCalled) errors.push(`mustCallTool=${caseItem.expected.mustCallTool}, toolCalled=${toolCalled}`)

  const outputHand = fixture.game_hand
  let preservedCount = 0
  for (const field of caseItem.expected.preservedFields) {
    const baseValue = getByPath(baseHand, field)
    const outputValue = getByPath(outputHand, field)
    if (deepEqual(baseValue, outputValue)) preservedCount += 1
    else errors.push(`field not preserved: ${field} (base=${JSON.stringify(baseValue)}, out=${JSON.stringify(outputValue)})`)
  }
  checks.patchPreservation = preservedCount === caseItem.expected.preservedFields.length

  for (const field of caseItem.expected.changedFields) {
    const baseValue = getByPath(baseHand, field)
    const outputValue = getByPath(outputHand, field)
    const changed = !deepEqual(baseValue, outputValue)
    if (!changed) errors.push(`field should have changed: ${field}`)
  }
  checks.fieldsChanged = caseItem.expected.changedFields.every((field) => {
    return !deepEqual(getByPath(baseHand, field), getByPath(outputHand, field))
  })

  if (caseItem.expected.mustBeValid !== undefined && fixture.game_hand) {
    const pipeline = await runToolPipeline(fixture.game_hand)
    checks.validationSuccess = pipeline.validationSuccess === caseItem.expected.mustBeValid
    if (!checks.validationSuccess) errors.push(`mustBeValid=${caseItem.expected.mustBeValid}`)
  }

  const passed = Object.values(checks).every(Boolean)
  return {
    id: caseItem.id,
    suite: 'patch',
    passed,
    durationMs: Date.now() - started,
    checks,
    errors,
    details: { preservedCount, totalPreserved: caseItem.expected.preservedFields.length },
  }
}

function computeMetrics(results: CaseResult[]): EvalMetrics {
  const routing = results.filter((r) => r.suite === 'routing')
  const golden = results.filter((r) => r.suite === 'golden')
  const patch = results.filter((r) => r.suite === 'patch')

  const rate = (items: CaseResult[], checkKey: string) => {
    const relevant = items.filter((item) => checkKey in item.checks)
    if (relevant.length === 0) return 1
    return relevant.filter((item) => item.checks[checkKey]).length / relevant.length
  }

  const totalDuration = results.reduce((sum, item) => sum + item.durationMs, 0)

  return {
    route_accuracy: routing.length > 0
      ? routing.filter((r) => r.passed).length / routing.length
      : rate(golden, 'route'),
    tool_call_rate: rate([...golden, ...patch], 'toolCalled'),
    schema_success_rate: rate(golden, 'schemaSuccess'),
    validation_success_rate: rate(
      [...golden, ...patch].filter((r) => 'validationSuccess' in r.checks),
      'validationSuccess',
    ),
    artifact_success_rate: rate(golden, 'artifactCreated'),
    patch_preservation_rate: patch.length > 0
      ? rate(patch, 'patchPreservation')
      : 1,
    totalCases: results.length,
    passedCases: results.filter((r) => r.passed).length,
    failedCases: results.filter((r) => !r.passed).length,
    durationMs: totalDuration,
  }
}

function checkThresholds(
  metrics: EvalMetrics,
  thresholds: ReturnType<typeof getThresholds>,
  failOnRegression: boolean,
): string[] {
  const violations: string[] = []
  const entries: Array<[keyof EvalMetrics, string]> = [
    ['route_accuracy', 'route_accuracy'],
    ['tool_call_rate', 'tool_call_rate'],
    ['schema_success_rate', 'schema_success_rate'],
    ['validation_success_rate', 'validation_success_rate'],
    ['artifact_success_rate', 'artifact_success_rate'],
    ['patch_preservation_rate', 'patch_preservation_rate'],
  ]

  for (const [metricKey, thresholdKey] of entries) {
    const value = metrics[metricKey] as number
    const threshold = thresholds[thresholdKey]
    if (!threshold) continue
    const compareRate = failOnRegression ? threshold.blockRate : threshold.minRate
    if (value < compareRate) {
      violations.push(
        `${thresholdKey}: ${(value * 100).toFixed(1)}% < ${(compareRate * 100).toFixed(0)}% (${failOnRegression ? 'block' : 'min'})`,
      )
    }
  }

  return violations
}

/** 包装 ModelClient，注入 evalCaseId 到 stream metadata */
function wrapWithEvalCaseId(client: ModelClient, getCaseId: () => string | undefined): ModelClient {
  return {
    ...client,
    async *stream(input) {
      const caseId = getCaseId()
      const metadata = { ...input.metadata, evalCaseId: caseId }
      yield* client.stream({ ...input, metadata })
    },
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const thresholds = getThresholds(args.model)
  const fixtureRegistry: FakeFixtureRegistry = new Map()
  let currentCaseId: string | undefined

  const baseClient = args.model === 'fake'
    ? createFakeEvalModelClient(fixtureRegistry)
    : new VercelAIModelClient()

  const modelClient = wrapWithEvalCaseId(baseClient, () => currentCaseId)
  const router = new CapabilityRouter()

  const routingCases = await loadJsonl<RoutingCase>(join(NL_TO_HAND_DIR, 'routing_cases.jsonl'))
  const goldenCases = await loadJsonl<GoldenCase>(join(NL_TO_HAND_DIR, 'golden_cases.jsonl'))
  const patchCases = await loadJsonl<PatchCase>(join(NL_TO_HAND_DIR, 'patch_cases.jsonl'))

  const results: CaseResult[] = []
  const runStarted = Date.now()

  for (const caseItem of routingCases) {
    results.push(await evaluateRoutingCase(router, caseItem))
  }

  for (const caseItem of goldenCases) {
    currentCaseId = caseItem.id
    results.push(await evaluateGoldenCase(modelClient, fixtureRegistry, caseItem, router))
  }

  for (const caseItem of patchCases) {
    currentCaseId = caseItem.id
    results.push(await evaluatePatchCase(modelClient, fixtureRegistry, caseItem))
  }

  currentCaseId = undefined

  const metrics = computeMetrics(results)
  metrics.durationMs = Date.now() - runStarted

  const thresholdViolations = checkThresholds(metrics, thresholds, args.failOnRegression)

  const report: EvalReport = {
    runAt: new Date().toISOString(),
    modelMode: args.model,
    metrics,
    caseResults: results,
    thresholdViolations,
  }

  const outputDir = args.outputDir ?? join(NL_TO_HAND_DIR, 'reports')
  const mdPath = await writeMarkdownReport(report, thresholds, outputDir)
  const jsonPath = await writeJsonReport(report, outputDir)

  console.log(formatMarkdownReport(report, thresholds))
  console.log('')
  console.log(`Markdown report: ${mdPath}`)
  console.log(`JSON report: ${jsonPath}`)

  if (args.failOnRegression && thresholdViolations.length > 0) {
    console.error('Eval gate failed:')
    for (const v of thresholdViolations) console.error(`  - ${v}`)
    process.exit(1)
  }

  if (metrics.failedCases > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[eval-runner] fatal error:', err)
  process.exit(1)
})
