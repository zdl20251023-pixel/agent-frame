import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test'
import { getEventBus, _resetEventBus } from '../../src/shared/realtime/redis-event-bus.js'
import type { AgentEvent } from '@agent-frame/shared'

// Mock ioredis
const mockPublish = mock(() => Promise.resolve(1))
const mockSubscribe = mock(() => Promise.resolve())
const mockUnsubscribe = mock(() => Promise.resolve())
const mockConnect = mock(() => Promise.resolve())
const mockOn = mock((_event: string, _callback: (...args: any[]) => void) => {})

mock.module('ioredis', () => {
  return {
    default: class MockRedis {
      constructor(public url: string, public options: any) {}
      connect = mockConnect
      publish = mockPublish
      subscribe = mockSubscribe
      unsubscribe = mockUnsubscribe
      on = mockOn
    }
  }
})

describe('Redis EventBus Tests', () => {
  beforeEach(() => {
    _resetEventBus()
    delete process.env.REDIS_URL
    mockPublish.mockClear()
    mockSubscribe.mockClear()
    mockUnsubscribe.mockClear()
    mockConnect.mockClear()
    mockOn.mockClear()
  })

  afterEach(() => {
    _resetEventBus()
    delete process.env.REDIS_URL
  })

  it('should fall back to in-memory event bus when REDIS_URL is not set', async () => {
    const bus = await getEventBus()
    expect(bus).toBeDefined()
    expect(mockConnect).not.toHaveBeenCalled()
  })

  it('should use Redis EventBus when REDIS_URL is set', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379'
    const bus = await getEventBus()
    expect(bus).toBeDefined()
    expect(mockConnect).toHaveBeenCalledTimes(2) // pub and sub clients
  })

  it('should publish events to Redis channel', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379'
    const bus = await getEventBus()
    
    const event: AgentEvent = {
      type: 'run.started',
      runId: 'run-123',
      agentId: 'test-agent',
      timestamp: Date.now(),
    }
    
    bus.emit(event)
    
    // Wait for async publish call
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(mockPublish).toHaveBeenCalledWith('agent-frame:events:run-123', JSON.stringify(event))
  })
})
