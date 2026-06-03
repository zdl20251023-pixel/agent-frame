import { useParams } from 'react-router-dom'
import { ArtifactViewer } from './ArtifactViewer.tsx'

// ============================================================
// ArtifactPage — 独立 Artifact 详情页
// ============================================================

export function ArtifactPage() {
  const { artifactId } = useParams()

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={titleStyle}>Artifact 详情</h1>
          <p style={subtitleStyle}>查看产物内容、版本历史与来源 Run。</p>
        </div>
        <a href="/" style={linkStyle}>返回聊天</a>
      </header>

      <section style={panelStyle}>
        {artifactId ? (
          <ArtifactViewer artifactId={artifactId} showVersionHistory />
        ) : (
          <p style={subtitleStyle}>缺少 artifactId。</p>
        )}
      </section>
    </main>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  padding: '32px',
  background: '#0f1117',
  color: '#e5e7eb',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '24px',
}

const titleStyle: React.CSSProperties = { margin: 0, fontSize: '28px' }
const subtitleStyle: React.CSSProperties = { margin: '8px 0 0', color: '#9ca3af' }

const panelStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '14px',
  background: 'rgba(255,255,255,0.03)',
  padding: '18px',
}

const linkStyle: React.CSSProperties = {
  color: '#a5b4fc',
  textDecoration: 'none',
}
