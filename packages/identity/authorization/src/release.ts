import type { InquiryPolicy } from './inquiry.ts'

export type GateVerdict =
  | Readonly<{ kind: 'prohibited' | 'allowed' | 'decision-required'; revision: string }>
  | Readonly<{ kind: 'unavailable' }>

export type SessionFacts =
  | Readonly<{
      kind: 'read'
      revision: string
      policy: InquiryPolicy
      /** A once authorization that matches this action item by item. */
      once: boolean
      /** The verdict revision a session authorization of this gate was given under, if any. */
      sessionGrantBasis: string | null
    }>
  | Readonly<{ kind: 'unavailable' }>

export type ReleaseFacts = Readonly<{
  /** The call only carries another action; only a prohibition of the carrier itself counts. */
  carrier: boolean
  verdict: GateVerdict
  session: SessionFacts
}>

export type ReleaseBasis = Readonly<{ verdict: string; session: string | null }>

export type ReleaseDecision =
  | Readonly<{
      kind: 'release'
      by: 'verdict' | 'carrier' | 'once' | 'session' | 'skip-ask'
      basis: ReleaseBasis
    }>
  | Readonly<{ kind: 'ask'; basis: ReleaseBasis }>
  | Readonly<{ kind: 'refuse'; reason: 'prohibited' | 'inquiry-policy'; basis: ReleaseBasis }>
  | Readonly<{ kind: 'unavailable'; missing: 'verdict' | 'session' }>

// The four steps in their fixed order (packages/identity/SPEC.md, 人工决定与询问处理).
export function decideRelease(facts: ReleaseFacts): ReleaseDecision {
  const { verdict, session } = facts
  if (verdict.kind === 'unavailable') return { kind: 'unavailable', missing: 'verdict' }
  const own = { verdict: verdict.revision, session: null }
  if (verdict.kind === 'prohibited') return { kind: 'refuse', reason: 'prohibited', basis: own }
  if (facts.carrier) return { kind: 'release', by: 'carrier', basis: own }
  if (verdict.kind === 'allowed') return { kind: 'release', by: 'verdict', basis: own }
  if (session.kind === 'unavailable') return { kind: 'unavailable', missing: 'session' }
  const basis = { verdict: verdict.revision, session: session.revision }
  if (session.once) return { kind: 'release', by: 'once', basis }
  if (session.sessionGrantBasis === verdict.revision)
    return { kind: 'release', by: 'session', basis }
  return byInquiryPolicy(session.policy.onAsk, basis)
}

function byInquiryPolicy(onAsk: InquiryPolicy['onAsk'], basis: ReleaseBasis): ReleaseDecision {
  switch (onAsk) {
    case 'deny':
      return { kind: 'refuse', reason: 'inquiry-policy', basis }
    case 'ask-human':
      return { kind: 'ask', basis }
    case 'skip-ask':
      return { kind: 'release', by: 'skip-ask', basis }
  }
}
