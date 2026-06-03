import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '../features/auth/useAuth.tsx'
import { AuthPage } from '../features/auth/AuthPage.tsx'
import { ChatWorkspace } from '../features/chat/ChatWorkspace.tsx'
import { AgentsPage } from '../features/agents/AgentsPage.tsx'
import { WorkflowsPage } from '../features/workflows/WorkflowsPage.tsx'
import { ProjectsPage } from '../features/projects/ProjectsPage.tsx'
import { UsagePage } from '../features/usage/UsagePage.tsx'
import { ArtifactPage } from '../features/artifacts/ArtifactPage.tsx'

// ============================================================
// 路由守卫组件
// ============================================================

function ProtectedRoute({ children }: { children: React.ReactNode }) {
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
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
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

  if (user) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

// ============================================================
// 路由定义
// ============================================================

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <ChatWorkspace />
      </ProtectedRoute>
    ),
  },
  {
    path: '/session/:sessionId',
    element: (
      <ProtectedRoute>
        <ChatWorkspace />
      </ProtectedRoute>
    ),
  },
  {
    path: '/agents',
    element: (
      <ProtectedRoute>
        <AgentsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/workflows',
    element: (
      <ProtectedRoute>
        <WorkflowsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/projects',
    element: (
      <ProtectedRoute>
        <ProjectsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/usage',
    element: (
      <ProtectedRoute>
        <UsagePage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/artifacts/:artifactId',
    element: (
      <ProtectedRoute>
        <ArtifactPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/login',
    element: (
      <PublicRoute>
        <AuthPage />
      </PublicRoute>
    ),
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])

export function AppRouter() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
