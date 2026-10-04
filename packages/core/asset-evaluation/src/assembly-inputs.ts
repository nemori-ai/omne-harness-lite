import type { JsonObject } from '@omne-harness-lite/content-blocks'

export interface EvaluationInputSupport {
  readonly monotonicNow: () => bigint
  readonly diagnostics: (event: JsonObject) => void
  readonly onDiagnosticFailure: (stage: string) => void
}
