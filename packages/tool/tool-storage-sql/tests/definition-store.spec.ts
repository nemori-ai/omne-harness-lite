import { afterEach, describe, expect, it } from 'vitest'
import { judgeContentBlock, type ContentBlock } from '@omne-harness/content-block'
import { succeed } from '@omne-harness/operation-result'
import type { CommitRequestV2, SqlStorage } from '@omne-harness/sql-contract'
import {
  canonicalJson,
  createToolLedger,
  INITIAL_REVISION,
  type ToolLedgerGuards,
} from '@omne-harness/tool'
import { createMemoryToolBodies } from '@omne-harness/tool/testing'
import type { ToolDefinition, ToolInvokeRequest } from '@omne-harness/tool-contract'
import { defaultResultPolicy, toolInvokeRequestOf } from '@omne-harness/tool-contract/provider'
import {
  createMemoryToolClock,
  createMemoryToolEnvironment,
} from '@omne-harness/tool-contract/testing'
import { createLocalInvocationSource } from '@omne-harness/tool-host-local'
import { createSqlToolLedgerStore } from '../src/index.ts'
import { DEFINITION_BLOCK_BYTES } from '../src/worker/schema.ts'
import {
  MAX_COMMAND_BYTES,
  TENANT_A,
  domainNameOf,
  openApp,
  textOf,
  type App,
} from './fixtures/app.ts'
import { fixedRequest } from './fixtures/ledger.ts'

type Principal = Readonly<{ subject: string }>
const alice: Principal = { subject: 'alice' }

const opened: App[] = []
afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

function definitionOf(description: string, revision = '1'): ToolDefinition {
  const base = fixedRequest().availability.definition
  return { ...base, description, adoption: { ...base.adoption, revision } }
}

function requestFor(definition: ToolDefinition, position: string): ToolInvokeRequest {
  const call = fixedRequest()
  return toolInvokeRequestOf({
    ...call,
    availability: { ...call.availability, definition },
    consumer: { ...call.consumer, position },
  })
}

const bytesOf = (value: unknown): number => Buffer.byteLength(canonicalJson(value), 'utf8')

const commitBytes = (commit: CommitRequestV2): number =>
  commit.commands.reduce((total, command) => total + bytesOf(command), 0)

const factsOf = (commit: CommitRequestV2) => commit.commands[0]?.facts ?? {}

function admissionOf(commits: readonly CommitRequestV2[]): CommitRequestV2 {
  const found = commits.find(commit => {
    const facts = factsOf(commit)
    const writes = facts['writes']
    return (
      facts['kind'] === 'call' &&
      Array.isArray(writes) &&
      writes.some(
        write =>
          typeof write === 'object' &&
          write !== null &&
          !Array.isArray(write) &&
          write['key'] === 'call' &&
          write['definition'] !== undefined,
      )
    )
  })
  if (found === undefined) throw new Error('no admission commit was sent')
  return found
}

const writesDefinition = (commit: CommitRequestV2): boolean => {
  const facts = factsOf(commit)
  const listed = facts['definitions']
  return facts['intent'] === 'definition-put' || (Array.isArray(listed) && listed.length > 0)
}

async function assembly(initial: readonly ToolDefinition[]) {
  const app = await openApp()
  opened.push(app)
  const sent: CommitRequestV2[] = []
  const inner = app.options.storage
  const storage: SqlStorage = {
    ...inner,
    commit: (request, options) => {
      sent.push(request)
      return inner.commit(request, options)
    },
  }
  const store = createSqlToolLedgerStore({ ...app.options, storage })
  let catalog = [...initial]
  const source = createLocalInvocationSource<Principal>({
    store,
    authority: {
      qualify: async () => ({ kind: 'allowed' }),
      samePrincipal: async ({ current, original }) =>
        current.subject === original.subject
          ? { kind: 'allowed' }
          : { kind: 'denied', reason: 'different-subject' },
    },
    principalCodec: {
      encode: principal => ({ subject: principal.subject }),
      decode: value => {
        const subject: unknown =
          typeof value === 'object' && value !== null ? Reflect.get(value, 'subject') : undefined
        return typeof subject === 'string' ? succeed({ subject }) : { failure: { reason: 'shape' } }
      },
    },
    definitions: {
      current: async ({ name }) =>
        succeed(catalog.find(definition => definition.name === name) ?? null),
    },
    commitAttempts: 4,
  })
  const guards: ToolLedgerGuards<Principal, ContentBlock> = {
    access: { qualify: async () => ({ kind: 'allowed' }) },
    sources: source.guard,
    factAcknowledgements: {
      verify: async () => ({ kind: 'unavailable', diagnostic: 'no fact source here' }),
    },
    grants: new Map([['fixture-scope', { verifyGrant: async () => ({ kind: 'granted' }) }]]),
    starts: { qualifyStart: async () => ({ kind: 'allowed' }) },
    results: {
      text: text => {
        const block = judgeContentBlock({
          kind: 'text',
          id: 'logical',
          visibility: { toHuman: true, toModel: true },
          text,
        })
        if (!('ok' in block)) throw new Error('the fixture text block is not legal')
        return succeed({
          content: [block.ok],
          data: { kind: 'none' },
          original: { kind: 'none' },
          attachments: [],
        })
      },
    },
    policy: defaultResultPolicy,
    budgets: {
      arguments: {
        maxBytes: 4096,
        maxDepth: 16,
        maxItems: 256,
        maxMembers: 64,
        maxStringLength: 1024,
        maxNumberLength: 32,
      },
    },
  }
  const json = {
    maxBytes: 65_536,
    maxDepth: 32,
    maxItems: 4096,
    maxMembers: 4096,
    maxStringLength: 65_536,
    maxNumberLength: 64,
  }
  const ledger = createToolLedger<Principal, ContentBlock>(
    store,
    guards,
    createMemoryToolClock(),
    {
      resultPageBytes: 4096,
      ledgerCommitAttempts: 4,
      authorBufferBytes: 65_536,
      authorBufferItems: 128,
      queueCapacity: 16,
      readResultArguments: json,
      offloading: {
        maxInlineUtf8Bytes: 65_536,
        maxRetentionMs: 86_400_000,
        maxBodyBytes: 16_777_216,
        previewUtf8Bytes: 1_024,
        maxPageBytes: 65_536,
        permitMs: 30_000,
        clockSkewMs: 1_000,
        orphanGraceMs: 60_000,
        maxWriterMetadataBytes: 1_048_576,
        jsonDocument: json,
        jsonRecord: json,
      },
    },
    {
      bodies: createMemoryToolBodies(),
      releaseInspection: createMemoryToolEnvironment<Principal>(),
      content: null,
    },
  )
  const invoke = async (request: ToolInvokeRequest) => {
    const before = sent.length
    const bound = await source.issuer.resolve({ principal: alice, tenant: TENANT_A, request })
    if (bound.kind !== 'bound') return { bound, commits: sent.slice(before) } as const
    const admitted = await ledger.admissions.admit({
      principal: alice,
      tenant: TENANT_A,
      call: bound.call,
      operation: bound.admission,
      request: bound.request,
    })
    return { bound, admitted, commits: sent.slice(before) } as const
  }
  const rows = (sql: string) => app.sqlite.inspect(domainNameOf(TENANT_A), sql, [textOf(TENANT_A)])
  return {
    app,
    store,
    reopened: () =>
      createSqlToolLedgerStore({ ...app.options, storage: { ...inner, database: {} } }),
    sent,
    invoke,
    replace: (next: readonly ToolDefinition[]) => {
      catalog = [...next]
    },
    definitions: () => rows('SELECT digest FROM tl_definition WHERE tenant = ? ORDER BY digest'),
    records: () => rows('SELECT kind, name, key FROM tl_record WHERE tenant = ? ORDER BY kind'),
  }
}

type World = Awaited<ReturnType<typeof assembly>>

async function admitted(world: World, request: ToolInvokeRequest) {
  const answer = await world.invoke(request)
  if (answer.bound.kind !== 'bound' || !('admitted' in answer))
    throw new Error(`not bound: ${JSON.stringify(answer.bound)}`)
  if (!('ok' in answer.admitted)) throw new Error(JSON.stringify(answer.admitted.failure))
  return { ...answer, bound: answer.bound, admitted: answer.admitted.ok }
}

async function dropCall(world: World, call: Parameters<World['store']['read']>[0]) {
  const read = await world.store.read(call)
  if (read.kind !== 'complete') throw new Error(read.diagnostic)
  const dropped = await world.store.commit({
    domain: call,
    expected: read.revision,
    revision: INITIAL_REVISION,
    writes: [{ kind: 'drop' }],
  })
  expect(dropped).toEqual({ kind: 'committed' })
}

describe('a call writes bytes that do not grow with its tool definition', () => {
  it('sends the same request and, for a second call of one definition, the same admission commit, with no definition in it', async () => {
    const short = definitionOf('Reads one fixture value.')
    const long = definitionOf(`Reads one fixture value. ${'x'.repeat(100_000)}`)
    expect(bytesOf(long) - bytesOf(short)).toBeGreaterThanOrEqual(100_000)
    const measured = []
    for (const definition of [short, long]) {
      const world = await assembly([definition])
      await admitted(world, requestFor(definition, 'first'))
      const request = requestFor(definition, 'second')
      const second = await admitted(world, request)
      expect(second.commits.some(writesDefinition)).toBe(false)
      measured.push({
        request,
        requestBytes: bytesOf(request),
        admission: commitBytes(admissionOf(second.commits)),
      })
    }
    const [first, other] = measured
    expect(other?.request).toEqual(first?.request)
    expect(other?.requestBytes).toBe(first?.requestBytes)
    expect(other?.admission).toBe(first?.admission)
  })

  it('writes a definition larger than one command in blocks, each command within the block size', async () => {
    const huge = definitionOf(`Huge. ${'y'.repeat(MAX_COMMAND_BYTES + 200_000)}`)
    expect(bytesOf(huge)).toBeGreaterThan(MAX_COMMAND_BYTES)
    const world = await assembly([huge])
    const first = await admitted(world, requestFor(huge, 'first'))
    expect(first.admitted.state.phase).toBe('accepted')
    const sizes = first.commits.flatMap(commit => commit.commands.map(bytesOf))
    expect(first.commits.filter(writesDefinition).length).toBeGreaterThan(2)
    for (const commit of first.commits.filter(writesDefinition))
      for (const command of commit.commands)
        expect(bytesOf(command)).toBeLessThanOrEqual(DEFINITION_BLOCK_BYTES)
    expect(Math.max(...sizes)).toBeLessThanOrEqual(MAX_COMMAND_BYTES)
    const read = await world
      .reopened()
      .read({ kind: 'call', tenant: TENANT_A, call: first.bound.call })
    if (read.kind !== 'complete') throw new Error(read.diagnostic)
    const row = read.records.find(record => record.kind === 'call')
    expect(row?.kind === 'call' && row.call.request.availability.definition).toEqual(huge)
  })
})

describe('the definitions Tool keeps', () => {
  it('reads back the version admitted after the catalog moved on', async () => {
    const before = definitionOf('Version one.', '1')
    const after = definitionOf('Version two.', '2')
    const world = await assembly([before])
    const first = await admitted(world, requestFor(before, 'first'))
    world.replace([after])
    const second = await admitted(world, requestFor(after, 'second'))
    expect(world.definitions()).toHaveLength(2)
    const reopened = world.reopened()
    for (const [call, expected] of [
      [first.bound.call, before],
      [second.bound.call, after],
    ] as const) {
      const read = await reopened.read({ kind: 'call', tenant: TENANT_A, call })
      if (read.kind !== 'complete') throw new Error(read.diagnostic)
      const row = read.records.find(record => record.kind === 'call')
      expect(row?.kind === 'call' && row.call.request.availability.definition).toEqual(expected)
    }
  })

  it('recognises an admitted call resent after the catalog moved on and writes nothing', async () => {
    const before = definitionOf('Version one.', '1')
    const after = definitionOf('Version two.', '2')
    const world = await assembly([before])
    const request = requestFor(before, 'first')
    const first = await admitted(world, request)
    const records = world.records()
    world.replace([after])
    const again = await admitted(world, request)
    expect(again.bound.recovered).toBe(true)
    expect(again.admitted.recovered).toBe(true)
    expect(again.bound.call).toBe(first.bound.call)
    expect(again.commits).toEqual([])
    expect(world.records()).toEqual(records)
  })

  it('deletes a definition with the last call that names it', async () => {
    const definition = definitionOf('Shared by two calls.')
    const world = await assembly([definition])
    const one = await admitted(world, requestFor(definition, 'one'))
    const two = await admitted(world, requestFor(definition, 'two'))
    expect(world.definitions()).toHaveLength(1)
    await dropCall(world, { kind: 'call', tenant: TENANT_A, call: one.bound.call })
    expect(world.definitions()).toHaveLength(1)
    await dropCall(world, { kind: 'call', tenant: TENANT_A, call: two.bound.call })
    expect(world.definitions()).toEqual([])
  })

  it('refuses an adoption the catalog does not list, and writes nothing', async () => {
    const listed = definitionOf('Listed.', '2')
    const world = await assembly([listed])
    const answer = await world.invoke(requestFor(definitionOf('Never listed.', '1'), 'first'))
    expect(answer.bound).toEqual({
      kind: 'rejected',
      failure: { kind: 'invalid', field: 'name', reason: 'unknown-tool' },
    })
    expect(answer.commits).toEqual([])
    expect(world.records()).toEqual([])
    expect(world.definitions()).toEqual([])
  })
})
