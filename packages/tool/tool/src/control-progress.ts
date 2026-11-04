import { succeed, type Outcome } from '@omne-harness/operation-result'
import type { ControlProgress, ToolFailure } from '@omne-harness/tool-contract'
import { invalid, judgeEvidenceField } from './boundary.ts'

export function controlProgress(value: unknown): Outcome<ControlProgress, ToolFailure> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return invalid('progress', 'type')
  const kind: unknown = Reflect.get(value, 'kind')
  if (kind === 'pending' || kind === 'unknown') {
    const diagnostic: unknown = Reflect.get(value, 'diagnostic')
    return typeof diagnostic === 'string' && Object.keys(value).length === 2
      ? succeed({ kind, diagnostic })
      : invalid('progress', 'type')
  }
  if (
    kind !== 'accepted' &&
    kind !== 'stopped' &&
    kind !== 'already-ended' &&
    kind !== 'relation-changed' &&
    kind !== 'rejected'
  )
    return invalid('progress.kind', 'value')
  const evidence = judgeEvidenceField(Reflect.get(value, 'evidence'), 'progress.evidence')
  if ('failure' in evidence) return evidence
  if (kind === 'rejected') {
    const reason: unknown = Reflect.get(value, 'reason')
    return typeof reason === 'string' && Object.keys(value).length === 3
      ? succeed({ kind, reason, evidence: evidence.ok })
      : invalid('progress', 'type')
  }
  return Object.keys(value).length === 2
    ? succeed({ kind, evidence: evidence.ok })
    : invalid('progress', 'type')
}
