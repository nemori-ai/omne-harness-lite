import { describe, expect, it } from 'vitest'
import { decodeProviderName, decodeRevision } from '../src/index.ts'
import type { ModelFailure, ProfileResolution, ProviderName } from '../src/index.ts'
import { supplyOf, type ModelChoices, type ModelSupply } from '../src/provider/index.ts'

type Resolved = Extract<ProfileResolution<'decisions'>, { kind: 'resolved' }>
type Credential = Resolved['credential']
type State = Readonly<{
  covers: boolean
  credential: Credential
  enabled: boolean
  restriction: null | 'locked' | 'scope'
}>

function providerOf(name: string): ProviderName {
  const decoded = decodeProviderName(name)
  if (!('ok' in decoded)) throw new Error('no provider name')
  return decoded.ok
}
function revisionOf(text: string) {
  const decoded = decodeRevision(text)
  if (!('ok' in decoded)) throw new Error('no revision')
  return decoded.ok
}
const REVISION = revisionOf('1')

const adoption = { owner: 'tests', name: 'supply', revision: '1', digest: '0'.repeat(64) }
const evidence = { owner: 'tests', record: 'supply', revision: '1', digest: '1'.repeat(64) }

const ALPHA = providerOf('alpha')
const BETA = providerOf('beta')

function candidate(route: string, provider: ProviderName, state: State): Resolved {
  const reasons: Resolved['reasons'][number][] = []
  if (!state.covers) reasons.push('modality')
  if (state.restriction !== null) reasons.push(state.restriction)
  if (!state.enabled) reasons.push('not-enabled')
  return {
    kind: 'resolved',
    profile: {
      identity: { kind: 'decisions', scope: { kind: 'factory' }, route },
      adoption,
      revision: REVISION,
      updatedAt: '2026-11-27T00:00:00Z',
      availability: 'active',
      definition: {
        kind: 'decisions',
        suppliers: [{ adoption, provider, model: route }],
        fallback: false,
        input: ['text'],
        output: ['text'],
        maxQuestions: null,
        retryPolicy: adoption,
      },
    },
    source: evidence,
    selectable: reasons.length === 0,
    reasons,
    credential: state.credential,
    shadowed: [],
  }
}

const listed = (...choices: readonly Resolved[]) => ({
  ok: { choices, selected: null, source: evidence } satisfies ModelChoices<'decisions'>,
})

const READY: State = { covers: true, credential: 'available', enabled: true, restriction: null }
const STATES: readonly State[] = [true, false].flatMap(covers =>
  (['available', 'missing', 'unreadable', 'unavailable'] as const).flatMap(credential =>
    [true, false].flatMap(enabled =>
      ([null, 'locked', 'scope'] as const).map(restriction => ({
        covers,
        credential,
        enabled,
        restriction,
      })),
    ),
  ),
)

/** Where a candidate stops, told another way than the function tells it: by the gates it has passed. */
function passed(state: State): number {
  if (!state.covers) return 0
  if (state.credential !== 'available') return 1
  if (!state.enabled) return 2
  return state.restriction === null ? 4 : 3
}
const LEVEL = { 'no-offering': 0, credential: 1, 'not-enabled': 2, locked: 3, scope: 3 } as const

function levelOf(supply: ModelSupply): number | 'ready' | 'unknown' {
  if (supply.state === 'blocked') return LEVEL[supply.by]
  return supply.state
}

const PAIRS = STATES.flatMap(first => STATES.map(second => [first, second] as const))
const pairOf = ([first, second]: readonly [State, State], provider = BETA) =>
  listed(candidate('one', ALPHA, first), candidate('two', provider, second))

describe('the six answers of a supply (MD-54)', () => {
  const failure: ModelFailure = {
    kind: 'unavailable',
    dependency: 'model-profiles',
    diagnostic: 'x',
  }

  it('a listing that could not be read is not known, and is never no offering', () => {
    expect(supplyOf<'decisions'>({ failure })).toEqual({ state: 'unknown' })
    expect(supplyOf<'decisions'>({ failure: { kind: 'denied', action: 'list' } })).toEqual({
      state: 'unknown',
    })
  })

  it('no candidate, or none that meets the need, is no offering', () => {
    expect(supplyOf(listed())).toEqual({ state: 'blocked', by: 'no-offering' })
    expect(supplyOf(listed(candidate('one', ALPHA, { ...READY, covers: false })))).toEqual({
      state: 'blocked',
      by: 'no-offering',
    })
  })

  it('candidates that meet the need and have no credential stop at the credential, with their providers once each', () => {
    const missing: State = { ...READY, credential: 'missing' }
    expect(
      supplyOf(
        listed(
          candidate('one', ALPHA, missing),
          candidate('two', ALPHA, missing),
          candidate('three', BETA, missing),
        ),
      ),
    ).toEqual({ state: 'blocked', by: 'credential', providers: [ALPHA, BETA] })
  })

  it('candidates with a credential that are all turned off stop at not enabled, with each model', () => {
    const off: State = { ...READY, enabled: false }
    expect(supplyOf(listed(candidate('one', ALPHA, off), candidate('two', BETA, off)))).toEqual({
      state: 'blocked',
      by: 'not-enabled',
      models: [
        { provider: ALPHA, route: 'one' },
        { provider: BETA, route: 'two' },
      ],
    })
  })

  it('enabled candidates that are locked or out of scope stop there, the locked ones first', () => {
    const one = candidate('one', ALPHA, { ...READY, restriction: 'scope' })
    const two = candidate('two', BETA, { ...READY, restriction: 'locked' })
    expect(supplyOf(listed(one, two))).toEqual({
      state: 'blocked',
      by: 'locked',
      models: [{ provider: BETA, route: 'two' }],
    })
    expect(supplyOf(listed(one))).toEqual({
      state: 'blocked',
      by: 'scope',
      models: [{ provider: ALPHA, route: 'one' }],
    })
  })

  it('a name that resolves to no profile is no candidate', () => {
    const absent = { kind: 'absent', reason: 'excluded' } as const
    expect(supplyOf(listed(absent as never))).toEqual({ state: 'blocked', by: 'no-offering' })
    const ready = candidate('one', ALPHA, READY)
    expect(supplyOf(listed(absent as never, ready))).toEqual({ state: 'ready', choices: [ready] })
  })

  it('one candidate that passes everything is ready, with the candidates that pass and no other', () => {
    const ready = candidate('two', BETA, READY)
    expect(supplyOf(listed(candidate('one', ALPHA, { ...READY, enabled: false }), ready))).toEqual({
      state: 'ready',
      choices: [ready],
    })
  })
})

describe('the answer of a supply over every pair of candidates', () => {
  it('is ready exactly when a candidate passes every gate, and lists exactly those in their order', () => {
    for (const pair of PAIRS) {
      const supply = supplyOf(pairOf(pair))
      const passing = pair.filter(state => passed(state) === 4)
      expect(supply.state === 'ready', JSON.stringify(pair)).toBe(passing.length > 0)
      if (supply.state !== 'ready') continue
      expect(supply.choices.map(choice => choice.profile.identity.route)).toEqual(
        (['one', 'two'] as const).filter((_route, index) => passed(pair[index] as State) === 4),
      )
    }
  })

  it('names the gate where the candidate that went furthest stopped', () => {
    for (const pair of PAIRS) {
      const furthest = Math.max(...pair.map(passed))
      if (furthest === 4) continue
      const level = levelOf(supplyOf(pairOf(pair)))
      const unknownAtCredential = pair.some(
        state => passed(state) === 1 && state.credential !== 'missing',
      )
      expect(level, JSON.stringify(pair)).toBe(
        furthest === 1 && unknownAtCredential ? 'unknown' : furthest,
      )
    }
  })

  it('names every candidate stopped at that gate and no candidate stopped before it', () => {
    for (const pair of PAIRS) {
      const supply = supplyOf(pairOf(pair))
      if (supply.state !== 'blocked' || supply.by === 'no-offering') continue
      const level = LEVEL[supply.by]
      const stopped = (['one', 'two'] as const).filter(
        (_route, index) => passed(pair[index] as State) === level,
      )
      if (supply.by === 'credential') {
        expect(supply.providers, JSON.stringify(pair)).toEqual(
          stopped.map(route => (route === 'one' ? ALPHA : BETA)),
        )
        continue
      }
      const named = supply.models.map(model => model.route)
      expect(named.every(route => stopped.includes(route as 'one' | 'two'))).toBe(true)
      if (supply.by === 'not-enabled') expect(named).toEqual(stopped)
    }
  })

  it('does not depend on the order of the candidates', () => {
    for (const [first, second] of PAIRS) {
      const forward = supplyOf(pairOf([first, second]))
      const backward = supplyOf(
        listed(candidate('two', BETA, second), candidate('one', ALPHA, first)),
      )
      expect(levelOf(backward), JSON.stringify([first, second])).toBe(levelOf(forward))
    }
  })

  it('a candidate that stops before the furthest one changes nothing', () => {
    for (const pair of PAIRS) {
      const furthest = Math.max(...pair.map(passed))
      const before = supplyOf(pairOf(pair))
      for (const extra of STATES.filter(state => passed(state) < furthest)) {
        const after = supplyOf(
          listed(
            candidate('one', ALPHA, pair[0]),
            candidate('two', BETA, pair[1]),
            candidate('three', ALPHA, extra),
          ),
        )
        if (levelOf(before) === 'unknown' || levelOf(after) === 'unknown') {
          expect(levelOf(after)).toBe(levelOf(before))
          continue
        }
        expect(after, JSON.stringify([pair, extra])).toEqual(before)
      }
    }
  })
})
