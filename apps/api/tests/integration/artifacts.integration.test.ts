import { describe, it, expect, beforeEach } from 'bun:test'
import { MemoryArtifactStore } from '../../src/artifacts/artifact-store.memory.js'

describe('Artifacts Integration Tests', () => {
  let store: MemoryArtifactStore

  beforeEach(() => {
    store = new MemoryArtifactStore()
  })

  it('should create artifact and version transactionally', async () => {
    const { artifact, version } = await store.createArtifactWithVersion(
      {
        runId: 'r1',
        type: 'summary',
        title: 'Test Summary',
      },
      { text: 'Hello world' },
      { runId: 'r1', agentId: 'test-agent' }
    )

    expect(artifact.id).toBeDefined()
    expect(artifact.currentVersionId).toBe(version.id)
    expect(version.version).toBe(1)
    expect(version.content).toEqual({ text: 'Hello world' })
  })

  it('should list artifacts by run', async () => {
    await store.createArtifactWithVersion(
      { runId: 'r1', type: 'summary' },
      {},
      { runId: 'r1' }
    )
    await store.createArtifactWithVersion(
      { runId: 'r1', type: 'code' },
      {},
      { runId: 'r1' }
    )

    const list = await store.listArtifactsByRun('r1')
    expect(list.length).toBe(2)
    expect(list[0].type).toBe('summary')
    expect(list[1].type).toBe('code')
  })

  it('should get artifact and versions', async () => {
    const { artifact } = await store.createArtifactWithVersion(
      { runId: 'r2', type: 'report' },
      { report: 1 },
      { runId: 'r2' }
    )

    const fetched = await store.getArtifact(artifact.id)
    expect(fetched?.id).toBe(artifact.id)

    const versions = await store.listVersions(artifact.id)
    expect(versions.length).toBe(1)
  })
})
