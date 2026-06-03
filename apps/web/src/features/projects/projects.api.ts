import type { Artifact, Project, Run } from '@agent-frame/shared'
import { get, post } from '../../lib/http.ts'

// ============================================================
// projects.api.ts — Project 前端 API 客户端
// ============================================================

export type ProjectListResponse = {
  projects: Project[]
  total: number
}

export type ProjectRunsResponse = {
  projectId: string
  runs: Run[]
  total: number
}

export type ProjectArtifactsResponse = {
  projectId: string
  artifacts: Artifact[]
  total: number
}

export type CreateProjectRequest = {
  name: string
  type?: Project['type']
  description?: string
}

export function listProjects(): Promise<ProjectListResponse> {
  return get<ProjectListResponse>('/projects')
}

export function createProject(input: CreateProjectRequest): Promise<Project> {
  return post<Project>('/projects', input)
}

export function listProjectRuns(projectId: string): Promise<ProjectRunsResponse> {
  return get<ProjectRunsResponse>(`/projects/${projectId}/runs`)
}

export function listProjectArtifacts(projectId: string): Promise<ProjectArtifactsResponse> {
  return get<ProjectArtifactsResponse>(`/projects/${projectId}/artifacts`)
}
