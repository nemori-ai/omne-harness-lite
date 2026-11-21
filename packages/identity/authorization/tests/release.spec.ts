import { describe, expect, it } from 'vitest'
import {
  decideRelease,
  grantLayerOf,
  type GateVerdict,
  type ReleaseFacts,
  type SessionFacts,
} from '@omne-harness/authorization'

const evidence = (record: string) => ({ owner: 'session', record, revision: '1', digest: 'd' })
const ONCE = evidence('once')
const GRANT = evidence('grant')
const MODE = evidence('mode')
const holders = { tenant: 'tenant-1', session: 'session-1' }
const gate = { capability: 'tool.Schedules', key: 'tool.activate' }

const VERDICTS: readonly GateVerdict[] = [
  { kind: 'unavailable' },
  { kind: 'prohibited', revision: '7' },
  { kind: 'allowed', revision: '7', layer: 'tenant' },
  { kind: 'allowed', revision: '7', layer: 'session' },
  { kind: 'decision-required', revision: '7' },
]
const POLICIES = ['deny', 'ask-human', 'skip-ask'] as const
const GRANT_BASES = [null, '7', '6'] as const

const SESSIONS: readonly SessionFacts[] = [
  { kind: 'unavailable' },
  ...POLICIES.flatMap(onAsk =>
    [null, ONCE].flatMap(once =>
      GRANT_BASES.map(basis => ({
        kind: 'read' as const,
        revision: '3',
        policy: { onAsk },
        policySource: MODE,
        once,
        sessionGrant: basis === null ? null : { basis, source: GRANT },
      })),
    ),
  ),
]

const ALL: readonly ReleaseFacts[] = VERDICTS.flatMap(verdict =>
  SESSIONS.flatMap(session =>
    [false, true].map(carrier => ({ carrier, verdict, session, holders, gate })),
  ),
)

const read = (
  onAsk: 'deny' | 'ask-human' | 'skip-ask',
  extra: Partial<Extract<SessionFacts, { kind: 'read' }>> = {},
): SessionFacts => ({
  kind: 'read',
  revision: '3',
  policy: { onAsk },
  policySource: MODE,
  once: null,
  sessionGrant: null,
  ...extra,
})
const required: GateVerdict = { kind: 'decision-required', revision: '7' }
const facts = (verdict: GateVerdict, session: SessionFacts): ReleaseFacts => ({
  carrier: false,
  verdict,
  session,
  holders,
  gate,
})

describe('the release decision over every combination of its facts', () => {
  it('covers all 5 verdicts × 19 session facts × carrier or not', () => {
    expect(ALL).toHaveLength(5 * 19 * 2)
  })

  it('never releases what it cannot read, whatever the policy', () => {
    for (const item of ALL.filter(entry => entry.verdict.kind === 'unavailable'))
      expect(decideRelease(item)).toEqual({ kind: 'unavailable', missing: 'verdict' })
  })

  it('never releases a prohibited gate, carrier or not, whatever a person granted', () => {
    for (const item of ALL.filter(entry => entry.verdict.kind === 'prohibited'))
      expect(decideRelease(item)).toEqual({
        kind: 'refuse',
        reason: 'prohibited',
        basis: { verdict: '7', session: null },
      })
  })

  it('a carrier is released unless prohibited, is never asked about, and rests on no grant', () => {
    for (const item of ALL.filter(entry => entry.carrier)) {
      const decision = decideRelease(item)
      expect(decision.kind).not.toBe('ask')
      if (item.verdict.kind === 'allowed' || item.verdict.kind === 'decision-required')
        expect(decision).toEqual({
          kind: 'release',
          by: 'carrier',
          basis: { verdict: '7', session: null },
        })
    }
  })

  it('an allowed gate is released without reading the session, naming the verdict and its layer', () => {
    for (const item of ALL.filter(entry => !entry.carrier && entry.verdict.kind === 'allowed')) {
      const layer = item.verdict.kind === 'allowed' ? item.verdict.layer : 'tenant'
      expect(decideRelease(item)).toEqual({
        kind: 'release',
        by: 'verdict',
        basis: { verdict: '7', session: null },
        grant: {
          via: 'verdict',
          layer,
          holder: layer === 'tenant' ? 'tenant-1' : 'session-1',
          gate,
          revision: '7',
        },
      })
    }
  })

  it('every release but a carrier names its grant, and a grant other than a tenant verdict lives with the session', () => {
    for (const item of ALL) {
      const decision = decideRelease(item)
      if (decision.kind !== 'release' || decision.by === 'carrier') continue
      const tenantVerdict =
        decision.by === 'verdict' &&
        item.verdict.kind === 'allowed' &&
        item.verdict.layer === 'tenant'
      expect(grantLayerOf(decision.grant)).toBe(tenantVerdict ? 'tenant' : 'session')
    }
  })

  it('needing a decision, nothing is released without a grant unless the policy skips asking', () => {
    for (const item of ALL) {
      if (item.carrier || item.verdict.kind !== 'decision-required') continue
      const decision = decideRelease(item)
      const session = item.session
      if (session.kind === 'unavailable') {
        expect(decision).toEqual({ kind: 'unavailable', missing: 'session' })
        continue
      }
      const granted = session.once !== null || session.sessionGrant?.basis === '7'
      if (decision.kind === 'release')
        expect(granted || session.policy.onAsk === 'skip-ask').toBe(true)
      else expect(granted).toBe(false)
    }
  })

  it('a session grant given under another verdict revision is not used', () => {
    for (const onAsk of POLICIES)
      expect(
        decideRelease(
          facts(required, read(onAsk, { sessionGrant: { basis: '6', source: GRANT } })),
        ),
      ).not.toMatchObject({ kind: 'release', by: 'session' })
  })
})

describe('the four steps in their order, needing a decision', () => {
  const basis = { verdict: '7', session: '3' }
  const current = { basis: '7', source: GRANT }
  it.each([
    [
      'a once grant',
      read('deny', { once: ONCE }),
      {
        kind: 'release',
        by: 'once',
        basis,
        grant: { via: 'once', holder: 'session-1', source: ONCE },
      },
    ],
    [
      'a current session grant',
      read('deny', { sessionGrant: current }),
      {
        kind: 'release',
        by: 'session',
        basis,
        grant: { via: 'session-grant', holder: 'session-1', gate, source: GRANT },
      },
    ],
    [
      'a once grant before a session grant',
      read('ask-human', { once: ONCE, sessionGrant: current }),
      {
        kind: 'release',
        by: 'once',
        basis,
        grant: { via: 'once', holder: 'session-1', source: ONCE },
      },
    ],
    ['never', read('deny'), { kind: 'refuse', reason: 'inquiry-policy', basis }],
    [
      'a session where nobody can be asked',
      { ...read('deny'), policy: { onAsk: 'deny', denial: 'nobody-to-ask' } },
      { kind: 'refuse', reason: 'nobody-to-ask', basis },
    ],
    ['auto_permission', read('ask-human'), { kind: 'ask', basis }],
    [
      'bypass-permissions',
      read('skip-ask'),
      {
        kind: 'release',
        by: 'skip-ask',
        basis,
        grant: { via: 'skip-ask', holder: 'session-1', source: MODE },
      },
    ],
  ] as const)('%s', (_label, session, expected) => {
    expect(decideRelease(facts(required, session))).toEqual(expected)
  })
})
