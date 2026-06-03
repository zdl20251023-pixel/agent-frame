import type { Project, CreateProjectInput, UpdateProjectInput } from '@agent-frame/shared'
import { ProjectsRepository } from './projects.repository.js'
import { AppError } from '../../shared/errors/app-error.js'
import { generateId } from '../../shared/utils/id.js'
import { logger } from '../../shared/observability/logger.js'

// ============================================================
// ProjectsService — Project 业务逻辑层
// 对应 FRAMEWORK_DESIGN §18.4 Project API
// 路由: route → service → repository（不在 route 写业务逻辑）
// ============================================================

export class ProjectsService {
  constructor(private repo = new ProjectsRepository()) {}

  async listProjects(userId: string): Promise<{ projects: Project[]; total: number }> {
    const list = await this.repo.listByOwner(userId)
    return { projects: list, total: list.length }
  }

  async createProject(userId: string, input: CreateProjectInput): Promise<Project> {
    const project = await this.repo.create({
      id: generateId(),
      ownerId: userId,
      name: input.name.trim(),
      type: input.type ?? 'general',
      description: input.description,
      metadata: input.metadata,
    })
    logger.info('[ProjectsService] Project created', { projectId: project.id, userId })
    return project
  }

  async getProject(userId: string, projectId: string): Promise<Project> {
    const project = await this.repo.getByIdForOwner(projectId, userId)
    if (!project) throw new AppError('NOT_FOUND', `Project not found: ${projectId}`, { statusCode: 404 })
    return project
  }

  async updateProject(
    userId: string,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<Project> {
    await this.getProject(userId, projectId) // 校验归属
    const ok = await this.repo.update(projectId, userId, {
      name: input.name?.trim(),
      description: input.description,
      metadata: input.metadata,
    })
    if (!ok) throw new AppError('NOT_FOUND', `Project not found: ${projectId}`, { statusCode: 404 })
    return this.getProject(userId, projectId)
  }

  async deleteProject(userId: string, projectId: string): Promise<void> {
    const ok = await this.repo.softDelete(projectId, userId)
    if (!ok) throw new AppError('NOT_FOUND', `Project not found: ${projectId}`, { statusCode: 404 })
    logger.info('[ProjectsService] Project deleted', { projectId, userId })
  }

  async listProjectRuns(userId: string, projectId: string, limit?: number, offset?: number) {
    await this.getProject(userId, projectId) // 校验归属
    return this.repo.listRunsByProject(projectId, limit, offset)
  }

  async listProjectArtifacts(userId: string, projectId: string) {
    await this.getProject(userId, projectId) // 校验归属
    return this.repo.listArtifactsByProject(projectId)
  }
}
