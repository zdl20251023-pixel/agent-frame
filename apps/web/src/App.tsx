import { AuthProvider, useAuth } from './features/auth/useAuth.tsx'
import { AuthPage } from './features/auth/AuthPage.tsx'
import { ChatWorkspace } from './features/chat/ChatWorkspace.tsx'

function AppContent() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f1117',
          color: '#6b7280',
        }}
      >
        加载中...
      </div>
    )
  }

  if (!user) {
    return <AuthPage />
  }

  return <ChatWorkspace />
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
