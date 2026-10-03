import { immutable } from './json.ts'
import type { Condition, EvaluationResult, InputDiagnostic } from './types.ts'

export type InvalidInput = Extract<EvaluationResult, { readonly invalidInput: unknown }>

export function diagnostic(condition: Condition, message: string): InputDiagnostic {
  return { condition, message }
}
/** The frozen `invalidInput` result carrying one diagnostic: evaluation has not started (S-13). */
export function invalidInput(bad: InputDiagnostic): InvalidInput {
  return immutable({ invalidInput: { diagnostics: [bad] } })
}
