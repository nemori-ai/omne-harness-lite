import { describe, expect, it } from 'vitest'
import {
  decideRelease,
  type GateVerdict,
  type ReleaseFacts,
  type SessionFacts,
} from '@omne-harness/authorization'

const VERDICTS: readonly GateVerdict[] = [
  { kind: 'unavailable' },
  { kind: 'prohibited', revision: '7' },
  { kind: 'allowed', revision: '7' },
  { kind: 'decision-required', revision: '7' },
]
const POLICIES = ['deny', 'ask-human', 'skip-ask'] as const
const GRANT_BASES = [null, '7', '6'] as const

const SESSIONS: readonly SessionFacts[] = [
  { kind: 'unavailable' },
  ...POLICIES.flatMap(onAsk =>
    [false, true].flatMap(once =>
      GRANT_BASES.map(sessionGrantBasis => ({
        kind: 'read' as const,
        revision: '3',
        policy: { onAsk },
        once,
        sessionGrantBasis,
      })),
    ),
  ),
]

const ALL: readonly ReleaseFacts[] = VERDICTS.flatMap(verdict =>
  SESSIONS.flatMap(session => [false, true].map(carrier => ({ carrier, verdict, session }))),
)

const read = (
  onAsk: 'deny' | 'ask-human' | 'skip-ask',
  extra: Partial<Extract<SessionFacts, { kind: 'read' }>> = {},
): SessionFacts => ({
  kind: 'read',
  revision: '3',
  policy: { onAsk },
  once: false,
  sessionGrantBasis: null,
  ...extra,
})
const required: GateVerdict = { kind: 'decision-required', revision: '7' }

describe('the release decision over every combination of its facts', () => {
  it('covers all 4 verdicts × 19 session facts × carrier or not', () => {
    expect(ALL).toHaveLength(4 * 19 * 2)
  })

  it('never releases what it cannot read, whatever the policy', () => {
    for (const facts of ALL.filter(item => item.verdict.kind === 'unavailable'))
      expect(decideRelease(facts)).toEqual({ kind: 'unavailable', missing: 'verdict' })
  })

  it('never releases a prohibited gate, carrier or not, whatever a person granted', () => {
    for (const facts of ALL.filter(item => item.verdict.kind === 'prohibited'))
      expect(decideRelease(facts)).toEqual({
        kind: 'refuse',
        reason: 'prohibited',
        basis: { verdict: '7', session: null },
      })
  })

  it('a carrier is released unless prohibited, and is never asked about', () => {
    for (const facts of ALL.filter(item => item.carrier)) {
      const decision = decideRelease(facts)
      expect(decision.kind).not.toBe('ask')
      if (facts.verdict.kind === 'allowed' || facts.verdict.kind === 'decision-required')
        expect(decision).toEqual({
          kind: 'release',
          by: 'carrier',
          basis: { verdict: '7', session: null },
        })
    }
  })

  it('an allowed gate is released without reading the session', () => {
    for (const facts of ALL.filter(item => !item.carrier && item.verdict.kind === 'allowed'))
      expect(decideRelease(facts)).toEqual({
        kind: 'release',
        by: 'verdict',
        basis: { verdict: '7', session: null },
      })
  })

  it('needing a decision, nothing is released without a grant unless the policy skips asking', () => {
    for (const facts of ALL) {
      if (facts.carrier || facts.verdict.kind !== 'decision-required') continue
      const decision = decideRelease(facts)
      const session = facts.session
      if (session.kind === 'unavailable') {
        expect(decision).toEqual({ kind: 'unavailable', missing: 'session' })
        continue
      }
      const granted = session.once || session.sessionGrantBasis === '7'
      if (decision.kind === 'release')
        expect(granted || session.policy.onAsk === 'skip-ask').toBe(true)
      else expect(granted).toBe(false)
    }
  })

  it('a session grant given under another verdict revision is not used', () => {
    for (const onAsk of POLICIES)
      expect(
        decideRelease({
          carrier: false,
          verdict: required,
          session: read(onAsk, { sessionGrantBasis: '6' }),
        }),
      ).not.toMatchObject({ kind: 'release', by: 'session' })
  })
})

describe('the four steps in their order, needing a decision', () => {
  const basis = { verdict: '7', session: '3' }
  it.each([
    ['a once grant', read('deny', { once: true }), { kind: 'release', by: 'once', basis }],
    [
      'a current session grant',
      read('deny', { sessionGrantBasis: '7' }),
      { kind: 'release', by: 'session', basis },
    ],
    [
      'a once grant before a session grant',
      read('ask-human', { once: true, sessionGrantBasis: '7' }),
      { kind: 'release', by: 'once', basis },
    ],
    ['never', read('deny'), { kind: 'refuse', reason: 'inquiry-policy', basis }],
    ['auto_permission', read('ask-human'), { kind: 'ask', basis }],
    ['bypass-permissions', read('skip-ask'), { kind: 'release', by: 'skip-ask', basis }],
  ] as const)('%s', (_label, session, expected) => {
    expect(decideRelease({ carrier: false, verdict: required, session })).toEqual(expected)
  })
})
