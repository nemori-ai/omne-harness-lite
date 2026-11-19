import type { DurableEvidence } from '@omne-harness/exchange-refs'
import type { GateRef, GrantLayer, GrantRef } from './grant.ts'
import type { InquiryPolicy } from './inquiry.ts'

export type GateVerdict =
  | Readonly<{
      kind: 'allowed'
      revision: string
      /** The session layer took part in the verdict: the release then lives with the session. */
      layer: GrantLayer
    }>
  | Readonly<{ kind: 'prohibited' | 'decision-required'; revision: string }>
  | Readonly<{ kind: 'unavailable' }>

export type SessionFacts =
  | Readonly<{
      kind: 'read'
      revision: string
      policy: InquiryPolicy
      policySource: DurableEvidence
      /** The source of a once authorization that matches this action item by item. */
      once: DurableEvidence | null
      /** A session authorization of this gate, with the verdict revision it was given under. */
      sessionGrant: Readonly<{ basis: string; source: DurableEvidence }> | null
    }>
  | Readonly<{ kind: 'unavailable' }>

export type ReleaseFacts = Readonly<{
  /** The call only carries another action; only a prohibition of the carrier itself counts. */
  carrier: boolean
  verdict: GateVerdict
  session: SessionFacts
  holders: Readonly<{ tenant: string; session: string }>
  gate: GateRef
}>

export type ReleaseBasis = Readonly<{ verdict: string; session: string | null }>

export type ReleaseDecision =
  | Readonly<{ kind: 'release'; by: 'carrier'; basis: ReleaseBasis }>
  | Readonly<{
      kind: 'release'
      by: 'verdict' | 'once' | 'session' | 'skip-ask'
      basis: ReleaseBasis
      grant: GrantRef
    }>
  | Readonly<{ kind: 'ask'; basis: ReleaseBasis }>
  | Readonly<{ kind: 'refuse'; reason: 'prohibited' | 'inquiry-policy'; basis: ReleaseBasis }>
  | Readonly<{ kind: 'unavailable'; missing: 'verdict' | 'session' }>

// The four steps in their fixed order (packages/identity/SPEC.md, 人工决定与询问处理).
export function decideRelease(facts: ReleaseFacts): ReleaseDecision {
  const { verdict, session, holders, gate } = facts
  if (verdict.kind === 'unavailable') return { kind: 'unavailable', missing: 'verdict' }
  const own = { verdict: verdict.revision, session: null }
  if (verdict.kind === 'prohibited') return { kind: 'refuse', reason: 'prohibited', basis: own }
  if (facts.carrier) return { kind: 'release', by: 'carrier', basis: own }
  if (verdict.kind === 'allowed') {
    const { layer, revision } = verdict
    const holder = layer === 'tenant' ? holders.tenant : holders.session
    const grant = { via: 'verdict', layer, holder, gate, revision } as const
    return { kind: 'release', by: 'verdict', basis: own, grant }
  }
  if (session.kind === 'unavailable') return { kind: 'unavailable', missing: 'session' }
  const basis = { verdict: verdict.revision, session: session.revision }
  const holder = holders.session
  if (session.once !== null)
    return {
      kind: 'release',
      by: 'once',
      basis,
      grant: { via: 'once', holder, source: session.once },
    }
  const granted = session.sessionGrant
  if (granted !== null && granted.basis === verdict.revision) {
    const grant = { via: 'session-grant', holder, gate, source: granted.source } as const
    return { kind: 'release', by: 'session', basis, grant }
  }
  switch (session.policy.onAsk) {
    case 'deny':
      return { kind: 'refuse', reason: 'inquiry-policy', basis }
    case 'ask-human':
      return { kind: 'ask', basis }
    case 'skip-ask': {
      const grant = { via: 'skip-ask', holder, source: session.policySource } as const
      return { kind: 'release', by: 'skip-ask', basis, grant }
    }
  }
}
