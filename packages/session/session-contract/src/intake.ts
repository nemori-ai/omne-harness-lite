import type { SessionFailure } from './faces.ts'
import type { RoutedInput, WorkSnapshot } from './values.ts'

/** Deployment budgets for ordinary inputs awaiting Agent handover. */
export type SessionIntakeLimits = Readonly<{
  maxPendingInputs: number
  maxInputBytes: number
}>

export const DEFAULT_SESSION_INTAKE_LIMITS: SessionIntakeLimits = Object.freeze({
  maxPendingInputs: 64,
  maxInputBytes: 1048576,
})

/** Validates and copies deployment configuration once at provider construction. */
export function sessionIntakeLimits(
  value: SessionIntakeLimits = DEFAULT_SESSION_INTAKE_LIMITS,
): SessionIntakeLimits {
  for (const key of ['maxPendingInputs', 'maxInputBytes'] as const)
    if (!Number.isSafeInteger(value[key]) || value[key] < 1)
      throw new TypeError(`${key} must be a positive safe integer`)
  return Object.freeze({
    maxPendingInputs: value.maxPendingInputs,
    maxInputBytes: value.maxInputBytes,
  })
}

/** UTF-8 JSON bytes of the complete ordinary input that Session retains. */
export function sessionInputBytes(value: Extract<RoutedInput, { kind: 'ordinary' }>): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

/** Called under the same revision as publication, after original-operation recall. */
export function judgeSessionIntake(
  pending: number,
  value: Extract<RoutedInput, { kind: 'ordinary' }>,
  limits: SessionIntakeLimits,
): Extract<SessionFailure, { kind: 'limited' }> | null {
  if (sessionInputBytes(value) > limits.maxInputBytes)
    return { kind: 'limited', resource: 'input-bytes', limit: limits.maxInputBytes }
  if (pending >= limits.maxPendingInputs)
    return { kind: 'limited', resource: 'pending-inputs', limit: limits.maxPendingInputs }
  return null
}

/** `pending` retains Run ownership after handover; handed inputs no longer occupy intake capacity. */
export function pendingIntakeCount(snapshot: Pick<WorkSnapshot, 'pending' | 'handed'>): number {
  const handed = new Set(snapshot.handed)
  return snapshot.pending.reduce((count, input) => count + Number(!handed.has(input)), 0)
}
