// The `ModelCommandStorage` of this member, driven the way the shared commands core drives it:
// a run with a scope, `documents`, `reserved`, one `commit` or `publish`. It runs against the
// real participant, migration and read handlers on node:sqlite. The storage below is a test
// provider: one in-memory database per transaction domain, receipts by full identity, rollback on
// a stopping reply. It does not model Workers, durability, queues or limits; the real provider is
// joined later (sqlite-provider, integration A).
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  decodeDispatchId,
  decodeModelCallId,
  decodeModelOperationId,
  decodeOutputCursor,
  decodeRevision,
  type FixedModelRequest,
  type ModelCallId,
  type ModelFailure,
  type ModelOperationId,
  type ResultCapacity,
  type VisibleBlock,
} from '@omne-harness/model-contract'
import { decodeReadId } from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import {
  inputDigestV2,
  type CommitRequestV2,
  type CommitResultV2,
  type JsonValue,
  type ReceiptV2,
  type SqlIdentity,
  type SqlStorage,
  type TenantDomainLookup,
} from '@omne-harness/sql-contract'
import type { QueryRows, SqlValue } from '@omne-harness/sql-contract/worker'
import {
  CALL_READ_MAX_ROWS,
  COMMAND_RESERVE_BYTES,
  PART_MERGE_THRESHOLD,
  callHandler,
  createSqlModelStorage,
  modelMigration,
  pendingHandler,
  type BindingBase,
  type CallDocument,
  type DispatchDocument,
  type SqlModelStorage,
  type SqlModelStorageOptions,
} from '@omne-harness/model-storage-sql'
import participant from '../src/commit.ts'

// --- Test provider -------------------------------------------------------------------------

function isObject(value: JsonValue | undefined): value is { readonly [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const decoded = <T>(result: Outcome<T, unknown>): T => {
  if ('failure' in result) throw new Error('fixture identity does not decode')
  return result.ok
}

function rowsOf(db: DatabaseSync, sql: string, params: readonly SqlValue[]): QueryRows {
  const statement = db.prepare(sql)
  statement.setReadBigInts(true)
  const bound = params.map(value => (typeof value === 'boolean' ? Number(value) : value))
  if (/^\s*(SELECT|WITH)/i.test(sql)) {
    const rows = statement.all(...bound)
    const columns = rows[0] === undefined ? [] : Object.keys(rows[0])
    return {
      columns,
      rows: rows.map(row => columns.map(name => (row[name] ?? null) as never)),
      changes: 0n,
      lastInsertRowid: null,
    }
  }
  const result = statement.run(...bound)
  return { columns: [], rows: [], changes: BigInt(result.changes), lastInsertRowid: null }
}

type Domain = { readonly db: DatabaseSync; readonly receipts: Map<string, ReceiptV2> }
type Held = { readonly request: CommitRequestV2; readonly domain: Domain; readonly key: string }
const HANDLERS = new Map([callHandler, pendingHandler].map(item => [item.handler, item]))

function sqliteStorage() {
  const domains = new Map<string, Domain>()
  const hooks: {
    beforeCommit: (() => Promise<void>) | null
    loseNextReply: boolean
    holdNextCommit: boolean
  } = { beforeCommit: null, loseNextReply: false, holdNextCommit: false }
  const held = new Map<string, Held>()
  let commits = 0
  const domainOf = (name: string): Domain => {
    const found = domains.get(name)
    if (found !== undefined) return found
    const db = new DatabaseSync(':memory:')
    modelMigration.up({ execute: (sql, params) => rowsOf(db, sql, params) })
    const domain = { db, receipts: new Map<string, ReceiptV2>() }
    domains.set(name, domain)
    return domain
  }
  const execute = (domain: Domain, request: CommitRequestV2): ReceiptV2 => {
    const command = request.commands[0]
    if (command === undefined) throw new Error('no command')
    const head = {
      identity: request.identity,
      inputDigest: inputDigestV2(request),
      combinationVersion: request.combinationVersion,
      manifestDigest: request.manifestDigest,
    }
    domain.db.exec('BEGIN IMMEDIATE')
    const port = {
      execute: (sql: string, params: readonly SqlValue[]) => rowsOf(domain.db, sql, params),
      requireFact: () => null,
      provideFact: () => undefined,
    }
    let reply
    try {
      reply = participant.execute(structuredClone(command.facts), port)
    } catch (error) {
      reply = { kind: 'failed' as const, diagnostic: String(error) }
    }
    const entry = { participant: command.participant, protocol: participant.protocol }
    if (reply.kind === 'participated') {
      domain.db.exec('COMMIT')
      return { kind: 'committed', ...head, responses: [{ ...entry, reply }] }
    }
    domain.db.exec('ROLLBACK')
    const stopping =
      reply.kind === 'failed'
        ? {
            kind: 'failed' as const,
            category: 'participant_reported' as const,
            diagnostic: reply.diagnostic,
          }
        : reply
    return { kind: 'rolled_back', ...head, responses: [{ ...entry, reply: stopping }] }
  }
  const keyOf = (identity: SqlIdentity) => `${identity.operation}|${identity.operationKey}`
  const storage: SqlStorage = {
    registerCombination: input => Promise.resolve({ kind: 'registered', registration: input }),
    async commit(request): Promise<CommitResultV2> {
      const hook = hooks.beforeCommit
      hooks.beforeCommit = null
      if (hook !== null) await hook()
      commits += 1
      const domain = domainOf(request.identity.transactionDomain)
      const key = keyOf(request.identity)
      if (hooks.holdNextCommit) {
        hooks.holdNextCommit = false
        held.set(key, { request, domain, key })
        return { kind: 'unknown', identity: request.identity, diagnostic: null }
      }
      const existing = domain.receipts.get(key)
      if (existing !== undefined)
        return existing.inputDigest === inputDigestV2(request)
          ? existing
          : { kind: 'identity_conflict', identity: request.identity, existing }
      const receipt = execute(domain, request)
      domain.receipts.set(key, receipt)
      if (hooks.loseNextReply) {
        hooks.loseNextReply = false
        return { kind: 'unknown', identity: request.identity, diagnostic: null }
      }
      return receipt
    },
    query(identity) {
      if (held.has(keyOf(identity)))
        return Promise.resolve({ kind: 'unknown', identity, diagnostic: null })
      const found = domainOf(identity.transactionDomain).receipts.get(keyOf(identity))
      return Promise.resolve(
        found ?? {
          kind: 'not_committed',
          identity,
          proofs: {
            writerGenerationExcluded: true,
            oldTransactionTerminated: true,
            databaseRecoveryFinished: true,
            authoritativeReadSucceeded: true,
            operationNotQueued: true,
          },
        },
      )
    },
    read(request) {
      const handler = HANDLERS.get(request.handler)
      const db = domainOf(request.domain.transactionDomain).db
      const outcome = handler?.read(request.input, {
        execute: (sql, params) => rowsOf(db, sql, params),
      })
      return Promise.resolve(
        outcome?.kind === 'read'
          ? { kind: 'read', requestKey: request.requestKey, output: outcome.output }
          : {
              kind: 'unavailable',
              requestKey: request.requestKey,
              reason: 'read_failed',
              diagnostic: outcome?.kind === 'failed' ? outcome.diagnostic : 'no handler',
            },
      )
    },
  }
  return {
    storage,
    hooks,
    commits: () => commits,
    /** Runs every held commit now: the storage decides them. */
    release() {
      for (const item of held.values())
        item.domain.receipts.set(item.key, execute(item.domain, item.request))
      held.clear()
    },
    rows: (domain: string, sql: string, params: readonly SqlValue[] = []) =>
      rowsOf(domainOf(domain).db, sql, params).rows,
    seed: (domain: string, sql: string, params: readonly SqlValue[]) =>
      rowsOf(domainOf(domain).db, sql, params),
  }
}

// --- Values --------------------------------------------------------------------------------

function tenantOf(letter: string): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: `org_${letter.repeat(26)}`,
      account: `acc_${letter.repeat(26)}`,
    }),
  )
  if (!parsed.ok) throw new Error('fixture tenant does not parse')
  return parsed.value
}
const textOf = (tenant: TenantId): string => {
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new Error('fixture tenant does not encode')
  return text.value
}

const A = textOf(tenantOf('a'))
const B = textOf(tenantOf('b'))
const domainName = (tenant: string): string => (tenant === A ? 'domain-a' : 'domain-b')
const callId = (name: string): ModelCallId => decoded(decodeModelCallId(`mcall_${name}`))
const opId = (name: string): ModelOperationId => decoded(decodeModelOperationId(`mop_${name}`))
const ADOPTION = { owner: 'test', name: 'a', revision: '1', digest: '0'.repeat(64) }
const SUPPLIER = {
  adoption: ADOPTION,
  recipient: 'recipient',
  model: 'model',
  credential: { kind: 'factory' as const },
}
const REQUEST: FixedModelRequest = {
  profile: ADOPTION,
  suppliers: [SUPPLIER],
  fallback: false,
  retryPolicy: ADOPTION,
  parameters: [],
  system: [],
  messages: [],
  tools: [],
  toolChoice: 'none',
  declarations: [
    { produces: 'recipient/model', accepts: ['recipient/model'], foreignThinking: 'omit' },
  ],
  representation: ADOPTION,
  parameterAdoptions: [],
  source: ADOPTION,
}
const CAPACITY: ResultCapacity = { bytes: '1000', blocks: '10', attachmentBytes: '0' }
const DIGEST = 'a'.repeat(64)

function admitted(
  call: ModelCallId,
  operation: ModelOperationId,
  capacity = CAPACITY,
): CallDocument {
  return {
    state: {
      call,
      revision: decoded(decodeRevision('1')),
      consumer: { owner: 'owner', work: 'work', position: 'position', purpose: 'purpose' },
      control: { kind: 'none' },
      custody: { kind: 'producer' },
      phase: 'accepted',
    },
    request: REQUEST,
    requestDigest: 'request-digest',
    capacity,
    initiator: { owner: 'authority', subject: 'subject', revision: '1' },
    admission: operation,
    owner: { consumerOwner: 'owner', work: { kind: 'exempt' }, evidence: ADOPTION },
    execution: null,
    dispatches: [],
    retry: null,
    retryPosition: null,
    retrySource: null,
    cursor: decoded(decodeOutputCursor('0')),
    snapshots: new Map(),
    reads: new Map(),
    cleanupFailure: null,
    resultPaging: { resultPageParts: 10, resultPageTargetBytes: 1000 },
  }
}

function dispatchOf(
  seq: number,
  operation: ModelOperationId,
  blocks: readonly VisibleBlock[] = [],
): DispatchDocument {
  return {
    record: {
      dispatch: decoded(decodeDispatchId(`mdisp_${seq}`)),
      supplier: SUPPLIER,
      intent: operation,
      send: 'prepared',
      firstContent: 'none-proven',
      terminal: null,
      account: null,
      materialization: null,
    },
    logicalTerminal: null,
    windows: new Map([['w1', 'open']]),
    events: new Map(),
    assembly: null,
    blocks,
    nextSeq: new Map([['0', '1']]),
    trims: new Map(),
    hadContent: new Set(['0']),
    diagnostics: [],
  }
}

function bindingOf(call: ModelCallId, method: BindingBase['method']): BindingBase {
  return {
    call,
    method,
    fingerprint: `fp-${method}`,
    revision: decoded(decodeRevision('1')),
    receipt: { kind: 'revision', revision: decoded(decodeRevision('1')) },
  }
}

function lookup(registered: readonly string[]): TenantDomainLookup {
  return {
    lookup: ({ tenant }) =>
      Promise.resolve(
        registered.includes(tenant)
          ? {
              kind: 'ready',
              domain: { scope: { kind: 'tenant', tenant }, transactionDomain: domainName(tenant) },
            }
          : { kind: 'unregistered' },
      ),
  }
}

function options(
  storage: SqlStorage,
  overrides: Partial<SqlModelStorageOptions> = {},
): SqlModelStorageOptions {
  return {
    storage,
    domains: lookup([A, B]),
    combination: { combinationVersion: 'v1', manifestDigest: DIGEST },
    limits: {
      tenantCapacity: { bytes: '2500', blocks: '100', attachmentBytes: '0' },
      maxCallBytes: 1 << 20,
      maxCommandBytes: (1 << 20) + COMMAND_RESERVE_BYTES,
    },
    ...overrides,
  }
}

type Change = (current: CallDocument | undefined) => CallDocument | undefined

/** One command attempt as the core runs it: read the documents, write once, answer. */
function write(
  store: SqlModelStorage,
  call: ModelCallId,
  operation: ModelOperationId,
  change: Change,
  tenant: string = A,
): Promise<Outcome<string, ModelFailure>> {
  return store.run(
    () => {
      const documents = store.documents(tenant)
      const binding = documents.operations.get(operation)
      if (binding?.status === 'committed') return { ok: 'recovered' }
      if (binding?.status === 'unknown') return { failure: { kind: 'commit-unknown', operation } }
      const original = documents.calls.get(call)
      const next = change(original === undefined ? undefined : structuredClone(original))
      store.commit(tenant, {
        operation,
        expected: original,
        call: next,
        binding: bindingOf(call, original === undefined ? 'admit' : 'control'),
      })
      return { ok: 'written' }
    },
    { tenant, call, operation },
  )
}

const edit =
  (change: (doc: CallDocument) => void): Change =>
  current => {
    if (current === undefined) throw new Error('no document')
    change(current)
    return current
  }

async function stored(store: SqlModelStorage, call: ModelCallId, tenant: string = A) {
  const read = await store.readCall({ tenant, call, operation: null })
  if ('failure' in read) throw new Error(`read failed: ${JSON.stringify(read.failure)}`)
  return read.ok
}

// --- Cases ---------------------------------------------------------------------------------

describe('construction', () => {
  it('accepts maxCallBytes plus the command reserve equal to maxCommandBytes', () => {
    expect(() => createSqlModelStorage(options(sqliteStorage().storage))).not.toThrow()
  })

  it('refuses limits where maxCallBytes plus the command reserve exceeds maxCommandBytes (N1)', () => {
    const limits = {
      tenantCapacity: CAPACITY,
      maxCallBytes: 1 << 20,
      maxCommandBytes: (1 << 20) + COMMAND_RESERVE_BYTES - 1,
    }
    expect(() => createSqlModelStorage(options(sqliteStorage().storage, { limits }))).toThrow(
      RangeError,
    )
  })

  it('refuses a call bound that the model.call output cannot carry', () => {
    const limits = { tenantCapacity: CAPACITY, maxCallBytes: 4 << 20, maxCommandBytes: 8 << 20 }
    expect(() => createSqlModelStorage(options(sqliteStorage().storage, { limits }))).toThrow(
      RangeError,
    )
  })

  it('refuses an empty combination version and a digest that is not SHA-256 hex', () => {
    const { storage } = sqliteStorage()
    const empty = { combinationVersion: '', manifestDigest: DIGEST }
    const upper = { combinationVersion: 'v1', manifestDigest: 'A'.repeat(64) }
    expect(() => createSqlModelStorage(options(storage, { combination: empty }))).toThrow(TypeError)
    expect(() => createSqlModelStorage(options(storage, { combination: upper }))).toThrow(TypeError)
  })
})

describe('commit and read back', () => {
  it('reads back every field of the written document at version 1', async () => {
    const store = createSqlModelStorage(options(sqliteStorage().storage))
    const call = callId('one')
    const document = admitted(call, opId('admit'))
    document.dispatches = [
      dispatchOf(0, opId('admit'), [
        { kind: 'sealed', index: '0', block: { type: 'text', text: 'done' } as never },
        { kind: 'growing', index: '1', mode: 'append', content: 'text', value: 'hel' },
      ]),
    ]
    document.reads.set(decoded(decodeReadId('mread_1')), {
      id: decoded(decodeReadId('mread_1')),
      lastProgress: '2026-11-02T00:00:00Z',
      furthest: 0,
      state: { kind: 'reading', offset: 0 },
    })
    document.cleanupFailure = 'x'
    expect(await write(store, call, opId('admit'), () => document)).toEqual({ ok: 'written' })
    const read = await stored(store, call)
    expect(read.record?.version).toBe(1)
    expect(read.record?.document).toEqual(document)
    expect(read.capacity).toEqual(CAPACITY)
  })

  it('keeps the latest snapshot, with its blocks taken from the dispatch they equal', async () => {
    const store = createSqlModelStorage(options(sqliteStorage().storage))
    const call = callId('snap')
    const blocks: VisibleBlock[] = [
      { kind: 'growing', index: '0', mode: 'append', content: 'text', value: 'abc' },
    ]
    const document = admitted(call, opId('admit'))
    document.dispatches = [dispatchOf(0, opId('admit'), blocks)]
    const older = decoded(decodeOutputCursor('1'))
    const latest = decoded(decodeOutputCursor('2'))
    document.cursor = latest
    document.snapshots.set(older, { call, cursor: older, blocks: [], state: document.state })
    document.snapshots.set(latest, { call, cursor: latest, blocks, state: document.state })
    await write(store, call, opId('admit'), () => document)
    const read = await stored(store, call)
    expect([...(read.record?.document.snapshots.values() ?? [])]).toEqual([
      { call, cursor: latest, blocks, state: document.state },
    ])
  })

  it('advances the version by one and binds the operation as committed', async () => {
    const store = createSqlModelStorage(options(sqliteStorage().storage))
    const call = callId('two')
    await write(store, call, opId('admit'), () => admitted(call, opId('admit')))
    await write(
      store,
      call,
      opId('fail'),
      edit(doc => (doc.cleanupFailure = 'x')),
    )
    const result = await store.run(
      () => {
        const documents = store.documents(A)
        return {
          ok: [
            documents.operations.get(opId('fail'))?.status,
            documents.calls.get(call)?.cleanupFailure,
          ],
        }
      },
      { tenant: A, call, operation: opId('fail') },
    )
    expect(result).toEqual({ ok: ['committed', 'x'] })
    expect((await stored(store, call)).record?.version).toBe(2)
  })

  it('persists published read progress without binding an operation', async () => {
    const sqlite = sqliteStorage()
    const store = createSqlModelStorage(options(sqlite.storage))
    const call = callId('publish')
    await write(store, call, opId('admit'), () => admitted(call, opId('admit')))
    const read = decoded(decodeReadId('mread_p'))
    const result = await store.run(
      () => {
        const original = store.documents(A).calls.get(call)
        if (original === undefined) return { failure: { kind: 'not-settled' } }
        const next = structuredClone(original)
        next.reads.set(read, {
          id: read,
          lastProgress: 'now',
          furthest: 2,
          state: { kind: 'reading', offset: 2 },
        })
        store.publish(A, next)
        return { failure: { kind: 'denied', action: 'content' } }
      },
      { tenant: A, call },
    )
    expect(result).toEqual({ failure: { kind: 'denied', action: 'content' } })
    const after = await stored(store, call)
    expect(after.record?.version).toBe(2)
    expect(after.record?.document.reads.get(read)?.furthest).toBe(2)
    expect(sqlite.rows('domain-a', 'SELECT count(*) FROM md_operation')).toEqual([[1n]])
  })
})

describe('CAS conflict', () => {
  it('runs the work again on a new read when another write committed in between', async () => {
    const sqlite = sqliteStorage()
    const store = createSqlModelStorage(options(sqlite.storage))
    const call = callId('race')
    await write(store, call, opId('admit'), () => admitted(call, opId('admit')))
    sqlite.hooks.beforeCommit = async () => {
      const other = await write(
        store,
        call,
        opId('first'),
        edit(doc => (doc.cleanupFailure = 'first')),
      )
      expect(other).toEqual({ ok: 'written' })
    }
    const seen: (string | null)[] = []
    const result = await write(
      store,
      call,
      opId('second'),
      edit(doc => {
        seen.push(doc.cleanupFailure)
        doc.requestDigest = `${doc.cleanupFailure ?? 'none'}+second`
      }),
    )
    expect(result).toEqual({ ok: 'written' })
    expect(seen).toEqual([null, 'first'])
    const read = await stored(store, call)
    expect(read.record?.version).toBe(3)
    expect(read.record?.document.cleanupFailure).toBe('first')
    expect(read.record?.document.requestDigest).toBe('first+second')
  })

  it('stops a participant write whose expected version is not the stored version', async () => {
    const sqlite = sqliteStorage()
    const recorded: { facts: Readonly<Record<string, JsonValue>> | null } = { facts: null }
    const recorder: SqlStorage = {
      ...sqlite.storage,
      commit(request) {
        recorded.facts = request.commands[0]?.facts ?? null
        return sqlite.storage.commit(request)
      },
    }
    const store = createSqlModelStorage(options(recorder))
    const call = callId('cas')
    await write(store, call, opId('admit'), () => admitted(call, opId('admit')))
    await write(
      store,
      call,
      opId('next'),
      edit(() => undefined),
    )
    const facts = recorded.facts
    const row = facts?.['row']
    const bound = facts?.['binding']
    if (!isObject(row) || !isObject(bound)) throw new Error('no facts')
    // The same write once more, at a version ahead of the stored one (stored 2, expected 4).
    const ahead = {
      ...facts,
      expected: 4,
      row: { ...row, row_version: 5 },
      binding: { ...bound, operation: 'mop_ahead' },
    }
    const result = await sqlite.storage.commit({
      identity: {
        scope: { kind: 'tenant', tenant: A },
        transactionDomain: 'domain-a',
        operation: 'mop_ahead',
        protocolVersion: '2',
        operationKey: 'mop_ahead#1',
      },
      combinationVersion: 'v1',
      manifestDigest: DIGEST,
      commands: [{ participant: 'model', facts: ahead }],
    })
    expect(result.kind === 'rolled_back' && result.responses.at(-1)?.reply).toEqual({
      kind: 'conflict',
      basis: { reason: 'version' },
    })
    expect(sqlite.rows('domain-a', 'SELECT row_version FROM md_call')).toEqual([[2n]])
  })
})

describe('operation identity', () => {
  it('shows a bound operation as committed so the work recognizes it, with no new commit', async () => {
    const sqlite = sqliteStorage()
    const store = createSqlModelStorage(options(sqlite.storage))
    const call = callId('again')
    await write(store, call, opId('admit'), () => admitted(call, opId('admit')))
    const before = sqlite.commits()
    expect(await write(store, call, opId('admit'), () => admitted(call, opId('admit')))).toEqual({
      ok: 'recovered',
    })
    expect(sqlite.commits()).toBe(before)
  })

  it('answers commit-unknown when the reply is lost, then shows the committed original', async () => {
    const sqlite = sqliteStorage()
    const store = createSqlModelStorage(options(sqlite.storage))
    const call = callId('lost')
    sqlite.hooks.loseNextReply = true
    expect(await write(store, call, opId('admit'), () => admitted(call, opId('admit')))).toEqual({
      failure: { kind: 'commit-unknown', operation: opId('admit') },
    })
    const before = sqlite.commits()
    expect(await write(store, call, opId('admit'), () => admitted(call, opId('admit')))).toEqual({
      ok: 'recovered',
    })
    expect(sqlite.commits()).toBe(before)
    expect(sqlite.rows('domain-a', 'SELECT count(*) FROM md_call')).toEqual([[1n]])
  })

  it('keeps an operation with an undecided commit as unknown until the storage decides it', async () => {
    const sqlite = sqliteStorage()
    const store = createSqlModelStorage(options(sqlite.storage))
    const call = callId('held')
    await write(store, call, opId('admit'), () => admitted(call, opId('admit')))
    sqlite.hooks.holdNextCommit = true
    expect(
      await write(
        store,
        call,
        opId('held'),
        edit(doc => (doc.cleanupFailure = 'h')),
      ),
    ).toEqual({
      failure: { kind: 'commit-unknown', operation: opId('held') },
    })
    const statusOf = () =>
      store.run(() => ({ ok: store.documents(A).operations.get(opId('held'))?.status ?? 'none' }), {
        tenant: A,
        call,
        operation: opId('probe'),
      })
    expect(await statusOf()).toEqual({ ok: 'unknown' })
    expect(
      await write(
        store,
        call,
        opId('held'),
        edit(() => undefined),
      ),
    ).toEqual({
      failure: { kind: 'commit-unknown', operation: opId('held') },
    })
    sqlite.release()
    expect(await statusOf()).toEqual({ ok: 'none' })
    expect((await stored(store, call)).record?.document.cleanupFailure).toBe('h')
  })
})

describe('tenant share', () => {
  it('refuses a new call above the tenant share and writes no row', async () => {
    const sqlite = sqliteStorage()
    const store = createSqlModelStorage(options(sqlite.storage))
    const big = { bytes: '1500', blocks: '1', attachmentBytes: '0' }
    expect(
      await write(store, callId('c1'), opId('a1'), () => admitted(callId('c1'), opId('a1'), big)),
    ).toEqual({
      ok: 'written',
    })
    expect(
      await write(store, callId('c2'), opId('a2'), () => admitted(callId('c2'), opId('a2'), big)),
    ).toEqual({
      failure: { kind: 'capacity', required: big },
    })
    expect(sqlite.rows('domain-a', 'SELECT call FROM md_call')).toEqual([['mcall_c1']])
    expect(sqlite.rows('domain-a', 'SELECT count(*) FROM md_operation')).toEqual([[1n]])
  })

  it('reports the held share and does not count a call whose request is released', async () => {
    const store = createSqlModelStorage(options(sqliteStorage().storage))
    const big = { bytes: '1500', blocks: '1', attachmentBytes: '0' }
    await write(store, callId('c1'), opId('a1'), () => admitted(callId('c1'), opId('a1'), big))
    const reserved = await store.run(() => ({ ok: store.reserved('bytes') }), {
      tenant: A,
      call: callId('c2'),
    })
    expect(reserved).toEqual({ ok: 1500n })
    await write(
      store,
      callId('c1'),
      opId('rel'),
      edit(doc => (doc.request = null)),
    )
    expect(
      await write(store, callId('c2'), opId('a2'), () => admitted(callId('c2'), opId('a2'), big)),
    ).toEqual({
      ok: 'written',
    })
  })
})

describe('tenant isolation', () => {
  it('does not read a call row of another tenant planted in the domain', async () => {
    const sqlite = sqliteStorage()
    const store = createSqlModelStorage(options(sqlite.storage))
    const call = callId('planted')
    await write(store, call, opId('b-admit'), () => admitted(call, opId('b-admit')), B)
    const [row] = sqlite.rows('domain-b', 'SELECT * FROM md_call')
    if (row === undefined) throw new Error('no row of B')
    sqlite.seed('domain-a', `INSERT INTO md_call VALUES (${row.map(() => '?').join(', ')})`, [
      ...(row as SqlValue[]),
    ])
    const read = await stored(store, call)
    expect(read.record).toBeUndefined()
    expect(read.capacity).toEqual({ bytes: '0', blocks: '0', attachmentBytes: '0' })
  })

  it('does not list a pending call of another tenant planted in the domain', async () => {
    const sqlite = sqliteStorage()
    const store = createSqlModelStorage(options(sqlite.storage))
    await write(store, callId('p'), opId('p'), () => admitted(callId('p'), opId('p')))
    sqlite.seed('domain-a', 'UPDATE md_call SET tenant = ?', [B])
    expect(await store.readPending({ tenant: A, after: null, limit: 10 })).toEqual({
      ok: { calls: [], next: null },
    })
  })

  it('reads another tenant than the run scope as empty (D3d)', async () => {
    const store = createSqlModelStorage(options(sqliteStorage().storage))
    const result = await store.run(() => ({ ok: store.documents(B).calls.size }), {
      tenant: A,
      call: callId('x'),
    })
    expect(result).toEqual({ ok: 0 })
  })

  it('answers unavailable when a run without a scope reads documents', async () => {
    const store = createSqlModelStorage(options(sqliteStorage().storage))
    const result = await store.run(() => ({ ok: store.documents(A).calls.size }))
    expect('failure' in result && result.failure.kind).toBe('unavailable')
  })

  it('reads an unregistered tenant as empty and refuses its writes', async () => {
    const store = createSqlModelStorage(options(sqliteStorage().storage, { domains: lookup([]) }))
    expect((await stored(store, callId('none'))).record).toBeUndefined()
    const written = await write(store, callId('none'), opId('w'), () =>
      admitted(callId('none'), opId('w')),
    )
    expect('failure' in written && written.failure.kind).toBe('unavailable')
  })
})

describe('pending flag', () => {
  it('lists calls that the core rule marks pending, in call order, and drops them later', async () => {
    const store = createSqlModelStorage(options(sqliteStorage().storage))
    const small = { bytes: '10', blocks: '1', attachmentBytes: '0' }
    for (const name of ['m2', 'm1', 'm3'])
      expect(
        await write(store, callId(name), opId(name), () =>
          admitted(callId(name), opId(name), small),
        ),
      ).toEqual({
        ok: 'written',
      })
    expect(await store.readPending({ tenant: A, after: null, limit: 2 })).toEqual({
      ok: { calls: [callId('m1'), callId('m2')], next: callId('m2') },
    })
    // Settled, handed off and cleaned up: the core rule leaves no recovery work.
    const settled = edit(doc => {
      doc.state = {
        ...doc.state,
        custody: {
          kind: 'acknowledged',
          operation: opId('ack'),
          receipt: { owner: 'o', record: 'r', revision: '1', digest: 'd' },
          cleanup: 'released',
          diagnostic: null,
        },
        phase: 'settled',
        settlement: {
          version: 'mrver_1' as never,
          termination: { kind: 'completed', reason: 'stop' },
          cursor: doc.cursor,
          source: { owner: 'o', record: 'r', revision: '1', digest: 'd' },
        },
      }
    })
    await write(store, callId('m1'), opId('settle'), settled)
    expect(await store.readPending({ tenant: A, after: null, limit: 10 })).toEqual({
      ok: { calls: [callId('m2'), callId('m3')], next: null },
    })
  })
})

describe('parts', () => {
  const growingBlock = (value: string): VisibleBlock => ({
    kind: 'growing',
    index: '0',
    mode: 'append',
    content: 'text',
    value,
  })
  const withBlocks = (blocks: readonly VisibleBlock[]): Change =>
    edit(doc => {
      const dispatch = doc.dispatches[0]
      if (dispatch === undefined) throw new Error('no dispatch')
      dispatch.blocks = blocks
    })
  async function started(store: SqlModelStorage, call: ModelCallId) {
    await write(store, call, opId('admit'), () => {
      const doc = admitted(call, opId('admit'))
      doc.dispatches = [dispatchOf(0, opId('admit'))]
      return doc
    })
  }
  const partRows = (sqlite: ReturnType<typeof sqliteStorage>) =>
    sqlite.rows('domain-a', 'SELECT kind FROM md_part ORDER BY seq, block, part').map(row => row[0])

  it(`folds the append parts of a block into one row at ${PART_MERGE_THRESHOLD} parts (N2)`, async () => {
    const sqlite = sqliteStorage()
    const store = createSqlModelStorage(options(sqlite.storage))
    const call = callId('grow')
    await started(store, call)
    let value = ''
    for (let batch = 0; batch < PART_MERGE_THRESHOLD; batch += 1) {
      value += `d${batch};`
      expect(
        await write(store, call, opId(`b${batch}`), withBlocks([growingBlock(value)])),
      ).toEqual({
        ok: 'written',
      })
    }
    expect(partRows(sqlite)).toEqual(['open', 'append'])
    expect((await stored(store, call)).record?.document.dispatches[0]?.blocks).toEqual([
      growingBlock(value),
    ])
  })

  it('keeps only the latest replace part and drops the growth parts when a block seals', async () => {
    const sqlite = sqliteStorage()
    const store = createSqlModelStorage(options(sqlite.storage))
    const call = callId('replace')
    await started(store, call)
    const replaced = (text: string): VisibleBlock => ({
      kind: 'growing',
      index: '0',
      mode: 'replace',
      content: 'text',
      value: text,
    })
    await write(store, call, opId('r1'), withBlocks([replaced('a')]))
    await write(store, call, opId('r2'), withBlocks([replaced('ab')]))
    expect(partRows(sqlite)).toEqual(['open', 'replace'])
    const sealed: VisibleBlock = {
      kind: 'sealed',
      index: '0',
      block: { type: 'text', text: 'ab' } as never,
    }
    await write(store, call, opId('seal'), withBlocks([sealed]))
    expect(partRows(sqlite)).toEqual(['seal'])
    expect((await stored(store, call)).record?.document.dispatches[0]?.blocks).toEqual([sealed])
  })

  it('removes every part of a dispatch whose blocks are cleared', async () => {
    const sqlite = sqliteStorage()
    const store = createSqlModelStorage(options(sqlite.storage))
    const call = callId('clear')
    await started(store, call)
    await write(store, call, opId('g'), withBlocks([growingBlock('x')]))
    await write(store, call, opId('c'), withBlocks([]))
    expect(partRows(sqlite)).toEqual([])
  })

  it('reads a call at the row bound and answers unavailable one row above it', async () => {
    const sqlite = sqliteStorage()
    const store = createSqlModelStorage(options(sqlite.storage))
    const call = callId('rows')
    await started(store, call)
    // One dispatch row; the call, operation and capacity rows take three more of the bound.
    sqlite.seed(
      'domain-a',
      `INSERT INTO md_part (tenant, call, seq, block, part, kind, payload)
       WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
       SELECT ?, ?, 0, i, 0, 'open', '{"index":"0","mode":"append","content":"text"}' FROM n`,
      [BigInt(CALL_READ_MAX_ROWS - 5), A, call],
    )
    const atBound = await store.readCall({ tenant: A, call, operation: null })
    expect('ok' in atBound && atBound.ok.record?.parts).toHaveLength(CALL_READ_MAX_ROWS - 4)
    sqlite.seed(
      'domain-a',
      `INSERT INTO md_part (tenant, call, seq, block, part, kind, payload) VALUES (?, ?, 0, ?, 0, 'open', '{"index":"0","mode":"append","content":"text"}')`,
      [A, call, BigInt(CALL_READ_MAX_ROWS - 4)],
    )
    const above = await store.readCall({ tenant: A, call, operation: null })
    expect('failure' in above && above.failure.kind).toBe('unavailable')
  })
})
