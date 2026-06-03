import { describe, it, expect, beforeEach } from 'bun:test'
import { Scheduler } from '../src/runtime/scheduler.js'

// ============================================================
// Scheduler 单元测试
// ============================================================

describe('Scheduler', () => {
  let scheduler: Scheduler

  beforeEach(() => {
    scheduler = new Scheduler({ maxConcurrent: 2, maxQueueSize: 10 })
  })

  it('should execute tasks concurrently up to maxConcurrent', async () => {
    const results: number[] = []
    const tasks = [1, 2, 3].map((n) =>
      scheduler.schedule(async () => {
        await new Promise((r) => setTimeout(r, 30))
        results.push(n)
        return n
      }),
    )

    const values = await Promise.all(tasks)
    expect(values.sort()).toEqual([1, 2, 3])
    expect(results.length).toBe(3)
  })

  it('should queue tasks when maxConcurrent is reached', async () => {
    const order: number[] = []

    const makeLongTask = (n: number) =>
      scheduler.schedule(
        async () => {
          order.push(n)
          await new Promise((r) => setTimeout(r, 50))
          return n
        },
        { priority: n },
      )

    // Submit 4 tasks but only 2 can run at once
    const tasks = [1, 2, 3, 4].map(makeLongTask)
    await Promise.all(tasks)

    expect(order.length).toBe(4)
  })

  it('should respect priority ordering in queue', async () => {
    // Use maxConcurrent=1 to force strict ordering
    const strict = new Scheduler({ maxConcurrent: 1, maxQueueSize: 10 })
    const order: number[] = []

    // Submit 1 task to fill the slot
    const first = strict.schedule(async () => {
      await new Promise((r) => setTimeout(r, 30))
      order.push(0)
      return 0
    })

    // While slot is occupied, queue tasks with different priorities
    await new Promise((r) => setTimeout(r, 5)) // let first task start
    const p3 = strict.schedule(async () => { order.push(3); return 3 }, { priority: 3 })
    const p1 = strict.schedule(async () => { order.push(1); return 1 }, { priority: 1 })
    const p2 = strict.schedule(async () => { order.push(2); return 2 }, { priority: 2 })

    await Promise.all([first, p1, p2, p3])

    // After first completes, should run p1(priority=1) before p2(priority=2) before p3(priority=3)
    expect(order[0]).toBe(0)
    expect(order[1]).toBe(1)
    expect(order[2]).toBe(2)
    expect(order[3]).toBe(3)
  })

  it('should reject when queue is full', async () => {
    const tiny = new Scheduler({ maxConcurrent: 1, maxQueueSize: 2 })

    // Fill slot + queue
    tiny.schedule(async () => { await new Promise((r) => setTimeout(r, 200)); return 'slot' })
    tiny.schedule(async () => 'q1')
    tiny.schedule(async () => 'q2')

    // One more should fail
    await expect(tiny.schedule(async () => 'q3')).rejects.toThrow('full')
  })

  it('should report stats accurately', async () => {
    const task = scheduler.schedule(async () => {
      await new Promise((r) => setTimeout(r, 30))
      return 'done'
    })

    await new Promise((r) => setTimeout(r, 5))
    const stats = scheduler.getStats()
    expect(stats.running).toBeGreaterThanOrEqual(1)

    await task
    const after = scheduler.getStats()
    expect(after.completed).toBe(1)
    expect(after.running).toBe(0)
  })
})
