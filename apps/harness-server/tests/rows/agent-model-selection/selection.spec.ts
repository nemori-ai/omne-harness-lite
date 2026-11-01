// APP-10: the `agent-model-selection` row. The row reads the model route that the Session saved,
// resolves it through `modelProfiles`, and gives the Agent a `SelectedModel`. These tests go
// through the serve tree and the `agentModelSelection` service key that `agent-host` uses. They
// judge what the Agent can observe: the selected model, or one of the failures, and never another
// model. The Session double and the profile double stand for the real providers (not covered).
import type { Failure } from '@omne-harness/agent-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { describe, expect, test } from 'vitest'
import { stubPlugin } from '../../../src/cordis.ts'
import {
  agentModelSelectionRow,
  createAgentModelSelectionRow,
} from '../../../src/rows/agent-model-selection/index.ts'
import { serveOnce } from '../../fixtures/serve/harness.ts'
import { serveProfile } from '../../../src/profile.ts'
import { rowDeclarationOf } from '../../../src/row.ts'
import type { RowId } from '../../../src/types.ts'
import {
  SAVED_SOURCE,
  SESSION,
  failureOf,
  profileOf,
  type ProfilesAnswer,
  resolvedOf,
  savedSelection,
  selectInput,
  sessionAccess,
  sessionBinding,
  textRequirement,
  withLiveRow,
} from './support.ts'

const ROUTE = 'official-fast'

/** The full set of tables for the positive case: the saved route and a profile that resolves it. */
const happy = {
  session: () => succeed(savedSelection(ROUTE)),
  profiles: { [ROUTE]: succeed(resolvedOf(profileOf(ROUTE))) },
}

describe('the selected model', () => {
  test('a saved selection gives the resolved official profile and the evidence of the saving commit', async () => {
    const { value } = await withLiveRow(happy, async ({ select }) => select(selectInput))
    if ('failure' in value) throw new Error(`unexpected failure: ${JSON.stringify(value.failure)}`)
    const selected = value.ok
    expect(selected.recipient.route).toBe(ROUTE)
    expect(selected.recipient.profile).toEqual(profileOf(ROUTE).adoption)
    expect(selected.resolution.kind).toBe('resolved')
    expect(selected.resolution.selectable).toBe(true)
    expect(selected.resolution.profile.identity.route).toBe(ROUTE)
    expect(selected.parameters).toEqual(profileOf(ROUTE).definition.parameters)
    expect(selected.evidence).toEqual(SAVED_SOURCE)
  })

  test('the Session is read as a maintainer with exactly the principal, tenant and session', async () => {
    const { value } = await withLiveRow(happy, async ({ select, session }) => {
      await select(selectInput)
      return session.reads
    })
    expect(value).toHaveLength(1)
    expect(value[0]?.caller).toBe('maintainer')
    expect(value[0]?.access).toEqual({
      principal: sessionAccess.principal,
      tenant: sessionAccess.tenant,
      session: SESSION,
    })
  })

  test('the profile is asked for the saved route with the text modality and the history as source', async () => {
    const { value } = await withLiveRow(happy, async ({ select, profiles }) => {
      await select(selectInput)
      return profiles.resolves
    })
    expect(value).toEqual([
      {
        principal: sessionAccess.principal,
        tenant: sessionAccess.tenant,
        route: ROUTE,
        required: textRequirement,
      },
    ])
  })

  test('another call reads the saved selection again, so a switch shows at the next call', async () => {
    let saved = ROUTE
    const { value } = await withLiveRow(
      {
        session: () => succeed(savedSelection(saved)),
        profiles: {
          [ROUTE]: succeed(resolvedOf(profileOf(ROUTE))),
          'official-deep': succeed(resolvedOf(profileOf('official-deep'))),
        },
      },
      async ({ select }) => {
        const first = await select(selectInput)
        saved = 'official-deep'
        const second = await select(selectInput)
        return [first, second]
      },
    )
    const routes = value.map(outcome => ('ok' in outcome ? outcome.ok.recipient.route : 'failed'))
    expect(routes).toEqual([ROUTE, 'official-deep'])
  })
})

describe('the three failures differ', () => {
  async function failureFor(options: Parameters<typeof withLiveRow>[0]): Promise<Failure> {
    const { value } = await withLiveRow(options, async ({ select }) => select(selectInput))
    const failure = failureOf(value)
    if (failure === undefined) throw new Error('expected a failure')
    return failure
  }

  test('no selection saved: not-ready', async () => {
    const failure = await failureFor({
      session: () => fail({ kind: 'not-ready' }),
      profiles: { [ROUTE]: succeed(resolvedOf(profileOf(ROUTE))) },
    })
    expect(failure).toEqual({ kind: 'not-ready' })
  })

  test('the selection cannot be read: unavailable, owned by the session', async () => {
    const failure = await failureFor({
      session: () => fail({ kind: 'unavailable', owner: 'storage', diagnostic: 'down' }),
      profiles: { [ROUTE]: succeed(resolvedOf(profileOf(ROUTE))) },
    })
    expect(failure.kind).toBe('unavailable')
    expect(failure).toMatchObject({ owner: 'session' })
  })

  test('the profile cannot be resolved: unavailable, owned by the profiles', async () => {
    const failure = await failureFor({
      session: () => succeed(savedSelection(ROUTE)),
      profiles: { [ROUTE]: succeed({ kind: 'absent', reason: 'unknown-name' }) },
    })
    expect(failure.kind).toBe('unavailable')
    expect(failure).toMatchObject({ owner: 'modelProfiles' })
    expect(JSON.stringify(failure)).toContain('unknown-name')
  })

  test('the three results are pairwise different', async () => {
    const results = [
      await failureFor({ session: () => fail({ kind: 'not-ready' }), profiles: {} }),
      await failureFor({
        session: () => fail({ kind: 'unavailable', owner: 'storage', diagnostic: 'down' }),
        profiles: {},
      }),
      await failureFor({
        session: () => succeed(savedSelection(ROUTE)),
        profiles: { [ROUTE]: succeed({ kind: 'absent', reason: 'withdrawn' }) },
      }),
    ]
    expect(new Set(results.map(result => JSON.stringify(result))).size).toBe(3)
  })
})

describe('no other model is chosen', () => {
  /** A profile table that has a perfectly good default next to the route that fails. */
  const withDefault = (answer: ProfilesAnswer) => ({
    default: succeed(resolvedOf(profileOf('default'))),
    [ROUTE]: answer,
  })

  test.each([
    ['absent', succeed({ kind: 'absent', reason: 'excluded' } as const) as ProfilesAnswer],
    [
      'resolved but not selectable',
      succeed(
        resolvedOf(profileOf(ROUTE), { selectable: false, reasons: ['scope'] }),
      ) as ProfilesAnswer,
    ],
    [
      'unreadable profile source',
      fail({
        kind: 'unavailable',
        dependency: 'profiles',
        diagnostic: 'unreadable',
      } as const) as ProfilesAnswer,
    ],
  ])('a route that is %s fails and the default route is never asked', async (_name, answer) => {
    const { value } = await withLiveRow(
      { session: () => succeed(savedSelection(ROUTE)), profiles: withDefault(answer) },
      async ({ select, profiles }) => ({
        outcome: await select(selectInput),
        asked: profiles.resolves.map(input => (input as { route: string }).route),
      }),
    )
    expect(failureOf(value.outcome)).toMatchObject({ kind: 'unavailable', owner: 'modelProfiles' })
    expect('ok' in value.outcome).toBe(false)
    expect(value.asked).toEqual([ROUTE])
  })

  test('no saved selection fails without asking the profiles about any route', async () => {
    const { value } = await withLiveRow(
      {
        session: () => fail({ kind: 'not-ready' }),
        profiles: withDefault(succeed(resolvedOf(profileOf(ROUTE)))),
      },
      async ({ select, profiles }) => ({
        outcome: await select(selectInput),
        asked: profiles.resolves,
      }),
    )
    expect(failureOf(value.outcome)).toEqual({ kind: 'not-ready' })
    expect(value.asked).toEqual([])
  })

  test('a provider that answers with the profile of another route is refused', async () => {
    const { value } = await withLiveRow(
      {
        session: () => succeed(savedSelection(ROUTE)),
        profiles: async () => succeed(resolvedOf(profileOf('some-other-route'))),
      },
      async ({ select }) => select(selectInput),
    )
    expect(failureOf(value)).toMatchObject({ kind: 'unavailable', owner: 'modelProfiles' })
  })

  test('an extension alteration is not applied and not ignored', async () => {
    const { value } = await withLiveRow(happy, async ({ select, session }) => ({
      outcome: await select({ ...selectInput, alterations: [selectInput.scope] }),
      reads: session.reads.length,
    }))
    expect(failureOf(value.outcome)).toEqual({ kind: 'unsupported' })
    expect(value.reads).toBe(0)
  })
})

describe('other failures of the two providers', () => {
  test.each([
    [
      { kind: 'denied', action: 'readModelSelection' },
      { kind: 'denied', action: 'readModelSelection' },
    ],
    [
      { kind: 'invalid', field: 'session', reason: 'unknown' },
      { kind: 'invalid', field: 'session', reason: 'unknown' },
    ],
  ] as const)(
    'a Session %j reaches the Agent as the same refusal',
    async (sessionFailure, expected) => {
      const { value } = await withLiveRow(
        { session: () => fail(sessionFailure as never), profiles: {} },
        async ({ select }) => select(selectInput),
      )
      expect(failureOf(value)).toEqual(expected)
    },
  )

  test.each([
    { kind: 'conflict', operation: 'op' },
    { kind: 'commit-unknown', operation: 'op' },
    { kind: 'quarantined', diagnostic: 'gap' },
  ] as const)('a Session %j is unavailable, not a selection', async sessionFailure => {
    const { value } = await withLiveRow(
      { session: () => fail(sessionFailure as never), profiles: {} },
      async ({ select }) => select(selectInput),
    )
    expect(failureOf(value)).toMatchObject({ kind: 'unavailable', owner: 'session' })
  })

  test('a denial by the profiles reaches the Agent as a denial', async () => {
    const { value } = await withLiveRow(
      {
        session: () => succeed(savedSelection(ROUTE)),
        profiles: { [ROUTE]: fail({ kind: 'denied', action: 'resolve' }) },
      },
      async ({ select }) => select(selectInput),
    )
    expect(failureOf(value)).toEqual({ kind: 'denied', action: 'resolve' })
  })
})

describe('what the row depends on', () => {
  test('the manifest equals the `agent-model-selection` row of the table: only modelProfiles is injected', () => {
    const declaration = rowDeclarationOf(agentModelSelectionRow)
    expect(declaration).toBeDefined()
    expect(declaration?.manifest).toEqual({
      provides: ['agentModelSelection'],
      injects: ['modelProfiles'],
      sameProviderGroup: null,
      phase: null,
    })
    expect(declaration?.implementation).toBe('real')
    const table = serveProfile().stubManifests.get('agent-model-selection' as RowId)
    expect(declaration?.manifest.provides).toEqual(table?.provides)
    expect(declaration?.manifest.injects).toEqual(table?.injects)
  })

  test('a call touches only the work face of the Session, never settings or credential state', async () => {
    const { value } = await withLiveRow(happy, async ({ select, session }) => {
      await select(selectInput)
      return session.otherFaces
    })
    expect(value).toEqual([])
  })

  test('without the session service the row stays ACTIVE and each call is unavailable', async () => {
    const { value, run } = await withLiveRow(
      { session: null, profiles: { [ROUTE]: succeed(resolvedOf(profileOf(ROUTE))) } },
      async ({ select, profiles }) => ({
        outcome: await select(selectInput),
        asked: profiles.resolves,
      }),
    )
    expect(run.state('agent-model-selection')).toMatchObject({ state: 'ACTIVE' })
    expect(failureOf(value.outcome)).toMatchObject({ kind: 'unavailable', owner: 'session' })
    expect(value.asked).toEqual([])
  })

  test('without modelProfiles the row is PENDING and names the missing service', async () => {
    const run = await serveOnce({
      distribution: { rows: [{ id: 'agent-model-selection', plugin: 'selection', config: {} }] },
      plugins: { stubPlugin, selection: createAgentModelSelectionRow(sessionBinding) },
    })
    expect(run.state('agent-model-selection')).toMatchObject({
      state: 'PENDING',
      missing: ['modelProfiles'],
    })
  })

  test('the default bindings name no session: the call is unavailable before any read', async () => {
    const { value } = await withLiveRow(
      { ...happy, bindings: {} },
      async ({ select, session }) => ({
        outcome: await select(selectInput),
        reads: session.reads.length,
      }),
    )
    expect(failureOf(value.outcome)).toMatchObject({ kind: 'unavailable' })
    expect(value.reads).toBe(0)
  })
})

describe('what a failure may say', () => {
  test('no failure text carries the principal of the call', async () => {
    const { value: failure } = await withLiveRow(
      { session: () => fail({ kind: 'not-ready' }), profiles: {} },
      async ({ select }) => select(selectInput),
    )
    // The positive control: the search text is in the session read of a call that did read.
    const { value: read } = await withLiveRow(happy, async ({ select, session }) => {
      await select(selectInput)
      return JSON.stringify(session.reads)
    })
    expect(read).toContain('agent-principal')
    expect(JSON.stringify(failure)).not.toContain('agent-principal')
  })
})
