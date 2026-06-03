import { useCallback, useEffect, useReducer } from 'react'
import type { Artifact, Project, Run } from '@agent-frame/shared'
import {
  createProject,
  listProjectArtifacts,
  listProjectRuns,
  listProjects,
  type CreateProjectRequest,
} from './projects.api.ts'

// ============================================================
// useProjects — 项目列表与详情数据加载
// ============================================================

type ProjectsState = {
  projects: Project[]
  selectedProjectId: string | null
  runs: Run[]
  artifacts: Artifact[]
  loading: boolean
  detailLoading: boolean
  submitting: boolean
  error: string | null
}

type ProjectsAction =
  | { type: 'load_success'; projects: Project[] }
  | { type: 'load_failed'; error: string }
  | { type: 'select_project'; projectId: string }
  | { type: 'detail_success'; runs: Run[]; artifacts: Artifact[] }
  | { type: 'detail_failed'; error: string }
  | { type: 'submit_start' }
  | { type: 'submit_success'; project: Project }
  | { type: 'submit_failed'; error: string }
  | { type: 'submit_end' }

const initialProjectsState: ProjectsState = {
  projects: [],
  selectedProjectId: null,
  runs: [],
  artifacts: [],
  loading: true,
  detailLoading: false,
  submitting: false,
  error: null,
}

function projectsReducer(state: ProjectsState, action: ProjectsAction): ProjectsState {
  switch (action.type) {
    case 'load_success': {
      const selectedProjectId = state.selectedProjectId ?? action.projects[0]?.id ?? null
      return {
        ...state,
        loading: false,
        projects: action.projects,
        selectedProjectId,
        detailLoading: Boolean(selectedProjectId),
        runs: selectedProjectId ? state.runs : [],
        artifacts: selectedProjectId ? state.artifacts : [],
        error: null,
      }
    }
    case 'load_failed':
      return { ...state, loading: false, error: action.error }
    case 'select_project':
      return {
        ...state,
        selectedProjectId: action.projectId,
        detailLoading: true,
        runs: [],
        artifacts: [],
      }
    case 'detail_success':
      return {
        ...state,
        detailLoading: false,
        runs: action.runs,
        artifacts: action.artifacts,
        error: null,
      }
    case 'detail_failed':
      return { ...state, detailLoading: false, error: action.error }
    case 'submit_start':
      return { ...state, submitting: true, error: null }
    case 'submit_success':
      return {
        ...state,
        submitting: false,
        projects: [action.project, ...state.projects],
        selectedProjectId: action.project.id,
        detailLoading: true,
        runs: [],
        artifacts: [],
        error: null,
      }
    case 'submit_failed':
      return { ...state, submitting: false, error: action.error }
    case 'submit_end':
      return { ...state, submitting: false }
  }
}

export function useProjects() {
  const [state, dispatch] = useReducer(projectsReducer, initialProjectsState)

  const refreshProjects = useCallback(async () => {
    try {
      const data = await listProjects()
      dispatch({ type: 'load_success', projects: data.projects ?? [] })
    } catch (err) {
      dispatch({
        type: 'load_failed',
        error: err instanceof Error ? err.message : '加载项目失败',
      })
    }
  }, [])

  const createProjectItem = useCallback(async (input: CreateProjectRequest) => {
    dispatch({ type: 'submit_start' })
    try {
      const project = await createProject(input)
      dispatch({ type: 'submit_success', project })
      return project
    } catch (err) {
      dispatch({
        type: 'submit_failed',
        error: err instanceof Error ? err.message : '创建项目失败',
      })
      return null
    } finally {
      dispatch({ type: 'submit_end' })
    }
  }, [])

  useEffect(() => {
    refreshProjects()
  }, [refreshProjects])

  useEffect(() => {
    const projectId = state.selectedProjectId
    if (!projectId) return

    let cancelled = false
    Promise.all([
      listProjectRuns(projectId),
      listProjectArtifacts(projectId),
    ])
      .then(([runData, artifactData]) => {
        if (cancelled) return
        dispatch({
          type: 'detail_success',
          runs: runData.runs ?? [],
          artifacts: artifactData.artifacts ?? [],
        })
      })
      .catch((err) => {
        if (cancelled) return
        dispatch({
          type: 'detail_failed',
          error: err instanceof Error ? err.message : '加载项目详情失败',
        })
      })

    return () => {
      cancelled = true
    }
  }, [state.selectedProjectId])

  const selectedProject =
    state.projects.find((project) => project.id === state.selectedProjectId) ?? null

  return {
    ...state,
    selectedProject,
    refreshProjects,
    createProjectItem,
    selectProject: (projectId: string) => dispatch({ type: 'select_project', projectId }),
  }
}
