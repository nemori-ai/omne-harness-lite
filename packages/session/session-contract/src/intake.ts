import type { SessionFailure } from './faces.ts'
import type { InputId } from './identity.ts'
import type { RoutedInput, WorkSnapshot } from './values.ts'

export type SessionIntakeLimits = Readonly<{
  maxPendingInputs: number
  maxInputBytes: number
}>

export const DEFAULT_SESSION_INTAKE_LIMITS: SessionIntakeLimits = Object.freeze({
  maxPendingInputs: 64,
  maxInputBytes: 1048576,
})

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

export function sessionInputBytes(value: Extract<RoutedInput, { kind: 'ordinary' }>): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

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

export function pendingIntakeCount(
  snapshot: Pick<WorkSnapshot, 'pending' | 'handed' | 'uncountedInputs'>,
): number {
  const uncounted = new Set([...snapshot.handed, ...(snapshot.uncountedInputs ?? [])])
  return snapshot.pending.reduce((count, input) => count + Number(!uncounted.has(input)), 0)
}

/** The inputs of a taken batch the model has not been shown since its last reply. */
export function inputsToDeliver(
  snapshot: Pick<WorkSnapshot, 'deliveredTail'>,
  ordered: readonly InputId[],
): readonly InputId[] {
  const shown = new Set(snapshot.deliveredTail ?? [])
  return ordered.filter(input => !shown.has(input))
}

/** The input a Run starts from: the first waking one, or none. */
export function runStartInputs(
  snapshot: Pick<WorkSnapshot, 'pending' | 'quietInputs'> | null | undefined,
): readonly InputId[] {
  return snapshot === null || snapshot === undefined ? [] : wakingInputs(snapshot).slice(0, 1)
}

/** The pending inputs that can start a Run; a quiet one goes in with a batch another input opens. */
export function wakingInputs(
  snapshot: Pick<WorkSnapshot, 'pending' | 'quietInputs'>,
): readonly InputId[] {
  const quiet = new Set(snapshot.quietInputs ?? [])
  return snapshot.pending.filter(input => !quiet.has(input))
}
