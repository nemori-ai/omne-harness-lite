import { describe, expect, it } from 'vitest'
import { LosslessNumber, writeJsonLossless, type Modality } from '@omne-harness-lite/content-blocks'
import { parseTenantId, type TenantId } from '@omne-harness-lite/identity-values'
import type { ModelProfile, ModelProfileRef } from '@omne-harness-lite/model-profile'
import type { ProfileRow } from '@omne-harness-lite/model-profile-directory'
import { legalTargets, displayList, effectiveModel } from '../src/selection.ts'
import { type RowCredentialFact, type SelectionCompatibility, type SelectionFact } from '../src/selection-types.ts'

function tenant(organization = 'org', account = 'account'): TenantId {
  const parsed = parseTenantId({ organization, account })
  if (!('ok' in parsed)) throw new Error('invalid test tenant')
  return parsed.ok
}
function known<T>(value: T): SelectionFact<T> {
  return { known: value }
}
const unknown = { unknown: true } as const
const malformed = { invalidInput: { reason: 'malformed' } }
const unavailable = { unavailable: true }
function profile(
  name: string,
  origin: 'official' | 'custom',
  registration: 'listed' | 'withdrawn' = 'listed',
  input: readonly Modality[] = ['text'],
): ModelProfile {
  return {
    adaptation: {
      implementation: { name: 'teaching', revision: 'one' },
      definition: { modelId: name, revision: 'one' },
      configuration: {
        revision: 'one',
        values: { precise: new LosslessNumber('9007199254740993.00') },
      },
    },
    routeName: name,
    origin,
    registration,
    providers: ['vendor'],
    allowFallback: false,
    inputModalities: input,
    outputModalities: ['text'],
    maxInputTokens: new LosslessNumber('9007199254740993'),
    maxOutputTokens: 100,
    inputConstraints: input.includes('image') ? { maxImageBytes: 1024 } : {},
    upstreamInputLimits: {
      maxInputTokens: { status: 'unknown' },
      maxRequestBytes: { status: 'unknown' },
      ...(input.includes('image')
        ? { maxImageBytes: { status: 'unknown' }, maxImages: { status: 'unknown' } }
        : {}),
    },
    updatedAt: '2026-09-27T00:00:00Z',
  }
}
function row(
  name: string,
  slot: 'official' | 'organization' | 'tenant',
  registration: 'listed' | 'withdrawn' = 'listed',
  input: readonly Modality[] = ['text'],
  identity = tenant(),
): ProfileRow {
  const ref: ModelProfileRef =
    slot === 'official'
      ? { origin: 'official', routeName: name }
      : {
          origin: 'custom',
          routeName: name,
          scope:
            slot === 'organization'
              ? { layer: 'organization', organization: identity.organization }
              : { layer: 'tenant', tenant: identity },
        }
  return { ref, profile: profile(name, ref.origin, registration, input) }
}
const compatible: SelectionCompatibility = (p, projection) => {
  const blocked = projection.filter(value => !p.inputModalities.includes(value))
  return blocked.length ? { blocked } : { ok: true }
}
function presence(
  value: readonly ProfileRow[],
  present = true,
): SelectionFact<readonly RowCredentialFact[]> {
  return known(value.map(item => ({ ref: item.ref, present: known(present) })))
}
function legal(
  value: readonly ProfileRow[],
  names = [...new Set(value.map(item => item.ref.routeName))],
  projection: readonly Modality[] = ['text'],
) {
  return legalTargets(known(value), known(names), known(projection), compatible)
}
function display(
  value: readonly ProfileRow[],
  selected: string,
  names = [...new Set(value.map(item => item.ref.routeName))],
  projection: readonly Modality[] = ['text'],
  present = true,
) {
  return displayList(
    known(value),
    known(names),
    known(projection),
    compatible,
    known(selected),
    presence(value, present),
  )
}
function effective(
  value: readonly ProfileRow[],
  selected: string,
  names = [...new Set(value.map(item => item.ref.routeName))],
) {
  return effectiveModel(known(selected), known(null), known(value), known(names))
}
function permutations<T>(value: readonly T[]): T[][] {
  if (value.length === 0) return [[]]
  return value.flatMap((item, index) =>
    permutations(value.filter((_, position) => position !== index)).map(rest => [item, ...rest]),
  )
}

describe('selection: independent expected values for RT5 S10-12', () => {
  it.each([
    { slots: ['official'] as const, winner: 'official' },
    { slots: ['official', 'organization'] as const, winner: 'organization' },
    { slots: ['official', 'organization', 'tenant'] as const, winner: 'tenant' },
  ])('chooses $winner from $slots', ({ slots, winner }) => {
    const value = slots.map(slot => row('route', slot))
    const wanted = row(
      'route',
      winner === 'official' ? 'official' : winner === 'organization' ? 'organization' : 'tenant',
    ).ref
    for (const order of permutations(value)) {
      expect(legal(order)).toEqual({ ok: ['route'] })
      expect(effective(order, 'route')).toEqual({
        ok: { routeName: 'route', profile: wanted, selectedBy: 'session', selected: 'route' },
      })
    }
  })
  it('withdrawn tenant falls back to the listed organization without changing the selected route', () => {
    const value = [
      row('route', 'official'),
      row('route', 'organization'),
      row('route', 'tenant', 'withdrawn'),
    ]
    for (const order of permutations(value)) {
      expect(legal(order)).toEqual({ ok: ['route'] })
      expect(effective(order, 'route')).toEqual({
        ok: {
          routeName: 'route',
          profile: value[1]?.ref,
          selectedBy: 'session',
          selected: 'route',
        },
      })
      expect(display(order, 'route')).toEqual({
        ok: [
          {
            routeName: 'route',
            ref: value[1]?.ref,
            selected: true,
            annotations: ['legal'],
            covered: [
              {
                ref: value[2]?.ref,
                annotations: [
                  { overridden_by: { scope: { layer: 'organization', organization: 'org' } } },
                  'withdrawn',
                ],
              },
              {
                ref: value[0]?.ref,
                annotations: [
                  { overridden_by: { scope: { layer: 'organization', organization: 'org' } } },
                ],
              },
            ],
          },
        ],
      })
    }
  })
  it('missing credentials leave the legal name selectable and annotate its winning row', () => {
    const value = [row('route', 'official'), row('route', 'tenant')]
    expect(legal(value)).toEqual({ ok: ['route'] })
    expect(display(value, 'route', ['route'], ['text'], false)).toEqual({
      ok: [
        {
          routeName: 'route',
          ref: value[1]?.ref,
          selected: true,
          annotations: ['legal', 'credential_missing'],
          covered: [
            {
              ref: value[0]?.ref,
              annotations: [
                {
                  overridden_by: {
                    scope: { layer: 'tenant', tenant: { organization: 'org', account: 'account' } },
                  },
                },
              ],
            },
          ],
        },
      ],
    })
  })
  it('incompatible tenant does not fall back to compatible official and remains selected in display', () => {
    const value = [row('route', 'official', 'listed', ['text', 'image']), row('route', 'tenant')]
    expect(legal(value, ['route'], ['image'])).toEqual({ ok: [] })
    const answer = display(value, 'route', ['route'], ['image'], false)
    expect(answer).toMatchObject({
      ok: [
        {
          ref: value[1]?.ref,
          selected: true,
          annotations: ['modality_mismatch', 'credential_missing'],
        },
      ],
    })
    expect(effective(value, 'route')).toMatchObject({ ok: { profile: value[1]?.ref } })
  })
  it('disallowed landing uses nonempty C1 before a withdrawn more-specific C row', () => {
    const value = [
      row('route', 'official', 'withdrawn'),
      row('route', 'organization'),
      row('route', 'tenant', 'withdrawn'),
    ]
    for (const order of permutations(value)) {
      expect(legal(order, [])).toEqual({ ok: [] })
      expect(effective(order, 'route', [])).toEqual({
        ok: {
          routeName: 'route',
          profile: value[1]?.ref,
          selectedBy: 'session',
          selected: 'route',
        },
      })
      expect(
        displayList(
          known(order),
          known([]),
          known([]),
          () => {
            throw new Error('must not ask modality')
          },
          known('route'),
          unknown,
        ),
      ).toEqual({
        ok: [
          {
            routeName: 'route',
            ref: value[1]?.ref,
            annotations: ['scope_disallowed'],
            selected: true,
            covered: [],
          },
        ],
      })
    }
  })
  it('all withdrawn uses most-specific C, without asking credentials or modality', () => {
    const value = [row('route', 'official', 'withdrawn'), row('route', 'tenant', 'withdrawn')]
    expect(
      displayList(
        known(value),
        known(['route']),
        known([]),
        () => {
          throw new Error('must not ask')
        },
        known('route'),
        unknown,
      ),
    ).toEqual({
      ok: [
        {
          routeName: 'route',
          ref: value[1]?.ref,
          annotations: ['withdrawn'],
          covered: [],
          selected: true,
        },
      ],
    })
    expect(effective(value, 'route')).toMatchObject({ ok: { profile: value[1]?.ref } })
  })
  it('selected route unions with legal names; unselected incompatible names are omitted', () => {
    const value = [
      row('chosen', 'official'),
      row('image', 'official', 'listed', ['text', 'image']),
      row('other', 'official'),
    ]
    expect(display(value, 'chosen', ['chosen', 'image', 'other'], ['image'])).toEqual({
      ok: [
        {
          routeName: 'chosen',
          ref: value[0]?.ref,
          annotations: ['modality_mismatch'],
          covered: [],
          selected: true,
        },
        {
          routeName: 'image',
          ref: value[1]?.ref,
          annotations: ['legal'],
          covered: [],
          selected: false,
        },
      ],
    })
  })
  it('credential presence is keyed by exact winning ref and its origin', () => {
    const value = [row('official-route', 'official'), row('custom-route', 'organization')]
    const credentials = known([
      { ref: value[0]?.ref, present: known(true) },
      { ref: value[1]?.ref, present: known(false) },
    ])
    const result = Reflect.apply(displayList, undefined, [
      known(value),
      known(['official-route', 'custom-route']),
      known(['text']),
      compatible,
      known('official-route'),
      credentials,
    ])
    expect(result).toMatchObject({
      ok: [
        { routeName: 'custom-route', annotations: ['legal', 'credential_missing'] },
        { routeName: 'official-route', annotations: ['legal'] },
      ],
    })
  })
  it.each([null, 'chosen', 'locked'])('keeps source of the evaluated lock %s', lock => {
    const value = [row('chosen', 'official'), row('locked', 'tenant', 'withdrawn')]
    expect(effectiveModel(known('chosen'), known(lock), known(value), known(['chosen']))).toEqual({
      ok: {
        routeName: lock ?? 'chosen',
        profile: lock === 'locked' ? value[1]?.ref : value[0]?.ref,
        selectedBy: lock === null ? 'session' : 'layer_lock',
        selected: 'chosen',
      },
    })
  })
  it('preserves codepoint-distinct route names without normalization', () => {
    const value = [row('é', 'official'), row('e\u0301', 'official')]
    expect(legal(value)).toEqual({ ok: ['e\u0301', 'é'] })
    expect(effective(value, 'é')).toMatchObject({ ok: { routeName: 'é', selected: 'é' } })
    expect(display(value, 'é')).toMatchObject({ ok: [{ selected: false }, { selected: true }] })
  })
  it('known empty projection is valid; known empty rows produces only a legal empty set', () => {
    expect(legal([row('route', 'official')], ['route'], [])).toEqual({ ok: ['route'] })
    expect(legal([])).toEqual({ ok: [] })
    expect(display([], 'route')).toEqual({ profileNotFound: true })
    expect(effective([], 'route')).toEqual({ profileNotFound: true })
  })
})

describe('selection: admission, explicit unknown and whole-result failure', () => {
  it.each([0, 1, 2])('unknown legal input %s is unavailable, not an empty set', position => {
    const args: unknown[] = [
      known([row('route', 'official')]),
      known(['route']),
      known([]),
      compatible,
    ]
    args[position] = unknown
    expect(Reflect.apply(legalTargets, undefined, args)).toEqual(unavailable)
  })
  it.each([
    undefined,
    { known: undefined },
    { unknown: false },
    { known: [], unknown: true },
    { known: [], extra: true },
  ])('rejects missing or malformed fact %j', value => {
    expect(
      Reflect.apply(legalTargets, undefined, [value, known([]), known([]), compatible]),
    ).toEqual(malformed)
  })
  it.each([undefined, null, true, {}])(
    'does not default missing/invalid compatibility %j',
    value => {
      expect(
        Reflect.apply(legalTargets, undefined, [known([]), known([]), known([]), value]),
      ).toEqual(malformed)
    },
  )
  it.each(
    [
      ['text', 'text'],
      ['image', 'other'],
      ['image', 'text', 'audio', 'video', 'fifth'],
    ].map(value => ({ value })),
  )('rejects malformed projection $value', ({ value }) => {
    expect(
      Reflect.apply(legalTargets, undefined, [known([]), known([]), known(value), compatible]),
    ).toEqual(malformed)
  })
  it.each([['route', 'route'], [''], [' route'], ['route\n'], [1]].map(value => ({ value })))(
    'rejects malformed allowed names $value',
    ({ value }) => {
      expect(
        Reflect.apply(legalTargets, undefined, [known([]), known(value), known([]), compatible]),
      ).toEqual(malformed)
    },
  )
  it('rejects duplicate scope+name even with identical original values', () => {
    const value = row('route', 'official')
    expect(legal([value, value])).toEqual(malformed)
  })
  it.each(
    [
      [
        row('same', 'organization', 'listed', ['text'], tenant('org1')),
        row('same', 'organization', 'listed', ['text'], tenant('org2')),
      ],
      [
        row('a', 'organization', 'listed', ['text'], tenant('org1')),
        row('b', 'organization', 'listed', ['text'], tenant('org2')),
      ],
      [
        row('a', 'tenant', 'listed', ['text'], tenant('org', 'one')),
        row('b', 'tenant', 'listed', ['text'], tenant('org', 'two')),
      ],
      [
        row('a', 'organization', 'listed', ['text'], tenant('org1')),
        row('b', 'tenant', 'listed', ['text'], tenant('org2')),
      ],
    ].map(value => ({ value })),
  )('rejects a mixed chain in both permutations %#', ({ value }) => {
    for (const order of permutations(value)) {
      expect(legal(order)).toEqual(malformed)
      expect(display(order, order[0]?.ref.routeName ?? '')).toEqual(malformed)
      expect(effective(order, order[0]?.ref.routeName ?? '')).toEqual(malformed)
    }
  })
  it('rejects profile/ref mismatch', () => {
    const value = { ...row('route', 'official'), ref: { origin: 'official', routeName: 'other' } }
    expect(
      Reflect.apply(legalTargets, undefined, [
        known([value]),
        known(['route']),
        known([]),
        compatible,
      ]),
    ).toEqual(malformed)
  })
  it('preserves named profile rejections and required adaptation', () => {
    const original = row('route', 'official')
    expect(
      Reflect.apply(legalTargets, undefined, [
        known([{ ...original, profile: { ...original.profile, providers: [] } }]),
        known(['route']),
        known([]),
        compatible,
      ]),
    ).toEqual({ invalidInput: { reason: 'providers_empty' } })
    const { adaptation: omitted, ...rest } = original.profile
    expect(omitted).toBeDefined()
    expect(
      Reflect.apply(legalTargets, undefined, [
        known([{ ...original, profile: rest }]),
        known(['route']),
        known([]),
        compatible,
      ]),
    ).toEqual(malformed)
  })
  it.each([unknown, known(null)])('does not manufacture initial selection for %j', selected => {
    const value = [row('route', 'official')]
    expect(effectiveModel(selected, known('route'), known(value), known(['route']))).toEqual(
      unavailable,
    )
    expect(
      displayList(known(value), known(['route']), known([]), compatible, selected, presence(value)),
    ).toEqual(unavailable)
  })
  it('unknown lock does not mean absent lock', () => {
    expect(
      effectiveModel(known('route'), unknown, known([row('route', 'official')]), known(['route'])),
    ).toEqual(unavailable)
  })
  it('only selected missing route yields profileNotFound and never hides a chosen entry', () => {
    const value = [row('present', 'official')]
    expect(display(value, 'absent')).toEqual({ profileNotFound: true })
    expect(effective(value, 'absent')).toEqual({ profileNotFound: true })
    expect(
      effectiveModel(known('present'), known('absent'), known(value), known(['present'])),
    ).toEqual({ profileNotFound: true })
  })
  it('required credential fact unknown fails complete display; missing or duplicate input is invalid', () => {
    const value = [row('a', 'official'), row('b', 'official')]
    expect(
      displayList(known(value), known(['a', 'b']), known([]), compatible, known('a'), unknown),
    ).toEqual(unavailable)
    const a = value[0],
      b = value[1]
    if (a === undefined || b === undefined) throw new Error('test fixture missing')
    expect(
      displayList(
        known(value),
        known(['a', 'b']),
        known([]),
        compatible,
        known('a'),
        known([
          { ref: a.ref, present: known(true) },
          { ref: b.ref, present: unknown },
        ]),
      ),
    ).toEqual(unavailable)
    expect(
      displayList(known(value), known(['a', 'b']), known([]), compatible, known('a'), known([])),
    ).toEqual(malformed)
    expect(
      displayList(
        known(value),
        known(['a', 'b']),
        known([]),
        compatible,
        known('a'),
        known([
          { ref: a.ref, present: known(true) },
          { ref: a.ref, present: known(false) },
        ]),
      ),
    ).toEqual(malformed)
  })
  it.each([
    { ok: false },
    { blocked: [] },
    { blocked: ['text'] },
    { blocked: ['image', 'image'] },
    { ok: true, blocked: ['image'] },
    { unavailable: false },
    { invalidInput: { reason: 'made_up' } },
    true,
  ])('rejects malformed callback answer %j', answer => {
    expect(
      Reflect.apply(legalTargets, undefined, [
        known([row('route', 'official')]),
        known(['route']),
        known(['text']),
        () => answer,
      ]),
    ).toEqual(malformed)
  })
  it('rejects a false ok and a false blocked rather than trusting malformed decision facts', () => {
    expect(
      legalTargets(known([row('route', 'official')]), known(['route']), known(['image']), () => ({
        ok: true,
      })),
    ).toEqual(malformed)
    expect(
      legalTargets(known([row('route', 'official')]), known(['route']), known(['text']), () => ({
        blocked: ['image'],
      })),
    ).toEqual(malformed)
  })
  it.each(['unknown', 'malformed', 'throw'] as const)(
    'failure in second winner callback produces whole-result %s',
    mode => {
      const value = [row('a', 'official'), row('b', 'official')]
      const before = writeJsonLossless(value)
      const calls: string[] = []
      const decide: SelectionCompatibility = p => {
        calls.push(p.routeName)
        if (p.routeName === 'a') return { ok: true }
        if (mode === 'throw') throw new Error('secret-original-error-must-not-escape')
        return mode === 'unknown'
          ? { unavailable: true }
          : { invalidInput: { reason: 'malformed' } }
      }
      const answer = legalTargets(known(value), known(['b', 'a']), known([]), decide)
      expect(answer).toEqual(mode === 'malformed' ? malformed : unavailable)
      expect(JSON.stringify(answer)).not.toContain('secret-original-error')
      expect(writeJsonLossless(value)).toBe(before)
      expect(calls).toEqual(['a', 'b'])
      expect(
        displayList(
          known(value),
          known(['a', 'b']),
          known([]),
          decide,
          known('a'),
          presence(value),
        ),
      ).toEqual(mode === 'malformed' ? malformed : unavailable)
    },
  )
  it('only winner callbacks run and receive full precise adaptation with copied frozen projection', () => {
    const value = [row('a', 'official'), row('a', 'tenant'), row('gone', 'official', 'withdrawn')]
    const seen: ModelProfile[] = []
    const projection: Modality[] = ['text']
    const decide: SelectionCompatibility = (p, got) => {
      seen.push(p)
      expect(p).not.toBe(value[1]?.profile)
      expect(got).not.toBe(projection)
      expect(Object.isFrozen(p.adaptation.configuration.values)).toBe(true)
      expect(writeJsonLossless(p.adaptation.configuration.values)).toContain('9007199254740993.00')
      expect(writeJsonLossless(p.maxInputTokens)).toBe('9007199254740993')
      expect(Object.isFrozen(got)).toBe(true)
      return { ok: true }
    }
    expect(legalTargets(known(value), known(['a', 'gone']), known(projection), decide)).toEqual({
      ok: ['a'],
    })
    expect(seen).toHaveLength(1)
    expect(seen[0]?.origin).toBe('custom')
  })
  it('never invokes getters or toJSON', () => {
    let calls = 0
    const getter = Object.defineProperty({}, 'known', {
      enumerable: true,
      get() {
        calls++
        return []
      },
    })
    const value = [row('route', 'official')]
    expect(
      Reflect.apply(legalTargets, undefined, [getter, known([]), known([]), compatible]),
    ).toEqual(malformed)
    const bad = {
      ...value[0],
      toJSON() {
        calls++
        return {}
      },
    }
    expect(
      Reflect.apply(legalTargets, undefined, [known([bad]), known([]), known([]), compatible]),
    ).toEqual(malformed)
    expect(calls).toBe(0)
  })
  it('does not disguise unexpected JSON capture exceptions as an input or availability fact', () => {
    const unexpected = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('foreign-secret-capture-text')
        },
      },
    )
    expect(() =>
      Reflect.apply(legalTargets, undefined, [unexpected, known([]), known([]), compatible]),
    ).toThrow('model selection JSON capture failed')
    try {
      Reflect.apply(legalTargets, undefined, [unexpected, known([]), known([]), compatible])
      throw new Error('capture unexpectedly returned')
    } catch (error) {
      expect(error instanceof Error ? error.message : '').not.toContain('foreign-secret')
    }
  })
  it('returns caller-independent deeply immutable refs, scopes, arrays and annotations', () => {
    const value = [row('route', 'official'), row('route', 'tenant')]
    const answer = display(value, 'route')
    if (!('ok' in answer)) throw new Error('expected display')
    const first = answer.ok[0]
    if (first === undefined) throw new Error('missing display')
    expect(first.ref).not.toBe(value[1]?.ref)
    expect(() => Reflect.set(first.ref, 'routeName', 'changed')).not.toThrow()
    expect(Reflect.set(first.ref, 'routeName', 'changed')).toBe(false)
    expect(Object.isFrozen(first.covered[0]?.annotations[0])).toBe(true)
    expect(Object.isFrozen(first.annotations)).toBe(true)
    expect(Object.isFrozen(answer.ok)).toBe(true)
    expect(value[1]?.ref.routeName).toBe('route')
    expect(first.ref.routeName).toBe('route')
  })
  it('accepts frozen inputs and keeps nested scope facts independent after caller mutation', () => {
    const source = [row('route', 'tenant')]
    const input = Object.freeze(source)
    const answer = effectiveModel(
      Object.freeze(known('route')),
      Object.freeze(known(null)),
      Object.freeze(known(input)),
      Object.freeze(known(Object.freeze(['route']))),
    )
    expect(answer).toMatchObject({ ok: { selected: 'route' } })
    const ref = source[0]?.ref
    if (ref === undefined || ref.origin !== 'custom' || ref.scope.layer !== 'tenant')
      throw new Error('fixture missing')
    expect(Reflect.set(ref.scope.tenant, 'account', 'mutated')).toBe(true)
    if (!('ok' in answer)) throw new Error('expected success')
    expect(answer.ok.profile).toEqual({
      origin: 'custom',
      routeName: 'route',
      scope: { layer: 'tenant', tenant: { organization: 'org', account: 'account' } },
    })
    expect(Object.isFrozen(answer.ok.profile)).toBe(true)
  })
})
