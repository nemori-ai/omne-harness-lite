// Adoption planner: the registry reads and loader calls that decide which capability material is
// built. Each case fixes one observable consequence, so that a planner which reads the wrong
// entries, loads when it must not, or loads for the wrong capability, is distinguishable.
import { describe, expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { SessionId } from '@omne-harness/session-contract'
import { residentToolFacts } from '@omne-harness/tool-contract'
import type { ToolAuthority, ToolBindingEntry } from '@omne-harness/tool-contract/provider'
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
  const options = {
    readBindings: () => ({ snapshot: fixture.registry.snapshot }),
    readGenerations: () => scripted.generations,
    definitionFor: (capability: string) =>
      capability === fixture.authority.asset.name ? definition : undefined,
  } satisfies AdoptionPlannerOptions<string>
  const capability = facts.ok.capability
  const expectedMaterial = succeed({
    material: {
      residents: [
        {
          capability,
          version: definition.version,
          admitted: definition.admitted,
          shape: facts.ok.shape,
        },
      ],
      keys: [{ capability, key: facts.ok.key }],
    },
    verdict: null,
  })
  return {
    fixture,
    access,
    scripted,
    definition,
    loaded,
    recorded: facts.ok,
    capability,
    options,
    expectedMaterial,
  }
}
type Setup = ReturnType<typeof setup>

/** A binding entry as the registry would list it, for registrations the memory registry refuses. */
function entryOf(
  f: Setup,
  authority: ToolAuthority,
  state: ToolBindingEntry['state'],
  ordinal: string,
): ToolBindingEntry {
  const loaded = f.fixture.loaded(authority, `sha256:${ordinal}`)
  return {
    key: loaded.key,
    ordinal,
    digest: `sha256:${ordinal}`,
    shape: loaded.shape,
    state,
    fiber: 'f',
  }
}
const renamed = (authority: ToolAuthority, name: string): ToolAuthority => ({
  ...authority,
  asset: { ...authority.asset, name, adoption: { ...authority.asset.adoption, name } },
})
const withBindings = (f: Setup, entries: readonly ToolBindingEntry[]) =>
  ({
    ...f.options,
    readBindings: () => ({ snapshot: () => succeed(entries) }),
  }) as unknown as AdoptionPlannerOptions<string>

/**
 * The registry lists nothing until the loader runs. The loader then makes it list `after` and
 * answers with `result`. `snapshot` counts every read.
 */
function loaderThatLists(
  f: Setup,
  after: readonly ToolBindingEntry[],
  result: ReturnType<typeof succeed> | ReturnType<typeof fail>,
) {
  let current: readonly ToolBindingEntry[] = []
  const snapshot = vi.fn(() => succeed(current))
  const ensureLoaded = vi.fn(async () => {
    current = after
    return result
  })
  const options = {
    ...f.options,
    readBindings: () => ({ snapshot }),
    readGenerations: () => ({ ensureLoaded }),
  } as unknown as AdoptionPlannerOptions<string>
  return { options, snapshot, ensureLoaded }
}
const loadedOk = succeed({ key: undefined, state: 'loaded' })

describe('adoption planner: failed registry reads', () => {
  it('fails the whole request when the first snapshot fails, even if nothing was asked', async () => {
    const f = setup()
    const snapshot = vi.fn(() => fail({ kind: 'unavailable', diagnostic: 'read failed' }))
    const planner = createAdoptionPlanner({
      ...f.options,
      readBindings: () => ({ snapshot }),
    } as unknown as AdoptionPlannerOptions<string>)
    expect(await planner.plan(f.access, { recorded: [], capabilities: [] })).toEqual(
      fail({ kind: 'unavailable' }),
    )
    expect(snapshot).toHaveBeenCalledExactlyOnceWith(f.access)
    expect(f.scripted.calls).toEqual([])
  })
})

describe('adoption planner: a capability that was not recorded', () => {
  it('uses the live registration it finds and does not call the loader', async () => {
    const f = setup()
    f.fixture.registry.register({
      ...f.access,
      authority: f.definition.authority,
      loaded: f.loaded,
    })
    expect(
      await createAdoptionPlanner(f.options).plan(f.access, {
        recorded: [],
        capabilities: [f.capability],
      }),
    ).toEqual(f.expectedMaterial)
    expect(f.scripted.calls).toEqual([])
  })

  it('ignores the live registrations of other capabilities when it counts its own', async () => {
    const f = setup()
    const own = entryOf(f, f.fixture.authority, 'live', '1')
    const other = entryOf(f, renamed(f.fixture.authority, 'other_tool'), 'live', '2')
    const planner = createAdoptionPlanner(withBindings(f, [other, own]))
    expect(await planner.plan(f.access, { recorded: [], capabilities: [f.capability] })).toEqual(
      f.expectedMaterial,
    )
    expect(f.scripted.calls).toEqual([])
  })

  it('counts only live versions among those it finds before any load', async () => {
    const f = setup()
    const other = f.fixture.otherAuthority
    if (other === undefined) throw new Error('fixture has another version')
    const planner = createAdoptionPlanner(
      withBindings(f, [
        entryOf(f, other, 'draining', '2'),
        entryOf(f, f.fixture.authority, 'live', '1'),
      ]),
    )
    expect(await planner.plan(f.access, { recorded: [], capabilities: [f.capability] })).toEqual(
      f.expectedMaterial,
    )
    expect(f.scripted.calls).toEqual([])
  })

  it('matches each recorded capability with its own record', async () => {
    const f = setup()
    const otherAuthority = renamed(f.fixture.authority, 'other_tool')
    const otherEntry = entryOf(f, otherAuthority, 'live', '2')
    const otherFacts = residentToolFacts(otherEntry.key, otherEntry.shape)
    if ('failure' in otherFacts) throw new Error('fixture facts failed')
    const planner = createAdoptionPlanner({
      ...withBindings(f, [entryOf(f, f.fixture.authority, 'live', '1'), otherEntry]),
      definitionFor: () => undefined,
    })
    expect(
      await planner.plan(f.access, { recorded: [otherFacts.ok, f.recorded], capabilities: [] }),
    ).toEqual(
      succeed({
        material: {
          residents: [],
          keys: [
            { capability: 'other_tool', key: otherFacts.ok.key },
            { capability: f.capability, key: f.recorded.key },
          ],
        },
        verdict: null,
      }),
    )
  })

  it('does not call the loader for a definition that belongs to another capability', async () => {
    const f = setup()
    f.scripted.answer(f.loaded.key, succeed({ key: f.loaded.key, state: 'loaded' }), f.loaded)
    const wrong = { ...f.definition, authority: renamed(f.definition.authority, 'other_tool') }
    expect(
      await createAdoptionPlanner({ ...f.options, definitionFor: () => wrong }).plan(f.access, {
        recorded: [],
        capabilities: [f.capability],
      }),
    ).toEqual(fail({ kind: 'unavailable' }))
    expect(f.scripted.calls).toEqual([])
  })

  it('does not call the loader without a definition', async () => {
    const f = setup()
    f.scripted.answer(f.loaded.key, succeed({ key: f.loaded.key, state: 'loaded' }), f.loaded)
    expect(
      await createAdoptionPlanner({ ...f.options, definitionFor: () => undefined }).plan(f.access, {
        recorded: [],
        capabilities: [f.capability],
      }),
    ).toEqual(fail({ kind: 'unavailable' }))
    expect(f.scripted.calls).toEqual([])
  })

  it('stays unavailable when the loader fails, even if the registry then lists a live version', async () => {
    const f = setup()
    const own = entryOf(f, f.fixture.authority, 'live', '1')
    const failed = loaderThatLists(
      f,
      [own],
      fail({ kind: 'unavailable', diagnostic: 'load failed' }),
    )
    expect(
      await createAdoptionPlanner(failed.options).plan(f.access, {
        recorded: [],
        capabilities: [f.capability],
      }),
    ).toEqual(fail({ kind: 'unavailable' }))
    expect(failed.ensureLoaded).toHaveBeenCalledTimes(1)
    expect(failed.snapshot).toHaveBeenCalledTimes(1)
  })
})

describe('adoption planner: the registry read after a load', () => {
  const run = async (f: Setup, after: readonly ToolBindingEntry[]) => {
    const flip = loaderThatLists(f, after, loadedOk)
    const answer = await createAdoptionPlanner(flip.options).plan(f.access, {
      recorded: [],
      capabilities: [f.capability],
    })
    expect(flip.ensureLoaded).toHaveBeenCalledTimes(1)
    expect(flip.snapshot).toHaveBeenCalledTimes(2)
    return answer
  }

  it('adopts the one live version', async () => {
    const f = setup()
    expect(await run(f, [entryOf(f, f.fixture.authority, 'live', '1')])).toEqual(f.expectedMaterial)
  })

  it('rejects two live versions of the capability', async () => {
    const f = setup()
    const other = f.fixture.otherAuthority
    if (other === undefined) throw new Error('fixture has another version')
    expect(
      await run(f, [entryOf(f, f.fixture.authority, 'live', '1'), entryOf(f, other, 'live', '2')]),
    ).toEqual(fail({ kind: 'unavailable' }))
  })

  it('rejects a registration that is listed but not live', async () => {
    const f = setup()
    expect(await run(f, [entryOf(f, f.fixture.authority, 'draining', '1')])).toEqual(
      fail({ kind: 'unavailable' }),
    )
  })

  it('counts only live versions: a draining one beside the live one does not matter', async () => {
    const f = setup()
    const other = f.fixture.otherAuthority
    if (other === undefined) throw new Error('fixture has another version')
    expect(
      await run(f, [
        entryOf(f, other, 'draining', '2'),
        entryOf(f, f.fixture.authority, 'live', '1'),
      ]),
    ).toEqual(f.expectedMaterial)
  })

  it('ignores the live versions of other capabilities', async () => {
    const f = setup()
    expect(
      await run(f, [
        entryOf(f, renamed(f.fixture.authority, 'other_tool'), 'live', '2'),
        entryOf(f, f.fixture.authority, 'live', '1'),
      ]),
    ).toEqual(f.expectedMaterial)
  })

  it('rejects a live version whose shape is named for another capability', async () => {
    const f = setup()
    const live = entryOf(f, f.fixture.authority, 'live', '1')
    expect(await run(f, [{ ...live, shape: { ...live.shape, name: 'other_tool' } }])).toEqual(
      fail({ kind: 'unavailable' }),
    )
  })
})

describe('adoption planner: a recorded shape that Tool does not read back for the capability', () => {
  const emptyRegistry = (f: Setup) => createAdoptionPlanner(withBindings(f, []))

  it('keeps the recorded key for a readable shape of the capability (control)', async () => {
    const f = setup()
    expect(
      await emptyRegistry(f).plan(f.access, { recorded: [f.recorded], capabilities: [] }),
    ).toEqual(
      succeed({
        material: { residents: [], keys: [{ capability: f.capability, key: f.recorded.key }] },
        verdict: null,
      }),
    )
  })

  it('rejects a recorded shape that is named for another capability', async () => {
    const f = setup()
    // The recorded shape is a JSON value; its  member is the one Tool reads back.
    const shape = f.recorded.shape as unknown as {
      entries: { key: string; value: unknown }[]
    }
    const named = {
      ...shape,
      entries: shape.entries.map(entry =>
        entry.key === 'name'
          ? { key: 'name', value: { kind: 'string', value: 'other_tool' } }
          : entry,
      ),
    }
    const recorded = { ...f.recorded, shape: named } as unknown as typeof f.recorded
    expect(
      await emptyRegistry(f).plan(f.access, { recorded: [recorded], capabilities: [] }),
    ).toEqual(fail({ kind: 'unavailable' }))
  })

  it('rejects a recorded shape that the projection refuses, even with nothing live to compare', async () => {
    const f = setup()
    const recorded = { ...f.recorded, shape: { kind: 'null' as const } }
    expect(
      await emptyRegistry(f).plan(f.access, { recorded: [recorded], capabilities: [] }),
    ).toEqual(fail({ kind: 'unavailable' }))
  })
})

describe('adoption planner: keys that cannot be encoded', () => {
  it('rejects an advance to a live version whose key has no resident encoding', async () => {
    const f = setup()
    const live = entryOf(f, f.fixture.authority, 'live', '1')
    const unencodable = {
      ...live,
      key: {
        ...live.key,
        asset: {
          ...live.key.asset,
          adoption: { ...live.key.asset.adoption, digest: '' },
        },
      },
    }
    expect(
      await createAdoptionPlanner(withBindings(f, [unencodable])).plan(f.access, {
        recorded: [f.recorded],
        capabilities: [],
      }),
    ).toEqual(fail({ kind: 'unavailable' }))
  })
})
