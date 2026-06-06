import { describe, expect, it } from 'bun:test'
import {
  ARTIFACT_TYPES,
  TOOL_INVOCATION_PHASE,
  TOOL_INVOCATION_STATUS,
} from '@agent-frame/shared'
import { MemoryArtifactStore } from '../../../src/artifacts/artifact-store.memory.js'
import { MemoryRunStore } from '../../../src/runtime/stores/memory-run-store.js'
import { ToolInvocationRecoveryWorker } from '../../../src/runtime/tool-invocation-recovery.worker.js'

describe('ToolInvocationRecoveryWorker', () => {
  it('should recover stale artifact_write by replaying persisted recoveryPayload', async () => {
    const runStore = new MemoryRunStore()
    const artifactStore = new MemoryArtifactStore()
    const invocation = await runStore.createToolInvocation({
      id: 'tinv-recover-artifact',
      runId: 'run-recover-artifact',
      stepId: 'step-recover-artifact',
      toolName: 'nl_to_hand',
      idempotencyKey: 'run-recover-artifact:nl_to_hand:hash',
      inputHash: 'hash',
      inputPreview: { playerCount: 6 },
    })
    await runStore.updateToolInvocation(invocation.id, {
      status: TOOL_INVOCATION_STATUS.RUNNING,
      phase: TOOL_INVOCATION_PHASE.ARTIFACT_WRITE,
      recoveryPayload: {
        kind: 'create_artifact_with_version',
        artifactInput: {
          runId: 'run-recover-artifact',
          type: ARTIFACT_TYPES.HAND_HISTORY,
          title: '恢复测试牌谱',
          idempotencyKey: 'run-recover-artifact:nl_to_hand:hash:artifact',
          metadata: { source: 'test' },
        },
        content: { gameHand: { gameuuid: 'recover' }, validation: { ok: true } },
        context: {
          runId: 'run-recover-artifact',
          stepId: 'step-recover-artifact',
          agentId: 'nl-to-hand-agent',
          idempotencyKey: 'run-recover-artifact:nl_to_hand:hash:artifact',
        },
      },
    })

    const worker = new ToolInvocationRecoveryWorker(runStore, artifactStore, {
      enabled: false,
      staleAfterMs: -1,
    })
    const recovered = await worker.recoverStaleInvocations()

    expect(recovered).toBe(1)
    const updated = await runStore.getToolInvocation(invocation.id)
    expect(updated?.status).toBe(TOOL_INVOCATION_STATUS.SUCCEEDED)
    expect(updated?.phase).toBe(TOOL_INVOCATION_PHASE.COMPLETED)
    expect(updated?.outputRef).toBeTruthy()
    const artifacts = await artifactStore.listArtifactsByRun('run-recover-artifact')
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]?.id).toBe(updated?.outputRef)
  })

  it('should mark stale non-replayable phase as timed_out', async () => {
    const runStore = new MemoryRunStore()
    const artifactStore = new MemoryArtifactStore()
    const invocation = await runStore.createToolInvocation({
      id: 'tinv-timeout',
      runId: 'run-timeout',
      stepId: 'step-timeout',
      toolName: 'nl_to_hand',
      idempotencyKey: 'run-timeout:nl_to_hand:hash',
      inputHash: 'hash',
    })
    await runStore.updateToolInvocation(invocation.id, {
      status: TOOL_INVOCATION_STATUS.RUNNING,
      phase: TOOL_INVOCATION_PHASE.SIMULATE_HAND,
    })

    const worker = new ToolInvocationRecoveryWorker(runStore, artifactStore, {
      enabled: false,
      staleAfterMs: -1,
    })
    const recovered = await worker.recoverStaleInvocations()

    expect(recovered).toBe(1)
    const updated = await runStore.getToolInvocation(invocation.id)
    expect(updated?.status).toBe(TOOL_INVOCATION_STATUS.TIMED_OUT)
    expect(updated?.errorCode).toBe('TOOL_INVOCATION_STALE')
  })
})
