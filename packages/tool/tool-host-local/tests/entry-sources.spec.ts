import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import { createToolMessageResultCodec } from '@omne-harness/tool'
import type {
  Access,
  FixedToolRequest,
  ToolCallId,
  ToolConsumerProfile,
} from '@omne-harness/tool-contract'
import type {
  ToolEntrySource,
  ToolExecutionContext,
  ToolSourceListing,
} from '@omne-harness/tool-contract/provider'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import {
  createMemoryToolEntrySource,
  testingSourceEntry,
} from '@omne-harness/tool-contract/testing'
import {
  createLocalToolCatalog,
  type LocalToolAvailabilitySource,
} from '@omne-harness/tool-host-local'
import { createLocalEntrySources, noteCallFacts } from '../src/entry-sources.ts'
import {
  accessOf,
  authorityFor,
  fiberedRegistry,
  officialLayer,
  register,
  scriptedVerifier,
  tenantA,
  tenantB,
} from './binding-values.ts'
import { catalogSearch, catalogView } from './catalog-view-fixture.ts'

type Source = ToolEntrySource<string, ContentBlock>

const evidence = (record: string) => ({
  owner: 'test',
  record,
  revision: '1',
  digest: `sha256:${record}`,
})
const consumer: ToolConsumerProfile = {
  capabilities: evidence('capabilities'),
  conversion: null,
  attachmentAccess: evidence('attachments'),
}
const allowing: LocalToolAvailabilitySource<string> = {
  judge: () =>
    Promise.resolve(
      succeed({
        qualification: 'allowed',
        dependencies: [],
        inputCompatible: true,
        outputCompatible: true,
        attachmentsReadable: true,
        productsStorable: true,
      }),
    ),
}

const asA = accessOf(tenantA)
const asB = accessOf(tenantB)
const sameTenant = (left: Access<string>, right: Access<string>) =>
  JSON.stringify(left.tenant) === JSON.stringify(right.tenant)

const result = (text: string) => ({
  content: [
    {
      kind: 'text' as const,
      id: 'probe.result',
      visibility: { toHuman: true, toModel: true },
      text,
    },
  ],
  data: { kind: 'none' as const },
  original: { kind: 'none' as const },
  attachments: [],
})

function probe(
  listing: (access: Access<string>) => ToolSourceListing | Promise<ToolSourceListing>,
) {
  return createMemoryToolEntrySource<string, ContentBlock>({
    prefix: 'probe__',
    listing,
    execute: call => Promise.resolve(result(`${call.name} ${call.command}`) as never),
  })
}

const alpha = testingSourceEntry({
  name: 'probe__alpha',
  category: 'probe',
  commands: ['run', 'stop'],
})
const beta = testingSourceEntry({
  name: 'probe__beta',
  category: 'probe',
  unavailable: 'the connection is closed',
})
const toA = (listing: ToolSourceListing) => (access: Access<string>) =>
  sameTenant(access, asA) ? listing : { entries: [], withheld: [] }

function world(sources: readonly Source[]) {
  const shell = authorityFor(officialLayer, 'Shell', 'holding-Shell-1', '1')
  const { registry } = fiberedRegistry(scriptedVerifier([shell]))
  if (!('ok' in register(registry, asA, shell))) throw new Error('setup')
  const held: string[] = []
  const sourced = createLocalEntrySources<string, unknown, ContentBlock>({
    sources: () => sources,
    hold: prefix => {
      held.push(`hold ${prefix}`)
      return () => held.push(`release ${prefix}`)
    },
    codec: createToolMessageResultCodec(4096) as never,
    policy: {
      listTimeoutMs: 50,
      arguments: {
        maxBytes: 4096,
        maxDepth: 16,
        maxItems: 256,
        maxMembers: 64,
        maxStringLength: 1024,
        maxNumberLength: 32,
      },
    },
  })
  return {
    held,
    registry: sourced.registry(registry),
    catalog: createLocalToolCatalog({
      registry,
      availability: allowing,
      view: catalogView(registry),
      search: catalogSearch,
      sources: sourced.entries,
    }),
  }
}

const inspecting = (access: Access<string>, name: string, command: string | null = null) => ({
  ...access,
  name,
  command,
  consumer,
})
const searching = (access: Access<string>, after: string | null = null, limit = 10) => ({
  ...access,
  query: '',
  consumer,
  invocation: 'direct' as const,
  after,
  limit,
})

describe('the entries of a source in the catalog', () => {
  it('are found, inspected and described like the tools of the registry, and are never resident', async () => {
    const { catalog } = world([probe(toA({ entries: [alpha, beta], withheld: [] }))])
    const found = await catalog.search(searching(asA))
    if ('failure' in found) throw new Error(JSON.stringify(found.failure))
    expect(
      found.ok.entries.map(entry => [entry.definition.name, entry.kind, entry.resident]),
    ).toEqual(
      expect.arrayContaining([
        ['Shell', 'available', false],
        ['probe__alpha', 'available', false],
        ['probe__beta', 'known-unavailable', false],
      ]),
    )
    expect(found.ok.withheld).toBeUndefined()

    expect(await catalog.inspect(inspecting(asA, 'probe__alpha', 'stop'))).toEqual({
      ok: {
        kind: 'available',
        definition: alpha.definition,
        executor: alpha.executor,
        layer: { kind: 'tenant', tenant: tenantA },
      },
    })
    expect(await catalog.inspect(inspecting(asA, 'probe__beta'))).toEqual({
      ok: {
        kind: 'known-unavailable',
        definition: beta.definition,
        reason: 'the connection is closed',
      },
    })
    expect(
      await catalog.usage({
        ...inspecting(asA, 'probe__alpha', 'run'),
        adoption: alpha.definition.adoption,
      }),
    ).toMatchObject({ ok: { command: 'run', definition: alpha.definition.adoption } })
    expect(await catalog.inspect(inspecting(asA, 'probe__alpha', 'absent'))).toEqual(
      fail({ kind: 'invalid', field: 'command', reason: 'unknown-command' }),
    )
  })

  it('are read for the asker: another tenant finds none of them and is told the name is unknown', async () => {
    const { catalog } = world([probe(toA({ entries: [alpha], withheld: [] }))])
    const found = await catalog.search(searching(asB))
    if ('failure' in found) throw new Error(JSON.stringify(found.failure))
    expect(found.ok.entries.map(entry => entry.definition.name)).toEqual(['Shell'])
    const unknown = fail({ kind: 'invalid', field: 'name', reason: 'unknown-tool' })
    expect(await catalog.inspect(inspecting(asB, 'probe__alpha'))).toEqual(unknown)
    expect(await catalog.inspect(inspecting(asA, 'probe__never'))).toEqual(unknown)
  })

  it('lists the names that have no definition after the entries, on the first page only', async () => {
    const withheld = [{ name: 'probe__gamma', reason: 'its actions were never listed' }]
    const { catalog } = world([probe(toA({ entries: [alpha], withheld }))])
    const first = await catalog.search(searching(asA, null, 1))
    if ('failure' in first) throw new Error(JSON.stringify(first.failure))
    expect(first.ok.withheld).toEqual(withheld)
    expect(first.ok.next).not.toBeNull()
    const second = await catalog.search(searching(asA, first.ok.next, 1))
    if ('failure' in second) throw new Error(JSON.stringify(second.failure))
    expect(second.ok.withheld).toBeUndefined()
    expect(await catalog.inspect(inspecting(asA, 'probe__gamma'))).toEqual(
      fail({ kind: 'invalid', field: 'name', reason: 'unknown-tool' }),
    )
  })

  it.each([
    ['throws', () => Promise.reject(new Error('down')), 'threw'],
    ['does not answer in time', () => new Promise<ToolSourceListing>(() => {}), 'timeout'],
    [
      'names an entry outside its prefix',
      () => ({
        entries: [testingSourceEntry({ name: 'other__x', category: 'probe' })],
        withheld: [],
      }),
      'breach name-outside-prefix',
    ],
  ])(
    'a source that %s is unavailable, and the registry and the other sources answer as usual',
    async (_name, listing, why) => {
      const other = createMemoryToolEntrySource<string, ContentBlock>({
        prefix: 'other__',
        listing: () => ({
          entries: [testingSourceEntry({ name: 'other__fine', category: 'other' })],
          withheld: [],
        }),
        execute: () => Promise.reject(new Error('unused')),
      })
      const { catalog } = world([probe(listing), other])
      const found = await catalog.search(searching(asA))
      if ('failure' in found) throw new Error(JSON.stringify(found.failure))
      expect(found.ok.entries.map(entry => entry.definition.name).sort()).toEqual([
        'Shell',
        'other__fine',
      ])
      expect(found.ok.withheld).toEqual([
        { name: 'probe__*', reason: `the source of these entries is unavailable (${why})` },
      ])
      expect(await catalog.inspect(inspecting(asA, 'probe__alpha'))).toEqual(
        fail({
          kind: 'unavailable',
          dependency: 'toolEntrySource',
          diagnostic: 'the source of this entry is unavailable',
        }),
      )
      expect(await catalog.inspect(inspecting(asA, 'Shell'))).toMatchObject({
        ok: { kind: 'available' },
      })
    },
  )

  it('a tool of the registry is inspected without asking any source, so a source that hangs holds up none of them', async () => {
    let asked = 0
    const { catalog } = world([
      probe(() => {
        asked += 1
        return new Promise<never>(() => undefined)
      }),
    ])
    const started = Date.now()
    expect(await catalog.inspect(inspecting(asA, 'Shell'))).toMatchObject({
      ok: { kind: 'available' },
    })
    expect(asked).toBe(0)
    expect(Date.now() - started).toBeLessThan(50)
    expect(await catalog.inspect(inspecting(asA, 'probe__alpha'))).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'toolEntrySource' },
    })
    expect(asked).toBeGreaterThan(0)
  })

  it('a source whose list answers a failure is unavailable for that reason', async () => {
    const failing: Source = {
      prefix: 'probe__',
      list: () =>
        Promise.resolve(fail({ kind: 'unavailable', dependency: 'probe', diagnostic: 'no basis' })),
      select: () => undefined,
      execute: () => Promise.reject(new Error('unused')),
    }
    const { catalog } = world([failing])
    const found = await catalog.search(searching(asA))
    if ('failure' in found) throw new Error(JSON.stringify(found.failure))
    expect(found.ok.withheld).toEqual([
      { name: 'probe__*', reason: 'the source of these entries is unavailable (unavailable)' },
    ])
  })

  it('answers that the catalog changed when the entries of a source change during one reading', async () => {
    let listings = 0
    const { catalog } = world([
      probe(() => {
        listings += 1
        return { entries: listings === 1 ? [alpha] : [], withheld: [] }
      }),
    ])
    expect(await catalog.inspect(inspecting(asA, 'probe__alpha'))).toEqual(
      fail({
        kind: 'unavailable',
        dependency: 'toolCatalogView',
        diagnostic: 'catalog snapshot changed; retry',
      }),
    )
  })
})

describe('a call of an entry of a source', () => {
  const call = 'call-1' as ToolCallId
  const fixed = (entry = alpha, command: string | null = 'run'): FixedToolRequest =>
    ({
      availability: {
        kind: 'available',
        definition: entry.definition,
        executor: entry.executor,
        layer: { kind: 'tenant', tenant: tenantA },
      },
      command,
    }) as FixedToolRequest

  async function selecting(source: ReturnType<typeof probe>) {
    const made = world([source])
    await made.catalog.inspect(inspecting(asA, 'probe__alpha'))
    return made
  }

  it('runs the executor of the source with the asker, the command, the arguments and the call', async () => {
    const source = probe(toA({ entries: [alpha], withheld: [] }))
    const { registry, held } = await selecting(source)
    const selected = registry.selectAndPin(asA, fixed(alpha, 'stop'), call)
    if ('failure' in selected) throw new Error(selected.failure.diagnostic)
    expect(selected.ok.loaded.definition).toBe(alpha.definition)
    expect(selected.ok.loaded.key).toEqual({
      layer: { kind: 'tenant', tenant: tenantA },
      asset: { name: 'probe__alpha', adoption: alpha.definition.adoption },
    })
    expect(held).toEqual(['hold probe__'])

    const registration = readToolRegistration(selected.ok.loaded.implementation)
    if (registration?.kind !== 'commands') throw new Error('registration')
    const slot = registration.operations.find(([name]) => name === 'stop')?.[1]
    const signal = new AbortController().signal
    const context = { signal } as ToolExecutionContext
    noteCallFacts(context, { ...asA, call })
    const args = { kind: 'object', entries: [] } as const
    const value = await slot?.author.executor.execute(args, undefined, context)
    expect(value).toEqual(result('probe__alpha stop'))
    expect(source.calls).toEqual([
      {
        ...asA,
        name: 'probe__alpha',
        command: 'stop',
        declared: alpha.definition.kind === 'commands' ? alpha.definition.commands[1] : null,
        arguments: args,
        invocation: call,
        signal,
      },
    ])

    selected.ok.pin.release()
    selected.ok.pin.release()
    expect(held).toEqual(['hold probe__', 'release probe__'])
    expect(selected.ok.repin(asA, call)).toMatchObject({ ok: {} })
    expect(selected.ok.repin(asB, call)).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it('is refused when the executor is asked without the facts of its call', async () => {
    const { registry } = await selecting(probe(toA({ entries: [alpha], withheld: [] })))
    const selected = registry.selectAndPin(asA, fixed(), call)
    if ('failure' in selected) throw new Error(selected.failure.diagnostic)
    const registration = readToolRegistration(selected.ok.loaded.implementation)
    if (registration?.kind !== 'commands') throw new Error('registration')
    const slot = registration.operations[0]?.[1]
    const context = { signal: new AbortController().signal } as ToolExecutionContext
    expect(() =>
      slot?.author.executor.execute({ kind: 'object', entries: [] }, undefined, context),
    ).toThrow('the call of the source entry is not known')
  })

  it.each([
    [
      'the definition changed since the request was fixed',
      testingSourceEntry({ name: 'probe__alpha', category: 'probe', revision: '2' }),
      'the source entry changed since it was fixed',
    ],
    [
      'the entry is no longer available',
      testingSourceEntry({ name: 'probe__alpha', category: 'probe', unavailable: 'closed' }),
      'the source entry is not available now',
    ],
  ])('is not selected when %s', async (_name, now, diagnostic) => {
    const { registry, held } = await selecting(probe(toA({ entries: [now], withheld: [] })))
    const selected = registry.selectAndPin(asA, fixed(), call)
    expect(selected).toEqual(fail({ kind: 'unavailable', diagnostic }))
    expect(registry.peek(asA, fixed().availability as never)).toEqual(
      fail({ kind: 'unavailable', diagnostic }),
    )
    expect(held).toEqual([])
  })

  it('is not selected for another tenant, nor once the source left the point', async () => {
    const source = probe(toA({ entries: [alpha], withheld: [] }))
    const { registry } = await selecting(source)
    expect(registry.selectAndPin(asB, fixed(), call)).toEqual(
      fail({ kind: 'unavailable', diagnostic: 'the source entry is not available now' }),
    )
    const gone = world([])
    expect(gone.registry.selectAndPin(asA, fixed(), call)).toMatchObject({
      failure: { kind: 'unavailable' },
    })
  })

  it('leaves the tools of the registry to the registry', async () => {
    const { registry, catalog } = world([probe(toA({ entries: [alpha], withheld: [] }))])
    const shell = await catalog.inspect(inspecting(asA, 'Shell'))
    if ('failure' in shell || shell.ok.kind !== 'available') throw new Error('setup')
    const selected = registry.selectAndPin(
      asA,
      { availability: shell.ok, command: null } as FixedToolRequest,
      call,
    )
    expect(selected).toMatchObject({ ok: { loaded: { definition: { name: 'Shell' } } } })
  })
})
