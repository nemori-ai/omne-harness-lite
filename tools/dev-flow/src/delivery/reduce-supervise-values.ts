import { array, choice, fields, string } from '../integration/parse.ts'
import type { ReduceSignal } from './reduce-supervise.ts'

export const reducePhases = [
  'PREPARE',
  'DISPATCH',
  'SERVE',
  'VERIFY_WAVE',
  'RELEASE_WAVE',
  'FINALIZE',
  'DONE',
] as const
export const signalKinds = [
  'handoff',
  'request-run',
  'candidate',
  'gate',
  'local-work',
  'infrastructure',
  'deadline',
  'release',
] as const
export function parseReduceSignal(value: unknown): ReduceSignal {
  const v = fields(
    value,
    ['signalKind', 'identity', 'phase', 'eventCursor', 'observed', 'evidence', 'reasonCode'],
    'reduce signal',
  )
  return {
    signalKind: choice(v.signalKind, signalKinds, 'signalKind'),
    identity: string(v.identity, 'identity'),
    phase: choice(v.phase, reducePhases, 'phase'),
    eventCursor: v.eventCursor === null ? null : string(v.eventCursor, 'eventCursor'),
    observed: string(v.observed, 'observed'),
    evidence: array(v.evidence, 'evidence'),
    reasonCode: string(v.reasonCode, 'reasonCode'),
  }
}
