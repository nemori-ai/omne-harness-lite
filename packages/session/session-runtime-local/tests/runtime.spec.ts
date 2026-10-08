import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStorage, type SqlStorage } from '@omne-harness-lite/storage-sql'
import { StorageUnavailable, type AtomicStorage } from '@omne-harness-lite/storage'
import {
  parseAccountId,
  parseLoginStateId,
  parseTenantId,
  unwrap,
} from '@omne-harness-lite/identity-values'
import { isGovernanceCenterId } from '@omne-harness-lite/governance-center-entry'
import {
  openSqlSessionLog,
  sessionLogMigrations,
  type SqlSessionLog,
} from '@omne-harness-lite/session-log-sql'
import {
  readSessionFact,
  type Access,
  type CreateSessionInput,
} from '@omne-harness-lite/session-runtime'
import {
  createRuntimeContext,
  runtimeContextMigrations,
} from '@omne-harness-lite/runtime-context-local'
import { judgeMessage, type UserMessage } from '@omne-harness-lite/messages'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import { createLocalSessionIngress } from '../src/runtime.ts'
import { sessionRuntimeMigrations } from '../src/runtime-migrations.ts'
import { admissionMigrations, admissionUseMigrations } from '../src/admission-migrations.ts'
import { sessionStateMigrations } from '../src/state-migrations.ts'
import { operationReceiptMigrations } from '../src/receipt-migrations.ts'
import { createLocalAdmission } from '../src/admission.ts'
import type { AdmissionSource, LocalAdmission } from '../src/admission-types.ts'
import type { RuntimeOptions } from '../src/runtime-types.ts'

const roots: string[] = [],
  stores: SqlStorage[] = [],
  logs: SqlSessionLog[] = [],
  admissions: LocalAdmission[] = []
const centerId = 'a'.repeat(32)
if (!isGovernanceCenterId(centerId)) throw new Error('bad center fixture')
const source: AdmissionSource = {
  centerId,
  accountId: unwrap(parseAccountId('owner')),
  loginStateHandle: unwrap(parseLoginStateId('login')),
}
const tenant = unwrap(parseTenantId({ organization: 'team', account: 'owner' }))
const input: CreateSessionInput = {
  operationKey: 'create-1',
  definition: { category: 'agent_definition', name: 'actual-fixture' },
  executionType: 'interactive',
  mode: 'never',
  collaboration: 'co-work',
}
const at = '2026-10-08T00:00:00Z'
function user(text = 'Hello', id = 'message-1'): UserMessage {
  const checked = judgeMessage({
    id,
    type: 'user',
    createdAt: at,
    blocks: [
      { id: `block-${id}`, kind: 'text', text, visibility: { toHuman: true, toModel: true } },
    ],
  })
  if ('rejected' in checked || checked.ok.type !== 'user') throw new Error('bad user fixture')
  return checked.ok
}
afterEach(async () => {
  vi.restoreAllMocks()
  for (const log of logs.splice(0)) await log.close()
  for (const admission of admissions.splice(0)) await admission.close().catch(() => undefined)
  for (const storage of stores.splice(0)) await storage.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
/** Real root and tenant SQLite/G28/log/state/receipt composition; bootstrap assets are controlled inputs. */
async function fixture(
  initialize: RuntimeOptions['bootstrap']['initialize'] = vi.fn(async () => 'ready' as const),
) {
  const root = await mkdtemp(join(tmpdir(), 'omne-session-runtime-'))
  roots.push(root)
  const storage = await openStorage({
    dialect: 'sqlite',
    file: join(root, 'tenant.sqlite'),
    synchronous: 'full',
  })
  const rootStorage = await openStorage({
    dialect: 'sqlite',
    file: join(root, 'root.sqlite'),
    synchronous: 'full',
  })
  stores.push(storage, rootStorage)
  for (const fragment of admissionMigrations)
    await rootStorage.write(tx => fragment.migration.up(tx.db))
  for (const fragment of [
    ...admissionUseMigrations,
    ...sessionLogMigrations,
    ...sessionStateMigrations,
    ...operationReceiptMigrations,
    ...sessionRuntimeMigrations,
  ])
    await storage.write(tx => fragment.migration.up(tx.db))
  let decision: 'memberValid' | 'memberRejected' | 'rejected' = 'memberValid'
  const probe = vi.fn(async () => ({ kind: decision }))
  const admission = await createLocalAdmission(
    rootStorage,
    { verify: probe },
    { maxLogins: 8, maxTickets: 32, maxRecordBytes: 8192 },
  )
  admissions.push(admission)
  let log!: SqlSessionLog
  const options: RuntimeOptions = {
    storage,
    admission,
    source,
    tenant,
    principal: 'owner',
    policy: {
      maxSessions: 16,
      maxRecordBytes: 8192,
      maxInFlight: 16,
      state: { maxPendingPerSession: 8, maxBatchSize: 8, maxRecordBytes: 8192 },
      receipts: { maxRecords: 32, maxRecordBytes: 8192 },
    },
    log: authority => {
      log = openSqlSessionLog({ storage, authority, operationLimit: 32 })
      logs.push(log)
      return log.participant
    },
    bootstrap: { initialize },
    now: () => at,
    workSettledIn: async () => 'settled',
  }
  const runtime = createLocalSessionIngress(options)
  const count = (table: string) =>
    storage.read(tx =>
      tx.db
        .selectFrom(table)
        .select(eb => eb.fn.countAll<number>().as('n'))
        .executeTakeFirstOrThrow(),
    )
  return {
    root,
    storage,
    rootStorage,
    admission,
    probe,
    options,
    runtime,
    initialize,
    log: () => log,
    count,
    setDecision: (value: typeof decision) => {
      decision = value
    },
  }
}
async function create(f: Awaited<ReturnType<typeof fixture>>) {
  const result = await f.runtime.operations.createSession(f.runtime.access, input)
  expect(result).toHaveProperty('kind', 'created')
  if (!('kind' in result) || result.kind !== 'created') throw new Error('create failed')
  return result
}
it('publishes a single initialized empty Session without Run, attempt, pending input or model IO', async () => {
  const f = await fixture(),
    result = await create(f)
  expect(f.initialize).toHaveBeenCalledWith({ tenant, session: result.session }, input)
  expect(await f.runtime.operations.readSession(f.runtime.access, result.session)).toMatchObject({
    kind: 'session',
    session: { lifecycle: 'active', definition: input.definition, workspace: null },
  })
  expect(await f.runtime.operations.readProgress(f.runtime.access, result.session)).toMatchObject({
    kind: 'progress',
    progress: { state: 'idle', run: null, attempt: null },
  })
  expect(await f.count('sr_pending_input')).toEqual({ n: 0 })
  expect(await f.count('sr_run_seen')).toEqual({ n: 0 })
  const read = await f.log().readSince(result.session, 0)
  expect(read).toHaveProperty('entries')
  if ('failure' in read) throw new Error('read failed')
  expect(read.entries.map(readSessionFact)).toMatchObject([
    { kind: 'other' },
    { kind: 'fact', fact: { kind: 'session_created' } },
  ])
})
it('recognizes the original creation and receipt after later appends without rerunning bootstrap', async () => {
  const f = await fixture(),
    first = await create(f)
  const admitted = await f.runtime.operations.submitInput(
    f.runtime.access,
    first.session,
    'input-1',
    user(),
  )
  expect(admitted).toHaveProperty('kind', 'accepted')
  expect(await create(f)).toEqual(first)
  expect(f.initialize).toHaveBeenCalledTimes(1)
  expect(await f.runtime.operations.readReceipt(f.runtime.access, first.receipt.operation)).toEqual(
    { kind: 'present', receipt: first.receipt },
  )
  expect(await f.count('sr_session_creation')).toEqual({ n: 1 })
})
it('reserves the same identity through initialization failure and resumes without publishing early', async () => {
  const scopes: SessionScope[] = []
  const initialize = vi.fn(async (scope: SessionScope) => {
    scopes.push(scope)
    return scopes.length === 1 ? ('unavailable' as const) : ('ready' as const)
  })
  const f = await fixture(initialize)
  expect(await f.runtime.operations.createSession(f.runtime.access, input)).toEqual({
    failure: 'unavailable',
  })
  expect(await f.count('sr_operation_receipt')).toEqual({ n: 0 })
  expect(await f.count('sr_session_state')).toEqual({ n: 0 })
  expect(
    await f.runtime.operations.readSession(f.runtime.access, scopes[0]!.session),
  ).toMatchObject({ session: { lifecycle: 'initializing' } })
  expect(
    await f.runtime.operations.submitInput(f.runtime.access, scopes[0]!.session, 'input-1', user()),
  ).toEqual({ failure: 'notAccepting' })
  const created = await create(f)
  expect(scopes[1]).toEqual(scopes[0])
  expect(created.session).toBe(scopes[0]!.session)
  expect(await f.count('sr_session_creation')).toEqual({ n: 1 })
})
it('rejects a same-key different creation before bootstrapping another identity', async () => {
  const f = await fixture(),
    first = await create(f)
  expect(
    await f.runtime.operations.createSession(f.runtime.access, {
      ...input,
      mode: 'auto_permission',
    }),
  ).toEqual({ failure: 'conflict' })
  expect(await create(f)).toEqual(first)
  expect(f.initialize).toHaveBeenCalledTimes(1)
})
it('admits message, original fact, pending qualification and receipt in one real commit', async () => {
  const f = await fixture(),
    created = await create(f),
    message = user()
  const result = await f.runtime.operations.submitInput(
    f.runtime.access,
    created.session,
    'input-1',
    message,
  )
  expect(result).toMatchObject({ kind: 'accepted', receipt: { position: 4, source: { tail: 4 } } })
  expect(await f.count('sr_pending_input')).toEqual({ n: 1 })
  expect(await f.count('sr_run_seen')).toEqual({ n: 0 })
  const read = await f.log().readSince(created.session, 2)
  if ('failure' in read) throw new Error('read failed')
  expect(read.entries).toHaveLength(2)
  expect(read.entries[0]!.payload).toMatchObject({ kind: 'message', value: message })
  expect(readSessionFact(read.entries[1]!)).toMatchObject({
    fact: { kind: 'input_accepted', messagePosition: 3 },
  })
  expect(
    await f.runtime.operations.submitInput(f.runtime.access, created.session, 'input-1', message),
  ).toEqual(result)
  expect(
    await f.runtime.operations.submitInput(
      f.runtime.access,
      created.session,
      'input-1',
      user('changed'),
    ),
  ).toEqual({ failure: 'identityConflict' })
  expect(await f.count('sr_pending_input')).toEqual({ n: 1 })
})
it('rolls back staged message and fact if the pending capacity refuses admission', async () => {
  const f = await fixture()
  // Capacity is a construction policy, independent of the input payload.
  await f.runtime.close()
  await f.log().close()
  logs.pop()
  const limited = createLocalSessionIngress({
    ...f.options,
    policy: { ...f.options.policy, state: { ...f.options.policy.state, maxPendingPerSession: 1 } },
  })
  const created = await limited.operations.createSession(limited.access, input)
  if (!('kind' in created) || created.kind !== 'created') throw new Error('create failed')
  expect(
    await limited.operations.submitInput(limited.access, created.session, 'one', user()),
  ).toHaveProperty('kind', 'accepted')
  expect(
    await limited.operations.submitInput(
      limited.access,
      created.session,
      'two',
      user('second', 'message-2'),
    ),
  ).toEqual({ failure: 'unavailable' })
  expect(await f.log().readSince(created.session, 0)).toHaveProperty('tail', 4)
  expect(await f.count('sr_operation_receipt')).toEqual({ n: 2 })
  expect(await f.count('sr_pending_input')).toEqual({ n: 1 })
})
it('returns an original unknown input commit and recognizes its receipt without another append', async () => {
  const f = await fixture(),
    created = await create(f),
    actual = f.storage.atomic.bind(f.storage)
  let lose = true
  vi.spyOn(f.storage, 'atomic').mockImplementation(async action => {
    const result = await actual(action)
    if (lose) {
      lose = false
      throw new StorageUnavailable('lost original return')
    }
    return result
  })
  const result = await f.runtime.operations.submitInput(
    f.runtime.access,
    created.session,
    'input-1',
    user(),
  )
  expect(result).toMatchObject({
    kind: 'unknownCommit',
    operation: { operation: 'submitInput', operationKey: 'input-1', session: created.session },
  })
  if (!('kind' in result) || result.kind !== 'unknownCommit') throw new Error('missing unknown')
  expect(await f.runtime.operations.readReceipt(f.runtime.access, result.operation)).toMatchObject({
    kind: 'present',
    receipt: { position: 4 },
  })
  expect(
    await f.runtime.operations.submitInput(f.runtime.access, created.session, 'input-1', user()),
  ).toHaveProperty('kind', 'accepted')
  expect(await f.log().readSince(created.session, 0)).toHaveProperty('tail', 4)
})
it('uses live access and current member authority before disclosing a stored receipt or Session', async () => {
  const f = await fixture(),
    created = await create(f)
  expect(await f.runtime.operations.readSession({} as Access, created.session)).toEqual({
    failure: 'denied',
  })
  expect(
    await f.runtime.operations.readReceipt(f.runtime.access, {
      ...created.receipt.operation,
      principal: 'other',
    }),
  ).toEqual({ failure: 'denied' })
  f.setDecision('memberRejected')
  const ticket = await f.admission.reserve(source, {
    tenant,
    session: null,
    purpose: 'createSession',
    operationKey: 'revocation-check',
    inputPosition: null,
  })
  await f.admission.query(ticket.ticket)
  expect(
    await f.runtime.operations.readReceipt(f.runtime.access, created.receipt.operation),
  ).toEqual({ failure: 'denied' })
  expect(await f.runtime.operations.readSession(f.runtime.access, created.session)).toEqual({
    failure: 'denied',
  })
})
it('does not execute untrusted getters and refuses work after ingress close', async () => {
  const f = await fixture()
  let reads = 0
  const bad = {
    ...input,
    get mode() {
      reads++
      return 'never' as const
    },
  }
  expect(await f.runtime.operations.createSession(f.runtime.access, bad)).toEqual({
    failure: 'invalidInput',
  })
  expect(reads).toBe(0)
  expect(f.probe).not.toHaveBeenCalled()
  await f.runtime.close()
  expect(await f.runtime.operations.createSession(f.runtime.access, input)).toEqual({
    failure: 'unavailable',
  })
})

it('initializes the real Runtime Context journal before publishing the Session', async () => {
  let context: ReturnType<typeof createRuntimeContext> | undefined
  let f!: Awaited<ReturnType<typeof fixture>>
  const initialize = vi.fn(async (scope: SessionScope, original: CreateSessionInput) => {
    expect(original).toEqual(input)
    const initialized = await context!.initializer.initializeContextSession(scope, {
      required: [],
      initial: [],
      fixed: [],
    })
    return initialized.kind === 'applied' ? ('ready' as const) : ('unavailable' as const)
  })
  f = await fixture(initialize)
  for (const fragment of runtimeContextMigrations)
    await f.storage.write(tx => fragment.migration.up(tx.db))
  const backing = f.log().backing.borrow()
  context = createRuntimeContext({
    storage: f.storage,
    log: backing.log,
    access: { authorize: async () => ({ kind: 'rejected', reason: 'notAuthorized' }) },
    now: () => at,
  })
  try {
    const created = await create(f)
    const read = await f.log().readSince(created.session, 0)
    if ('failure' in read) throw new Error('read failed')
    expect(read.entries).toHaveLength(3)
    expect(read.entries[1]!.payload).toMatchObject({
      owner: 'runtime-context',
      kind: 'fact',
      value: { kind: 'session_initialized', scope: { tenant, session: created.session } },
    })
    expect(readSessionFact(read.entries[2]!)).toMatchObject({ fact: { kind: 'session_created' } })
    expect(created.receipt.source.tail).toBe(3)
    expect(await f.count('sr_pending_input')).toEqual({ n: 0 })
    expect(await f.count('sr_run_seen')).toEqual({ n: 0 })
  } finally {
    await f.runtime.close()
    context.closeAdmission()
    await context.drain()
    await backing.release()
  }
})
it('recognizes the reservation after a real tenant commit return is lost without allocating another Session', async () => {
  const f = await fixture(),
    actual = f.storage.atomic.bind(f.storage)
  let lose = true
  vi.spyOn(f.storage, 'atomic').mockImplementation(async action => {
    const result = await actual(action)
    if (lose) {
      lose = false
      throw new StorageUnavailable('reservation return lost')
    }
    return result
  })
  const unknown = await f.runtime.operations.createSession(f.runtime.access, input)
  expect(unknown).toMatchObject({
    kind: 'unknownCommit',
    operation: { operation: 'createSession', session: null },
  })
  expect(f.initialize).not.toHaveBeenCalled()
  expect(await f.count('sr_session_creation')).toEqual({ n: 1 })
  if (!('kind' in unknown) || unknown.kind !== 'unknownCommit')
    throw new Error('missing original operation')
  expect(await f.runtime.operations.readReceipt(f.runtime.access, unknown.operation)).toEqual({
    kind: 'absent',
  })
  const created = await create(f)
  expect(await f.count('sr_session_creation')).toEqual({ n: 1 })
  expect(await f.runtime.operations.readReceipt(f.runtime.access, unknown.operation)).toEqual({
    kind: 'present',
    receipt: created.receipt,
  })
})
it('recognizes a lost publication result as the original created receipt without reinitializing', async () => {
  let f!: Awaited<ReturnType<typeof fixture>>
  const initialize = vi.fn(async () => {
    const actual = f.storage.atomic.bind(f.storage)
    let lose = true
    vi.spyOn(f.storage, 'atomic').mockImplementation(async action => {
      const result = await actual(action)
      if (lose) {
        lose = false
        throw new StorageUnavailable('publication return lost')
      }
      return result
    })
    return 'ready' as const
  })
  f = await fixture(initialize)
  const unknown = await f.runtime.operations.createSession(f.runtime.access, input)
  expect(unknown).toMatchObject({
    kind: 'unknownCommit',
    operation: { operation: 'createSession' },
  })
  if (!('kind' in unknown) || unknown.kind !== 'unknownCommit')
    throw new Error('missing original operation')
  const receipt = await f.runtime.operations.readReceipt(f.runtime.access, unknown.operation)
  expect(receipt).toHaveProperty('kind', 'present')
  const created = await create(f)
  expect(receipt).toEqual({ kind: 'present', receipt: created.receipt })
  expect(initialize).toHaveBeenCalledTimes(1)
  expect(await f.count('sr_session_creation')).toEqual({ n: 1 })
})
it('keeps a live original creation during ingress drain and refuses new work', async () => {
  const ready = Promise.withResolvers<'ready'>(),
    entered = Promise.withResolvers<void>()
  const f = await fixture(async () => {
    entered.resolve()
    return ready.promise
  })
  const creating = f.runtime.operations.createSession(f.runtime.access, input)
  await entered.promise
  let closed = false
  const closing = f.runtime.close().then(() => {
    closed = true
  })
  expect(
    await f.runtime.operations.createSession(f.runtime.access, { ...input, operationKey: 'new' }),
  ).toEqual({ failure: 'unavailable' })
  expect(closed).toBe(false)
  ready.resolve('ready')
  expect(await creating).toHaveProperty('kind', 'created')
  await closing
  expect(closed).toBe(true)
  expect(await f.count('sr_session_creation')).toEqual({ n: 1 })
})
it('recognizes the original identity with a newly opened tenant storage and live ingress token', async () => {
  const f = await fixture(),
    created = await create(f)
  await f.runtime.close()
  await f.log().close()
  logs.pop()
  const storage = await openStorage({
    dialect: 'sqlite',
    file: join(f.root, 'tenant.sqlite'),
    synchronous: 'full',
  })
  stores.push(storage)
  const reopened = createLocalSessionIngress({
    ...f.options,
    storage,
    log: authority => {
      const log = openSqlSessionLog({ storage, authority, operationLimit: 32 })
      logs.push(log)
      return log.participant
    },
  })
  expect(await reopened.operations.createSession(reopened.access, input)).toEqual(created)
  expect(f.initialize).toHaveBeenCalledTimes(1)
  expect(await reopened.operations.readSession(f.runtime.access, created.session)).toEqual({
    failure: 'denied',
  })
  expect(await reopened.operations.readSession(reopened.access, created.session)).toMatchObject({
    session: { lifecycle: 'active', session: created.session },
  })
  await reopened.close()
})
it('refuses a second operation reusing a logged MessageId without leaving another pending input', async () => {
  const f = await fixture(),
    created = await create(f)
  const first = await f.runtime.operations.submitInput(
    f.runtime.access,
    created.session,
    'first',
    user(),
  )
  expect(first).toHaveProperty('kind', 'accepted')
  expect(
    await f.runtime.operations.submitInput(f.runtime.access, created.session, 'second', user()),
  ).toEqual({ failure: 'identityConflict' })
  expect(await f.count('sr_pending_input')).toEqual({ n: 1 })
  expect(await f.log().readSince(created.session, 0)).toHaveProperty('tail', 4)
})
it('reports a corrupt persisted initialization identity instead of returning a normal Session', async () => {
  const f = await fixture(),
    created = await create(f)
  await f.storage.write(tx =>
    tx.db
      .updateTable('sr_session_creation')
      .set({ operation: '["foreign","owner","owner","createSession","create-1",null]' })
      .execute(),
  )
  await expect(f.runtime.operations.readSession(f.runtime.access, created.session)).rejects.toThrow(
    'corrupt Session initialization',
  )
})
