import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { CapabilityRouteDecisionRecord } from '@agent-frame/shared'
import { capabilityRouteDecisions } from '../shared/db/schema.js'
import { getDb } from '../shared/db/client.js'
import { mysqlNow } from '../shared/utils/id.js'
import { generateId } from '../shared/utils/id.js'
import { logger } from '../shared/observability/logger.js'
import type { CapabilityRouteResult } from './capability-router.js'

// ============================================================
// CapabilityRouteDecisionStore — 路由决策持久化与审计
// ============================================================

export type PersistRouteDecisionInput = {
  runId?: string
  sessionId?: string
  userId?: string
  input: unknown
  requestedAgentId?: string
  route: CapabilityRouteResult
}

/** 内存降级存储（无 DATABASE_URL 时） */
const memoryDecisions: CapabilityRouteDecisionRecord[] = []

export class CapabilityRouteDecisionStore {
  private useMemory(): boolean {
    return !process.env.DATABASE_URL
  }

  async persist(input: PersistRouteDecisionInput): Promise<CapabilityRouteDecisionRecord> {
    const record: CapabilityRouteDecisionRecord = {
      id: generateId(),
      runId: input.runId,
      sessionId: input.sessionId,
      userId: input.userId,
      inputHash: hashInput(input.input),
      requestedAgentId: input.requestedAgentId,
      resolvedAgentId: input.route.type === 'agent' ? input.route.agentId : input.route.candidateAgentId,
      routeType: input.route.type === 'agent' ? 'agent' : 'ask_clarification',
      confidence: input.route.confidence,
      reason: input.route.reason,
      source: input.route.type === 'agent' ? input.route.source : 'clarification',
      createdAt: mysqlNow(),
    }

    if (this.useMemory()) {
      memoryDecisions.push(record)
      return record
    }

    try {
      const db = getDb()
      await db.insert(capabilityRouteDecisions).values({
        id: record.id,
        runId: record.runId ?? null,
        sessionId: record.sessionId ?? null,
        userId: record.userId ?? null,
        inputHash: record.inputHash,
        requestedAgentId: record.requestedAgentId ?? null,
        resolvedAgentId: record.resolvedAgentId ?? null,
        routeType: record.routeType,
        confidence: String(record.confidence),
        reason: record.reason,
        source: record.source,
        createdAt: record.createdAt,
      })
    } catch (err) {
      logger.warn('[CapabilityRouteDecisionStore] persist failed', {
        errorCode: err instanceof Error ? err.message : 'PERSIST_FAILED',
      })
    }

    return record
  }

  async listBySession(sessionId: string, limit = 50): Promise<CapabilityRouteDecisionRecord[]> {
    if (this.useMemory()) {
      return memoryDecisions.filter((d) => d.sessionId === sessionId).slice(-limit)
    }
    const db = getDb()
    const rows = await db
      .select()
      .from(capabilityRouteDecisions)
      .where(eq(capabilityRouteDecisions.sessionId, sessionId))
      .limit(limit)
    return rows.map((row) => ({
      id: row.id,
      runId: row.runId ?? undefined,
      sessionId: row.sessionId ?? undefined,
      userId: row.userId ?? undefined,
      inputHash: row.inputHash,
      requestedAgentId: row.requestedAgentId ?? undefined,
      resolvedAgentId: row.resolvedAgentId ?? undefined,
      routeType: row.routeType as CapabilityRouteDecisionRecord['routeType'],
      confidence: Number(row.confidence),
      reason: row.reason,
      source: row.source,
      createdAt: row.createdAt,
    }))
  }
}

function hashInput(input: unknown): string {
  return createHash('sha256').update(JSON.stringify(input ?? null)).digest('hex')
}

export const capabilityRouteDecisionStore = new CapabilityRouteDecisionStore()
