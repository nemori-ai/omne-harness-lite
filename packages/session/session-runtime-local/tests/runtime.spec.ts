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
import { compareInteger } from '@omne-harness-lite/session-log'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import {
  createLocalSessionContext as assembleSessionContext,
  type SessionContextOptions,
} from '../src/cordis.ts'
import { createRuntimeContextLocal } from '@omne-harness-lite/runtime-context-local/cordis'
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
import type { AdmissionSource, AdmissionTarget, LocalAdmission } from '../src/admission-types.ts'
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
function createLocalSessionContext(options: Omit<SessionContextOptions, 'runtimeContext'>) {
  return assembleSessionContext({ ...options, runtimeContext: createRuntimeContextLocal() })
}
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
  const probe = vi.fn(async (_source: AdmissionSource, target: AdmissionTarget) => ({
    kind:
      decision === 'memberValid' && target.purpose === 'startRun' ? ('valid' as const) : decision,
  }))
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
      maxSteps: 32,
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

async function startReadyRun(f: Awaited<ReturnType<typeof fixture>>) {
  const created = await create(f)
  const admitted = await f.runtime.operations.submitInput(
    f.runtime.access,
    created.session,
    'input-1',
    user(),
  )
  if (!('kind' in admitted) || admitted.kind !== 'accepted') throw new Error('input failed')
  const scope = { tenant, session: created.session }
  const step = { kind: 'startRun' as const, stepKey: 'run-1', inputPosition: 3 }
  const result = await f.runtime.lifecycle.commitStep(
    f.runtime.coordinationAuthority,
    scope,
    admitted.receipt.source,
    step,
  )
  if (!('kind' in result) || result.kind !== 'committed') throw new Error('start Run failed')
  return { created, admitted, scope, step, result }
}
it('starts a Run with original G28 grant and initial input adoption in one commit, without an attempt', async () => {
  const f = await fixture(),
    started = await startReadyRun(f)
  expect(started.result.permit).toBeNull()
  expect(started.result.receipt).toMatchObject({ step: 'startRun', attempt: null, position: 5 })
  expect(await f.count('sr_pending_input')).toEqual({ n: 0 })
  expect(await f.count('sr_run_grant')).toEqual({ n: 1 })
  expect(await f.count('sr_coordination_step')).toEqual({ n: 1 })
  expect(
    await f.runtime.operations.readProgress(f.runtime.access, started.created.session),
  ).toMatchObject({
    progress: { run: started.result.receipt.run, attempt: null, state: 'runnable' },
  })
  const read = await f.log().readSince(started.created.session, 4)
  if ('failure' in read) throw new Error('read failed')
  expect(read.entries.map(readSessionFact)).toMatchObject([
    { fact: { kind: 'run_started', inputPosition: 3 } },
  ])
  expect(f.probe).toHaveBeenLastCalledWith(
    source,
    expect.objectContaining({
      purpose: 'startRun',
      session: started.created.session,
      inputPosition: '3',
    }),
  )
})
it('does not consume durable pending input or create a Run when the new Run login check fails', async () => {
  const f = await fixture(),
    created = await create(f)
  const admitted = await f.runtime.operations.submitInput(
    f.runtime.access,
    created.session,
    'input-1',
    user(),
  )
  if (!('kind' in admitted) || admitted.kind !== 'accepted') throw new Error('input failed')
  f.setDecision('rejected')
  expect(
    await f.runtime.lifecycle.commitStep(
      f.runtime.coordinationAuthority,
      { tenant, session: created.session },
      admitted.receipt.source,
      { kind: 'startRun', stepKey: 'run-1', inputPosition: 3 },
    ),
  ).toEqual({ failure: 'denied' })
  expect(await f.count('sr_pending_input')).toEqual({ n: 1 })
  expect(await f.count('sr_run_seen')).toEqual({ n: 0 })
  expect(await f.log().readSince(created.session, 0)).toHaveProperty('tail', 4)
})
it('recognizes the original Run step after later input without a second G28 check or adoption', async () => {
  const f = await fixture(),
    started = await startReadyRun(f)
  await f.runtime.operations.submitInput(
    f.runtime.access,
    started.created.session,
    'input-2',
    user('later', 'message-2'),
  )
  const before = f.probe.mock.calls.length
  expect(
    await f.runtime.lifecycle.commitStep(
      f.runtime.coordinationAuthority,
      started.scope,
      started.admitted.receipt.source,
      started.step,
    ),
  ).toEqual(started.result)
  expect(f.probe).toHaveBeenCalledTimes(before)
  expect(await f.count('sr_pending_input')).toEqual({ n: 1 })
  expect(
    await f.runtime.lifecycle.commitStep(
      f.runtime.coordinationAuthority,
      started.scope,
      started.result.source,
      { ...started.step, inputPosition: 6 },
    ),
  ).toEqual({ failure: 'retryFromFacts' })
})
it('starts a real fenced attempt separately and continues its original Run after login expiry', async () => {
  const f = await fixture(),
    started = await startReadyRun(f)
  f.setDecision('rejected')
  const ticket = await f.admission.reserve(source, {
    tenant,
    session: started.created.session,
    purpose: 'startRun',
    operationKey: 'expiry-check',
    inputPosition: '3',
  })
  await f.admission.query(ticket.ticket)
  const before = f.probe.mock.calls.length
  const result = await f.runtime.lifecycle.commitStep(
    f.runtime.coordinationAuthority,
    started.scope,
    started.result.source,
    {
      kind: 'startAttempt',
      stepKey: 'attempt-1',
      run: started.result.receipt.run!,
      reason: 'first',
    },
  )
  expect(result).toMatchObject({
    kind: 'committed',
    receipt: { attempt: 1, position: 6 },
    permit: {},
  })
  expect(f.probe).toHaveBeenCalledTimes(before)
  expect(
    await f.runtime.operations.readProgress(f.runtime.access, started.created.session),
  ).toMatchObject({ progress: { attempt: 1 } })
})
it('rolls back the whole attempt and its fact when step receipt capacity is exhausted', async () => {
  const f = await fixture()
  await f.runtime.close()
  await f.log().close()
  logs.pop()
  const limited = createLocalSessionIngress({
    ...f.options,
    policy: { ...f.options.policy, maxSteps: 1 },
  })
  const started = await startReadyRun({ ...f, runtime: limited })
  expect(
    await limited.lifecycle.commitStep(
      limited.coordinationAuthority,
      started.scope,
      started.result.source,
      {
        kind: 'startAttempt',
        stepKey: 'attempt-1',
        run: started.result.receipt.run!,
        reason: 'first',
      },
    ),
  ).toEqual({ failure: 'unavailable' })
  expect(
    await limited.operations.readProgress(limited.access, started.created.session),
  ).toMatchObject({ progress: { attempt: null } })
  expect(await f.log().readSince(started.created.session, 0)).toHaveProperty('tail', 5)
  expect(await f.count('sr_coordination_step')).toEqual({ n: 1 })
  await limited.close()
})
it('refuses copied coordination authority and future or foreign journal coordinates', async () => {
  const f = await fixture(),
    created = await create(f),
    scope = { tenant, session: created.session }
  const step = { kind: 'startRun' as const, stepKey: 'run-1', inputPosition: 3 }
  expect(
    await f.runtime.lifecycle.commitStep(
      {} as typeof f.runtime.coordinationAuthority,
      scope,
      created.receipt.source,
      step,
    ),
  ).toEqual({ failure: 'denied' })
  expect(
    await f.runtime.lifecycle.commitStep(
      f.runtime.coordinationAuthority,
      scope,
      { ...created.receipt.source, tail: 999 },
      step,
    ),
  ).toEqual({ failure: 'retryFromFacts' })
  expect(
    await f.runtime.lifecycle.commitStep(
      f.runtime.coordinationAuthority,
      scope,
      { ...created.receipt.source, journalGeneration: 'foreign' },
      step,
    ),
  ).toEqual({ failure: 'retryFromFacts' })
  expect(f.probe).toHaveBeenCalledTimes(1)
})
it('recognizes a lost actual Run commit without re-querying login or consuming a second input', async () => {
  const f = await fixture(),
    created = await create(f)
  const admitted = await f.runtime.operations.submitInput(
    f.runtime.access,
    created.session,
    'input-1',
    user(),
  )
  if (!('kind' in admitted) || admitted.kind !== 'accepted') throw new Error('input failed')
  const actual = f.storage.atomic.bind(f.storage)
  let lose = true
  vi.spyOn(f.storage, 'atomic').mockImplementation(async action => {
    const result = await actual(action)
    if (lose && (await f.count('sr_run_grant')).n === 1) {
      lose = false
      throw new StorageUnavailable('original Run commit return lost')
    }
    return result
  })
  const scope = { tenant, session: created.session },
    step = { kind: 'startRun' as const, stepKey: 'run-1', inputPosition: 3 }
  expect(
    await f.runtime.lifecycle.commitStep(
      f.runtime.coordinationAuthority,
      scope,
      admitted.receipt.source,
      step,
    ),
  ).toEqual({ kind: 'unknownCommit', scope, stepKey: 'run-1' })
  const before = f.probe.mock.calls.length
  const recognized = await f.runtime.lifecycle.commitStep(
    f.runtime.coordinationAuthority,
    scope,
    admitted.receipt.source,
    step,
  )
  expect(recognized).toMatchObject({ kind: 'committed', receipt: { position: 5 } })
  expect(f.probe).toHaveBeenCalledTimes(before)
  expect(await f.count('sr_pending_input')).toEqual({ n: 0 })
  expect(await f.count('sr_run_grant')).toEqual({ n: 1 })
})
it('keeps attempt, step receipt and journal fence atomic through a lost result and does not reissue a replay permit', async () => {
  const f = await fixture(),
    started = await startReadyRun(f),
    actual = f.storage.atomic.bind(f.storage)
  let lose = true
  vi.spyOn(f.storage, 'atomic').mockImplementation(async action => {
    const result = await actual(action)
    if (lose && (await f.count('sr_coordination_step')).n === 2) {
      lose = false
      throw new StorageUnavailable('original attempt return lost')
    }
    return result
  })
  const step = {
    kind: 'startAttempt' as const,
    stepKey: 'attempt-1',
    run: started.result.receipt.run!,
    reason: 'first' as const,
  }
  expect(
    await f.runtime.lifecycle.commitStep(
      f.runtime.coordinationAuthority,
      started.scope,
      started.result.source,
      step,
    ),
  ).toEqual({ kind: 'unknownCommit', scope: started.scope, stepKey: step.stepKey })
  const recognized = await f.runtime.lifecycle.commitStep(
    f.runtime.coordinationAuthority,
    started.scope,
    started.result.source,
    step,
  )
  expect(recognized).toMatchObject({
    kind: 'committed',
    receipt: { attempt: 1, position: 6 },
    permit: null,
  })
  expect(await f.count('sl_attempt')).toEqual({ n: 1 })
  expect(await f.count('sr_coordination_step')).toEqual({ n: 2 })
  expect(await f.log().readSince(started.created.session, 0)).toHaveProperty('tail', 6)
})
it('adopts later input under the real attempt and refuses an old empty-queue finish decision', async () => {
  const f = await fixture(),
    started = await startReadyRun(f),
    run = started.result.receipt.run!
  const attempt = await f.runtime.lifecycle.commitStep(
    f.runtime.coordinationAuthority,
    started.scope,
    started.result.source,
    { kind: 'startAttempt', stepKey: 'attempt-1', run, reason: 'first' },
  )
  if (!('kind' in attempt) || attempt.kind !== 'committed' || !attempt.permit)
    throw new Error('attempt failed')
  const later = await f.runtime.operations.submitInput(
    f.runtime.access,
    started.created.session,
    'later',
    user('later', 'message-2'),
  )
  if (!('kind' in later) || later.kind !== 'accepted') throw new Error('later input failed')
  const finish = {
    kind: 'finish' as const,
    stepKey: 'finish-1',
    run,
    attempt: 1,
    terminal: 'completed' as const,
    reason: 'done',
    permit: attempt.permit,
  }
  expect(
    await f.runtime.lifecycle.commitStep(
      f.runtime.coordinationAuthority,
      started.scope,
      attempt.source,
      finish,
    ),
  ).toEqual({ failure: 'retryFromFacts' })
  expect(
    await f.runtime.lifecycle.commitStep(
      f.runtime.coordinationAuthority,
      started.scope,
      later.receipt.source,
      {
        kind: 'adoptInput',
        stepKey: 'adopt-later',
        run,
        attempt: 1,
        inputPosition: 7,
        permit: {} as typeof attempt.permit,
      },
    ),
  ).toEqual({ failure: 'staleAttempt' })
  const adopted = await f.runtime.lifecycle.commitStep(
    f.runtime.coordinationAuthority,
    started.scope,
    later.receipt.source,
    {
      kind: 'adoptInput',
      stepKey: 'adopt-later',
      run,
      attempt: 1,
      inputPosition: 7,
      permit: attempt.permit,
    },
  )
  expect(adopted).toMatchObject({ kind: 'committed', receipt: { step: 'adoptInput', position: 9 } })
  expect(await f.count('sr_pending_input')).toEqual({ n: 0 })
  const finished = await f.runtime.lifecycle.commitStep(
    f.runtime.coordinationAuthority,
    started.scope,
    attempt.source,
    finish,
  )
  expect(finished).toMatchObject({ kind: 'committed', receipt: { step: 'finish' } })
  if (!('kind' in finished) || finished.kind !== 'committed') throw new Error('finish failed')
  expect(compareInteger(finished.receipt.position, 10)).toBe(0)
  expect(
    await f.runtime.operations.readProgress(f.runtime.access, started.created.session),
  ).toMatchObject({ progress: { state: 'completed' } })
  expect(
    await f.runtime.lifecycle.commitStep(
      f.runtime.coordinationAuthority,
      started.scope,
      attempt.source,
      { ...finish, stepKey: 'second-finish' },
    ),
  ).toEqual({ failure: 'terminal' })
})
it('does not report read failure as unknownCommit before any coordination write', async () => {
  const f = await fixture(),
    created = await create(f)
  vi.spyOn(f.storage, 'atomic').mockRejectedValueOnce(new StorageUnavailable('read unavailable'))
  expect(
    await f.runtime.lifecycle.commitStep(
      f.runtime.coordinationAuthority,
      { tenant, session: created.session },
      created.receipt.source,
      { kind: 'startRun', stepKey: 'run-1', inputPosition: 1 },
    ),
  ).toEqual({ failure: 'unavailable' })
})
it('rejects malformed steps without executing their getters or making admission IO', async () => {
  const f = await fixture(),
    created = await create(f)
  let reads = 0
  const step = {
    kind: 'startRun' as const,
    stepKey: 'run-1',
    get inputPosition() {
      reads++
      return 1
    },
  }
  expect(
    await f.runtime.lifecycle.commitStep(
      f.runtime.coordinationAuthority,
      { tenant, session: created.session },
      created.receipt.source,
      step,
    ),
  ).toEqual({ failure: 'invalidInput' })
  expect(reads).toBe(0)
  expect(f.probe).toHaveBeenCalledTimes(1)
})
it('rejects a corrupt persisted original Run grant rather than continuing with a new login', async () => {
  const f = await fixture(),
    started = await startReadyRun(f)
  await f.storage.write(tx => tx.db.updateTable('sr_run_grant').set({ grant: '{}' }).execute())
  await expect(
    f.runtime.lifecycle.commitStep(
      f.runtime.coordinationAuthority,
      started.scope,
      started.result.source,
      {
        kind: 'startAttempt',
        stepKey: 'attempt-1',
        run: started.result.receipt.run!,
        reason: 'first',
      },
    ),
  ).rejects.toThrow('corrupt original Run admission grant')
  expect(await f.log().readSince(started.created.session, 0)).toHaveProperty('tail', 5)
})
it('abandons a reliably rolled back Run ticket and preserves its pending input when step capacity is full', async () => {
  const f = await fixture()
  await f.runtime.close()
  await f.log().close()
  logs.pop()
  const limited = createLocalSessionIngress({
    ...f.options,
    policy: { ...f.options.policy, maxSteps: 1 },
  })
  await startReadyRun({ ...f, runtime: limited })
  const created = await limited.operations.createSession(limited.access, {
    ...input,
    operationKey: 'create-2',
  })
  if (!('kind' in created) || created.kind !== 'created') throw new Error('create failed')
  const admitted = await limited.operations.submitInput(
    limited.access,
    created.session,
    'input-2',
    user('second', 'message-2'),
  )
  if (!('kind' in admitted) || admitted.kind !== 'accepted') throw new Error('input failed')
  expect(
    await limited.lifecycle.commitStep(
      limited.coordinationAuthority,
      { tenant, session: created.session },
      admitted.receipt.source,
      { kind: 'startRun', stepKey: 'run-2', inputPosition: 3 },
    ),
  ).toEqual({ failure: 'unavailable' })
  expect(await f.count('sr_run_grant')).toEqual({ n: 1 })
  expect(await f.count('sr_run_seen')).toEqual({ n: 1 })
  expect(await f.count('sr_pending_input')).toEqual({ n: 1 })
  expect(await f.log().readSince(created.session, 0)).toHaveProperty('tail', 4)
  const ticket = await f.admission.reserve(source, {
    tenant,
    session: created.session,
    purpose: 'startRun',
    operationKey: 'run-2',
    inputPosition: '3',
  })
  expect((await f.admission.read(ticket.ticket)).state).toBe('notUsed')
  await limited.close()
})
it('rejects unknown step variants as invalid input and waits for an already admitted new Run during drain', async () => {
  const f = await fixture(),
    created = await create(f)
  expect(
    await f.runtime.lifecycle.commitStep(
      f.runtime.coordinationAuthority,
      { tenant, session: created.session },
      created.receipt.source,
      { kind: 'toString' } as unknown as import('../src/runtime-types.ts').SessionLifecycleStep,
    ),
  ).toEqual({ failure: 'invalidInput' })
  const admitted = await f.runtime.operations.submitInput(
    f.runtime.access,
    created.session,
    'input-1',
    user(),
  )
  if (!('kind' in admitted) || admitted.kind !== 'accepted') throw new Error('input failed')
  const ready = Promise.withResolvers<{ kind: 'valid' }>(),
    entered = Promise.withResolvers<void>()
  f.probe.mockImplementationOnce(async () => {
    entered.resolve()
    return ready.promise
  })
  const starting = f.runtime.lifecycle.commitStep(
    f.runtime.coordinationAuthority,
    { tenant, session: created.session },
    admitted.receipt.source,
    { kind: 'startRun', stepKey: 'run-1', inputPosition: 3 },
  )
  await entered.promise
  let closed = false
  const closing = f.runtime.close().then(() => {
    closed = true
  })
  expect(closed).toBe(false)
  expect(
    await f.runtime.lifecycle.commitStep(
      f.runtime.coordinationAuthority,
      { tenant, session: created.session },
      admitted.receipt.source,
      { kind: 'startRun', stepKey: 'run-2', inputPosition: 3 },
    ),
  ).toEqual({ failure: 'unavailable' })
  ready.resolve({ kind: 'valid' })
  expect(await starting).toHaveProperty('kind', 'committed')
  await closing
  expect(closed).toBe(true)
})
it('requires the actual committed original G28 ticket usage before any original Run continuation', async () => {
  const f = await fixture(),
    started = await startReadyRun(f)
  const raw = await f.storage.read(tx =>
    tx.db.selectFrom('sr_run_grant').select('grant').executeTakeFirstOrThrow(),
  )
  const grant = JSON.parse(String(raw.grant))
  await f.storage.write(tx =>
    tx.db
      .deleteFrom('sr_admission_use')
      .where('root', '=', grant.ticket.root)
      .where('ticket', '=', grant.ticket.id)
      .execute(),
  )
  await expect(
    f.runtime.lifecycle.commitStep(
      f.runtime.coordinationAuthority,
      started.scope,
      started.result.source,
      {
        kind: 'startAttempt',
        stepKey: 'attempt-1',
        run: started.result.receipt.run!,
        reason: 'first',
      },
    ),
  ).rejects.toThrow('missing original Run ticket usage')
  expect(await f.log().readSince(started.created.session, 0)).toHaveProperty('tail', 5)
})
it('reads real immutable Session ownership during initialization without a development seed or publication', async () => {
  let f!: Awaited<ReturnType<typeof fixture>>
  const initialize = vi.fn(async (scope: SessionScope) => {
    expect(await f.runtime.tenancy.holdingTenant(scope.session)).toEqual({ tenant })
    expect(await f.count('sr_session_state')).toEqual({ n: 0 })
    expect(await f.count('sr_operation_receipt')).toEqual({ n: 0 })
    return 'ready' as const
  })
  f = await fixture(initialize)
  const created = await create(f),
    before = f.probe.mock.calls.length
  expect(await f.runtime.tenancy.holdingTenant(created.session)).toEqual({ tenant })
  expect(await f.runtime.tenancy.holdingTenant('missing-session')).toEqual({
    failure: 'sessionNotFound',
  })
  expect(await f.runtime.tenancy.holdingTenant({ session: created.session })).toEqual({
    failure: 'invalidInput',
  })
  expect(f.probe).toHaveBeenCalledTimes(before)
  expect(await f.count('sr_run_seen')).toEqual({ n: 0 })
  expect(await f.log().readSince(created.session, 0)).toHaveProperty('tail', 2)
  await f.runtime.close()
  expect(await f.runtime.tenancy.holdingTenant(created.session)).toEqual({ failure: 'unavailable' })
})
it('reports damaged ownership as a storage defect and preserves original read failures', async () => {
  const f = await fixture(),
    created = await create(f)
  vi.spyOn(f.storage, 'atomic').mockRejectedValueOnce(new StorageUnavailable('owner read failed'))
  expect(await f.runtime.tenancy.holdingTenant(created.session)).toEqual({ failure: 'unavailable' })
  await f.storage.write(tx =>
    tx.db.updateTable('sr_session_creation').set({ input: '{}' }).execute(),
  )
  await expect(f.runtime.tenancy.holdingTenant(created.session)).rejects.toThrow(
    'corrupt Session initialization',
  )
})

it('initializes the actual Runtime Context in separate Session hosts and withdraws A without stopping B', async () => {
  const f = await fixture(),
    a = await create(f)
  const b = await f.runtime.operations.createSession(f.runtime.access, {
    ...input,
    operationKey: 'create-b',
  })
  if (!('kind' in b) || b.kind !== 'created') throw new Error('create B failed')
  for (const fragment of runtimeContextMigrations)
    await f.storage.write(tx => fragment.migration.up(tx.db))
  const before = f.probe.mock.calls.length
  const options = {
    storage: f.storage,
    logBacking: f.log().backing,
    access: {
      authorize: vi.fn(async () => ({
        kind: 'rejected' as const,
        reason: 'notAuthorized' as const,
      })),
    },
    clock: { now: () => unwrap(instantFromRfc3339(at)) },
  }
  const hostA = createLocalSessionContext({ ...options, scope: { tenant, session: a.session } })
  const hostB = createLocalSessionContext({ ...options, scope: { tenant, session: b.session } })
  try {
    const [contextA, contextB] = await Promise.all([hostA.ready, hostB.ready])
    expect(contextA).not.toBe(contextB)
    const registration = {
      name: 'same-local-source',
      recovery: 'reread_source' as const,
      consumers: ['model' as const],
      requiredKeys: [],
      read: async () => ({ kind: 'values' as const, values: [] }),
    }
    const sourceA = contextA.registerSource(registration),
      sourceB = contextB.registerSource(registration)
    expect(sourceA.generation).not.toBe(sourceB.generation)

    const seed = { required: [], initial: [], fixed: [] }
    expect(await hostA.initializer.initializeContextSession(hostA.scope, seed)).toMatchObject({
      kind: 'applied',
    })
    expect(await hostB.initializer.initializeContextSession(hostB.scope, seed)).toMatchObject({
      kind: 'applied',
    })
    expect(await hostA.initializer.initializeContextSession(hostB.scope, seed)).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
    const readA = await f.log().readSince(a.session, 0),
      readB = await f.log().readSince(b.session, 0)
    if ('failure' in readA || 'failure' in readB) throw new Error('read failed')
    expect(readA.entries.at(-1)!.payload).toMatchObject({
      owner: 'runtime-context',
      value: { kind: 'session_initialized', scope: hostA.scope },
    })
    expect(readB.entries.at(-1)!.payload).toMatchObject({
      owner: 'runtime-context',
      value: { kind: 'session_initialized', scope: hostB.scope },
    })
    expect(await sourceA.invalidate(hostB.scope, [])).toMatchObject({ kind: 'rejected' })
    hostA.requestStop()
    expect(await hostA.closed).toMatchObject({ complete: true })
    expect(await sourceA.invalidate(hostA.scope, [])).toMatchObject({ kind: 'rejected' })
    expect(await sourceB.invalidate(hostB.scope, [])).toEqual({ kind: 'invalidated' })
    expect(await hostA.initializer.initializeContextSession(hostA.scope, seed)).toEqual({
      kind: 'rejected',
      reason: 'ownerStopped',
    })
    expect(await hostB.initializer.initializeContextSession(hostB.scope, seed)).toMatchObject({
      kind: 'applied',
    })
    expect(f.probe).toHaveBeenCalledTimes(before)
  } finally {
    hostA.requestStop()
    hostB.requestStop()
    await Promise.all([hostA.closed, hostB.closed])
  }
  expect(
    await f.storage.read(tx =>
      tx.db
        .selectFrom('sr_session_creation')
        .select(eb => eb.fn.countAll<number>().as('n'))
        .executeTakeFirstOrThrow(),
    ),
  ).toEqual({ n: 2 })
})
it('publishes a Session only after its actual isolated Runtime Context initializer has confirmed the original seed', async () => {
  let f!: Awaited<ReturnType<typeof fixture>>,
    host: ReturnType<typeof createLocalSessionContext> | undefined
  const initialize = vi.fn(async (scope: SessionScope) => {
    expect(await f.runtime.tenancy.holdingTenant(scope.session)).toEqual({ tenant })
    host ??= createLocalSessionContext({
      scope,
      storage: f.storage,
      logBacking: f.log().backing,
      access: { authorize: async () => ({ kind: 'rejected', reason: 'notAuthorized' }) },
      clock: { now: () => unwrap(instantFromRfc3339(at)) },
    })
    await host.ready
    const applied = await host.initializer.initializeContextSession(scope, {
      required: [],
      initial: [],
      fixed: [],
    })
    return applied.kind === 'applied' ? ('ready' as const) : ('unavailable' as const)
  })
  f = await fixture(initialize)
  for (const fragment of runtimeContextMigrations)
    await f.storage.write(tx => fragment.migration.up(tx.db))
  try {
    const created = await create(f),
      read = await f.log().readSince(created.session, 0)
    if ('failure' in read) throw new Error('read failed')
    expect(read.entries.map(entry => entry.payload)).toMatchObject([
      { owner: 'session-runtime-local', value: { kind: 'session_initializing' } },
      { owner: 'runtime-context', value: { kind: 'session_initialized' } },
      { owner: 'session-runtime', value: { kind: 'session_created' } },
    ])
    expect(created.receipt.source.tail).toBe(3)
    expect(await create(f)).toEqual(created)
    expect(initialize).toHaveBeenCalledTimes(1)
  } finally {
    await f.runtime.close()
    host?.requestStop()
    await host?.closed
  }
})
it('retains the original Session Context borrow after release failure and permits only retry of that close', async () => {
  const f = await fixture(),
    created = await create(f)
  for (const fragment of runtimeContextMigrations)
    await f.storage.write(tx => fragment.migration.up(tx.db))
  let release: (() => Promise<void>) | undefined
  const attempts = vi.fn(async (): Promise<void> => {
    throw new Error('original release unavailable')
  })
  const backing = {
    ownerGeneration: f.log().backing.ownerGeneration,
    borrow() {
      const original = f.log().backing.borrow()
      release = original.release
      return { log: original.log, release: attempts }
    },
  }
  const host = createLocalSessionContext({
    scope: { tenant, session: created.session },
    storage: f.storage,
    logBacking: backing,
    access: { authorize: async () => ({ kind: 'rejected', reason: 'notAuthorized' }) },
    clock: { now: () => unwrap(instantFromRfc3339(at)) },
  })
  try {
    await host.ready
    expect(await host.retryClose()).toBe('notStopping')
    host.requestStop()
    expect(await host.closeAttempt()).toBe('retained')
    let closed = false
    void host.closed.then(() => {
      closed = true
    })
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(closed).toBe(false)
    expect(
      await host.initializer.initializeContextSession(host.scope, {
        required: [],
        initial: [],
        fixed: [],
      }),
    ).toEqual({ kind: 'rejected', reason: 'ownerStopped' })
    attempts.mockImplementation(async () => {
      await release!()
    })
    expect(await host.retryClose()).toBe('closed')
    expect(await host.closed).toMatchObject({ complete: true })
    expect(attempts).toHaveBeenCalledTimes(2)
    expect(await f.count('sr_session_creation')).toEqual({ n: 1 })
  } finally {
    attempts.mockImplementation(async () => {
      await release?.()
    })
    host.requestStop()
    await host.retryClose()
    await host.closed
  }
})
it('reports actual Session Context setup failure and releases the original log borrow', async () => {
  const f = await fixture(),
    created = await create(f)
  const original = f.log().backing.borrow.bind(f.log().backing),
    released = vi.fn()
  const host = createLocalSessionContext({
    scope: { tenant, session: created.session },
    storage: f.storage,
    logBacking: {
      ownerGeneration: f.log().backing.ownerGeneration,
      borrow() {
        const borrowed = original()
        return {
          log: borrowed.log,
          release: async () => {
            await borrowed.release()
            released()
          },
        }
      },
    },
    access: { authorize: async () => ({ kind: 'rejected', reason: 'notAuthorized' }) },
    clock: { now: () => unwrap(instantFromRfc3339(at)) },
  })
  await expect(host.ready).rejects.toThrow()
  host.requestStop()
  expect(await host.closed).toMatchObject({
    complete: false,
    rows: [{ id: 'runtimeContext', result: { kind: 'failed', codes: ['setup'] } }],
  })
  expect(released).toHaveBeenCalledTimes(1)
})
