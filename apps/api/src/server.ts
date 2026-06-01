import { createApp } from './app.js'
import { validateEnv } from './shared/config/env.js'
import { env } from './shared/config/env.js'
import { logger } from './shared/observability/logger.js'

// ============================================================
// Bun 启动入口
// ============================================================

validateEnv()

const app = createApp()

app.listen(env.PORT, () => {
  logger.info('[Server] Agent Frame API started', {
    eventType: 'server.started',
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    webOrigin: env.WEB_ORIGIN,
  })
  console.log(`\n🚀 Agent Frame API running at http://localhost:${env.PORT}`)
  console.log(`   Health: http://localhost:${env.PORT}/health`)
  console.log(`   Agents: http://localhost:${env.PORT}/agents\n`)
})

export type App = typeof app
