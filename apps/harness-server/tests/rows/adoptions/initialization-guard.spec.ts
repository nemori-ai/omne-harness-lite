// R2-D7: the `create` material of the `adoption-sources` row is Session's initialization guard
// (session-contract「初始化守卫编码」). The row reads the deployment mapping and nothing else, so the
// guard says what the mapping says: the initial adoption is the mapping entry, the plan and the
// requirements are the required identities of the entry, and there are no resident tools, sources or
// results. The Session core (`decide`) accepts the guard for the command it was prepared for and
// refuses it once it is missing, re-owned, re-adopted or handed to another command. A creation that
// declares what the mapping does not hold gets no guard.
import { tenantCodec } from '@omne-harness/legal-identity'
import { contentDigest } from '@omne-harness/server-entry/cordis'
import {
  INITIALIZATION_PROTOCOL,
  decide,
  type AdoptionEvidenceCommand,
  type GuardCommand,
} from '@omne-harness/session-contract'
import { operationId } from '@omne-harness/session-contract/testing'
import { describe, expect, test } from 'vitest'
import {
  access,
  adoptionOf,
  createCommand,
  entryConfig,
  factsOf,
  firstCreationEntryObjects,
  mappingConfig,
  plainOf,
  withLiveTree,
} from './support.ts'

type Plain = Record<string, unknown>
type Create = Extract<AdoptionEvidenceCommand, { kind: 'create' }>

const tenantText = (() => {
  const encoded = tenantCodec.encode(access.tenant)
  if (!encoded.ok) throw new Error('the fixture tenant is not minted')
  return encoded.value
})()

/** The JSON tree of a plain value, as a guard's `facts` carry it. */
function treeOf(plain: unknown): GuardCommand['facts'] {
  if (plain === null || plain === undefined) return { kind: 'null' }
  if (typeof plain === 'string') return { kind: 'string', value: plain }
  if (typeof plain === 'boolean') return { kind: 'boolean', value: plain }
  if (typeof plain === 'number') return { kind: 'number', lexeme: String(plain) }
  if (Array.isArray(plain)) return { kind: 'array', items: plain.map(treeOf) }
  return {
    kind: 'object',
    entries: Object.entries(plain as Plain).map(([key, value]) => ({ key, value: treeOf(value) })),
  }
}

/** The row's guard for `command`, with the table identity and the entry it was prepared against. */
async function prepared(command: Create, config: unknown = mappingConfig()) {
  const { value } = await withLiveTree(config, async ({ mappings, source }) => ({
    outcome: await source.prepare(command),
    identity: mappings.identity,
    entry: mappings.byName(command.input.creation.definition.name),
  }))
  if (!('ok' in value.outcome)) throw new Error(`expected material: ${JSON.stringify(value)}`)
  if (value.entry === undefined) throw new Error('the entry is missing')
  return { guards: value.outcome.ok, identity: value.identity, entry: value.entry }
}

const decided = (command: Create, guards: readonly GuardCommand[]) =>
  decide(null, command, guards, null, { compaction: null })

describe('the create material is the initialization guard of Session', () => {
  test('create gives exactly one guard: the initialization protocol, bound to the command, no results', async () => {
    const command = createCommand('alpha')
    const { guards } = await prepared(command)
    expect(guards).toHaveLength(1)
    const guard = guards[0]!
    expect(guard).toMatchObject({
      owner: 'session-initialization',
      participant: 'session-evidence',
      protocol: INITIALIZATION_PROTOCOL,
    })
    expect(factsOf(guard)).toMatchObject({
      version: 1,
      command: 'create',
      binding: {
        tenant: tenantText,
        session: access.session,
        operation: operationId('op-1'),
        createOperation: operationId('op-1'),
      },
      results: [],
    })
    // The complete fixed input, as a JSON tree inside the facts: the tenant as its codec text.
    expect(plainOf(factsOf(guard)['input'])).toMatchObject({
      tenant: tenantText,
      session: access.session,
      operation: operationId('op-1'),
      creation: { definition: { name: 'alpha' }, workspace: null },
    })
  })

  test('the initial adoption is the mapping entry: its candidate, its digest as the source, the table as the boundary, no resident tools', async () => {
    const { guards, identity, entry } = await prepared(createCommand('alpha'))
    const facts = factsOf(guards[0]!)
    expect(facts['initialAdoption']).toMatchObject({
      definitionName: 'alpha',
      candidate: entry.candidate,
      adopted: entry.candidate,
      source: { owner: '@omne-harness/harness-server', digest: contentDigest(entry) },
      boundary: { owner: '@omne-harness/harness-server', digest: identity },
      residentBindings: [],
      newResidents: [],
    })
    const initial = facts['initialAdoption'] as Plain
    const capabilities = initial['capabilities'] as Plain
    const inputSnapshot = initial['inputSnapshot'] as Plain
    expect(plainOf(capabilities['value'])).toMatchObject({
      name: 'alpha',
      candidate: entry.candidate,
      requiredIdentities: [{ capability: 'model', name: 'default' }],
    })
    expect(plainOf(inputSnapshot['value'])).toEqual({ definition: 'alpha' })
  })

  test('the plan and the requirements are the required identities of the entry, each requirement planned to its item', async () => {
    const { guards, entry } = await prepared(createCommand('alpha'))
    const facts = factsOf(guards[0]!)
    const plan = facts['plan'] as Plain[]
    expect(plan).toHaveLength(1)
    expect(plan[0]).toMatchObject({
      kind: 'identity',
      owner: 'model',
      item: 'default',
      protocol: entry.entryContract,
    })
    expect(plainOf(plan[0]!['originalInput'])).toEqual({ capability: 'model', name: 'default' })
    expect(facts['requirements']).toEqual([
      expect.objectContaining({
        kind: 'identity',
        requirement: expect.objectContaining({ digest: contentDigest(entry) }),
        resolution: { kind: 'planned', owner: 'model', item: 'default' },
      }),
    ])
  })

  test('an entry without required identities gives an empty plan and empty requirements (the release `assistant` shape)', async () => {
    const config = mappingConfig(entryConfig('solo', { requiredIdentities: [] }))
    const command = createCommand('solo', { requiredIdentities: [] })
    const { guards } = await prepared(command, config)
    expect(factsOf(guards[0]!)).toMatchObject({ plan: [], requirements: [] })
    expect(decided(command, guards)).toMatchObject({ kind: 'entries' })
  })

  test('the Session core accepts the guard for the command it was prepared for', async () => {
    const command = createCommand('alpha')
    const { guards } = await prepared(command)
    const decision = decided(command, guards)
    expect(decision).toMatchObject({ kind: 'entries' })
  })

  test.each([
    [
      'no initialization guard',
      (): readonly GuardCommand[] => [],
      'exactly one initialization guard is required',
    ],
    [
      'the guard re-owned',
      (guard: GuardCommand): readonly GuardCommand[] => [{ ...guard, owner: 'definition-mapping' }],
      'exactly one initialization guard is required',
    ],
    [
      'the initial adoption naming another candidate',
      (guard: GuardCommand): readonly GuardCommand[] => {
        const facts = factsOf(guard)
        const initial = facts['initialAdoption'] as Plain
        const other = adoptionOf('test-assets', 'other')
        return [
          {
            ...guard,
            facts: treeOf({
              ...facts,
              initialAdoption: { ...initial, candidate: other, adopted: other },
            }),
          },
        ]
      },
      'initialization cannot change the original definition adoption',
    ],
  ])('Session refuses a create with %s', async (_, tamper, reason) => {
    const command = createCommand('alpha')
    const { guards } = await prepared(command)
    expect(decided(command, tamper(guards[0]!))).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'initialization', reason },
    })
  })

  test('a guard prepared for one command does not let another command through', async () => {
    const { guards } = await prepared(createCommand('alpha'))
    const other: Create = {
      ...createCommand('alpha'),
      input: { ...createCommand('alpha').input, operation: 'op-2' as never },
    }
    expect(decided(other, guards)).toMatchObject({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'initialization' },
    })
  })

  test.each([
    [
      'initialization sources',
      createCommand('alpha', {
        initialization: {
          sources: [
            {
              kind: 'execution-adoption',
              item: 'prepare',
              owner: 'test-agent',
              protocol: adoptionOf('test-agent', 'preparation'),
            },
          ],
          results: [],
        },
      }),
      'initialization',
    ],
    [
      'resident tools',
      createCommand('alpha', {
        residentAdoption: { residents: [], keys: [{ capability: 'tool', key: 'k' as never }] },
      }),
      'residentAdoption',
    ],
  ])(
    'a creation that declares %s gets no guard: the mapping holds none',
    async (_, command, field) => {
      // A first creation: Session has no original initialization to recall, so the mapping decides.
      const { value } = await withLiveTree(
        mappingConfig(),
        ({ source }) => source.prepare(command, access),
        { entryObjects: firstCreationEntryObjects },
      )
      expect(value).toMatchObject({ failure: { kind: 'invalid', field } })
    },
  )

  test('a creation that declares initialization sources and whose original cannot be read gets no guard: unavailable', async () => {
    // A retried create is recalled from Session before the mapping is consulted (adoption-sources
    // docs「create 的模式注册」). Without the Session read, whether it is a retry stays unknown.
    const command = createCommand('alpha', {
      initialization: {
        sources: [
          {
            kind: 'execution-adoption',
            item: 'prepare',
            owner: 'test-agent',
            protocol: adoptionOf('test-agent', 'preparation'),
          },
        ],
        results: [],
      },
    })
    const { value } = await withLiveTree(mappingConfig(), async ({ source }) => [
      await source.prepare(command),
      await source.prepare(command, access),
    ])
    expect(value).toMatchObject([
      { failure: { kind: 'unavailable', owner: 'session.modes' } },
      { failure: { kind: 'unavailable', owner: 'sessionPrincipalBindings' } },
    ])
  })
})
