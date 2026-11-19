import type { Context } from '@deepseek-ai/cordis'
import type { DurableEvidence, ProfileResolution } from '@omne-harness/model-contract'
import type { ModelProfiles } from '@omne-harness/model-contract/provider'
import { modelProfilesKey } from '@omne-harness/model-cordis-contract/cordis'
import type { ModelTargetCheck, ModelTargets } from '@omne-harness/session-access'

/** A session selects a model for text first; other modalities are judged per request. */
export const SELECTION_REQUIREMENT_SOURCE: DurableEvidence = Object.freeze({
  owner: 'harness-server',
  record: 'session-access/select-model',
  revision: '1',
  digest: '0'.repeat(64),
})

const CREDENTIAL = {
  available: 'available',
  missing: 'missing',
  unreadable: 'unknown',
  unavailable: 'unknown',
} as const

export function targetOf(resolution: ProfileResolution): ModelTargetCheck {
  if (resolution.kind === 'absent') return { kind: 'refused', reason: resolution.reason }
  const [reason] = resolution.reasons
  if (!resolution.selectable)
    return reason === undefined ? { kind: 'unavailable' } : { kind: 'refused', reason }
  const { owner, name, revision, digest } = resolution.profile.adoption
  return {
    kind: 'selectable',
    credential: CREDENTIAL[resolution.credential],
    basis: { owner, record: name, revision, digest },
  }
}

export function modelTargetsOf(
  profiles: ModelProfiles<unknown> | undefined,
): ModelTargets | undefined {
  if (profiles === undefined) return undefined
  return {
    async check({ principal, tenant, route }) {
      const resolved = await profiles.resolve({
        principal,
        tenant,
        route,
        required: { modalities: ['text'], source: SELECTION_REQUIREMENT_SOURCE },
      })
      return 'ok' in resolved ? targetOf(resolved.ok) : { kind: 'unavailable' }
    },
  }
}

export function modelTargets(ctx: Context): ModelTargets | undefined {
  return modelTargetsOf(ctx.get(modelProfilesKey, false) as ModelProfiles<unknown> | undefined)
}
