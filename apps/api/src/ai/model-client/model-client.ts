import type {
  GenerateInput,
  GenerateOutput,
  StreamInput,
  ModelStreamEvent,
  GenerateObjectInput,
  EmbedInput,
  EmbedOutput,
} from './model-client.types.js'

// ============================================================
// ModelClient 接口
// 所有上层 Agent 只依赖此接口，不直接依赖任何 AI SDK
// ============================================================

export interface ModelClient {
  /**
   * 非流式文本生成。
   * 适合：总结、改写、规划、结构化内容等不需要实时展示的场景。
   */
  generate(input: GenerateInput): Promise<GenerateOutput>

  /**
   * 流式文本生成。
   * 适合：聊天、长文生成、实时回复。
   * 返回框架自己的 ModelStreamEvent，而不是 AI SDK 原始 stream part。
   */
  stream(input: StreamInput): AsyncIterable<ModelStreamEvent>

  /**
   * 结构化对象生成。
   * 适合：生成 JSON 结构、Artifact 内容、Agent 配置。
   */
  generateObject<T>(input: GenerateObjectInput<T>): Promise<T>

  /**
   * Embedding 向量生成（预留，MVP 不强制实现）。
   */
  embed(input: EmbedInput): Promise<EmbedOutput>
}
