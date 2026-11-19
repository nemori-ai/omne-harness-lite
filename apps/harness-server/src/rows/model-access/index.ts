import type { Context } from '@deepseek-ai/cordis'
import type { Principal } from '@omne-harness/access-cordis-contract'
import { accessRegistryKey } from '@omne-harness/access-cordis-contract/cordis'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import type { ModelAccessPrincipals, ModelChoiceReader } from '@omne-harness/model-access'
import { createModelAccessPlugin } from '@omne-harness/model-access/cordis'
import type { DurableEvidence } from '@omne-harness/model-contract'
import type { ModelProfiles } from '@omne-harness/model-contract/provider'
import { modelProfilesKey } from '@omne-harness/model-cordis-contract/cordis'
import { z } from 'zod'
import { defineRow } from '../../row.ts'
import { memberActingOfCall } from '../server-entry/identity.ts'

/** A listed model is judged for text, as the selection of a session is. */
export const LISTING_REQUIREMENT_SOURCE: DurableEvidence = Object.freeze({
  owner: 'harness-server',
  record: 'model-access/list-models',
  revision: '1',
  digest: '0'.repeat(64),
})

export const modelAccessConfig = z.strictObject({})

function modelPrincipals(ctx: Context): ModelAccessPrincipals {
  const actForMember = memberActingOfCall(ctx)
  return {
    async actingFor(login, tenant) {
      const issued = await actForMember(login, tenant)
      return issued.outcome === 'issued' ? { ok: issued.principal } : { refused: issued.outcome }
    },
  }
}

const profilesOf = (ctx: Context): ModelChoiceReader | undefined =>
  ctx.get(modelProfilesKey, false) as ModelProfiles<Principal> | undefined

const plugin = createModelAccessPlugin({ principals: modelPrincipals, profiles: profilesOf })

export const modelAccessRow = defineRow({
  row: 'model-access',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [accessRegistryKey, principalIssuerKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'model-access',
    inject: [accessRegistryKey, principalIssuerKey],
    Config: modelAccessConfig,
    // The row has no configuration of its own; the requirement is a constant of this release.
    apply: (ctx: Context) =>
      plugin.apply(ctx, { required: { modalities: ['text'], source: LISTING_REQUIREMENT_SOURCE } }),
  },
})
