import type { Step, CreateStepInput, UpdateStepInput } from '@agent-frame/shared'
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
    await this.store.updateStep(stepId, {
      status: STEP_STATUS.COMPLETED,
      output,
      endedAt: now(),
    })
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
