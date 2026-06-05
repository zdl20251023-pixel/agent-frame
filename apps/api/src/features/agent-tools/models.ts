import { google } from '@ai-sdk/google'
import type { LanguageModel } from 'ai'

// Stub model for agent tool, using gemini-1.5-flash as the underlying model
export const qwen8bModel: LanguageModel = google('gemini-1.5-flash')
