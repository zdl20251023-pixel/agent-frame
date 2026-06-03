// ============================================================
// 兼容重导出 — ArtifactPreview 已迁移至 features/artifacts/
//
// 原因：依据 FRAMEWORK_DESIGN §15，产物展示应在独立的
// features/artifacts/ 模块中，而不是放在 features/runs/ 里。
// 本文件保留为兼容垫片，以免现有调用方编译报错。
// ============================================================

export {
  ArtifactViewer as ArtifactPreview,
  ArtifactList as RunArtifactList,
} from '../artifacts/index.ts'
