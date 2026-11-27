import { tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import type { ModelProfileSource, ModelProfiles } from '@omne-harness/model-contract/provider'
import { judgeProfileChoices, judgeProfileResolution } from './judge.ts'

function isMinted(tenant: TenantId): boolean {
  return tenantEquals(tenant, tenant)
}

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
