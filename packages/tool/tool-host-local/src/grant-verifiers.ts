// The grant verifier of the guard table (row 4), as the D1 decision fixes it: the assembly gives
// one scope value, `{ owner, key, grant }`, to this verifier and to the Agent that fills the
// request. The verifier holds no recipe. It accepts the request whose scope is that value, so no
// rule has to be copied to two sides.
//
// Known limitation: an assembly has one scope in M2, so every call shares one FIFO key prefix
// (the key is made of the owner, the key and the tool name), whatever its tenant or caller.
import type { ToolGrantVerifier } from '@omne-harness/tool'
import type { DurableEvidence, ResourceScope } from '@omne-harness/tool-contract'

/** The one scope an assembly accepts: its owner, its key, and the fixed durable grant evidence. */
export type LocalGrantScope = ResourceScope

const EVIDENCE_FIELDS = ['owner', 'record', 'revision', 'digest'] as const

function filled(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0
}

function sameEvidence(left: DurableEvidence, right: DurableEvidence): boolean {
  return EVIDENCE_FIELDS.every(field => left[field] === right[field])
}

/**
 * Builds the verifier map of an assembly: one entry, for the owner of `scope`. A request scope
 * with the same owner and key and the same grant evidence is `granted`; any other scope of that
 * owner is `refused`. An owner that is not in the map is denied by the ledger, not here.
 * A scope with an empty text is a defect of the assembly and throws a `TypeError`.
 */
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
  // Keep a copy, so a later change of the caller's object cannot change what is granted.
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
