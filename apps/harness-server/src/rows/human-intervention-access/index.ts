import type { Context } from '@deepseek-ai/cordis'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import type { LoginTenants } from '@omne-harness/human-intervention-access'
import { createHitlAccessPlugin } from '@omne-harness/human-intervention-access/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import { createAccessIdentity } from '@omne-harness/identity-access'
import { z } from 'zod'
import { createHitlEntryPrincipals } from '../../entry/hitl-entry-principals.ts'
import { defineRow } from '../../row.ts'
import { hitlFacesOfCall } from './faces.ts'
import { governanceOfCall, identityOfCall } from '../server-entry/identity.ts'
import { toolHitlHolder } from '../tool-hitl/holder.ts'
import { HITL_LOCATION } from '../tool-hitl/host.ts'

export const humanInterventionAccessConfig = z.strictObject({
  locationRef: z.string().min(1).default(HITL_LOCATION),
})

function loginTenants(ctx: Context): LoginTenants {
  const identity = createAccessIdentity({
    operations: identityOfCall(ctx),
    governance: governanceOfCall(ctx),
    issuer: ctx.principalIssuer,
  })
  return {
    async admits(login, tenant) {
      const issued = await identity.actFor(login, tenant)
      return issued.outcome === 'issued' ? 'admitted' : issued.outcome
    },
  }
}

const plugin = createHitlAccessPlugin({
  faces: hitlFacesOfCall,
  entryPrincipals: ctx => createHitlEntryPrincipals(ctx.principalIssuer),
  logins: loginTenants,
  changes: ctx => toolHitlHolder(ctx).host?.changes,
})

export const humanInterventionAccessRow = defineRow({
  row: 'human-intervention-access',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [accessRegistryKey, principalIssuerKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: {
    ...plugin,
    inject: [accessRegistryKey, principalIssuerKey],
    Config: humanInterventionAccessConfig,
  },
})
