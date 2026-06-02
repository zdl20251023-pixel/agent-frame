import { authService } from '../src/features/auth/auth.service.js'
import { sessionsService } from '../src/features/sessions/sessions.service.js'

const email = `debug-${Date.now()}@example.com`
const reg = await authService.register({ email, password: 'test' })
console.log('user', reg.user.id)
try {
  const s = await sessionsService.createSession(reg.user.id, '新对话')
  console.log('session ok', s)
} catch (e) {
  console.error('session fail', e)
}
