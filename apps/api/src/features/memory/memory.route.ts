import { Elysia, t } from 'elysia'
import { container } from '../../container.js'
import { requireAuthPlugin } from '../../shared/auth/auth.middleware.js'
import { isAppError } from '../../shared/errors/app-error.js'
import { generateId } from '../../shared/utils/id.js'
import type { MemoryScope } from '../../memory/memory.types.js'
import { memoryPolicy } from '../../memory/memory-policy.js'

// ============================================================
// Memory Feature — HTTP API
// 对应 FRAMEWORK_DESIGN §13 memory/ 通用记忆层
//
// 路由：
// POST   /memory                    — 写入新记忆
// GET    /memory?scope=&scopeId=    — 按 scope + scopeId 查询记忆列表
// DELETE /memory/:memoryId          — 删除单条记忆
// DELETE /memory?scope=&scopeId=    — 批量删除某 scope 下的所有记忆
// GET    /memory/kinds              — 获取允许的 kind 列表
// ============================================================

export const memoryRoute = new Elysia({ prefix: '/memory' })
  .use(requireAuthPlugin)

  // GET /memory/kinds — 允许的 kind 列表（供前端下拉使用）
  .get('/kinds', () => ({ kinds: memoryPolicy.getAllowedKinds() }))

  // POST /memory — 写入记忆
  .post(
    '/',
    async ({ body, set }) => {
      try {
        const input = {
          scope: body.scope as MemoryScope,
          scopeId: body.scopeId,
          kind: body.kind,
          content: body.content,
          metadata: body.metadata as Record<string, unknown> | undefined,
        }
        // 策略校验
        memoryPolicy.assertCanWrite(input)

        const item = await container.memoryStore.create({
          ...input,
          id: generateId(),
        })
        set.status = 201
        return item
      } catch (err) {
        if (isAppError(err)) { set.status = err.statusCode; return err.toJSON() }
        throw err
      }
    },
    {
      body: t.Object({
        scope: t.String(),
        scopeId: t.String(),
        kind: t.String(),
        content: t.Any(),
        metadata: t.Optional(t.Any()),
      }),
    },
  )

  // GET /memory?scope=&scopeId=&kind= — 查询记忆列表
  .get(
    '/',
    async ({ query, set }) => {
      if (!query.scope || !query.scopeId) {
        set.status = 400
        return { code: 'VALIDATION_ERROR', message: 'scope and scopeId are required' }
      }
      try {
        const items = await container.memoryRetriever.recallByScope(
          query.scope as MemoryScope,
          query.scopeId,
          query.kind,
        )
        return { scope: query.scope, scopeId: query.scopeId, items, total: items.length }
      } catch (err) {
        if (isAppError(err)) { set.status = err.statusCode; return err.toJSON() }
        throw err
      }
    },
    {
      query: t.Object({
        scope: t.Optional(t.String()),
        scopeId: t.Optional(t.String()),
        kind: t.Optional(t.String()),
      }),
    },
  )

  // DELETE /memory/:memoryId — 删除单条记忆
  .delete(
    '/:memoryId',
    async ({ params, set }) => {
      try {
        await container.memoryStore.delete(params.memoryId)
        set.status = 204
        return
      } catch (err) {
        if (isAppError(err)) { set.status = err.statusCode; return err.toJSON() }
        throw err
      }
    },
    { params: t.Object({ memoryId: t.String() }) },
  )

  // DELETE /memory/scope?scope=&scopeId= — 批量删除 scope 下记忆
  .delete(
    '/scope',
    async ({ query, set }) => {
      if (!query.scope || !query.scopeId) {
        set.status = 400
        return { code: 'VALIDATION_ERROR', message: 'scope and scopeId are required' }
      }
      try {
        memoryPolicy.assertCanDelete(query.scope as MemoryScope)
        await container.memoryStore.deleteByScope(
          query.scope as MemoryScope,
          query.scopeId,
        )
        set.status = 204
        return
      } catch (err) {
        if (isAppError(err)) { set.status = err.statusCode; return err.toJSON() }
        throw err
      }
    },
    {
      query: t.Object({
        scope: t.Optional(t.String()),
        scopeId: t.Optional(t.String()),
      }),
    },
  )
