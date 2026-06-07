import type { Step, CreateStepInput, RunCheckpointPayload } from '@agent-frame/shared'
import { STEP_STATUS } from '@agent-frame/shared'
import type { RunStore } from './stores/run-store.js'
import { generateStepId, now } from '../shared/utils/id.js'

// ============================================================
// StepManager — 管理 Run 内部 Step 的创建和更新
// ============================================================

export class StepManager {
  constructor(private store: RunStore) {}

  async startStep(input: Omit<CreateStepInput, 'id'>): Promise<Step> {
    const step = await this.store.createStep({
      ...input,
      id: generateStepId(),
    })
    return step
  }

  async completeStep(stepId: string, output?: unknown): Promise<void> {
    const step = await this.store.getStep(stepId)
    await this.store.updateStep(stepId, {
      status: STEP_STATUS.COMPLETED,
      output,
      endedAt: now(),
    })
    if (step) {
      const checkpoint: RunCheckpointPayload = {
        lastCompletedStepId: stepId,
        lastStepType: step.type,
        agentId: step.agentId,
        updatedAt: now(),
      }
      try {
        await this.store.updateRunCheckpoint(step.runId, checkpoint)
      } catch {
        // A2A 纯单元/集成测试可能只创建 Step，不创建对应 Run。
        // checkpoint 是恢复增强能力，不能反向影响 Step 完成语义。
      }
    }
  }

  async failStep(stepId: string, error: unknown): Promise<void> {
    await this.store.updateStep(stepId, {
      status: STEP_STATUS.FAILED,
      error,
      endedAt: now(),
    })
  }

  async cancelStep(stepId: string): Promise<void> {
    await this.store.updateStep(stepId, {
      status: STEP_STATUS.CANCELLED,
      endedAt: now(),
    })
  }

  async getStep(stepId: string): Promise<Step | null> {
    return this.store.getStep(stepId)
  }

  async listSteps(runId: string): Promise<Step[]> {
    return this.store.listSteps(runId)
  }
}
