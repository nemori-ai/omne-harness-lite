import type { ToolGrantVerifier } from '@omne-harness/tool'
import type { DurableEvidence, ResourceScope } from '@omne-harness/tool-contract'

export type LocalGrantScope = ResourceScope

const EVIDENCE_FIELDS = ['owner', 'record', 'revision', 'digest'] as const

function filled(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0
}

function sameEvidence(left: DurableEvidence, right: DurableEvidence): boolean {
  return EVIDENCE_FIELDS.every(field => left[field] === right[field])
}

export function createLocalGrantVerifiers<P>(
  scope: LocalGrantScope,
): ReadonlyMap<string, ToolGrantVerifier<P>> {
  if (typeof scope !== 'object' || scope === null) throw new TypeError('scope: missing')
  if (!filled(scope.owner)) throw new TypeError('scope.owner: not a filled value')
  if (!filled(scope.key)) throw new TypeError('scope.key: not a filled value')
  if (
    typeof scope.grant !== 'object' ||
    scope.grant === null ||
    !EVIDENCE_FIELDS.every(field => filled(scope.grant[field]))
  )
    throw new TypeError('scope.grant: not a filled value')
  const declared: LocalGrantScope = Object.freeze({
    owner: scope.owner,
    key: scope.key,
    grant: Object.freeze({
      owner: scope.grant.owner,
      record: scope.grant.record,
      revision: scope.grant.revision,
      digest: scope.grant.digest,
    }),
  })
  const verifier: ToolGrantVerifier<P> = {
    verifyGrant: input =>
      Promise.resolve(
        input.scope.owner === declared.owner &&
          input.scope.key === declared.key &&
          sameEvidence(input.scope.grant, declared.grant)
          ? { kind: 'granted' }
          : { kind: 'refused', reason: 'scope-not-declared' },
      ),
  }
  return new Map([[declared.owner, verifier]])
}
