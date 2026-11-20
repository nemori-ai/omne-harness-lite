import type { Context } from '@deepseek-ai/cordis'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import type { TargetTenantPrincipals } from '@omne-harness/media-access'
import { createMediaAccessPlugin } from '@omne-harness/media-access/cordis'
import { mediaKey } from '@omne-harness/media-cordis-contract/cordis'
import { defineRow } from '../../row.ts'
import { memberActingOfCall } from '../server-entry/identity.ts'

function principals(ctx: Context): TargetTenantPrincipals {
  const actForMember = memberActingOfCall(ctx)
  return {
    async actingFor(login, tenant) {
      const issued = await actForMember(login, tenant)
      return issued.outcome === 'issued' ? { ok: issued.principal } : { refused: issued.outcome }
    },
  }
}

const plugin = createMediaAccessPlugin({ principals, media: ctx => ctx.get(mediaKey) })

/** media/v1 for clients. The media face is taken at each call: without the media row it is unavailable. */
export const mediaAccessRow = defineRow({
  row: 'media-access',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [accessRegistryKey, principalIssuerKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: { ...plugin, inject: [accessRegistryKey, principalIssuerKey] },
})
