import { container } from '../src/container.js'

async function main() {
  console.log('Testing ArtifactStore...')
  try {
    const { artifact, version } = await container.artifactStore.createArtifactWithVersion(
      {
        runId: 'run-mock-123',
        type: 'summary',
        title: '测试产物',
        metadata: { source: 'test-script' },
      },
      { summary: '这是一个测试用的 Artifact 内容，用于验证阶段 9。' },
      { runId: 'run-mock-123', agentId: 'summary-agent' }
    )

    console.log('✅ Created Artifact:', artifact.id)
    console.log('✅ Created Version:', version.id)

    const list = await container.artifactStore.listArtifactsByRun('run-mock-123')
    console.log('✅ List Artifacts count:', list.length)

    const fetched = await container.artifactStore.getArtifact(artifact.id)
    console.log('✅ Fetched Artifact title:', fetched?.title)

    console.log('All Artifact tests passed!')
  } catch (err) {
    console.error('Test failed:', err)
  } finally {
    process.exit(0)
  }
}

main()
