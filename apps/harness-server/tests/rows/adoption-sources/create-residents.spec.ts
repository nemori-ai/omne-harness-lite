// G-RESIDENTS (R2-D159): the resident tools of a `create`. The mapping entry names them (the
// `resident` Tool references of its definition); the adoption source plans them through Tool's
// binding registry with the first definitions of the trusted release, and puts the material into
// Session's initialization guard. Real rows and entry objects: the release snapshot, the registrant,
// `tool-bindings` and `tool-host` with the operator construction of the tests. The Session core
// (`decide`) then writes one admitted resident per tool, so the committed snapshot holds them.
//
// The authors are loaded by the release registrant before the creation: nothing in the release
// tree does that yet (only the registrant may register an official author; see the row page), so
// these cases state what `create` does once the tools are live, and what it does when they are not.
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { decide, type AdoptionEvidenceCommand } from '@omne-harness/session-contract'
import { encodeResidentKey } from '@omne-harness/tool-contract'
import { toolGenerationsKey, type ToolGenerations } from '@omne-harness/tool-cordis-contract/cordis'
import { AdoptionSourcesImpl } from '../../../src/rows/adoption-sources/sources.ts'
import { agentAdoptionsConfig } from '../../../src/rows/agent-adoptions/config.ts'
import { buildTable } from '../../../src/rows/agent-adoptions/table.ts'
import { toolBindingsRow } from '../../../src/rows/tool-bindings/index.ts'
import { createToolHostPlugin } from '../../../src/rows/tool-host/index.ts'
import { got } from '../../entry/support.ts'
import {
  access,
  createCommand,
  entryConfig,
  factsOf,
  mappingConfig,
} from '../adoptions/support.ts'
import {
  TEST_CONSTRUCTION,
  authorityOf,
  entryOf,
  releaseFixture,
  type ReleaseFixture,
} from '../tool-host/support.ts'

type Plain = Record<string, unknown>
type Create = Extract<AdoptionEvidenceCommand, { kind: 'create' }>

const toolRef = (name: string, resident = true) => ({
  capability: { category: 'Tool', name },
  resident,
})

/** A mapping entry whose definition names `references`. */
const withReferences = (name: string, references: readonly unknown[]) =>
  entryConfig(name, {
    definition: { category: 'AgentDefinition', name, references, attributes: [] },
  })

const CODING = withReferences('alpha', [toolRef('Files'), toolRef('Shell')])

const disposers: (() => Promise<unknown> | unknown)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
})

type Options = Readonly<{
  /** Which release authors the registrant loads before the creation. */
  loaded?: readonly string[]
  /** Leaves out `tool-bindings` and `tool-host`. */
  tools?: 'absent'
}>

/** The source of this row over `config`, on a root with the release and the tool rows. */
async function sourceOn(config: unknown, options: Options = {}) {
  const fixture: ReleaseFixture = await releaseFixture()
  if (options.tools !== 'absent') {
    const bindings = fixture.root.plugin(toolBindingsRow)
    await bindings
    disposers.push(() => bindings.dispose())
    const host = fixture.root.plugin(createToolHostPlugin(), { construction: TEST_CONSTRUCTION })
    await host
    disposers.push(() => host.dispose())
    const generations = got(
      fixture.root.get(toolGenerationsKey),
      'toolGenerations',
    ) as ToolGenerations<unknown, unknown, never>
    for (const name of options.loaded ?? ['Files', 'Shell']) {
      const loaded = await generations.ensureLoaded({
        authority: authorityOf(fixture.manifest, name),
        access: fixture.registrant,
      })
      expect(loaded).toMatchObject({ ok: { state: 'loaded' } })
    }
  }
  const table = await buildTable(agentAdoptionsConfig.parse(config))
  let source: AdoptionSourcesImpl | undefined
  await fixture.root.plugin({
    name: 'adoption-source-probe',
    apply(ctx: Context) {
      source = new AdoptionSourcesImpl(ctx, table.mappings)
    },
  })
  return { fixture, source: got(source, 'adoption source'), table }
}

const prepare = (source: AdoptionSourcesImpl, command: Create) => source.prepare(command, access)

/** The initial adoption of the one guard of a successful preparation. */
function initialOf(outcome: Awaited<ReturnType<AdoptionSourcesImpl['prepare']>>): Plain {
  if (!('ok' in outcome)) throw new Error(`expected material: ${JSON.stringify(outcome)}`)
  return factsOf(outcome.ok[0]!)['initialAdoption'] as Plain
}

/** J06's projection of one resident into a binding (session-adapters `conditions.ts`). */
const bindingOf = (resident: Plain) => {
  const admitted = resident['admitted'] as Plain
  return {
    owner: admitted['owner'],
    name: resident['capability'],
    revision: resident['version'],
    digest: admitted['digest'],
  }
}

describe('a mapping that names resident tools', () => {
  it('gives each named tool as a new resident and a binding key, in the order of the definition; the bindings are the release asset adoptions', async () => {
    const { fixture, source } = await sourceOn(mappingConfig(CODING))
    const initial = initialOf(await prepare(source, createCommand('alpha')))
    const residents = initial['newResidents'] as Plain[]
    expect(residents.map(item => item['capability'])).toEqual(['Files', 'Shell'])
    for (const name of ['Files', 'Shell']) {
      const resident = residents.find(item => item['capability'] === name)!
      const { asset } = entryOf(fixture.manifest, name)
      expect(bindingOf(resident)).toEqual(asset.adoption)
      expect(resident['admitted']).toMatchObject({ record: `tool-release.json#${name}/asset` })
    }
    const keys = initial['residentBindings'] as Plain[]
    expect(keys).toEqual(
      ['Files', 'Shell'].map(name => {
        const encoded = encodeResidentKey({
          layer: { kind: 'official' },
          asset: entryOf(fixture.manifest, name).asset,
        })
        if (!('ok' in encoded)) throw new Error('unencodable')
        return { capability: name, key: encoded.ok }
      }),
    )
  })

  it('Session accepts the guard and writes one admitted resident per tool', async () => {
    const { source } = await sourceOn(mappingConfig(CODING))
    const command = createCommand('alpha')
    const outcome = await prepare(source, command)
    if (!('ok' in outcome)) throw new Error(JSON.stringify(outcome))
    const decision = decide(null, command, outcome.ok, null, { compaction: null })
    expect(decision.kind).toBe('entries')
    if (decision.kind !== 'entries') return
    expect(
      decision.entries.filter(entry => entry.kind === 'session.tool-resident-admitted'),
    ).toHaveLength(2)
  })

  it('a tool the release does not hold fails the creation with a diagnostic; no resident is left out', async () => {
    const config = mappingConfig(
      withReferences('alpha', [toolRef('Files'), toolRef('Browser'), toolRef('Shell')]),
    )
    const { source } = await sourceOn(config)
    expect(await prepare(source, createCommand('alpha'))).toEqual({
      failure: {
        kind: 'unavailable',
        owner: '@omne-harness/harness-server',
        diagnostic: 'resident tools: Browser is not a tool of the trusted release',
      },
    })
  })

  it('a named tool that is not live fails the creation: a session access cannot load an official author', async () => {
    const { source } = await sourceOn(mappingConfig(CODING), { loaded: ['Files'] })
    expect(await prepare(source, createCommand('alpha'))).toMatchObject({
      failure: {
        kind: 'unavailable',
        diagnostic: expect.stringContaining('Files, Shell could not be planned'),
      },
    })
  })

  it('an absent binding registry fails the creation with a diagnostic', async () => {
    const { source } = await sourceOn(mappingConfig(CODING), { tools: 'absent' })
    expect(await prepare(source, createCommand('alpha'))).toEqual({
      failure: {
        kind: 'unavailable',
        owner: '@omne-harness/harness-server',
        diagnostic: 'resident tools: the tool binding registry (toolBindings) is absent',
      },
    })
  })

  it('a create without an access fails the creation, it does not plan for nobody', async () => {
    const { source } = await sourceOn(mappingConfig(CODING))
    expect(await source.prepare(createCommand('alpha'))).toMatchObject({
      failure: {
        kind: 'unavailable',
        diagnostic: 'resident tools: the create carries no access to plan them with',
      },
    })
  })
})

describe('what a creation itself declares', () => {
  it('a declared resident that the mapping does not name is invalid, even when the mapping names others', async () => {
    const { source } = await sourceOn(mappingConfig(CODING))
    const command = createCommand('alpha', {
      residentAdoption: { residents: [], keys: [{ capability: 'Browser', key: 'k' as never }] },
    })
    expect(await prepare(source, command)).toMatchObject({
      failure: { kind: 'invalid', field: 'residentAdoption' },
    })
  })

  it('a declaration within the mapping is not refused by the source; Session compares it with the guard', async () => {
    const { source } = await sourceOn(mappingConfig(CODING))
    const planned = initialOf(await prepare(source, createCommand('alpha')))
    const command = createCommand('alpha', {
      residentAdoption: {
        residents: planned['newResidents'] as never,
        keys: planned['residentBindings'] as never,
      },
    })
    const outcome = await prepare(source, command)
    if (!('ok' in outcome)) throw new Error(JSON.stringify(outcome))
    expect(decide(null, command, outcome.ok, null, { compaction: null }).kind).toBe('entries')
  })
})

describe('a mapping that names no resident tool', () => {
  it('gives no residents and reads no Tool service: the tree has no tool rows at all', async () => {
    const { source } = await sourceOn(mappingConfig(entryConfig('alpha')), { tools: 'absent' })
    const initial = initialOf(await prepare(source, createCommand('alpha')))
    expect(initial['newResidents']).toEqual([])
    expect(initial['residentBindings']).toEqual([])
  })

  it('references that are not resident name no resident', async () => {
    const config = mappingConfig(withReferences('alpha', [toolRef('Files', false)]))
    const { source, table } = await sourceOn(config, { tools: 'absent' })
    expect(table.mappings.byName('alpha')?.residentCapabilities).toBeUndefined()
    expect(initialOf(await prepare(source, createCommand('alpha')))['newResidents']).toEqual([])
  })
})

describe('the mapping table', () => {
  it('copies the resident Tool references of the definition into the entry, in order', async () => {
    const table = await buildTable(agentAdoptionsConfig.parse(mappingConfig(CODING)))
    expect(table.mappings.byName('alpha')?.residentCapabilities).toEqual(['Files', 'Shell'])
  })

  it('refuses a resident reference that is not a tool', async () => {
    const config = mappingConfig(
      withReferences('alpha', [{ capability: { category: 'Skill', name: 'x' }, resident: true }]),
    )
    await expect(buildTable(agentAdoptionsConfig.parse(config))).rejects.toThrow(
      'mappings.0.definition.references.0: a resident reference must name a Tool',
    )
  })
})
