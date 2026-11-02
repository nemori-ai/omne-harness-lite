// The production `ModelProfiles`: one snapshot read per call, then the pure verdicts of
// `judge.ts`. It reads no environment and keeps no selection: the snapshot is the authority of a
// single evaluation, and the caller owns the value it saved.
import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type { ModelProfileSource, ModelProfiles } from '@omne-harness/model-contract/provider'
import { judgeProfileChoices, judgeProfileResolution } from './judge.ts'

// legal-identity has no separate mint check; equality with itself holds only for a minted tenant,
// so a copied tenant is refused before the source is read. The test is the one of `credential.ts`.
function isMinted(tenant: TenantId): boolean {
  return tenantEquals(tenant, tenant)
}

/**
 * A `ModelProfiles` over one source. Each call reads the snapshot the source gives for this
 * access; a source failure is handed back unchanged, never shown as an absent profile.
 */
export function createModelProfiles<P>(source: ModelProfileSource<P>): ModelProfiles<P> {
  return {
    async list(input) {
      if (!isMinted(input.tenant)) return { failure: { kind: 'denied', action: 'tenant' } }
      const read = await source.read({ principal: input.principal, tenant: input.tenant })
      if ('failure' in read) return read
      return judgeProfileChoices(read.ok, input.selected, input.required)
    },
    async resolve(input) {
      if (!isMinted(input.tenant)) return { failure: { kind: 'denied', action: 'tenant' } }
      const read = await source.read({ principal: input.principal, tenant: input.tenant })
      if ('failure' in read) return read
      return judgeProfileResolution(read.ok, input.route, input.required)
    },
  }
}
