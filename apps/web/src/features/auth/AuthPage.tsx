import { useState, type CSSProperties, type FormEvent } from 'react'
import { useAuth } from './useAuth.tsx'

export function AuthPage() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register(email, password, username || undefined)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0f1117',
        color: '#e5e7eb',
        fontFamily: "'Inter', -apple-system, sans-serif",
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: '400px',
          padding: '32px',
          borderRadius: '16px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <h1 style={{ margin: '0 0 8px', fontSize: '22px' }}>Agent Frame</h1>
        <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: '13px' }}>
          {mode === 'login' ? '登录后继续对话' : '注册新账号'}
        </p>

        {error && (
          <div
            style={{
              marginBottom: '16px',
              padding: '10px 12px',
              borderRadius: '8px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#fca5a5',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        )}

        <label style={labelStyle}>邮箱</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={inputStyle}
        />

        {mode === 'register' && (
          <>
            <label style={labelStyle}>用户名（可选）</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={inputStyle}
            />
          </>
        )}

        <label style={labelStyle}>密码</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={inputStyle}
        />

        <button type="submit" disabled={submitting} style={buttonStyle}>
          {submitting ? '处理中...' : mode === 'login' ? '登录' : '注册'}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            setError(null)
          }}
          style={{
            marginTop: '12px',
            width: '100%',
            background: 'none',
            border: 'none',
            color: '#818cf8',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          {mode === 'login' ? '没有账号？去注册' : '已有账号？去登录'}
        </button>
      </form>
    </div>
  )
}

const labelStyle: CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '12px',
  color: '#9ca3af',
}

const inputStyle: CSSProperties = {
  width: '100%',
  marginBottom: '16px',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.05)',
  color: '#e5e7eb',
  fontSize: '14px',
  boxSizing: 'border-box',
}

const buttonStyle: CSSProperties = {
  width: '100%',
  padding: '12px',
  borderRadius: '10px',
  border: 'none',
  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: '14px',
}
