import type { AssemblyInput, AssemblyResult, RequestCandidate, FitVerdict } from './values.js'
export function assemblyOutcome(
  input: AssemblyInput<unknown>,
  candidate: Omit<RequestCandidate, 'verdict'>,
  verdict: FitVerdict,
  goals: Extract<AssemblyResult, { kind: 'needs-compaction' }>['goals'],
): AssemblyResult {
  const { coverage } = candidate
  if (verdict.kind === 'fixed-part-over-limit')
    return {
      kind: 'cannot-fit',
      reason: 'fixed-part-over-limit',
      coverage,
      verdict,
      diagnostic: 'Fixed request inputs exceed a known limit',
    }
  if (verdict.kind === 'needs-compaction')
    return (input.previous?.candidate === input.identity.candidate &&
      input.previous.enteredCompaction) ||
      input.transition !== null
      ? {
          kind: 'cannot-fit',
          reason: 'after-compaction',
          coverage,
          verdict,
          diagnostic: 'Request still exceeds a limit after compaction',
        }
      : { kind: 'needs-compaction', candidate: { ...candidate, verdict }, goals }
  return {
    kind: input.beforeModelCall === null ? 'candidate-before-extension' : 'candidate-fixable',
    candidate: { ...candidate, verdict },
  }
}
