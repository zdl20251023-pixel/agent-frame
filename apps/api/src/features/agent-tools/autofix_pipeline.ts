import type { LatestHandType } from './tool_nl_to_hand'

export function runPostParseAutoFix(hand: LatestHandType): { fixed: LatestHandType; patches: any[] } {
  // Return the hand unchanged as a stub for now
  return {
    fixed: hand,
    patches: []
  }
}

export function logAutoFixSummary(stage: string, patches: any[]): void {
  // No-op stub
  console.info(`[autofix_pipeline stub] logAutoFixSummary for stage ${stage}, patches count: ${patches.length}`)
}
