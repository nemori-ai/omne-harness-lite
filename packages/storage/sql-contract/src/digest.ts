import { canonicalJson, sha256Hex } from './canonical.ts'
import type { CommitRequestV2, StorageScope } from './types.ts'

function scopeValue(scope: StorageScope): { kind: string; tenant?: string } {
  return scope.kind === 'tenant' ? { kind: 'tenant', tenant: scope.tenant } : { kind: 'system' }
}

/**
 * Protocol 2 input digest (SPEC 3.2): SHA-256 of the RFC 8785 text of the scope, the combination
 * version, the manifest digest and the commands sorted by participant in UTF-16 code units.
 * Throws TypeError when a fact is not strict JSON.
 */
export function inputDigestV2(request: CommitRequestV2): string {
  const commands = [...request.commands]
    .sort((a, b) => (a.participant < b.participant ? -1 : a.participant > b.participant ? 1 : 0))
    .map(command => ({ participant: command.participant, facts: command.facts }))
  return sha256Hex(
    canonicalJson({
      scope: scopeValue(request.identity.scope),
      combinationVersion: request.combinationVersion,
      manifestDigest: request.manifestDigest,
      commands,
    }),
  )
}
