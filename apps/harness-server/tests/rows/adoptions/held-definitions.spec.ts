import {
  capabilityId,
  readBodyText,
  type AssetLayerSource,
  type Candidate,
  type JsonValue,
  type LayerInput,
} from '@omne-harness/assets'
import { access, type TenantId } from '@omne-harness/legal-identity'
import { describe, expect, it } from 'vitest'
import { agentAdoptionsConfig } from '../../../src/rows/agent-adoptions/config.ts'
import type {
  DefinitionAsker,
  DefinitionLookup,
} from '../../../src/rows/agent-adoptions/definition-mappings.ts'
import {
  createDefinitionReading,
  HELD_DEFINITION_OWNER,
} from '../../../src/rows/agent-adoptions/held-definitions.ts'
import { buildTable } from '../../../src/rows/agent-adoptions/table.ts'
import type { AssetLayers } from '../../../src/rows/tenant-assets/layers.ts'
import { fixtureTenant } from '../../entry/support.ts'
import { adoptionOf, entryConfig, environment, mappingConfig } from './support.ts'

const alpha = fixtureTenant('a')
const beta = fixtureTenant('b')

const CUSTOM = {
  execution: adoptionOf('custom-agent', 'generic'),
  entryContract: adoptionOf('custom-entry', 'chat'),
  requiredIdentities: [],
  modes: { permission: 'auto_permission', environment, collaboration: 'co-work' },
  initialModelSelection: {
    name: 'custom/model',
    basis: { owner: 'test', record: 'custom', revision: '1', digest: 'sha256:custom' },
  },
} as const

const LIMITS = {
  maxBytes: 100_000,
  maxDepth: 20,
  maxItems: 1000,
  maxMembers: 80,
  maxStringLength: 20_000,
  maxNumberLength: 100,
}

function bodyOf(value: object): JsonValue {
  const read = readBodyText(JSON.stringify(value), LIMITS)
  if (read.kind !== 'ok') throw new Error(read.kind)
  return read.value
}

const REVIEWER = {
  name: 'reviewer',
  type: 'non-master',
  summary: 'Reviews one file.',
  references: [
    { capability: { category: 'tool', name: 'Files' }, resident: true },
    { capability: { category: 'tool', name: 'wordcount' } },
    { capability: { category: 'skill', name: 'review' }, resident: true },
  ],
  attributes: [],
  instructions: [{ id: 'instructions', text: 'You review code.' }],
  manifest: { entries: [{ path: 'AGENT.md', bytes: 10, digest: 'sha256:file' }] },
}

type Held = Readonly<{
  layer: 'tenant' | 'workspace'
  name: string
  asset: string
  version: string
  body?: object
  disabled?: boolean
  within?: string
}>

type World = Readonly<{
  held?: Readonly<Record<string, readonly Held[]>>
  /** Layers that cannot be read, by tenant label. */
  unread?: Readonly<Record<string, 'tenant' | 'workspace' | 'assets'>>
  custom?: false
}>

const labelOf = (tenant: TenantId) => (tenant === alpha ? 'alpha' : 'beta')

function layersOf(world: World, asker: DefinitionAsker): AssetLayers | undefined {
  const label = labelOf(asker.tenant)
  const down = world.unread?.[label]
  if (down === 'assets') return undefined
  const mine = (world.held?.[label] ?? []).filter(
    held => held.layer === 'tenant' || asker.turn !== undefined,
  )
  const candidateOf = (held: Held): Candidate => ({
    asset: held.asset,
    version: held.version,
    disabled: held.disabled === true,
    immutable: false,
    replaceLocked: false,
    ...(held.within === undefined ? {} : { within: held.within }),
  })
  const source = (layer: 'tenant' | 'workspace'): AssetLayerSource => ({
    layer,
    list: async () => ({ layer, state: 'not-applicable' }),
    async candidates(capability): Promise<LayerInput> {
      if (down === layer) return { layer, state: 'unavailable' }
      const candidates = mine
        .filter(held => held.layer === layer && held.name === capability.name)
        .map(candidateOf)
      return { layer, state: 'read', candidates }
    },
  })
  return {
    sources:
      asker.turn === undefined ? [source('tenant')] : [source('tenant'), source('workspace')],
    async body(candidate) {
      const held = mine.find(
        each => each.asset === candidate.asset && each.version === candidate.version,
      )
      return held?.body === undefined ? undefined : bodyOf(held.body)
    },
    readerOf: () => {
      throw new Error('not read')
    },
  }
}

async function readingOf(world: World) {
  const config = agentAdoptionsConfig.parse({
    ...mappingConfig(entryConfig('alpha'), entryConfig('beta')),
    ...(world.custom === false ? {} : { custom: CUSTOM }),
  })
  const table = await buildTable(config)
  const asked: DefinitionAsker[] = []
  const reading = createDefinitionReading({
    table,
    custom: config.custom,
    async layers(asker) {
      asked.push(asker)
      return layersOf(world, asker)
    },
  })
  return { table, reading, asked }
}

const TENANT_HELD: Held = {
  layer: 'tenant',
  name: 'reviewer',
  asset: 'asset-reviewer',
  version: 'sha256:v1',
  body: REVIEWER,
}
const turn = { access: access('principal' as never, alpha), key: 'run-1' }

const entryOf = (lookup: DefinitionLookup) => {
  if (lookup.kind !== 'found') throw new Error(JSON.stringify(lookup))
  return lookup
}

describe('the definition a tenant holds, read as an entry of the table', () => {
  it('answers a definition of the deployment from the table, without reading any layer', async () => {
    const { table, reading, asked } = await readingOf({ held: { alpha: [TENANT_HELD] } })
    const named = entryOf(await reading.named({ tenant: alpha }, 'alpha'))
    expect(named.entry).toBe(table.mappings.byName('alpha'))
    expect(named.side).toBe(table.agentSide(named.entry.candidate))
    const adopted = entryOf(await reading.adopted({ tenant: beta }, named.entry.candidate))
    expect(adopted.entry).toBe(named.entry)
    expect(asked).toEqual([])
  })

  it('gives what the definition wrote, and the rest from the defaults of the deployment', async () => {
    const { reading } = await readingOf({ held: { alpha: [TENANT_HELD] } })
    const { entry, side } = entryOf(await reading.named({ tenant: alpha }, 'reviewer'))
    expect(entry).toEqual({
      name: 'reviewer',
      candidate: {
        owner: HELD_DEFINITION_OWNER,
        name: 'reviewer',
        revision: 'asset-reviewer',
        digest: 'sha256:v1',
      },
      execution: CUSTOM.execution,
      entryContract: CUSTOM.entryContract,
      requiredIdentities: [],
      modes: CUSTOM.modes,
      initialModelSelection: CUSTOM.initialModelSelection,
      residentReferences: [
        { category: 'tool', name: 'Files' },
        { category: 'skill', name: 'review' },
      ],
    })
    expect(side.extensions).toEqual([])
    expect(side.definition.instructions).toEqual([{ id: 'instructions', text: 'You review code.' }])
    expect(side.definition.references).toHaveLength(3)
    expect(side.definition).not.toHaveProperty('manifest')
  })

  it('answers the same entry by the exact candidate, each time it is read', async () => {
    const { reading } = await readingOf({ held: { alpha: [TENANT_HELD] } })
    const named = entryOf(await reading.named({ tenant: alpha }, 'reviewer'))
    const first = entryOf(await reading.adopted({ tenant: alpha }, named.entry.candidate))
    const second = entryOf(await reading.adopted({ tenant: alpha }, named.entry.candidate))
    expect(first.entry).toEqual(named.entry)
    expect(second).toEqual(first)
  })

  it('answers another tenant that no definition has the name, by name and by candidate', async () => {
    const { reading } = await readingOf({ held: { alpha: [TENANT_HELD] } })
    const { entry } = entryOf(await reading.named({ tenant: alpha }, 'reviewer'))
    expect(await reading.named({ tenant: beta }, 'reviewer')).toEqual({
      kind: 'absent',
      reason: 'no definition is named reviewer',
    })
    expect((await reading.adopted({ tenant: beta }, entry.candidate)).kind).toBe('unavailable')
  })

  it('answers unavailable, and says what is missing, when the deployment gives no defaults', async () => {
    const { reading } = await readingOf({ held: { alpha: [TENANT_HELD] }, custom: false })
    expect(await reading.named({ tenant: alpha }, 'reviewer')).toEqual({
      kind: 'unavailable',
      diagnostic:
        'the deployment gives no agent-adoptions.custom: how a definition of a tenant runs is not configured',
    })
  })

  it.each([
    ['the assets of the tenant', 'assets', 'the assets of the tenant cannot be read'],
    ['the tenant layer', 'tenant', 'the tenant layer cannot be read'],
  ] as const)('answers unavailable, not absent, when %s cannot be read', async (_, down, said) => {
    const { reading } = await readingOf({ held: { alpha: [TENANT_HELD] }, unread: { alpha: down } })
    expect(await reading.named({ tenant: alpha }, 'reviewer')).toEqual({
      kind: 'unavailable',
      diagnostic: said,
    })
  })

  it('answers unavailable when the body of the winner cannot be read', async () => {
    const { body: _body, ...bare } = TENANT_HELD
    const { reading } = await readingOf({ held: { alpha: [bare] } })
    expect((await reading.named({ tenant: alpha }, 'reviewer')).kind).toBe('unavailable')
  })

  it.each([
    [
      'a master',
      { ...REVIEWER, type: 'master' },
      'it is a master: only the deployment brings a master',
    ],
    ['a body the definition judge refuses', { ...REVIEWER, summary: '' }, 'its body is refused'],
    [
      'a body that names another definition',
      { ...REVIEWER, name: 'auditor' },
      'its body names auditor',
    ],
  ])('does not use %s', async (_, body, said) => {
    const { reading } = await readingOf({ held: { alpha: [{ ...TENANT_HELD, body }] } })
    const lookup = await reading.named({ tenant: alpha }, 'reviewer')
    expect(lookup.kind).toBe('absent')
    expect(JSON.stringify(lookup)).toContain(said)
  })

  it('does not use a disabled holding', async () => {
    const { reading } = await readingOf({ held: { alpha: [{ ...TENANT_HELD, disabled: true }] } })
    expect((await reading.named({ tenant: alpha }, 'reviewer')).kind).toBe('absent')
  })

  it('reads a definition of the workspace only in a turn, and by its candidate only in a turn', async () => {
    const inWorkspace: Held = {
      layer: 'workspace',
      name: 'scribe',
      asset: 'workspace/shared/AgentDefinition/scribe',
      version: 'sha256:w1',
      body: { ...REVIEWER, name: 'scribe' },
    }
    const { reading } = await readingOf({ held: { alpha: [inWorkspace] } })
    expect((await reading.named({ tenant: alpha }, 'scribe')).kind).toBe('absent')
    const { entry } = entryOf(await reading.named({ tenant: alpha, turn }, 'scribe'))
    expect(entry.candidate).toEqual({
      owner: HELD_DEFINITION_OWNER,
      name: 'scribe',
      revision: 'workspace/shared/AgentDefinition/scribe',
      digest: 'sha256:w1',
    })
    expect(entryOf(await reading.adopted({ tenant: alpha, turn }, entry.candidate)).entry).toEqual(
      entry,
    )
    expect(await reading.adopted({ tenant: alpha }, entry.candidate)).toEqual({
      kind: 'unavailable',
      diagnostic: 'a definition of a workspace is read in the turn that adopted it',
    })
  })

  it('lets the workspace of a turn stand over the holding of the tenant under one name', async () => {
    const local: Held = {
      ...TENANT_HELD,
      layer: 'workspace',
      asset: 'workspace/shared/AgentDefinition/reviewer',
      version: 'sha256:w2',
    }
    const { reading } = await readingOf({ held: { alpha: [TENANT_HELD, local] } })
    expect(entryOf(await reading.named({ tenant: alpha }, 'reviewer')).entry.candidate.digest).toBe(
      'sha256:v1',
    )
    expect(
      entryOf(await reading.named({ tenant: alpha, turn }, 'reviewer')).entry.candidate.digest,
    ).toBe('sha256:w2')
  })

  it('keeps where a definition lies inside another package in its candidate, and reads it back from there', async () => {
    const carried: Held = { ...TENANT_HELD, asset: 'asset-plugin', within: 'agents/reviewer' }
    const { reading } = await readingOf({ held: { alpha: [carried] } })
    const { entry } = entryOf(await reading.named({ tenant: alpha }, 'reviewer'))
    expect(entry.candidate.revision).toBe('asset-plugin#agents/reviewer')
    expect(entryOf(await reading.adopted({ tenant: alpha }, entry.candidate)).entry).toEqual(entry)
  })

  it('answers a candidate of another owner as no definition adoption of this deployment', async () => {
    const { reading } = await readingOf({})
    expect(await reading.adopted({ tenant: alpha }, adoptionOf('someone', 'reviewer'))).toEqual({
      kind: 'absent',
      reason: 'the candidate is not a definition adoption of this deployment',
    })
    expect(capabilityId('AgentDefinition', 'reviewer').ok).toBe(true)
  })

  it('keeps the identity of the table what the mappings alone give', async () => {
    const mappings = mappingConfig(entryConfig('alpha'), entryConfig('beta'))
    const bare = await buildTable(agentAdoptionsConfig.parse(mappings))
    const withCustom = await buildTable(agentAdoptionsConfig.parse({ ...mappings, custom: CUSTOM }))
    expect(withCustom.mappings.identity).toBe(bare.mappings.identity)
    expect(withCustom.mappings.entries()).toEqual(bare.mappings.entries())
  })
})
