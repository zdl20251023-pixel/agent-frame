import { useState } from 'react'
import type { Artifact, ProjectType, Run } from '@agent-frame/shared'
import { useProjects } from './useProjects.ts'

// ============================================================
// ProjectsPage — 项目列表与项目详情入口
// ============================================================

const PROJECT_TYPES: ProjectType[] = ['general', 'creative', 'research', 'automation']

export function ProjectsPage() {
  const {
    projects,
    selectedProject,
    runs,
    artifacts,
    loading,
    detailLoading,
    submitting,
    error,
    createProjectItem,
    selectProject,
  } = useProjects()

  const [name, setName] = useState('')
  const [type, setType] = useState<ProjectType>('general')
  const [description, setDescription] = useState('')

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return

    const project = await createProjectItem({
      name: name.trim(),
      type,
      description: description.trim() || undefined,
    })
    if (project) {
      setName('')
      setDescription('')
      setType('general')
    }
  }

  return (
    <main style={pageStyle}>
      <header style={headerStyle}>
        <div>
          <h1 style={titleStyle}>Project 中心</h1>
          <p style={subtitleStyle}>管理长期任务空间，并查看项目关联的 Run 与 Artifact。</p>
        </div>
        <a href="/" style={linkStyle}>返回聊天</a>
      </header>

      {error && <div style={errorStyle}>⚠ {error}</div>}

      <section style={gridStyle}>
        <aside style={panelStyle}>
          <h2 style={sectionTitleStyle}>创建项目</h2>
          <form onSubmit={handleCreateProject} style={{ display: 'grid', gap: 10 }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="项目名称"
              style={inputStyle}
            />
            <select value={type} onChange={(e) => setType(e.target.value as ProjectType)} style={inputStyle}>
              {PROJECT_TYPES.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="项目描述（可选）"
              rows={3}
              style={inputStyle}
            />
            <button type="submit" disabled={submitting || !name.trim()} style={buttonStyle}>
              {submitting ? '创建中...' : '创建项目'}
            </button>
          </form>

          <h2 style={{ ...sectionTitleStyle, marginTop: 24 }}>项目列表</h2>
          {loading ? (
            <p style={mutedStyle}>加载中...</p>
          ) : projects.length === 0 ? (
            <p style={mutedStyle}>暂无项目，先创建一个项目。</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => selectProject(project.id)}
                  style={{
                    ...projectButtonStyle,
                    borderColor: selectedProject?.id === project.id ? '#6366f1' : 'rgba(255,255,255,0.08)',
                    background: selectedProject?.id === project.id ? 'rgba(99,102,241,0.16)' : 'rgba(255,255,255,0.03)',
                  }}
                >
                  <strong>{project.name}</strong>
                  <span style={mutedStyle}>{project.type}</span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <section style={panelStyle}>
          {!selectedProject ? (
            <p style={mutedStyle}>选择一个项目查看详情。</p>
          ) : (
            <>
              <div style={{ marginBottom: 20 }}>
                <h2 style={sectionTitleStyle}>{selectedProject.name}</h2>
                <p style={mutedStyle}>{selectedProject.description || '暂无描述'}</p>
                <p style={mutedStyle}>ID: <code>{selectedProject.id}</code></p>
              </div>

              {detailLoading ? (
                <p style={mutedStyle}>加载关联数据...</p>
              ) : (
                <div style={detailGridStyle}>
                  <ProjectRuns runs={runs} />
                  <ProjectArtifacts artifacts={artifacts} />
                </div>
              )}
            </>
          )}
        </section>
      </section>
    </main>
  )
}

function ProjectRuns({ runs }: { runs: Run[] }) {
  return (
    <div>
      <h3 style={sectionTitleStyle}>关联 Run ({runs.length})</h3>
      {runs.length === 0 ? (
        <p style={mutedStyle}>暂无关联 Run。</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {runs.map((run) => (
            <a key={run.id} href={`/`} style={itemStyle}>
              <span>{run.agentId ?? 'unknown-agent'}</span>
              <code>{run.id.slice(-12)}</code>
              <span style={mutedStyle}>{run.status}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectArtifacts({ artifacts }: { artifacts: Artifact[] }) {
  return (
    <div>
      <h3 style={sectionTitleStyle}>关联 Artifact ({artifacts.length})</h3>
      {artifacts.length === 0 ? (
        <p style={mutedStyle}>暂无关联 Artifact。</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {artifacts.map((artifact) => (
            <a key={artifact.id} href={`/artifacts/${artifact.id}`} style={itemStyle}>
              <span>{artifact.title ?? artifact.type}</span>
              <code>{artifact.id.slice(-12)}</code>
              <span style={mutedStyle}>{artifact.type}</span>
            </a>
          ))}
        </div>
      )}
    </div>
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
const sectionTitleStyle: React.CSSProperties = { margin: '0 0 12px', fontSize: '16px' }
const mutedStyle: React.CSSProperties = { color: '#9ca3af', fontSize: '13px' }

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '360px minmax(0, 1fr)',
  gap: '20px',
}

const detailGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: '20px',
}

const panelStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '14px',
  background: 'rgba(255,255,255,0.03)',
  padding: '18px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  background: '#111827',
  color: '#e5e7eb',
  padding: '10px 12px',
}

const buttonStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: '8px',
  background: '#6366f1',
  color: '#fff',
  padding: '10px 12px',
  cursor: 'pointer',
}

const projectButtonStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '10px',
  color: '#e5e7eb',
  padding: '12px',
  textAlign: 'left',
  cursor: 'pointer',
}

const itemStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '10px 12px',
  borderRadius: '8px',
  background: 'rgba(255,255,255,0.04)',
  color: '#e5e7eb',
  textDecoration: 'none',
}

const linkStyle: React.CSSProperties = {
  color: '#a5b4fc',
  textDecoration: 'none',
}

const errorStyle: React.CSSProperties = {
  marginBottom: '16px',
  border: '1px solid rgba(248,113,113,0.3)',
  borderRadius: '10px',
  padding: '12px',
  color: '#fecaca',
  background: 'rgba(248,113,113,0.08)',
}
