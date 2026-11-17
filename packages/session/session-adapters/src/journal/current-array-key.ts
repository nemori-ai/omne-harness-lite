import type { ExecutionView } from './view.ts'
import { canonical } from '../testing/canonical.ts'

export const CURRENT_ARRAYS = [
  'attachments',
  'inputs',
  'steps',
  'requests',
  'voided',
  'admissions',
  'settlements',
  'observations',
  'fences',
  'bindings',
] as const
export type CurrentArray = (typeof CURRENT_ARRAYS)[number]

type Keys = { [M in CurrentArray]: (value: ExecutionView[M][number]) => string }
const keys: Keys = {
  attachments: value => canonical(value.authority),
  inputs: value => value.input,
  steps: value => canonical([value.step, value.batch.id]),
  requests: value => canonical([value.reference, value.step, value.attempt, value.pub]),
  voided: value =>
    canonical([value.intent, value.step, value.intent === 'model' ? value.attempt : value.action]),
  admissions: value => String(value.sequence),
  settlements: value => canonical([value.op, value.variant, value.evidence.record]),
  observations: value => value.passage,
  fences: value => canonical([value.operation, value.guard]),
  bindings: value => canonical([value.reference, value.pending.digest, value.pub]),
}

export function currentArrayKey<M extends CurrentArray>(
  member: M,
  value: ExecutionView[M][number],
): string {
  return (keys[member] as (item: ExecutionView[M][number]) => string)(value)
}
