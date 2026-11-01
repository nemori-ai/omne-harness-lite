// The commit loop through its public entry, against the real participant, migration and read
// handlers of this member on node:sqlite. The storage below is a test provider: one in-memory
// database per transaction domain, receipts by full identity, rollback on a stopping reply. It
// does not model Workers, durability, queues or limits; the real provider is joined later
// (sqlite-provider, integration A).
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
  type ModelOperationId,
  type ResultCapacity,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import {
  inputDigestV2,
  type JsonValue,
  type CommitRequestV2,
  type CommitResultV2,
  type ReceiptV2,
  type SqlStorage,
  type TenantDomainLookup,
} from '@omne-harness/sql-contract'
import type { QueryRows, SqlValue } from '@omne-harness/sql-contract/worker'
import {
  CALL_READ_MAX_ROWS,
  COMMAND_RESERVE_BYTES,
  PART_MERGE_THRESHOLD,
  callHandler,
  createModelStore,
  modelMigration,
  pendingHandler,
  type ModelStore,
  type ModelStoreOptions,
  type StoredModelDocument,
  type StoredPart,
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
const HANDLERS = new Map([callHandler, pendingHandler].map(item => [item.handler, item]))

function sqliteStorage() {
  const domains = new Map<string, Domain>()
  const hooks: { beforeCommit: (() => Promise<void>) | null; loseNextReply: boolean } = {
    beforeCommit: null,
    loseNextReply: false,
  }
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
  const execute = (domain: Domain, request: CommitRequestV2, inputDigest: string): ReceiptV2 => {
    const command = request.commands[0]
    if (command === undefined) throw new Error('no command')
    const head = {
      identity: request.identity,
      inputDigest,
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
  const keyOf = (identity: CommitRequestV2['identity']) =>
    `${identity.operation}|${identity.operationKey}`
  const storage: SqlStorage = {
    registerCombination: input => Promise.resolve({ kind: 'registered', registration: input }),
    async commit(request): Promise<CommitResultV2> {
      const hook = hooks.beforeCommit
      hooks.beforeCommit = null
      if (hook !== null) await hook()
      commits += 1
      const domain = domainOf(request.identity.transactionDomain)
      const inputDigest = inputDigestV2(request)
      const existing = domain.receipts.get(keyOf(request.identity))
      if (existing !== undefined)
        return existing.inputDigest === inputDigest
          ? existing
          : { kind: 'identity_conflict', identity: request.identity, existing }
      const receipt = execute(domain, request, inputDigest)
      domain.receipts.set(keyOf(request.identity), receipt)
      if (hooks.loseNextReply) {
        hooks.loseNextReply = false
        return { kind: 'unknown', identity: request.identity, diagnostic: null }
      }
      return receipt
    },
    query(identity) {
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
const tenantText = (tenant: TenantId): string => {
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new Error('fixture tenant does not encode')
  return text.value
}

const TENANT_A = tenantOf('a')
const TENANT_B = tenantOf('b')
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
): StoredModelDocument {
  return {
    version: 0,
    call: {
      call,
      admission: operation,
      owner: { consumerOwner: 'owner', work: { kind: 'exempt' }, evidence: ADOPTION },
      initiator: { owner: 'authority', subject: 'subject', revision: '1' },
      request: REQUEST,
      requestDigest: 'request-digest',
      capacity,
      state: {
        call,
        revision: decoded(decodeRevision('1')),
        consumer: { owner: 'owner', work: 'work', position: 'position', purpose: 'purpose' },
        control: { kind: 'none' },
        custody: { kind: 'producer' },
        phase: 'accepted',
      },
      execution: null,
      retry: null,
      retryPosition: null,
      retrySource: null,
      cursor: decoded(decodeOutputCursor('0')),
      snapshot: null,
      paging: { resultPageParts: 10, resultPageTargetBytes: 1000 },
      cleanupFailure: null,
      pending: null,
    },
    dispatches: [],
    parts: [],
    binding: bindingOf(call, operation, 'admit'),
  }
}

function bindingOf(call: ModelCallId, operation: ModelOperationId, method: string) {
  return {
    operation,
    call,
    method,
    fingerprint: `fp-${method}`,
    revision: decoded(decodeRevision('1')),
    receipt: { kind: method },
  }
}

function withDispatch(
  document: StoredModelDocument,
  operation: ModelOperationId,
): StoredModelDocument {
  const dispatch = decoded(decodeDispatchId('mdisp_1'))
  return {
    ...document,
    dispatches: [
      {
        seq: 0,
        record: {
          dispatch,
          supplier: SUPPLIER,
          intent: operation,
          send: 'prepared',
          firstContent: 'none-proven',
          terminal: null,
          account: null,
          materialization: null,
        },
        logicalTerminal: null,
        windows: [],
        events: [],
        nextSeq: [],
        trims: [],
        hadContent: [],
        diagnostics: [],
      },
    ],
  }
}

const domainName = (tenant: TenantId): string =>
  `domain-${tenantText(tenant).length}-${tenantText(tenant).slice(20, 24)}`

function lookup(registered: readonly TenantId[]): TenantDomainLookup {
  const known = new Map(registered.map(tenant => [tenantText(tenant), domainName(tenant)]))
  return {
    lookup: ({ tenant }) => {
      const name = known.get(tenant)
      return Promise.resolve(
        name === undefined
          ? { kind: 'unregistered' }
          : {
              kind: 'ready',
              domain: { scope: { kind: 'tenant', tenant }, transactionDomain: name },
            },
      )
    },
  }
}

function options(
  storage: SqlStorage,
  overrides: Partial<ModelStoreOptions> = {},
): ModelStoreOptions {
  return {
    storage,
    domains: lookup([TENANT_A, TENANT_B]),
    combination: { combinationVersion: 'v1', manifestDigest: DIGEST },
    limits: {
      tenantCapacity: { bytes: '2500', blocks: '100', attachmentBytes: '0' },
      maxCallBytes: 1 << 20,
      maxCommandBytes: (1 << 20) + COMMAND_RESERVE_BYTES,
    },
    ...overrides,
  }
}

/** Writes `next` at the version the transaction read, under `operation`. */
async function put(
  store: ModelStore,
  call: ModelCallId,
  operation: ModelOperationId,
  change: (current: StoredModelDocument | undefined) => StoredModelDocument,
  tenant: TenantId = TENANT_A,
) {
  return store.transact({ tenant, call, operation }, tx => {
    const current = tx.read(tenant, operation)
    if ('failure' in current) return current
    return tx.write(tenant, operation, current.ok?.version ?? null, change(current.ok))
  })
}

const update =
  (
    operation: ModelOperationId,
    method: string,
    edit: (doc: StoredModelDocument) => Partial<StoredModelDocument['call']>,
  ) =>
  (current: StoredModelDocument | undefined): StoredModelDocument => {
    if (current === undefined) throw new Error('no document')
    return {
      ...current,
      call: { ...current.call, ...edit(current) },
      binding: bindingOf(current.call.call, operation, method),
    }
  }

async function readDocument(store: ModelStore, call: ModelCallId, tenant: TenantId = TENANT_A) {
  const read = await store.readCall({ tenant, call, operation: opId('reader') })
  if ('failure' in read) throw new Error(`read failed: ${JSON.stringify(read.failure)}`)
  return read.ok
}

// --- Cases ---------------------------------------------------------------------------------

describe('construction', () => {
  it('accepts maxCallBytes plus the command reserve equal to maxCommandBytes', () => {
    const { storage } = sqliteStorage()
    expect(() => createModelStore(options(storage))).not.toThrow()
  })

  it('refuses limits where maxCallBytes plus the command reserve exceeds maxCommandBytes (N1)', () => {
    const { storage } = sqliteStorage()
    const limits = {
      tenantCapacity: CAPACITY,
      maxCallBytes: 1 << 20,
      maxCommandBytes: (1 << 20) + COMMAND_RESERVE_BYTES - 1,
    }
    expect(() => createModelStore(options(storage, { limits }))).toThrow(RangeError)
  })

  it('refuses a call bound that the model.call output cannot carry', () => {
    const { storage } = sqliteStorage()
    const limits = { tenantCapacity: CAPACITY, maxCallBytes: 4 << 20, maxCommandBytes: 8 << 20 }
    expect(() => createModelStore(options(storage, { limits }))).toThrow(RangeError)
  })

  it('refuses an empty combination version and a manifest digest that is not SHA-256 hex', () => {
    const { storage } = sqliteStorage()
    expect(() =>
      createModelStore(
        options(storage, { combination: { combinationVersion: '', manifestDigest: DIGEST } }),
      ),
    ).toThrow(TypeError)
    expect(() =>
      createModelStore(
        options(storage, {
          combination: { combinationVersion: 'v1', manifestDigest: 'A'.repeat(64) },
        }),
      ),
    ).toThrow(TypeError)
  })
})

describe('commit and read back', () => {
  it('reads back the written call at version 1, bound to its operation', async () => {
    const { storage } = sqliteStorage()
    const store = createModelStore(options(storage))
    const call = callId('one')
    const written = admitted(call, opId('admit'))
    expect(await put(store, call, opId('admit'), () => written)).toEqual({ ok: 1 })
    const read = await readDocument(store, call)
    expect(read.document?.version).toBe(1)
    expect(read.document?.call).toEqual(written.call)
    expect(read.binding).toEqual(null)
    expect(read.capacity).toEqual(CAPACITY)
  })

  it('advances the version by one on each update and keeps the binding of the operation', async () => {
    const { storage } = sqliteStorage()
    const store = createModelStore(options(storage))
    const call = callId('two')
    await put(store, call, opId('admit'), () => admitted(call, opId('admit')))
    const result = await put(
      store,
      call,
      opId('fail'),
      update(opId('fail'), 'control', () => ({ cleanupFailure: 'x' })),
    )
    expect(result).toEqual({ ok: 2 })
    const read = await store.readCall({ tenant: TENANT_A, call, operation: opId('fail') })
    expect('ok' in read && read.ok.document?.binding?.method).toBe('control')
    expect('ok' in read && read.ok.document?.call.cleanupFailure).toBe('x')
  })

  it('answers a stale expected version with a version conflict and writes nothing', async () => {
    const { storage, commits } = sqliteStorage()
    const store = createModelStore(options(storage))
    const call = callId('stale')
    await put(store, call, opId('admit'), () => admitted(call, opId('admit')))
    const before = commits()
    const result = await store.transact({ tenant: TENANT_A, call, operation: opId('late') }, tx => {
      const current = tx.read(TENANT_A, opId('late'))
      if ('failure' in current || current.ok === undefined) throw new Error('no document')
      return tx.write(
        TENANT_A,
        opId('late'),
        current.ok.version - 1,
        update(opId('late'), 'control', () => ({}))(current.ok),
      )
    })
    expect(result).toEqual({ failure: { kind: 'conflict', reason: 'version' } })
    expect(commits()).toBe(before)
  })
})

describe('CAS conflict', () => {
  it('runs the work again on a new read when another write committed in between', async () => {
    const sqlite = sqliteStorage()
    const store = createModelStore(options(sqlite.storage))
    const call = callId('race')
    await put(store, call, opId('admit'), () => admitted(call, opId('admit')))
    sqlite.hooks.beforeCommit = async () => {
      const other = await put(
        store,
        call,
        opId('first'),
        update(opId('first'), 'control', () => ({ cleanupFailure: 'first' })),
      )
      expect(other).toEqual({ ok: 2 })
    }
    const seen: number[] = []
    const result = await store.transact(
      { tenant: TENANT_A, call, operation: opId('second') },
      tx => {
        const current = tx.read(TENANT_A, opId('second'))
        if ('failure' in current || current.ok === undefined) throw new Error('no document')
        seen.push(current.ok.version)
        const next = update(opId('second'), 'claim', doc => ({
          requestDigest: `${doc.call.cleanupFailure ?? 'none'}+second`,
        }))(current.ok)
        return tx.write(TENANT_A, opId('second'), current.ok.version, next)
      },
    )
    expect(result).toEqual({ ok: 3 })
    expect(seen).toEqual([1, 2])
    const read = await readDocument(store, call)
    expect(read.document?.call.cleanupFailure).toBe('first')
    expect(read.document?.call.requestDigest).toBe('first+second')
  })

  it('stops a participant write whose expected version is not the stored version', async () => {
    const sqlite = sqliteStorage()
    const store = createModelStore(options(sqlite.storage))
    const call = callId('cas')
    await put(store, call, opId('admit'), () => admitted(call, opId('admit')))
    const recorded: { facts: Readonly<Record<string, JsonValue>> | null } = { facts: null }
    const recorder: SqlStorage = {
      ...sqlite.storage,
      commit(request) {
        recorded.facts = request.commands[0]?.facts ?? null
        return sqlite.storage.commit(request)
      },
    }
    const recording = createModelStore(options(recorder))
    await put(
      recording,
      call,
      opId('next'),
      update(opId('next'), 'control', () => ({})),
    )
    const facts = recorded.facts
    const head = facts?.['row']
    const bound = facts?.['binding']
    if (!isObject(head) || !isObject(bound)) throw new Error('no facts')
    // The same write once more, but at a version ahead of the stored one (stored 2, expected 4).
    const ahead = {
      ...facts,
      operation: 'mop_ahead',
      expected: 4,
      row: { ...head, row_version: 5 },
      binding: { ...bound, operation: 'mop_ahead' },
    }
    const domain = domainName(TENANT_A)
    const result = await sqlite.storage.commit({
      identity: {
        scope: { kind: 'tenant', tenant: tenantText(TENANT_A) },
        transactionDomain: domain,
        operation: 'mop_ahead',
        protocolVersion: '2',
        operationKey: 'mop_ahead#1',
      },
      combinationVersion: 'v1',
      manifestDigest: DIGEST,
      commands: [
        {
          participant: 'model',
          facts: ahead,
        },
      ],
    })
    expect(result.kind).toBe('rolled_back')
    expect(result.kind === 'rolled_back' && result.responses.at(-1)?.reply).toEqual({
      kind: 'conflict',
      basis: { reason: 'version' },
    })
    expect(sqlite.rows(domain, 'SELECT row_version FROM md_call')).toEqual([[2n]])
  })
})

describe('operation identity', () => {
  it('lets the work recognize an operation already bound to the call, with no new commit', async () => {
    const { storage, commits } = sqliteStorage()
    const store = createModelStore(options(storage))
    const call = callId('again')
    await put(store, call, opId('admit'), () => admitted(call, opId('admit')))
    const before = commits()
    const result = await store.transact(
      { tenant: TENANT_A, call, operation: opId('admit') },
      tx => {
        const current = tx.read(TENANT_A, opId('admit'))
        if ('failure' in current) return current
        return { ok: current.ok?.binding?.method ?? 'unbound' }
      },
    )
    expect(result).toEqual({ ok: 'admit' })
    expect(commits()).toBe(before)
  })

  it('refuses a read for an operation bound to another call', async () => {
    const { storage } = sqliteStorage()
    const store = createModelStore(options(storage))
    await put(store, callId('owner'), opId('shared'), () =>
      admitted(callId('owner'), opId('shared')),
    )
    const result = await store.transact(
      { tenant: TENANT_A, call: callId('other'), operation: opId('shared') },
      tx => tx.read(TENANT_A, opId('shared')),
    )
    expect(result).toEqual({ failure: { kind: 'conflict', reason: 'operation-bound' } })
  })

  it('answers commit-unknown when the reply is lost, then recognizes the committed original', async () => {
    const sqlite = sqliteStorage()
    const store = createModelStore(options(sqlite.storage))
    const call = callId('lost')
    sqlite.hooks.loseNextReply = true
    expect(await put(store, call, opId('admit'), () => admitted(call, opId('admit')))).toEqual({
      failure: { kind: 'commit-unknown', operation: opId('admit') },
    })
    const before = sqlite.commits()
    const again = await store.transact({ tenant: TENANT_A, call, operation: opId('admit') }, tx => {
      const current = tx.read(TENANT_A, opId('admit'))
      if ('failure' in current) return current
      return current.ok?.binding === null || current.ok === undefined
        ? tx.write(TENANT_A, opId('admit'), null, admitted(call, opId('admit')))
        : { ok: current.ok.version }
    })
    expect(again).toEqual({ ok: 1 })
    expect(sqlite.commits()).toBe(before)
    expect(sqlite.rows(domainName(TENANT_A), 'SELECT count(*) FROM md_call')).toEqual([[1n]])
  })

  it('never commits a second generation after a committed one', async () => {
    const sqlite = sqliteStorage()
    const store = createModelStore(options(sqlite.storage))
    const call = callId('twice')
    sqlite.hooks.loseNextReply = true
    await put(store, call, opId('admit'), () => admitted(call, opId('admit')))
    const result = await store.transact({ tenant: TENANT_A, call, operation: opId('admit') }, tx =>
      tx.write(
        TENANT_A,
        opId('admit'),
        1,
        update(opId('admit'), 'admit', () => ({}))(admitted(call, opId('admit'))),
      ),
    )
    expect(result).toEqual({ failure: { kind: 'conflict', reason: 'operation-bound' } })
    expect(sqlite.rows(domainName(TENANT_A), 'SELECT row_version FROM md_call')).toEqual([[1n]])
  })
})

describe('tenant share', () => {
  it('refuses a new call above the tenant share and writes no row', async () => {
    const sqlite = sqliteStorage()
    const store = createModelStore(options(sqlite.storage))
    const big = { bytes: '1500', blocks: '1', attachmentBytes: '0' }
    expect(
      await put(store, callId('c1'), opId('a1'), () => admitted(callId('c1'), opId('a1'), big)),
    ).toEqual({ ok: 1 })
    expect(
      await put(store, callId('c2'), opId('a2'), () => admitted(callId('c2'), opId('a2'), big)),
    ).toEqual({
      failure: { kind: 'capacity' },
    })
    expect(sqlite.rows(domainName(TENANT_A), 'SELECT call FROM md_call')).toEqual([['mcall_c1']])
    expect(
      sqlite.rows(
        domainName(TENANT_A),
        "SELECT count(*) FROM md_operation WHERE operation = 'mop_a2'",
      ),
    ).toEqual([[0n]])
  })

  it('does not count a call whose request material is released', async () => {
    const sqlite = sqliteStorage()
    const store = createModelStore(options(sqlite.storage))
    const big = { bytes: '1500', blocks: '1', attachmentBytes: '0' }
    await put(store, callId('c1'), opId('a1'), () => admitted(callId('c1'), opId('a1'), big))
    await put(
      store,
      callId('c1'),
      opId('rel'),
      update(opId('rel'), 'advanceCleanup', () => ({ request: null })),
    )
    expect(
      await put(store, callId('c2'), opId('a2'), () => admitted(callId('c2'), opId('a2'), big)),
    ).toEqual({ ok: 1 })
  })
})

describe('tenant isolation of the reads', () => {
  it('does not read a call row of another tenant planted in the domain', async () => {
    const sqlite = sqliteStorage()
    const store = createModelStore(options(sqlite.storage))
    const call = callId('planted')
    await put(store, call, opId('b-admit'), () => admitted(call, opId('b-admit')), TENANT_B)
    const domainA = domainName(TENANT_A)
    const columns =
      'call, row_version, admission, owner, initiator, request, request_digest, cap_bytes, cap_blocks, cap_attachment, state, execution, retry, retry_position, retry_source, cursor, snapshot, paging, cleanup_failure, pending_operation, pending_at'
    const [row] = sqlite.rows(domainName(TENANT_B), `SELECT ${columns} FROM md_call`)
    if (row === undefined) throw new Error('no row of B')
    sqlite.seed(
      domainA,
      `INSERT INTO md_call (tenant, ${columns}) VALUES (${['?', ...row.map(() => '?')].join(', ')})`,
      [tenantText(TENANT_B), ...(row as SqlValue[])],
    )
    const read = await readDocument(store, call)
    expect(read.document).toBeUndefined()
    expect(read.capacity).toEqual({ bytes: '0', blocks: '0', attachmentBytes: '0' })
  })

  it('does not list a pending call of another tenant planted in the domain', async () => {
    const sqlite = sqliteStorage()
    const store = createModelStore(options(sqlite.storage))
    const call = callId('pend')
    await store.transact({ tenant: TENANT_A, call, operation: opId('p') }, tx => {
      tx.pending(TENANT_A, opId('p'), '2026-11-02T00:00:00Z')
      return tx.write(TENANT_A, opId('p'), null, admitted(call, opId('p')))
    })
    sqlite.seed(domainName(TENANT_A), 'UPDATE md_call SET tenant = ?', [tenantText(TENANT_B)])
    expect(await store.readPending({ tenant: TENANT_A, after: null, limit: 10 })).toEqual({
      ok: { calls: [], next: null },
    })
  })

  it('refuses a transaction method called for another tenant', async () => {
    const { storage } = sqliteStorage()
    const store = createModelStore(options(storage))
    const result = await store.transact(
      { tenant: TENANT_A, call: callId('x'), operation: opId('x') },
      tx => tx.read(TENANT_B, opId('x')),
    )
    expect(result).toEqual({ failure: { kind: 'out-of-scope', field: 'tenant' } })
  })

  it('answers an unregistered tenant read as an empty domain and refuses its writes', async () => {
    const { storage } = sqliteStorage()
    const store = createModelStore(options(storage, { domains: lookup([]) }))
    const read = await readDocument(store, callId('none'))
    expect(read.document).toBeUndefined()
    const written = await put(store, callId('none'), opId('w'), () =>
      admitted(callId('none'), opId('w')),
    )
    expect('failure' in written && written.failure.kind).toBe('unavailable')
  })
})

describe('pending mark', () => {
  it('lists a marked call in call order and drops it when a write clears the mark', async () => {
    const { storage } = sqliteStorage()
    const store = createModelStore(options(storage))
    const small = { bytes: '10', blocks: '1', attachmentBytes: '0' }
    for (const name of ['m2', 'm1', 'm3'])
      expect(
        await store.transact(
          { tenant: TENANT_A, call: callId(name), operation: opId(name) },
          tx => {
            tx.pending(TENANT_A, opId(name), '2026-11-02T00:00:00Z')
            return tx.write(TENANT_A, opId(name), null, admitted(callId(name), opId(name), small))
          },
        ),
      ).toEqual({ ok: 1 })
    expect(await store.readPending({ tenant: TENANT_A, after: null, limit: 2 })).toEqual({
      ok: { calls: [callId('m1'), callId('m2')], next: callId('m2') },
    })
    await put(
      store,
      callId('m1'),
      opId('clear'),
      update(opId('clear'), 'claim', () => ({ pending: null })),
    )
    expect(await store.readPending({ tenant: TENANT_A, after: null, limit: 10 })).toEqual({
      ok: { calls: [callId('m2'), callId('m3')], next: null },
    })
  })
})

describe('parts', () => {
  const index = '0'
  async function withParts(
    store: ModelStore,
    call: ModelCallId,
    parts: readonly StoredPart[],
    name: string,
  ) {
    return store.transact({ tenant: TENANT_A, call, operation: opId(name) }, tx => {
      const current = tx.read(TENANT_A, opId(name))
      if ('failure' in current || current.ok === undefined) throw new Error('no document')
      for (const part of parts) {
        const appended = tx.appendPart(TENANT_A, opId(name), part)
        if ('failure' in appended) return appended
      }
      return tx.write(
        TENANT_A,
        opId(name),
        current.ok.version,
        update(opId(name), 'preserve', () => ({}))(current.ok),
      )
    })
  }

  it(`folds the append parts of a block into one row at ${PART_MERGE_THRESHOLD} parts (N2)`, async () => {
    const sqlite = sqliteStorage()
    const store = createModelStore(options(sqlite.storage))
    const call = callId('parts')
    await put(store, call, opId('admit'), () =>
      withDispatch(admitted(call, opId('admit')), opId('admit')),
    )
    const open: StoredPart = {
      seq: 0,
      index,
      part: 0,
      kind: 'open',
      mode: 'append',
      content: 'text',
    }
    const deltas = Array.from({ length: PART_MERGE_THRESHOLD - 1 }, (_, at): StoredPart => ({
      seq: 0,
      index,
      part: at + 1,
      kind: 'append',
      delta: `d${at};`,
    }))
    expect(await withParts(store, call, [open, ...deltas], 'batch1')).toEqual({ ok: 2 })
    expect((await readDocument(store, call)).document?.parts).toHaveLength(PART_MERGE_THRESHOLD)
    const last: StoredPart = {
      seq: 0,
      index,
      part: PART_MERGE_THRESHOLD,
      kind: 'append',
      delta: 'end',
    }
    expect(await withParts(store, call, [last], 'batch2')).toEqual({ ok: 3 })
    const parts = (await readDocument(store, call)).document?.parts
    expect(parts).toEqual([
      open,
      {
        seq: 0,
        index,
        part: 1,
        kind: 'append',
        delta: `${deltas.map(item => (item.kind === 'append' ? item.delta : '')).join('')}end`,
      },
    ])
  })

  it('keeps only the latest replace part of a block', async () => {
    const sqlite = sqliteStorage()
    const store = createModelStore(options(sqlite.storage))
    const call = callId('replace')
    await put(store, call, opId('admit'), () =>
      withDispatch(admitted(call, opId('admit')), opId('admit')),
    )
    const open: StoredPart = {
      seq: 0,
      index,
      part: 0,
      kind: 'open',
      mode: 'replace',
      content: 'text',
    }
    await withParts(
      store,
      call,
      [open, { seq: 0, index, part: 1, kind: 'replace', value: 'a' }],
      'r1',
    )
    await withParts(store, call, [{ seq: 0, index, part: 2, kind: 'replace', value: 'ab' }], 'r2')
    expect((await readDocument(store, call)).document?.parts).toEqual([
      open,
      { seq: 0, index, part: 2, kind: 'replace', value: 'ab' },
    ])
  })

  it('reads a call at the row bound and answers unavailable one row above it', async () => {
    const sqlite = sqliteStorage()
    const store = createModelStore(options(sqlite.storage))
    const call = callId('rows')
    await put(store, call, opId('admit'), () =>
      withDispatch(admitted(call, opId('admit')), opId('admit')),
    )
    // One dispatch row; the call, operation and capacity rows take three more of the bound.
    const fill = (count: number) =>
      sqlite.seed(
        domainName(TENANT_A),
        `INSERT INTO md_part (tenant, call, seq, block, part, kind, payload)
         WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
         SELECT ?, ?, 0, 0, i, 'append', '{"delta":"x"}' FROM n`,
        [BigInt(count), tenantText(TENANT_A), call],
      )
    fill(CALL_READ_MAX_ROWS - 4)
    const atBound = await store.readCall({ tenant: TENANT_A, call, operation: opId('r') })
    expect('ok' in atBound && atBound.ok.document?.parts).toHaveLength(CALL_READ_MAX_ROWS - 4)
    sqlite.seed(
      domainName(TENANT_A),
      'INSERT INTO md_part (tenant, call, seq, block, part, kind, payload) VALUES (?, ?, 0, 1, 0, \'append\', \'{"delta":"x"}\')',
      [tenantText(TENANT_A), call],
    )
    const above = await store.readCall({ tenant: TENANT_A, call, operation: opId('r') })
    expect('failure' in above && above.failure.kind).toBe('unavailable')
  })

  it('refuses a part of a dispatch the call does not have', async () => {
    const { storage } = sqliteStorage()
    const store = createModelStore(options(storage))
    const call = callId('nodispatch')
    await put(store, call, opId('admit'), () => admitted(call, opId('admit')))
    const result = await withParts(
      store,
      call,
      [{ seq: 0, index, part: 0, kind: 'append', delta: 'x' }],
      'p',
    )
    expect(result).toEqual({ failure: { kind: 'invalid', field: 'part', reason: 'dispatch' } })
  })
})
