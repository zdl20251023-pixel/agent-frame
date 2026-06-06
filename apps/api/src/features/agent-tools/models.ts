import { deepseek } from '@ai-sdk/deepseek'
import type { LanguageModel } from 'ai'

// nl_to_hand 工具默认修复模型：按当前项目要求统一走 DeepSeek。
export const qwen8bModel: LanguageModel = deepseek('deepseek-chat')
