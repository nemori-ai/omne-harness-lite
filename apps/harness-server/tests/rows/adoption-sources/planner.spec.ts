import { describe, expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { SessionId } from '@omne-harness/session-contract'
import { residentToolFacts } from '@omne-harness/tool-contract'
import {
  createScriptedToolGenerations,
  memoryToolBindingRegistryFixture,
} from '@omne-harness/tool-cordis-contract/testing'
import {
  createAdoptionPlanner,
  type AdoptionPlannerOptions,
} from '../../../src/rows/adoption-sources/planner.ts'

function setup() {
  const fixture = memoryToolBindingRegistryFixture()
  const access = { ...fixture.access, session: 'session-a' as SessionId }
  const scripted = createScriptedToolGenerations({ registry: fixture.registry })
  const definition = {
    authority: fixture.authority,
    version: 'definition-v1',
    admitted: { owner: 'fixture', record: 'admitted', revision: '1', digest: 'sha256:admitted' },
  }
  const loaded = fixture.loaded(fixture.authority, 'sha256:first')
  const facts = residentToolFacts(loaded.key, loaded.shape)
  if ('failure' in facts) throw new Error('fixture facts failed')
  const snapshot = vi.fn(fixture.registry.snapshot)
  const options = {
    readBindings: () => ({ snapshot }),
    readGenerations: () => scripted.generations,
    definitionFor: (capability: string) =>
      capability === fixture.authority.asset.name ? definition : undefined,
  }
  return { fixture, access, scripted, definition, loaded, recorded: facts.ok, snapshot, options }
}

describe('adoption planner over the RD-COORD memory registry', () => {
  it.each(['readBindings', 'definitionFor', 'readGenerations', 'ensureLoaded'] as const)(
    'returns unavailable when %s throws or rejects',
    async source => {
      const f = setup()
      const throwing = () => {
        throw new Error('dependency unavailable')
      }
      const options: AdoptionPlannerOptions<string> = {
        ...f.options,
        ...(source === 'readBindings' ? { readBindings: throwing } : {}),
        ...(source === 'definitionFor' ? { definitionFor: throwing } : {}),
        ...(source === 'readGenerations' ? { readGenerations: throwing } : {}),
        ...(source === 'ensureLoaded'
          ? { readGenerations: () => ({ ensureLoaded: async () => throwing() }) }
          : {}),
      }
      await expect(
        createAdoptionPlanner(options).plan(f.access, {
          recorded: [],
          capabilities: [f.recorded.capability],
        }),
      ).resolves.toEqual(fail({ kind: 'unavailable' }))
    },
  )

  it('loads a new capability and reads its registration again with the original access', async () => {
    const f = setup()
    const snapshot = f.snapshot
    f.scripted.answer(f.loaded.key, succeed({ key: f.loaded.key, state: 'loaded' }), f.loaded)
    const answer = await createAdoptionPlanner(f.options).plan(f.access, {
      recorded: [],
      capabilities: [f.recorded.capability],
    })
    expect(answer).toEqual(
      succeed({
        material: {
          residents: [
            {
              capability: f.recorded.capability,
              version: f.definition.version,
              admitted: f.definition.admitted,
              shape: f.recorded.shape,
            },
          ],
          keys: [{ capability: f.recorded.capability, key: f.recorded.key }],
        },
        verdict: null,
      }),
    )
    expect(snapshot.mock.calls).toEqual([[f.access], [f.access]])
    expect(snapshot.mock.calls.every(([access]) => access === f.access)).toBe(true)
    expect(f.scripted.calls).toHaveLength(1)
    expect(f.scripted.calls[0]?.access).toBe(f.access)
    expect(f.scripted.calls[0]?.authority).toBe(f.definition.authority)
  })

  it('fails the whole request when the binding registry is absent', async () => {
    const f = setup()
    expect(
      await createAdoptionPlanner({ ...f.options, readBindings: () => undefined }).plan(f.access, {
        recorded: [],
        capabilities: [],
      }),
    ).toEqual(fail({ kind: 'unavailable' }))
    expect(f.scripted.calls).toEqual([])
  })

  it('fails closed on a failed snapshot without loading or inventing a verdict', async () => {
    const f = setup()
    f.snapshot.mockReturnValue(fail({ kind: 'unavailable', diagnostic: 'read failed' }))
    expect(
      await createAdoptionPlanner(f.options).plan(f.access, {
        recorded: [f.recorded],
        capabilities: [],
      }),
    ).toEqual(fail({ kind: 'unavailable' }))
    expect(f.scripted.calls).toEqual([])
  })

  it('requires trusted definition evidence for the new capability', async () => {
    const f = setup()
    f.fixture.registry.register({
      ...f.access,
      authority: f.definition.authority,
      loaded: f.loaded,
    })
    for (const definitionFor of [
      () => undefined,
      () => ({
        ...f.definition,
        authority: {
          ...f.definition.authority,
          asset: {
            ...f.definition.authority.asset,
            name: 'wrong-capability',
          },
        },
      }),
    ]) {
      expect(
        await createAdoptionPlanner({ ...f.options, definitionFor }).plan(f.access, {
          recorded: [],
          capabilities: [f.recorded.capability],
        }),
      ).toEqual(fail({ kind: 'unavailable' }))
    }
    expect(f.scripted.calls).toEqual([])
  })

  it('rejects multiple live versions instead of selecting the largest ordinal', async () => {
    const f = setup()
    const other = f.fixture.otherAuthority
    if (other === undefined) throw new Error('fixture has another version')
    for (const authority of [f.fixture.authority, other]) {
      f.fixture.registry.register({
        ...f.access,
        authority,
        loaded: f.fixture.loaded(authority, 'x'),
      })
    }
    expect(
      await createAdoptionPlanner(f.options).plan(f.access, {
        recorded: [f.recorded],
        capabilities: [],
      }),
    ).toEqual(fail({ kind: 'unavailable' }))
    expect(f.scripted.calls).toEqual([])
  })

  it('advances to the only live same-shape version and preserves the first definition', async () => {
    const f = setup()
    const other = f.fixture.otherAuthority
    if (other === undefined) throw new Error('fixture has another version')
    const loaded = f.fixture.loaded(other, 'x')
    const facts = residentToolFacts(loaded.key, loaded.shape)
    if ('failure' in facts) throw new Error('fixture facts failed')
    f.fixture.registry.register({ ...f.access, authority: other, loaded })
    expect(
      await createAdoptionPlanner(f.options).plan(f.access, {
        recorded: [f.recorded],
        capabilities: [f.recorded.capability, f.recorded.capability],
      }),
    ).toEqual(
      succeed({
        material: {
          residents: [],
          keys: [{ capability: f.recorded.capability, key: facts.ok.key }],
        },
        verdict: null,
      }),
    )
    expect(f.scripted.calls).toEqual([])
  })

  it('preserves the recorded key for a draining replacement without reloading', async () => {
    const f = setup()
    f.fixture.registry.register({
      ...f.access,
      authority: f.definition.authority,
      loaded: f.loaded,
    })
    f.fixture.registry.close(f.loaded.key)
    expect(
      await createAdoptionPlanner(f.options).plan(f.access, {
        recorded: [f.recorded],
        capabilities: [],
      }),
    ).toEqual(
      succeed({
        material: {
          residents: [],
          keys: [{ capability: f.recorded.capability, key: f.recorded.key }],
        },
        verdict: null,
      }),
    )
    expect(f.scripted.calls).toEqual([])
  })

  it('preserves a trusted recorded key when the readable registry is empty', async () => {
    const f = setup()
    expect(
      await createAdoptionPlanner(f.options).plan(f.access, {
        recorded: [f.recorded],
        capabilities: [],
      }),
    ).toEqual(
      succeed({
        material: {
          residents: [],
          keys: [{ capability: f.recorded.capability, key: f.recorded.key }],
        },
        verdict: null,
      }),
    )
    expect(f.snapshot).toHaveBeenCalledExactlyOnceWith(f.access)
    expect(f.scripted.calls).toEqual([])
  })

  it('rejects an empty registry when the trusted definition cannot recover the recorded key', async () => {
    const f = setup()
    const other = f.fixture.otherAuthority
    if (other === undefined) throw new Error('fixture has another version')
    for (const definitionFor of [() => undefined, () => ({ ...f.definition, authority: other })]) {
      expect(
        await createAdoptionPlanner({ ...f.options, definitionFor }).plan(f.access, {
          recorded: [f.recorded],
          capabilities: [],
        }),
      ).toEqual(fail({ kind: 'unavailable' }))
    }
    expect(f.scripted.calls).toEqual([])
  })

  it('does not reconstruct unknown recorded keys and shapes', async () => {
    const f = setup()
    const planner = createAdoptionPlanner(f.options)
    f.fixture.registry.register({
      ...f.access,
      authority: f.definition.authority,
      loaded: f.loaded,
    })
    for (const recorded of [
      { ...f.recorded, key: 'unknown-key' },
      { ...f.recorded, shape: { kind: 'null' as const } },
    ]) {
      expect(await planner.plan(f.access, { recorded: [recorded], capabilities: [] })).toEqual(
        fail({ kind: 'unavailable' }),
      )
    }
    expect(f.scripted.calls).toEqual([])
  })

  it('fails the whole request when a later capability is unavailable', async () => {
    const f = setup()
    f.fixture.registry.register({
      ...f.access,
      authority: f.definition.authority,
      loaded: f.loaded,
    })
    expect(
      await createAdoptionPlanner(f.options).plan(f.access, {
        recorded: [],
        capabilities: [f.recorded.capability, 'missing'],
      }),
    ).toEqual(fail({ kind: 'unavailable' }))
  })

  it('keeps the requested capability list fixed across the load await', async () => {
    const f = setup()
    const input = { recorded: [], capabilities: [f.recorded.capability, 'missing'] }
    f.scripted.answer(f.loaded.key, succeed({ key: f.loaded.key, state: 'loaded' }), f.loaded)
    const pending = createAdoptionPlanner(f.options).plan(f.access, input)
    input.capabilities.pop()
    expect(await pending).toEqual(fail({ kind: 'unavailable' }))
  })

  it('reads the current registry after recognized and fails if that service was removed', async () => {
    const f = setup()
    f.scripted.answer(f.loaded.key, succeed({ key: f.loaded.key, state: 'recognized' }))
    const readBindings = vi
      .fn<AdoptionPlannerOptions<string>['readBindings']>(f.options.readBindings)
      .mockReturnValueOnce({ snapshot: f.snapshot })
    readBindings.mockReturnValueOnce({
      snapshot: () =>
        succeed([
          {
            key: f.loaded.key,
            ordinal: '1',
            digest: 'x',
            shape: f.loaded.shape,
            state: 'live',
            fiber: 'replacement',
          },
        ]),
    })
    expect(
      await createAdoptionPlanner({ ...f.options, readBindings }).plan(f.access, {
        recorded: [],
        capabilities: [f.recorded.capability],
      }),
    ).toHaveProperty('ok')
    const removed = createAdoptionPlanner({
      ...f.options,
      readBindings: vi
        .fn()
        .mockReturnValueOnce({ snapshot: f.snapshot })
        .mockReturnValue(undefined),
    })
    expect(
      await removed.plan(f.access, { recorded: [], capabilities: [f.recorded.capability] }),
    ).toEqual(fail({ kind: 'unavailable' }))
  })

  it('requires an available loader and a unique registration after its successful answer', async () => {
    const f = setup()
    const input = { recorded: [], capabilities: [f.recorded.capability] }
    expect(
      await createAdoptionPlanner({ ...f.options, readGenerations: () => undefined }).plan(
        f.access,
        input,
      ),
    ).toEqual(fail({ kind: 'unavailable' }))
    expect(await createAdoptionPlanner(f.options).plan(f.access, input)).toEqual(
      fail({ kind: 'unavailable' }),
    )
    f.scripted.answer(f.loaded.key, succeed({ key: f.loaded.key, state: 'recognized' }))
    expect(await createAdoptionPlanner(f.options).plan(f.access, input)).toEqual(
      fail({ kind: 'unavailable' }),
    )
  })
})
