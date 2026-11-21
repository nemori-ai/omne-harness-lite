import type { Context } from '@deepseek-ai/cordis'
import { grantLayerOf, parseGrantRef } from '@omne-harness/authorization'
import { toolStartReleasesKey } from '@omne-harness/tool-cordis-contract/cordis'
import type {
  ToolStartRelease,
  ToolStartReleaseReading,
  ToolStartReleases,
} from '@omne-harness/tool-contract/provider'
import { liveCallKey, liveCalls } from './live-calls.ts'

export type ConsentBasis = Readonly<{
  kind: 'blanket' | 'granular'
  scope: 'standing' | 'session'
  grant: string
}>
export type CallConsent =
  | Readonly<{ kind: 'consented'; basis: ConsentBasis }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'unavailable' }>

const NONE: CallConsent = { kind: 'none' }
const UNAVAILABLE: CallConsent = { kind: 'unavailable' }

function consentOf(release: ToolStartRelease): CallConsent {
  const consented = (kind: ConsentBasis['kind'], scope: ConsentBasis['scope'], grant: string) =>
    ({ kind: 'consented', basis: { kind, scope, grant } }) as const
  switch (release.by) {
    case 'carrier':
    case 'ungated':
      return NONE
    case 'once':
      return consented('granular', 'session', release.grant)
    case 'session':
    case 'skip-ask':
      return consented('blanket', 'session', release.grant)
    case 'verdict': {
      const grant = parseGrantRef(release.grant)
      if (grant === null) return UNAVAILABLE
      const scope = grantLayerOf(grant) === 'tenant' ? 'standing' : 'session'
      return consented('blanket', scope, release.grant)
    }
  }
}

export function consentOfReading(reading: ToolStartReleaseReading): CallConsent {
  return reading.kind === 'released' ? consentOf(reading.release) : NONE
}

/** What a live tool call was released on, as the consent a domain records with its write. */
export function callConsent(ctx: Context) {
  return async (tenantRef: string, call: string): Promise<CallConsent> => {
    const live = liveCalls(ctx).get(liveCallKey(tenantRef, call))
    if (live === undefined) return NONE
    const releases = ctx.get(toolStartReleasesKey, false) as ToolStartReleases<unknown> | undefined
    if (releases === undefined) return UNAVAILABLE
    try {
      const read = await releases.releaseOf(live)
      return 'failure' in read ? UNAVAILABLE : consentOfReading(read.ok)
    } catch {
      return UNAVAILABLE
    }
  }
}
