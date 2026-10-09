import {
  prepareToolJournalEntry,
  projectToolJournal,
} from '@omne-harness-lite/tool-execution-runtime'
import { readPassConclusions } from '@omne-harness-lite/loop-extension-runner-local'
import { prepareRunnerConclusion, readRunnerChain } from '@omne-harness-lite/loop-extension-runner'
import { judgeDefinition } from '@omne-harness-lite/loop-extension'
// @module-tag slow
// Uses real root and tenant SQLite transactions, log owners and Cordis lifetimes.
import {
  createOriginalIssueOwner,
  originalIssueMigrations,
  type OriginalIssueOwner,
} from '@omne-harness-lite/model-request-runtime-local'
import {
  captureModelLogValue,
  readModelLogEnvelope,
  prepareModelLogEntry,
  type OriginalIssueInput,
  type OriginalIssueAuthority,
} from '@omne-harness-lite/model-request-runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStorage, type SqlStorage } from '@omne-harness-lite/storage-sql'
import { narrow, StorageUnavailable, type AtomicStorage } from '@omne-harness-lite/storage'
import {
  parseAccountId,
  parseOpaqueIdentifier,
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
import { compareInteger, checkAppendInput } from '@omne-harness-lite/session-log'
import {
  judgePendingModelResponse,
  type PendingModelResponse,
} from '@omne-harness-lite/model-response'
import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
  copyJsonValue,
} from '@omne-harness-lite/content-blocks'
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
import { createSessionDriverWorkOwner } from '../src/driver-work.ts'
import { startDriverRun } from '../src/driver-run.ts'
import { bindDriverOriginal, createDriverModelSegment } from '../src/driver-model.ts'
import { createSessionModelResultSource } from '../src/model-result-source.ts'
import type { SessionDriverRunSources } from '../src/driver-types.ts'
import type {
  ModelRuntimeOperations,
  ModelRuntimeHostInputs,
} from '@omne-harness-lite/model-request-runtime'
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
const modelOwners: OriginalIssueOwner[] = []
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
function driverIdentityFixture() {
  return {
    run: vi.fn(() => ({ startKey: 'driver-run', attemptKey: 'driver-attempt' })),
    model: vi.fn(() => ({
      prepareKey: 'driver-model-prepare',
      originalPosition: 'driver-model-position',
      resultKey: 'driver-model-result',
      adoptionKey: 'driver-model-adopt',
      call: unwrap(parseOpaqueIdentifier('driver-model-call', 'ModelCallId')),
      creationKey: unwrap(parseOpaqueIdentifier('driver-model-create', 'CreationKey')),
    })),
    tool: () => {
      throw new Error('this Run start must not execute tools')
    },
    modelContent: {
      response: () => {
        throw new Error('this Run start must not create response content')
      },
      message: () => {
        throw new Error('this Run start must not create message content')
      },
    },
  }
}
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
  for (const owner of modelOwners.splice(0))
    expect(await owner.close()).toEqual({ kind: 'released' })
  for (const log of logs.splice(0)) await log.close()
  for (const admission of admissions.splice(0)) await admission.close().catch(() => undefined)
  for (const storage of stores.splice(0)) await storage.close()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
/** Real root and tenant SQLite/G28/log/state/receipt composition; bootstrap assets are controlled inputs. */
async function fixture(
  initialize: RuntimeOptions['bootstrap']['initialize'] = vi.fn(async () => 'ready' as const),
  maxSteps = 32,
  configure?: (
    storage: SqlStorage,
  ) => Pick<
    RuntimeOptions,
    'modelIssue' | 'modelResults' | 'toolIssue' | 'toolResults' | 'toolDelivery'
  >,
  readTime: RuntimeOptions['now'] = async () => at,
  workSettledIn: RuntimeOptions['workSettledIn'] = async () => 'settled',
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
    ...originalIssueMigrations,
  ])
    await storage.write(tx => fragment.migration.up(tx.db))
  let decision: 'memberValid' | 'memberRejected' | 'rejected' = 'memberValid'
  const probe = vi.fn(async (_source: AdmissionSource, target: AdmissionTarget) => {
    if (decision !== 'memberValid') return { kind: decision }
    return target.purpose === 'startRun'
      ? { kind: 'valid' as const }
      : { kind: 'memberValid' as const, role: 'member' as const }
  })
  const admission = await createLocalAdmission(
    rootStorage,
    { verify: probe },
    { maxLogins: 8, maxTickets: 32, maxRecordBytes: 8192 },
  )
  admissions.push(admission)
  let log!: SqlSessionLog
  const options: RuntimeOptions = {
    ...configure?.(storage),
    storage,
    admission,
    source,
    tenant,
    principal: 'owner',
    policy: {
      maxSessions: 16,
      maxRecordBytes: 8192,
      maxInFlight: 16,
      maxSteps,
      state: { maxPendingPerSession: 8, maxBatchSize: 8, maxRecordBytes: 8192 },
      receipts: { maxRecords: 32, maxRecordBytes: 8192 },
    },
    log: authority => {
      log = openSqlSessionLog({ storage, authority, operationLimit: 32 })
      logs.push(log)
      return log.participant
    },
    bootstrap: { initialize },
    now: readTime,
    workSettledIn,
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
it('starts the driver Run from the oldest persistent input and derives model keys after actual attempt creation', async () => {
  const f = await fixture(),
    created = await create(f)
  const scope = { tenant, session: created.session }
  await f.runtime.operations.submitInput(f.runtime.access, created.session, 'first-input', user())
  await f.runtime.operations.submitInput(
    f.runtime.access,
    created.session,
    'second-input',
    user('Second', 'second-message'),
  )
  const work = await f.runtime.readWork(f.runtime.coordinationAuthority, scope, 2)
  if (!('kind' in work)) throw new Error('actual work unavailable')
  const identities = driverIdentityFixture()
  const started = await startDriverRun({ ingress: f.runtime, identities }, scope, () => true)
  if (started.kind !== 'prepared') throw new Error('driver Run not prepared')
  expect(identities.run).toHaveBeenCalledWith(scope, work.inputs[0])
  expect(started.preparation.permit).toBeTruthy()
  const prefix = await f.log().readSince(scope.session, 0)
  if ('failure' in prefix) throw new Error('actual Run history unavailable')
  const attempt = prefix.entries.find(entry => {
    const read = readSessionFact(entry)
    return 'fact' in read && read.fact.kind === 'attempt_started'
  })
  expect(attempt).toBeDefined()
  expect(identities.model).toHaveBeenCalledWith(
    scope,
    started.preparation.run,
    started.preparation.attempt,
    attempt!.position,
  )
  const next = await f.runtime.readWork(f.runtime.coordinationAuthority, scope, 2)
  expect(next).toMatchObject({
    kind: 'work',
    inputs: [work.inputs[1]],
    head: { run: { state: 'runnable', attempt: 1 } },
  })
  expect(await f.count('sr_model_issue')).toEqual({ n: 0 })
  expect(await f.count('sr_coordination_step')).toEqual({ n: 3 })
  expect((await startDriverRun({ ingress: f.runtime, identities }, scope, () => true)).kind).toBe(
    'blocked',
  )
  expect(identities.run).toHaveBeenCalledOnce()
  expect(identities.model).toHaveBeenCalledOnce()
})

it('retains the original driver step on a lost Run receipt without allocating an attempt or replacement keys', async () => {
  const f = await fixture(),
    created = await create(f)
  const scope = { tenant, session: created.session }
  await f.runtime.operations.submitInput(f.runtime.access, created.session, 'first-input', user())
  const identities = driverIdentityFixture()
  const actual = f.runtime.lifecycle.commitStep
  const commit = vi.fn<typeof actual>(async (...args) => {
    const result = await actual(...args)
    if (args[3].kind === 'startRun' && 'kind' in result && result.kind === 'committed')
      return { kind: 'unknownCommit', scope, stepKey: args[3].stepKey }
    return result
  })
  const ingress = { ...f.runtime, lifecycle: { commitStep: commit } }
  const started = await startDriverRun({ ingress, identities }, scope, () => true)
  expect(started).toMatchObject({
    kind: 'blocked',
    originals: [
      {
        step: { kind: 'startRun', stepKey: 'driver-run' },
        result: { kind: 'unknownCommit', stepKey: 'driver-run' },
      },
    ],
  })
  expect(commit).toHaveBeenCalledOnce()
  expect(identities.run).toHaveBeenCalledOnce()
  expect(identities.model).not.toHaveBeenCalled()
  expect(await f.count('sr_pending_input')).toEqual({ n: 0 })
  expect(await f.count('sr_coordination_step')).toEqual({ n: 1 })
  expect(await f.count('sr_model_issue')).toEqual({ n: 0 })
})

it('withdraws the driver before new steps and preserves the actual Run already committed', async () => {
  const f = await fixture(),
    created = await create(f)
  const scope = { tenant, session: created.session }
  await f.runtime.operations.submitInput(f.runtime.access, created.session, 'first-input', user())
  const identities = driverIdentityFixture()
  let open = false
  expect((await startDriverRun({ ingress: f.runtime, identities }, scope, () => open)).kind).toBe(
    'blocked',
  )
  expect(identities.run).not.toHaveBeenCalled()
  expect(await f.count('sr_pending_input')).toEqual({ n: 1 })
  open = true
  const actual = f.runtime.lifecycle.commitStep
  const commit = vi.fn<typeof actual>(async (...args) => {
    const result = await actual(...args)
    open = false
    return result
  })
  const ingress = { ...f.runtime, lifecycle: { commitStep: commit } }
  const started = await startDriverRun({ ingress, identities }, scope, () => open)
  expect(started).toMatchObject({
    kind: 'blocked',
    originals: [{ step: { kind: 'startRun' }, result: { kind: 'committed' } }],
  })
  expect(commit).toHaveBeenCalledOnce()
  expect(identities.model).not.toHaveBeenCalled()
  expect(await f.count('sr_coordination_step')).toEqual({ n: 1 })
})
it('publishes a single initialized empty Session without Run, attempt, pending input or model IO', async () => {
  const f = await fixture(),
    result = await create(f)
  const original = await f.admission.reserve(source, {
    purpose: 'createSession',
    tenant,
    session: null,
    inputPosition: null,
    operationKey: input.operationKey,
  })
  expect(original.state).toBe('consumed')
  expect(original.memberStanding).toEqual({ standing: 'effective', role: 'member' })
  expect(f.initialize).toHaveBeenCalledWith(
    { tenant, session: result.session },
    input,
    original.ticket,
  )
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
it('waits for async time, rolls back unavailable input and drains that original wait on close', async () => {
  const entered = Promise.withResolvers<void>()
  const released = Promise.withResolvers<string | 'unavailable'>()
  let waiting = false
  const f = await fixture(undefined, 32, undefined, async () => {
    if (!waiting) return at
    entered.resolve()
    return released.promise
  })
  const created = await create(f)
  const before = await f.count('sr_operation_receipt')
  waiting = true
  const submitting = f.runtime.operations.submitInput(
    f.runtime.access,
    created.session,
    'clock-unavailable-input',
    user(),
  )
  await entered.promise
  let closed = false
  const closing = f.runtime.close().then(() => {
    closed = true
  })
  await Promise.resolve()
  expect(closed).toBe(false)
  released.resolve('unavailable')
  expect(await submitting).toEqual({ failure: 'unavailable' })
  await closing
  expect(closed).toBe(true)
  expect(await f.count('sr_pending_input')).toEqual({ n: 0 })
  expect(await f.count('sr_operation_receipt')).toEqual(before)
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
    now: async () => at,
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
    clock: { now: async () => unwrap(instantFromRfc3339(at)) },
  }
  const hostA = createLocalSessionContext({ ...options, scope: { tenant, session: a.session } })
  const hostB = createLocalSessionContext({ ...options, scope: { tenant, session: b.session } })
  try {
    expect(hostA.currentGeneration()).toBeNull()
    expect(hostB.currentGeneration()).toBeNull()
    const [contextA, contextB] = await Promise.all([hostA.ready, hostB.ready])
    expect(contextA).not.toBe(contextB)
    expect(hostA.currentGeneration()).toEqual(expect.any(String))
    const generationA = hostA.currentGeneration()
    expect(hostB.currentGeneration()).not.toBe(generationA)
    expect(hostA.currentGeneration()).toBe(generationA)
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
    expect(hostA.currentGeneration()).toBeNull()
    expect(hostB.currentGeneration()).toEqual(expect.any(String))
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
      clock: { now: async () => unwrap(instantFromRfc3339(at)) },
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
    clock: { now: async () => unwrap(instantFromRfc3339(at)) },
  })
  try {
    await host.ready
    expect(host.currentGeneration()).toEqual(expect.any(String))
    expect(await host.retryClose()).toBe('notStopping')
    host.requestStop()
    expect(host.currentGeneration()).toBeNull()
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
    expect(host.currentGeneration()).toBeNull()
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
    clock: { now: async () => unwrap(instantFromRfc3339(at)) },
  })
  await expect(host.ready).rejects.toThrow()
  host.requestStop()
  expect(await host.closed).toMatchObject({
    complete: false,
    rows: [{ id: 'runtimeContext', result: { kind: 'failed', codes: ['setup'] } }],
  })
  expect(released).toHaveBeenCalledTimes(1)
})

it('requires original live ingress Access for trusted journal reads and drains that read surface on close', async () => {
  const f = await fixture()
  const created = await create(f)
  const before = await f.runtime.operations.readProgress(f.runtime.access, created.session)
  expect(await f.runtime.journal.readPrefix({} as Access, created.session)).toEqual({
    failure: 'denied',
  })
  const prefix = await f.runtime.journal.readPrefix(f.runtime.access, created.session)
  expect(prefix).toHaveProperty('kind', 'prefix')
  expect(await f.runtime.operations.readProgress(f.runtime.access, created.session)).toEqual(before)
  expect(
    await f.runtime.journal.readPrefix(f.runtime.access, 'absent' as typeof created.session),
  ).toEqual({ failure: 'notFound' })
  await f.runtime.close()
  expect(await f.runtime.journal.readPrefix(f.runtime.access, created.session)).toEqual({
    failure: 'unavailable',
  })
})

async function preparedAttempt(f: Awaited<ReturnType<typeof fixture>>) {
  const started = await startReadyRun(f)
  const attempt = await f.runtime.lifecycle.commitStep(
    f.runtime.coordinationAuthority,
    started.scope,
    started.result.source,
    {
      kind: 'startAttempt',
      stepKey: 'first-attempt',
      run: started.result.receipt.run!,
      reason: 'first',
    },
  )
  if (
    !('kind' in attempt) ||
    attempt.kind !== 'committed' ||
    !attempt.permit ||
    attempt.receipt.attempt === null
  )
    throw new Error('actual attempt unavailable')
  return {
    ...started,
    attempt,
    step: {
      kind: 'prepareCall' as const,
      stepKey: 'prepare-original-call',
      run: attempt.receipt.run!,
      attempt: attempt.receipt.attempt,
      call: 'original-model-call',
      originalPosition: 'original-loop-position',
      permit: attempt.permit,
    },
  }
}
it('commits original call preparation and its step receipt under the actual latest attempt without issuing IO', async () => {
  const f = await fixture(),
    p = await preparedAttempt(f)
  const result = await f.runtime.lifecycle.commitStep(
    f.runtime.coordinationAuthority,
    p.scope,
    p.attempt.source,
    p.step,
  )
  expect(result).toMatchObject({
    kind: 'committed',
    receipt: { step: 'prepareCall', position: 7 },
    permit: null,
  })
  const read = await f.log().readSince(p.scope.session, 6)
  if ('failure' in read) throw new Error('actual log unavailable')
  expect(read.entries.map(readSessionFact)).toMatchObject([
    {
      fact: {
        kind: 'call_prepared',
        call: p.step.call,
        originalPosition: p.step.originalPosition,
        run: p.step.run,
        attempt: p.step.attempt,
      },
    },
  ])
  expect(await f.count('sr_call_preparation')).toEqual({ n: 1 })
  expect(await f.count('sr_coordination_step')).toEqual({ n: 3 })
  const before = f.probe.mock.calls.length
  expect(
    await f.runtime.lifecycle.commitStep(
      f.runtime.coordinationAuthority,
      p.scope,
      p.attempt.source,
      p.step,
    ),
  ).toEqual(result)
  expect(await f.count('sr_call_preparation')).toEqual({ n: 1 })
  expect(f.probe).toHaveBeenCalledTimes(before)
})
it('holds actual original driver work through finish and refuses absent, copied or uncompleted responsibility', async () => {
  let work!: ReturnType<typeof createSessionDriverWorkOwner>
  const f = await fixture(
    undefined,
    32,
    storage => {
      work = createSessionDriverWorkOwner({ storage, tenant, maxRecords: 1 })
      return {}
    },
    undefined,
    (unit, scope, run) => work.readIn(unit, scope, run),
  )
  const p = await preparedAttempt(f)
  const prepared = await f.runtime.lifecycle.commitStep(
    f.runtime.coordinationAuthority,
    p.scope,
    p.attempt.source,
    p.step,
  )
  if (!('kind' in prepared) || prepared.kind !== 'committed')
    throw new Error('actual prepare failed')
  const read = () =>
    f.storage.atomic(unit => unit.run(() => work.readIn(unit, p.scope, p.step.run)))
  expect(await read()).toBe('unavailable')
  const token = work.begin(p.scope, p.step)
  expect(work.begin(p.scope, p.step)).toBe(token)
  expect(() => work.begin(p.scope, { ...p.step })).toThrow('original preparation')
  expect(() => work.complete({ ...token })).toThrow('original work token')
  expect(() => work.release(token)).toThrow('uncompleted')
  expect(await read()).toBe('pending')
  const finish = {
    kind: 'finish' as const,
    stepKey: 'driver-original-finish',
    run: p.step.run,
    attempt: p.step.attempt,
    permit: p.step.permit,
    terminal: 'completed' as const,
    reason: 'actual original work settled',
  }
  expect(
    await f.runtime.lifecycle.commitStep(
      f.runtime.coordinationAuthority,
      p.scope,
      prepared.source,
      finish,
    ),
  ).toEqual({ failure: 'retryFromFacts' })
  work.complete(token)
  expect(await read()).toBe('settled')
  expect(
    await f.runtime.lifecycle.commitStep(
      f.runtime.coordinationAuthority,
      p.scope,
      prepared.source,
      finish,
    ),
  ).toHaveProperty('kind', 'committed')
  work.release(token)
  expect(await read()).toBe('unavailable')
})
it('refuses copied permits before saving original call preparation', async () => {
  const f = await fixture(),
    p = await preparedAttempt(f)
  expect(
    await f.runtime.lifecycle.commitStep(
      f.runtime.coordinationAuthority,
      p.scope,
      p.attempt.source,
      { ...p.step, permit: { ...p.step.permit } },
    ),
  ).toEqual({ failure: 'staleAttempt' })
  expect(await f.count('sr_call_preparation')).toEqual({ n: 0 })
  expect(await f.log().readSince(p.scope.session, 6)).toHaveProperty('tail', 6)
})
it('rolls back preparation, its fact and receipt together when original step capacity is full', async () => {
  const f = await fixture(undefined, 2),
    p = await preparedAttempt(f)
  expect(
    await f.runtime.lifecycle.commitStep(
      f.runtime.coordinationAuthority,
      p.scope,
      p.attempt.source,
      p.step,
    ),
  ).toEqual({ failure: 'unavailable' })
  expect(await f.count('sr_call_preparation')).toEqual({ n: 0 })
  expect(await f.count('sr_coordination_step')).toEqual({ n: 2 })
  expect(await f.log().readSince(p.scope.session, 6)).toHaveProperty('tail', 6)
})

async function modelFixture(maxRecords = 8) {
  let owner!: OriginalIssueOwner
  const current = vi.fn<OriginalIssueAuthority['authorizeIn']>(async () => ({ kind: 'authorized' }))
  const f = await fixture(undefined, 32, storage => ({
    modelResults: { maxRecords, source: { verifyIn: async () => 'verified' } },
    modelIssue: {
      maxRecords,
      current: { authorizeIn: current },
      create: binding => {
        owner = createOriginalIssueOwner({ storage, ...binding, limit: 8 })
        modelOwners.push(owner)
        return owner.participant
      },
    },
  }))
  const p = await preparedAttempt(f)
  const prepared = await f.runtime.lifecycle.commitStep(
    f.runtime.coordinationAuthority,
    p.scope,
    p.attempt.source,
    p.step,
  )
  if (!('kind' in prepared) || prepared.kind !== 'committed')
    throw new Error('actual preparation failed')
  const original = modelInput(p, prepared.source)
  const ready = owner.prepareOriginal(original)
  if (!('ticket' in ready)) throw new Error('actual model ticket unavailable')
  return { f, p, owner, current, prepared, original, ticket: ready.ticket }
}
function modelInput(
  p: Awaited<ReturnType<typeof preparedAttempt>>,
  source: OriginalIssueInput['source'],
): OriginalIssueInput {
  const adaptation = {
    implementation: { name: 'controlled-adapter', revision: 'one' },
    definition: { modelId: 'controlled/model', revision: 'one' },
    configuration: { revision: 'one', values: {} },
  }
  const captured = captureModelLogValue({
    category: 'record',
    input: {
      kind: 'value',
      value: {
        kind: 'model_call_dispatched',
        call: p.step.call,
        dispatch: 1,
        response: 'original-response',
        adaptation,
        profile: { origin: 'official', routeName: 'controlled/model' },
        profileSnapshot: {
          adaptation,
          providers: ['controlled'],
          allowFallback: false,
          inputModalities: ['text'],
          outputModalities: ['text'],
          maxInputTokens: 100,
          maxOutputTokens: 20,
          inputConstraints: {},
          upstreamInputLimits: {
            maxInputTokens: { status: 'unknown' },
            maxRequestBytes: { status: 'unknown' },
          },
          updatedAt: at,
        },
        provider: 'controlled',
        selectedBy: 'session',
        credentialScope: { layer: 'factory' },
        parameters: {},
      },
    },
  })
  if ('invalidValue' in captured) throw new Error('invalid actual model record fixture')
  const entry = prepareModelLogEntry({
    session: p.scope.session,
    shell: { tenant, run: p.step.run, attempt: p.step.attempt },
    captured: captured.ok,
    purpose: { kind: 'record' },
    messagePrefix: null,
  })
  if ('invalidValue' in entry || !entry.ok.dedupeKey)
    throw new Error('invalid original dispatch entry')
  return { source, originalPosition: entry.ok.dedupeKey, entry: entry.ok }
}
it('atomically pairs latest Session admission, actual original model claim and dispatched anchor, and grants one launch', async () => {
  const { f, p, owner, prepared, ticket, original } = await modelFixture()
  expect(await owner.admitOriginal(original)).toEqual({ kind: 'denied' })
  const result = await f.runtime.modelInvocation.admit(
    f.runtime.coordinationAuthority,
    p.scope,
    prepared.source,
    p.step,
    ticket,
  )
  expect(result).toHaveProperty('kind', 'issued')
  if (!('kind' in result) || result.kind !== 'issued') throw new Error('actual issue missing')
  expect(await f.count('sr_model_issue')).toEqual({ n: 1 })
  expect(await f.count('mr_original_issue')).toEqual({ n: 1 })
  expect(await f.log().readSince(p.scope.session, 7)).toHaveProperty('entries.length', 1)
  const launch = await Promise.all([
    owner.consumeOriginal(result.claim),
    owner.consumeOriginal(result.claim),
  ])
  expect(launch.filter(x => x.kind === 'launch')).toHaveLength(1)
  expect(launch.filter(x => x.kind === 'unavailable')).toHaveLength(1)
  expect(
    await f.runtime.modelInvocation.admit(
      f.runtime.coordinationAuthority,
      p.scope,
      prepared.source,
      p.step,
      ticket,
    ),
  ).toHaveProperty('kind', 'alreadyIssued')
  expect(await f.log().readSince(p.scope.session, 7)).toHaveProperty('entries.length', 1)
})
it('rejects copied latest permits before the actual model participant can append or acquire a claim', async () => {
  const { f, p, prepared, ticket, current } = await modelFixture()
  expect(
    await f.runtime.modelInvocation.admit(
      f.runtime.coordinationAuthority,
      p.scope,
      prepared.source,
      { ...p.step, permit: { ...p.step.permit } },
      ticket,
    ),
  ).toEqual({ failure: 'staleAttempt' })
  expect(current).not.toHaveBeenCalled()
  expect(await f.count('mr_original_issue')).toEqual({ n: 0 })
  expect(await f.count('sr_model_issue')).toEqual({ n: 0 })
  expect(await f.log().readSince(p.scope.session, 7)).toHaveProperty('entries.length', 0)
})
it('keeps actual original model qualification refusal inside the common admission transaction', async () => {
  const { f, p, prepared, ticket, current } = await modelFixture()
  current.mockResolvedValue({ kind: 'denied' })
  expect(
    await f.runtime.modelInvocation.admit(
      f.runtime.coordinationAuthority,
      p.scope,
      prepared.source,
      p.step,
      ticket,
    ),
  ).toEqual({ failure: 'denied' })
  expect(await f.count('mr_original_issue')).toEqual({ n: 0 })
  expect(await f.count('sr_model_issue')).toEqual({ n: 0 })
  expect(await f.log().readSince(p.scope.session, 7)).toHaveProperty('tail', 7)
})
it('rechecks the actual latest attempt at launch and still drains original proof after the Run is terminal', async () => {
  const { f, p, owner, prepared, ticket } = await modelFixture()
  const result = await f.runtime.modelInvocation.admit(
    f.runtime.coordinationAuthority,
    p.scope,
    prepared.source,
    p.step,
    ticket,
  )
  if (!('kind' in result) || result.kind !== 'issued') throw new Error('actual issue missing')
  const facts = await f.runtime.journal.readPrefix(f.runtime.access, p.scope.session)
  if (!('kind' in facts) || facts.kind !== 'prefix') throw new Error('actual journal unavailable')
  const finished = await f.runtime.lifecycle.commitStep(
    f.runtime.coordinationAuthority,
    p.scope,
    facts.source,
    {
      kind: 'finish',
      stepKey: 'finish-before-send',
      run: p.step.run,
      attempt: p.step.attempt,
      permit: p.step.permit,
      terminal: 'completed',
      reason: 'controlled-settled-source',
    },
  )
  expect(finished).toHaveProperty('kind', 'committed')
  expect(await owner.consumeOriginal(result.claim)).toEqual({ kind: 'staleAttempt' })
  await f.runtime.close()
  expect(await owner.close()).toEqual({ kind: 'released' })
})

it('rolls back the actual model claim and dispatched anchor when Session issue capacity rejects the batch', async () => {
  const { f, p, owner, prepared, ticket } = await modelFixture(1)
  expect(
    await f.runtime.modelInvocation.admit(
      f.runtime.coordinationAuthority,
      p.scope,
      prepared.source,
      p.step,
      ticket,
    ),
  ).toHaveProperty('kind', 'issued')
  const reading = await f.runtime.journal.readPrefix(f.runtime.access, p.scope.session)
  if (!('kind' in reading) || reading.kind !== 'prefix')
    throw new Error('actual prefix unavailable')
  const next = {
    ...p.step,
    stepKey: 'prepare-second',
    call: 'second-call',
    originalPosition: 'second-position',
  }
  const saved = await f.runtime.lifecycle.commitStep(
    f.runtime.coordinationAuthority,
    p.scope,
    reading.source,
    next,
  )
  if (!('kind' in saved) || saved.kind !== 'committed')
    throw new Error('second prepare unavailable')
  const ready = owner.prepareOriginal(modelInput({ ...p, step: next }, saved.source))
  if (!('ticket' in ready)) throw new Error('second ticket unavailable')
  expect(
    await f.runtime.modelInvocation.admit(
      f.runtime.coordinationAuthority,
      p.scope,
      saved.source,
      next,
      ready.ticket,
    ),
  ).toEqual({ failure: 'unavailable' })
  expect(await f.count('mr_original_issue')).toEqual({ n: 1 })
  expect(await f.count('sr_model_issue')).toEqual({ n: 1 })
  expect(await f.log().readSince(p.scope.session, 9)).toHaveProperty('entries.length', 0)
})
it('recognizes a real lost admission commit without allocating another model claim or granting launch on replay', async () => {
  const { f, p, owner, prepared, ticket } = await modelFixture()
  const commit = f.storage.write.bind(f.storage)
  const lost = vi.spyOn(f.storage, 'write').mockImplementationOnce(async tx => {
    await commit(tx)
    throw new StorageUnavailable('lost actual issue commit return')
  })
  expect(
    await f.runtime.modelInvocation.admit(
      f.runtime.coordinationAuthority,
      p.scope,
      prepared.source,
      p.step,
      ticket,
    ),
  ).toEqual({
    kind: 'unknownCommit',
    scope: p.scope,
    call: p.step.call,
    originalPosition: p.step.originalPosition,
  })
  lost.mockRestore()
  expect(await f.count('mr_original_issue')).toEqual({ n: 1 })
  expect(await f.count('sr_model_issue')).toEqual({ n: 1 })
  const replay = await f.runtime.modelInvocation.admit(
    f.runtime.coordinationAuthority,
    p.scope,
    prepared.source,
    p.step,
    ticket,
  )
  expect(replay).toHaveProperty('kind', 'alreadyIssued')
  expect(replay).not.toHaveProperty('claim')
  expect(await f.log().readSince(p.scope.session, 7)).toHaveProperty('entries.length', 1)
  expect(await owner.close()).toEqual({ kind: 'released' })
})
it('requires the same original prepare semantics and treats reordered JSON fields as the same data', async () => {
  const { f, p, prepared, ticket } = await modelFixture()
  expect(
    await f.runtime.modelInvocation.admit(
      f.runtime.coordinationAuthority,
      p.scope,
      prepared.source,
      { ...p.step, originalPosition: 'another-position' },
      ticket,
    ),
  ).toEqual({ failure: 'retryFromFacts' })
  const { permit, attempt, run, originalPosition, call, stepKey, kind } = p.step
  expect(
    await f.runtime.modelInvocation.admit(
      f.runtime.coordinationAuthority,
      p.scope,
      prepared.source,
      { permit, attempt, run, originalPosition, call, stepKey, kind },
      ticket,
    ),
  ).toHaveProperty('kind', 'issued')
})
it('stops new launch on ingress close without revoking read-only recognition of its original issued source', async () => {
  const { f, p, owner, prepared, ticket } = await modelFixture()
  const result = await f.runtime.modelInvocation.admit(
    f.runtime.coordinationAuthority,
    p.scope,
    prepared.source,
    p.step,
    ticket,
  )
  if (!('kind' in result) || result.kind !== 'issued') throw new Error('actual issue missing')
  await f.runtime.close()
  expect(await owner.consumeOriginal(result.claim)).toEqual({ kind: 'unavailable' })
  expect(await owner.close()).toEqual({ kind: 'released' })
})

it('reports admission read failure before the participant starts as unavailable rather than unknownCommit', async () => {
  const { f, p, prepared, ticket } = await modelFixture()
  vi.spyOn(f.storage, 'atomic').mockRejectedValueOnce(
    new StorageUnavailable('read before model staging unavailable'),
  )
  expect(
    await f.runtime.modelInvocation.admit(
      f.runtime.coordinationAuthority,
      p.scope,
      prepared.source,
      p.step,
      ticket,
    ),
  ).toEqual({ failure: 'unavailable' })
  expect(await f.count('mr_original_issue')).toEqual({ n: 0 })
})
it('rejects a damaged stored preparation position before staging a real original model claim', async () => {
  const { f, p, prepared, ticket, current } = await modelFixture()
  const row = await f.storage.read(tx =>
    tx.db.selectFrom('sr_call_preparation').select('preparation').executeTakeFirstOrThrow(),
  )
  const data = JSON.parse(row.preparation as string)
  await f.storage.write(tx =>
    tx.db
      .updateTable('sr_call_preparation')
      .set({ preparation: JSON.stringify({ ...data, position: 99 }) })
      .execute(),
  )
  await expect(
    f.runtime.modelInvocation.admit(
      f.runtime.coordinationAuthority,
      p.scope,
      prepared.source,
      p.step,
      ticket,
    ),
  ).rejects.toThrow('call preparation receipt')
  expect(current).not.toHaveBeenCalled()
  expect(await f.count('mr_original_issue')).toEqual({ n: 0 })
})

describe('original model result custody', () => {
  async function resultFixture() {
    const m = await modelFixture()
    const issued = await m.f.runtime.modelInvocation.admit(
      m.f.runtime.coordinationAuthority,
      m.p.scope,
      m.prepared.source,
      m.p.step,
      m.ticket,
    )
    if (!('kind' in issued) || issued.kind !== 'issued')
      throw new Error('actual original issue missing')
    expect(await m.owner.consumeOriginal(issued.claim)).toEqual({ kind: 'launch' })
    const captured = captureModelLogValue({
      category: 'record',
      input: { kind: 'value', value: readOriginalDispatch(m.original.entry.payload) },
    })
    if ('invalidValue' in captured || captured.ok.record?.kind !== 'model_call_dispatched')
      throw new Error('actual dispatch fixture unavailable')
    const {
      kind: _kind,
      call: _call,
      dispatch: _dispatch,
      response: _response,
      ...route
    } = captured.ok.record
    const reply = judgeMessage({
      id: 'original-reply',
      type: 'assistant',
      response: 'original-response',
      ending: 'complete',
      createdAt: '2026-10-08T00:00:02Z',
      blocks: [
        {
          id: 'answer-text',
          kind: 'text',
          text: 'original complete answer',
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    if ('rejected' in reply || reply.ok.type !== 'assistant' || reply.ok.ending !== 'complete')
      throw new Error('invalid actual assistant fixture')
    const pending: Extract<PendingModelResponse, { outcome: 'complete' }> = {
      id: 'original-response',
      call: { callId: m.p.step.call, runId: m.p.step.run },
      attemptId: m.p.step.attempt,
      dispatch: 1,
      route: {
        adaptation: route.adaptation,
        profile: route.profile,
        profileSnapshot: route.profileSnapshot,
        provider: route.provider,
        selectedBy: route.selectedBy,
        credentialScope: route.credentialScope,
        parameters: route.parameters,
      },
      outcome: 'complete',
      reply: reply.ok,
      timing: { sentAt: at, firstTokenAt: '2026-10-08T00:00:01Z', endedAt: '2026-10-08T00:00:02Z' },
      usage: {
        input_tokens: 11,
        output_tokens: 5,
        cache_read_tokens: 'unknown',
        cache_write_tokens: 0,
        source: 'upstream',
      },
      cost: {
        cost_usd: new LosslessNumber('0.0000000000000000000000000310'),
        source: 'upstream_usage',
      },
      inputCalibration: {
        requestInput: { kind: 'unavailable', reason: 'not_retained' },
        observedInput: { kind: 'unavailable', reason: 'missing_usage' },
        outputGroup: { kind: 'unavailable', reason: 'not_retained' },
      },
    }
    if (!('ok' in judgePendingModelResponse(pending)))
      throw new Error('invalid complete Pending fixture')
    const read = await m.f.runtime.journal.readPrefix(m.f.runtime.access, m.p.scope.session)
    if (!('kind' in read) || read.kind !== 'prefix') throw new Error('actual source unavailable')
    const verify = vi.spyOn(m.f.options.modelResults!.source, 'verifyIn')
    const data = { resultKey: 'original-result', source: read.source, pending }
    const store = (value: typeof data = data) =>
      m.f.runtime.modelResults.store(
        m.f.runtime.coordinationAuthority,
        m.p.scope,
        value as import('../src/model-result-types.ts').ModelResultInput,
      )
    return { ...m, verify, data, store }
  }
  function readOriginalDispatch(payload: unknown) {
    const read = readModelLogEnvelope(payload)
    if (!('kind' in read) || read.kind !== 'model')
      throw new Error('original dispatch envelope missing')
    return read.envelope.value
  }
  async function adoptingFixture() {
    const m = await resultFixture()
    const saved = await m.store()
    if (!('kind' in saved) || saved.kind !== 'custodied')
      throw new Error('original custody missing')
    const step = {
      kind: 'adoptResult' as const,
      stepKey: 'adopt-original-result',
      run: m.p.step.run,
      attempt: m.p.step.attempt,
      permit: m.p.step.permit,
      result: saved.witness.receipt,
    }
    const adopt = (candidate = step) =>
      m.f.runtime.lifecycle.commitStep(
        m.f.runtime.coordinationAuthority,
        m.p.scope,
        saved.witness.receipt.source,
        candidate,
      )
    return { ...m, saved, step, adopt }
  }
  it('adopts an original stored result once under its actual latest permit without inserting a second reply', async () => {
    const m = await adoptingFixture()
    const adopted = await m.adopt()
    expect(adopted).toMatchObject({
      kind: 'committed',
      receipt: {
        ...m.p.scope,
        run: m.step.run,
        attempt: m.step.attempt,
        step: 'adoptResult',
        stepKey: m.step.stepKey,
      },
      permit: null,
    })
    expect(await m.adopt()).toEqual(adopted)
    expect(await m.adopt({ ...m.step, stepKey: 'duplicate-adoption' })).toEqual({
      failure: 'retryFromFacts',
    })
    expect(await m.f.count('sr_result_adoption')).toEqual({ n: 1 })
    expect(await m.f.count('sr_model_result')).toEqual({ n: 1 })
    const after = await m.f.runtime.journal.readPrefix(m.f.runtime.access, m.p.scope.session)
    if (!('kind' in after) || after.kind !== 'prefix') throw new Error('actual journal missing')
    expect(after.entries.slice(-1)).toMatchObject([
      {
        payload: {
          kind: 'fact',
          owner: 'session-runtime-local',
          value: { kind: 'result_adopted' },
        },
      },
    ])
  })
  it('recognizes the original adopted result after its real commit return is lost', async () => {
    const m = await adoptingFixture()
    const actual = m.f.storage.atomic.bind(m.f.storage)
    let visits = 0
    const fault = vi.spyOn(m.f.storage, 'atomic').mockImplementation(async work => {
      const outcome = await actual(work)
      if (++visits === 2) throw new StorageUnavailable('adoption committed but return lost')
      return outcome
    })
    expect(await m.adopt()).toEqual({
      kind: 'unknownCommit',
      scope: m.p.scope,
      stepKey: m.step.stepKey,
    })
    fault.mockRestore()
    expect(await m.f.count('sr_result_adoption')).toEqual({ n: 1 })
    expect(await m.adopt()).toHaveProperty('kind', 'committed')
    expect(await m.f.count('sr_result_adoption')).toEqual({ n: 1 })
    expect(await m.adopt({ ...m.step, stepKey: 'lost-return-new-key' })).toEqual({
      failure: 'retryFromFacts',
    })
  })
  it('rolls back adoption fact, consumed index and receipt together when the original Unit cannot commit', async () => {
    const m = await adoptingFixture()
    const before = await m.f.runtime.journal.readPrefix(m.f.runtime.access, m.p.scope.session)
    const actual = m.f.storage.atomic.bind(m.f.storage)
    let visits = 0
    const fault = vi.spyOn(m.f.storage, 'atomic').mockImplementation(work => {
      if (++visits !== 2) return actual(work)
      return actual(async unit => {
        await work(unit)
        throw new StorageUnavailable('original adoption rolled back')
      })
    })
    expect(await m.adopt()).toEqual({
      kind: 'unknownCommit',
      scope: m.p.scope,
      stepKey: m.step.stepKey,
    })
    fault.mockRestore()
    expect(await m.f.count('sr_result_adoption')).toEqual({ n: 0 })
    expect(await m.f.runtime.journal.readPrefix(m.f.runtime.access, m.p.scope.session)).toEqual(
      before,
    )
    expect(await m.adopt()).toHaveProperty('kind', 'committed')
  })
  it('refuses copied permits and altered custody coordinates without adopting the original result', async () => {
    const m = await adoptingFixture()
    expect(await m.adopt({ ...m.step, permit: { ...m.step.permit } })).toEqual({
      failure: 'staleAttempt',
    })
    expect(await m.adopt({ ...m.step, result: { ...m.step.result, position: 1 } })).toEqual({
      failure: 'retryFromFacts',
    })
    expect(
      await m.adopt({
        ...m.step,
        result: { ...m.step.result, resultKey: 'absent-original-result' },
      }),
    ).toEqual({ failure: 'retryFromFacts' })
    expect(await m.f.count('sr_result_adoption')).toEqual({ n: 0 })
    expect(await m.adopt()).toHaveProperty('kind', 'committed')
  })
  it('keeps terminal result custody but gives it no new adoption or progression', async () => {
    const m = await adoptingFixture()
    expect(
      await m.f.runtime.lifecycle.commitStep(
        m.f.runtime.coordinationAuthority,
        m.p.scope,
        m.saved.witness.receipt.source,
        {
          kind: 'finish',
          stepKey: 'finish-before-adopt',
          run: m.step.run,
          attempt: m.step.attempt,
          permit: m.step.permit,
          terminal: 'completed',
          reason: 'no remaining actions',
        },
      ),
    ).toHaveProperty('kind', 'committed')
    expect(await m.adopt()).toEqual({ failure: 'terminal' })
    expect(
      await m.f.runtime.modelResults.read(
        m.f.runtime.coordinationAuthority,
        m.p.scope,
        m.step.result.call,
        m.step.result.resultKey,
      ),
    ).toMatchObject({ kind: 'alreadyCustodied', pending: m.data.pending })
    expect(await m.f.count('sr_result_adoption')).toEqual({ n: 0 })
  })
  it('saves the complete original Pending and fixed receipt, without a disposition or model ACK', async () => {
    const { f, p, data, store, verify } = await resultFixture()
    const saved = await store()
    expect(saved).toMatchObject({
      kind: 'custodied',
      pending: data.pending,
      witness: {
        response: data.pending.id,
        original: { ...p.scope, call: p.step.call, run: p.step.run, attempt: p.step.attempt },
        receipt: { ...p.scope, call: p.step.call, resultKey: data.resultKey, position: 9 },
      },
    })
    if (!('kind' in saved) || saved.kind !== 'custodied') throw new Error('actual custody missing')
    expect(writeJsonLossless(saved.pending)).toEqual(writeJsonLossless(data.pending))
    expect(verify).toHaveBeenCalledTimes(1)
    expect(await f.count('sr_model_result')).toEqual({ n: 1 })
    expect(await f.count('mr_original_issue')).toEqual({ n: 1 })
    const read = await f.runtime.modelResults.read(
      f.runtime.coordinationAuthority,
      p.scope,
      p.step.call,
      data.resultKey,
    )
    expect(read).toMatchObject({ kind: 'alreadyCustodied', pending: data.pending })
    expect(read).not.toHaveProperty('pending.replyDisposition')
    if (!('kind' in read) || read.kind !== 'alreadyCustodied')
      throw new Error('actual original custody missing')
    expect(writeJsonLossless(read.pending)).toEqual(writeJsonLossless(data.pending))
    const prefix = await f.log().readSince(p.scope.session, 8)
    if ('failure' in prefix) throw new Error('actual custody log unavailable')
    expect(prefix.entries.map(readSessionFact)).toMatchObject([
      { kind: 'fact', fact: { kind: 'result_custodied', resultKey: data.resultKey } },
    ])
  })
  it('recognizes reordered data by its original semantic value and refuses an altered reply or another key', async () => {
    const { f, p, data, store, verify } = await resultFixture()
    const first = await store()
    const reordered = {
      ...data,
      pending: Object.fromEntries(Object.entries(data.pending).reverse()) as typeof data.pending,
    }
    expect(await store(reordered)).toEqual({ ...first, kind: 'alreadyCustodied' })
    expect(verify).toHaveBeenCalledTimes(1)
    const block = data.pending.reply.blocks[0]
    if (!block || block.kind !== 'text') throw new Error('expected actual text block')
    expect(
      await store({
        ...data,
        pending: {
          ...data.pending,
          reply: { ...data.pending.reply, blocks: [{ ...block, text: 'different answer' }] },
        },
      }),
    ).toEqual({ failure: 'identityConflict' })
    expect(await store({ ...data, resultKey: 'another-key' })).toEqual({
      failure: 'identityConflict',
    })
    expect(await f.count('sr_model_result')).toEqual({ n: 1 })
    expect(await f.log().readSince(p.scope.session, 8)).toHaveProperty('tail', 9)
  })
  it('refuses copied coordination authority and another tenant before consulting the original source', async () => {
    const { f, p, data, verify } = await resultFixture()
    expect(
      await f.runtime.modelResults.store(
        { ...f.runtime.coordinationAuthority },
        p.scope,
        data as import('../src/model-result-types.ts').ModelResultInput,
      ),
    ).toEqual({ failure: 'denied' })
    expect(
      await f.runtime.modelResults.store(
        f.runtime.coordinationAuthority,
        {
          ...p.scope,
          tenant: unwrap(parseTenantId({ organization: 'foreign', account: 'owner' })),
        },
        data as import('../src/model-result-types.ts').ModelResultInput,
      ),
    ).toEqual({ failure: 'denied' })
    expect(verify).not.toHaveBeenCalled()
    expect(await f.count('sr_model_result')).toEqual({ n: 0 })
  })
  it('refuses a response that is not the original dispatched identity without publishing custody', async () => {
    const { f, data, store, verify } = await resultFixture()
    expect(
      await store({
        ...data,
        pending: {
          ...data.pending,
          id: 'another-response',
          reply: { ...data.pending.reply, response: 'another-response' },
        },
      }),
    ).toEqual({ failure: 'invalidSource' })
    expect(verify).not.toHaveBeenCalled()
    expect(await f.count('sr_model_result')).toEqual({ n: 0 })
  })
  it('keeps the original source responsible when complete value or reference custody is unavailable', async () => {
    const { f, p, store, verify } = await resultFixture()
    verify.mockResolvedValue('unavailable')
    expect(await store()).toEqual({ failure: 'unavailable' })
    expect(await f.count('sr_model_result')).toEqual({ n: 0 })
    expect(await f.log().readSince(p.scope.session, 8)).toHaveProperty('tail', 8)
    expect(await f.count('mr_original_issue')).toEqual({ n: 1 })
  })
  it('recognizes a real committed full value after the caller loses the custody return', async () => {
    const { f, p, data, store } = await resultFixture()
    const write = f.storage.write.bind(f.storage)
    vi.spyOn(f.storage, 'write').mockImplementationOnce(async (...args) => {
      await write(...args)
      throw new StorageUnavailable('custody committed but return lost')
    })
    expect(await store()).toEqual({
      kind: 'unknownCommit',
      scope: p.scope,
      call: p.step.call,
      resultKey: data.resultKey,
    })
    expect(await f.count('sr_model_result')).toEqual({ n: 1 })
    expect(await store()).toMatchObject({ kind: 'alreadyCustodied', pending: data.pending })
    expect(await f.count('sr_model_result')).toEqual({ n: 1 })
    expect(await f.log().readSince(p.scope.session, 8)).toHaveProperty('tail', 9)
  })
  it('stores a late complete result under the original Run grant without reopening its terminal state', async () => {
    const { f, p, store } = await resultFixture()
    const journal = await f.runtime.journal.readPrefix(f.runtime.access, p.scope.session)
    if (!('kind' in journal) || journal.kind !== 'prefix')
      throw new Error('actual journal unavailable')
    const finished = await f.runtime.lifecycle.commitStep(
      f.runtime.coordinationAuthority,
      p.scope,
      journal.source,
      {
        kind: 'finish',
        run: p.step.run,
        attempt: p.step.attempt,
        permit: p.step.permit,
        stepKey: 'finish-before-result',
        terminal: 'completed',
        reason: 'no-more-work',
      },
    )
    expect(finished).toHaveProperty('kind', 'committed')
    const before = await f.runtime.operations.readProgress(f.runtime.access, p.scope.session)
    f.setDecision('memberRejected')
    expect(await store()).toHaveProperty('kind', 'custodied')
    f.setDecision('memberValid')
    const after = await f.runtime.operations.readProgress(f.runtime.access, p.scope.session)
    if (
      !('kind' in before) ||
      before.kind !== 'progress' ||
      !('kind' in after) ||
      after.kind !== 'progress'
    )
      throw new Error('actual progress unavailable')
    expect(after.progress.run).toEqual(before.progress.run)
    expect(after.progress.state).toBe(before.progress.state)
    expect(after.progress.attempt).toEqual(before.progress.attempt)
  })
  it('rolls back original reference staging when the source cannot transfer the complete required custody', async () => {
    const { f, p, data, store, verify } = await resultFixture()
    await f.storage.write(tx =>
      tx.db.schema
        .createTable('test_result_reference')
        .addColumn('key', 'text', c => c.primaryKey())
        .addColumn('held', 'text')
        .execute(),
    )
    const pending = {
      ...data.pending,
      raw: {
        body: { storage: 'controlled-attachments', key: 'raw-body', mediaType: 'application/json' },
      },
    }
    expect(judgePendingModelResponse(pending)).toEqual({ ok: true })
    verify.mockImplementation(async unit => {
      unit.assertStorage(f.storage)
      await unit.mutate(tx =>
        tx.db
          .insertInto('test_result_reference')
          .values({ key: 'raw-body', held: 'session' })
          .execute(),
      )
      return 'unavailable'
    })
    expect(await store({ ...data, pending })).toEqual({ failure: 'unavailable' })
    expect(await f.count('test_result_reference')).toEqual({ n: 0 })
    expect(await f.count('sr_model_result')).toEqual({ n: 0 })
    expect(await f.log().readSince(p.scope.session, 8)).toHaveProperty('tail', 8)
  })
  it('reports a pre-staging storage failure without inventing an unknown result commit', async () => {
    const { f, store, verify } = await resultFixture()
    vi.spyOn(f.storage, 'write').mockRejectedValueOnce(
      new StorageUnavailable('before original result staging'),
    )
    expect(await store()).toEqual({ failure: 'unavailable' })
    expect(verify).not.toHaveBeenCalled()
    expect(await f.count('sr_model_result')).toEqual({ n: 0 })
  })
  it('rejects a stored custody receipt that points at the original dispatch instead of its result fact', async () => {
    const { f, p, data, store } = await resultFixture()
    expect(await store()).toHaveProperty('kind', 'custodied')
    const row = await f.storage.read(tx =>
      tx.db.selectFrom('sr_model_result').select('record').executeTakeFirstOrThrow(),
    )
    if (typeof row.record !== 'string') throw new Error('actual stored record missing')
    const decoded = readJsonStrict(row.record)
    if ('failed' in decoded) throw new Error('actual stored result malformed')
    const original =
      decoded.ok as unknown as import('../src/model-result-types.ts').ModelResultStored
    const changed = {
      ...original,
      witness: { ...original.witness, receipt: { ...original.witness.receipt, position: 8 } },
    }
    await f.storage.write(tx =>
      tx.db
        .updateTable('sr_model_result')
        .set({ record: writeJsonLossless(changed) })
        .execute(),
    )
    await expect(
      f.runtime.modelResults.read(
        f.runtime.coordinationAuthority,
        p.scope,
        p.step.call,
        data.resultKey,
      ),
    ).rejects.toThrow('custody fact')
  })
  it('propagates a defective original source instead of returning a success or authorization decision', async () => {
    const { f, store, verify } = await resultFixture()
    const error = new Error('defective original result source')
    verify.mockRejectedValue(error)
    await expect(store()).rejects.toBe(error)
    expect(await f.count('sr_model_result')).toEqual({ n: 0 })
  })
  it('withdraws new work and drains an original in-flight result without closing borrowed owners', async () => {
    const { f, p, data, store, verify } = await resultFixture()
    let unblock!: () => void, entered!: () => void
    const inside = new Promise<void>(resolve => {
      entered = resolve
    })
    const held = new Promise<void>(resolve => {
      unblock = resolve
    })
    verify.mockImplementation(async unit => {
      unit.assertStorage(f.storage)
      entered()
      await held
      return 'verified'
    })
    const saving = store()
    await inside
    let closed = false
    const close = f.runtime.close().then(() => {
      closed = true
    })
    try {
      expect(
        await f.runtime.modelResults.read(
          f.runtime.coordinationAuthority,
          p.scope,
          p.step.call,
          data.resultKey,
        ),
      ).toEqual({ failure: 'unavailable' })
      expect(closed).toBe(false)
    } finally {
      unblock()
    }
    expect(await saving).toHaveProperty('kind', 'custodied')
    await close
    expect(await f.count('sr_model_result')).toEqual({ n: 1 })
    expect(await f.log().readSince(p.scope.session, 8)).toHaveProperty('tail', 9)
  })
})

describe('original Run journal borrow for model settlement', () => {
  async function borrowed() {
    const f = await fixture(),
      p = await preparedAttempt(f)
    const result = await f.runtime.runJournal.borrow(
      f.runtime.coordinationAuthority,
      p.scope,
      p.step.run,
    )
    if (!('journal' in result)) throw new Error('original Run journal unavailable')
    return { f, p, journal: result.journal }
  }
  it('holds the original Run unit through a trusted input read and drains it before returning the borrow', async () => {
    const { f, journal } = await borrowed()
    const entered = Promise.withResolvers<void>()
    const finish = Promise.withResolvers<void>()
    const read = journal.withReadUnit(async unit => {
      unit.assertStorage(f.storage)
      entered.resolve()
      await finish.promise
      return { original: true }
    })
    await entered.promise
    let closed = false
    const closing = journal.close().then(() => {
      closed = true
    })
    await new Promise(resolve => setImmediate(resolve))
    expect(closed).toBe(false)
    const late = vi.fn(async () => 'late')
    expect(await journal.withReadUnit(late)).toEqual({ unavailable: true })
    expect(late).not.toHaveBeenCalled()
    finish.resolve()
    expect(await read).toEqual({ read: { original: true } })
    await closing
    expect(journal.currentGeneration()).toBeNull()
  })
  it('provides one actual prefix and same-Unit write under the original grant after member refusal', async () => {
    const { f, p, journal } = await borrowed()
    try {
      f.setDecision('memberRejected')
      const denied = await f.admission.reserve(source, {
        tenant,
        session: null,
        purpose: 'createSession',
        operationKey: 'probe-rejected',
        inputPosition: null,
      })
      await f.admission.query(denied.ticket)
      const count = f.probe.mock.calls.length
      expect(await f.runtime.journal.readPrefix(f.runtime.access, p.scope.session)).toEqual({
        failure: 'denied',
      })
      const prefix = await journal.readPrefix()
      if ('failure' in prefix) throw new Error('original prefix unavailable')
      expect(prefix.entries.length).toBe(6)
      expect(prefix.source.tail).toEqual(prefix.tail)
      const result = await journal.log.append(
        p.scope.session,
        [
          {
            tenant,
            run: p.step.run,
            attempt: p.step.attempt,
            dedupeKey: 'original-settlement',
            readKeys: ['original-settlement'],
            payload: { settlement: 'actual original Run' },
          },
        ],
        { kind: 'unfenced' },
        { kind: 'tailEquals', tail: prefix.tail },
      )
      expect(result).toMatchObject({ positions: [7], tail: 7 })
      expect(await journal.log.readByKey(p.scope.session, 'original-settlement')).toMatchObject({
        entries: [{ position: 7 }],
        tail: 7,
      })
      expect(await journal.log.readSince(p.scope.session, 6)).toMatchObject({
        entries: [{ position: 7 }],
        tail: 7,
      })
      expect(f.probe.mock.calls.length).toBe(count)
    } finally {
      await journal.close()
    }
  })
  it('rejects copied authority, unknown Run and foreign tenant without granting a writer', async () => {
    const f = await fixture(),
      p = await preparedAttempt(f)
    expect(
      await f.runtime.runJournal.borrow(
        {} as typeof f.runtime.coordinationAuthority,
        p.scope,
        p.step.run,
      ),
    ).toEqual({ failure: 'denied' })
    expect(
      await f.runtime.runJournal.borrow(f.runtime.coordinationAuthority, p.scope, 'missing-run'),
    ).toEqual({ failure: 'denied' })
    expect(
      await f.runtime.runJournal.borrow(
        f.runtime.coordinationAuthority,
        {
          tenant: unwrap(parseTenantId({ ...tenant, organization: 'foreign' })),
          session: p.scope.session,
        },
        p.step.run,
      ),
    ).toEqual({ failure: 'denied' })
    expect(await f.runtime.runJournal.borrow(f.runtime.coordinationAuthority, p.scope, '')).toEqual(
      { failure: 'invalidInput' },
    )
  })
  it('refuses a borrowed writer used for another Session or Run before touching storage', async () => {
    const { f, p, journal } = await borrowed()
    try {
      const write = vi.spyOn(f.storage, 'atomic')
      expect(
        await journal.log.append(
          unwrap(parseOpaqueIdentifier('other-session', 'SessionRef')),
          [{ tenant, readKeys: [], payload: { x: 1 } }],
          { kind: 'unfenced' },
          { kind: 'unconditional' },
        ),
      ).toEqual({ failure: 'invalidInput' })
      expect(
        await journal.log.append(
          p.scope.session,
          [{ tenant, run: 'other-run', attempt: 1, readKeys: [], payload: { x: 1 } }],
          { kind: 'unfenced' },
          { kind: 'unconditional' },
        ),
      ).toEqual({ failure: 'invalidInput' })
      expect(
        await journal.log.readSince(
          unwrap(parseOpaqueIdentifier('other-session', 'SessionRef')),
          0,
        ),
      ).toEqual({ failure: 'invalidInput' })
      expect(write).not.toHaveBeenCalled()
    } finally {
      await journal.close()
    }
  })
  it('retains the accepted borrow while ingress closes and returns it only after actual release', async () => {
    const { f, p, journal } = await borrowed()
    let closed = false
    const close = f.runtime.close().then(() => {
      closed = true
    })
    await new Promise(resolve => setImmediate(resolve))
    expect(closed).toBe(false)
    expect(
      await f.runtime.runJournal.borrow(f.runtime.coordinationAuthority, p.scope, p.step.run),
    ).toEqual({ failure: 'unavailable' })
    expect(await journal.readPrefix()).toHaveProperty('entries')
    await journal.close()
    await close
    expect(await journal.readPrefix()).toEqual({ failure: 'unavailable' })
    await journal.close()
    expect(
      await f.storage.read(tx => tx.db.selectFrom('sr_run_grant').selectAll().execute()),
    ).toHaveLength(1)
  })
  it('rechecks the original persisted grant on use and exposes a corrupted grant as a defect', async () => {
    const { f, p, journal } = await borrowed()
    try {
      await f.storage.write(tx =>
        tx.db
          .updateTable('sr_run_grant')
          .set({ grant: '{}' })
          .where('session', '=', p.scope.session)
          .execute(),
      )
      await expect(journal.readPrefix()).rejects.toThrow('corrupt original Run admission grant')
    } finally {
      await journal.close()
    }
  })
  it('drains an actual original read before returning the borrow and keeps physical dependencies open', async () => {
    const { f, p, journal } = await borrowed()
    expect(journal.currentGeneration()).toBe(journal.generation)
    let entered!: () => void, release!: () => void
    const inside = new Promise<void>(resolve => {
        entered = resolve
      }),
      gate = new Promise<void>(resolve => {
        release = resolve
      })
    const original = f.storage.atomic
    vi.spyOn(f.storage, 'atomic').mockImplementation(action =>
      original.call(f.storage, async unit => {
        entered()
        await gate
        return action(unit)
      }),
    )
    const reading = journal.readPrefix()
    await inside
    let returned = false
    const closing = journal.close().then(() => {
      returned = true
    })
    expect(journal.currentGeneration()).toBeNull()
    expect(await journal.log.readSince(p.scope.session, 0)).toEqual({ failure: 'unavailable' })
    expect(returned).toBe(false)
    release()
    expect(await reading).toHaveProperty('entries')
    await closing
    expect(returned).toBe(true)
    expect(await f.log().readSince(p.scope.session, 0)).toHaveProperty('tail', 6)
  })
  it('reports a lost commit as native unavailable and recognizes the one original append without reissuing', async () => {
    const { f, p, journal } = await borrowed()
    try {
      const write = f.storage.write
      let lost = true
      vi.spyOn(f.storage, 'write').mockImplementation(async action => {
        const result = await write.call(f.storage, action)
        if (lost) {
          lost = false
          throw new StorageUnavailable('actual original append return lost')
        }
        return result
      })
      expect(
        await journal.log.append(
          p.scope.session,
          [
            {
              tenant,
              run: p.step.run,
              attempt: p.step.attempt,
              dedupeKey: 'lost-original',
              readKeys: ['lost-original'],
              payload: { original: 'retained' },
            },
          ],
          { kind: 'unfenced' },
          { kind: 'unconditional' },
        ),
      ).toEqual({ failure: 'unavailable' })
      const recognized = await journal.log.readByKey(p.scope.session, 'lost-original')
      expect(recognized).toMatchObject({
        entries: [{ position: 7, payload: { original: 'retained' } }],
        tail: 7,
      })
      if ('failure' in recognized) throw new Error('recognition unavailable')
      expect(recognized.entries).toHaveLength(1)
    } finally {
      await journal.close()
    }
  })
  it('bounds live borrows by the explicit budget and reuses a slot only after returning its actual borrow', async () => {
    const f = await fixture(),
      p = await preparedAttempt(f)
    const borrows = []
    try {
      for (let index = 0; index < f.options.policy.maxInFlight; index++) {
        const result = await f.runtime.runJournal.borrow(
          f.runtime.coordinationAuthority,
          p.scope,
          p.step.run,
        )
        if (!('journal' in result)) throw new Error('borrow before actual limit refused')
        borrows.push(result.journal)
      }
      expect(
        await f.runtime.runJournal.borrow(f.runtime.coordinationAuthority, p.scope, p.step.run),
      ).toEqual({ failure: 'unavailable' })
      await borrows[0]!.close()
      const next = await f.runtime.runJournal.borrow(
        f.runtime.coordinationAuthority,
        p.scope,
        p.step.run,
      )
      expect(next).toHaveProperty('journal')
      if ('journal' in next) borrows.push(next.journal)
    } finally {
      await Promise.all(borrows.map(b => b.close()))
    }
  })
})

it('scans only bounded durable tenant work using an original keyset cursor without consuming input', async () => {
  const f = await fixture()
  const a = await create(f)
  const b = await f.runtime.operations.createSession(f.runtime.access, {
    ...input,
    operationKey: 'scan-second',
  })
  if (!('kind' in b) || b.kind !== 'created') throw new Error('second Session missing')
  const authority = f.runtime.coordinationAuthority
  expect(await f.runtime.scanWork(authority, null, 1)).toEqual({
    kind: 'workPage',
    sessions: [],
    next: null,
  })
  for (const session of [a.session, b.session]) {
    expect(
      await f.runtime.operations.submitInput(
        f.runtime.access,
        session,
        'scan-input',
        user('scan', session),
      ),
    ).toHaveProperty('kind', 'accepted')
  }
  const ordered = [a.session, b.session].sort()
  const before = await f.count('sr_pending_input')
  expect(await f.runtime.scanWork(authority, null, 1)).toEqual({
    kind: 'workPage',
    sessions: [ordered[0]],
    next: ordered[0],
  })
  expect(await f.runtime.scanWork(authority, ordered[0]!, 1)).toEqual({
    kind: 'workPage',
    sessions: [ordered[1]],
    next: ordered[1],
  })
  expect(await f.runtime.scanWork(authority, ordered[1]!, 1)).toEqual({
    kind: 'workPage',
    sessions: [],
    next: null,
  })
  expect(await f.runtime.scanWork(authority, null, 3)).toEqual({
    kind: 'workPage',
    sessions: ordered,
    next: null,
  })
  expect(await f.count('sr_pending_input')).toEqual(before)
  expect(await f.count('sr_run_seen')).toEqual({ n: 0 })
  expect(await f.runtime.scanWork({ ...authority }, null, 1)).toEqual({ failure: 'denied' })
  expect(await f.runtime.scanWork(authority, null, 0)).toEqual({ failure: 'invalidInput' })
  expect(await f.runtime.scanWork(authority, null, 17)).toEqual({ failure: 'invalidInput' })
  await f.runtime.close()
  expect(await f.runtime.scanWork(authority, null, 1)).toEqual({ failure: 'unavailable' })
})

it('keeps an active original Run visible in the work scan after it consumes the last pending input', async () => {
  const f = await fixture(),
    created = await create(f)
  expect(
    await f.runtime.operations.submitInput(
      f.runtime.access,
      created.session,
      'scan-run-input',
      user(),
    ),
  ).toHaveProperty('kind', 'accepted')
  const scope = { tenant, session: created.session },
    authority = f.runtime.coordinationAuthority
  const work = await f.runtime.readWork(authority, scope, 1)
  if (!('kind' in work)) throw new Error('actual pending missing')
  const started = await f.runtime.lifecycle.commitStep(authority, scope, work.source, {
    kind: 'startRun',
    stepKey: 'scan-start',
    inputPosition: work.inputs[0]!,
  })
  expect(started).toHaveProperty('kind', 'committed')
  expect(await f.count('sr_pending_input')).toEqual({ n: 0 })
  expect(await f.runtime.scanWork(authority, null, 16)).toEqual({
    kind: 'workPage',
    sessions: [created.session],
    next: null,
  })
  // The scan returns a candidate, not a permit or newly refreshed login qualification.
  expect(await f.count('sr_model_issue')).toEqual({ n: 0 })
})

describe('Session original Tool participation', () => {
  it('rejects a copied coordination authority before providing original Tool support', async () => {
    const f = await fixture(undefined, 32, () => ({
      toolIssue: { maxRecords: 8, current: { authorizeIn: async () => ({ kind: 'authorized' }) } },
    }))
    const result = await f.runtime.toolInvocation.support(
      Object.freeze({}) as typeof f.runtime.coordinationAuthority,
    )
    expect(result).toEqual({ unavailable: true })
  })
  it('does not provide original Tool support without an explicit current qualification source', async () => {
    const f = await fixture()
    expect(await f.runtime.toolInvocation.support(f.runtime.coordinationAuthority)).toEqual({
      unavailable: true,
    })
  })
})

async function sessionToolFixture(
  terminal = false,
  conclusionMode?: 'observed' | 'foreignAttempt',
) {
  const current = vi.fn<
    import('@omne-harness-lite/tool-execution-runtime').ToolOriginalIssueAuthority['authorizeIn']
  >(async () => ({ kind: 'authorized' }))
  const verifyResult = vi.fn<
    import('@omne-harness-lite/tool-execution-runtime').ToolResultCustodySource['verifyIn']
  >(async (_unit, original, value) => ({
    verified: { original, terminal: value, references: [] },
  }))
  const f = await fixture(undefined, 32, storage => ({
    toolIssue: { maxRecords: 8, current: { authorizeIn: current } },
    ...(terminal
      ? {
          toolDelivery: { readConclusions: readPassConclusions },
          toolResults: {
            maxRecords: 8,
            source: {
              verifyIn: async (...args) => {
                args[0].assertStorage(storage)
                return verifyResult(...args)
              },
            },
          },
        }
      : {}),
  }))
  const p = await preparedAttempt(f)
  const prepared = await f.runtime.lifecycle.commitStep(
    f.runtime.coordinationAuthority,
    p.scope,
    p.attempt.source,
    p.step,
  )
  if (!('kind' in prepared) || prepared.kind !== 'committed')
    throw new Error('actual Tool preparation unavailable')
  const support = await f.runtime.toolInvocation.support(f.runtime.coordinationAuthority)
  if ('unavailable' in support) throw new Error('actual Tool support unavailable')
  const identityBase: import('@omne-harness-lite/tool-execution-runtime').ToolOriginalIssueIdentity =
    {
      ref: { ...p.scope, callId: unwrap(parseOpaqueIdentifier(p.step.call, 'CallId')) },
      origin: {
        run: p.step.run,
        attempt: p.step.attempt,
        assistantMessage: 'controlled-tool-reply',
      },
      adoption: 'controlled-adoption',
      executionGeneration: 'controlled-native-generation',
      originalPosition: 'controlled-native-intended',
    }
  const native = prepareToolJournalEntry({
    origin: identityBase.origin,
    value: {
      kind: 'execution_intended',
      revision: 1,
      ref: identityBase.ref,
      origin: identityBase.origin,
      input: { format: 'controlled-tool/1', value: 'original-input' },
    },
  })
  if ('invalid' in native) throw new Error('invalid controlled native Tool intent')
  const definition = judgeDefinition({
    name: 'omne-fixture:after-observer',
    position: 'after_action',
    dimension: { scope: 'each' },
    power: 'observe',
    implementation: { kind: 'builtin', builtinName: 'controlled-after-observer' },
  })
  if ('rejected' in definition) throw new Error('invalid controlled after-action definition')
  const chain = copyJsonValue(
    conclusionMode ? [{ definition: definition.ok, power: 'observe' }] : [],
  )
  if ('failed' in chain) throw new Error('invalid controlled after-action chain')
  const conclusion = prepareRunnerConclusion({
    session: p.scope.session,
    tenant: p.scope.tenant,
    execution: {
      kind: 'withRun',
      run: identityBase.origin.run,
      attempt: conclusionMode === 'foreignAttempt' ? 2 : identityBase.origin.attempt,
    },
    anchor: 'controlled-delivery-pass',
    occurrence: { kind: 'final' },
    reminders: [],
    value: {
      position: 'after_action',
      dimension: { scope: 'each' },
      callId: identityBase.ref.callId,
      extension: definition.ok.name,
      power: 'observe',
      at,
      output: { kind: 'observed' },
    },
  })
  if ('invalidInput' in conclusion) throw new Error('invalid controlled after-action conclusion')
  const ended = prepareToolJournalEntry({
    origin: identityBase.origin,
    value: {
      kind: 'execution_ended',
      revision: 1,
      ref: identityBase.ref,
      terminal: { outcome: 'unavailable', reason: 'controlled-no-author-result' },
      account: {
        callId: identityBase.ref.callId,
        initiator: p.scope.tenant,
        externalEffect: 'unknown',
        cost: { total_usd: 0, items: [] },
        frames: 'unknown',
        wallClock: { startedAt: at, endedAt: at },
      },
      delivery: {
        pass: 'controlled-delivery-pass',
        selectedChain: chain.ok,
        result: {
          id: unwrap(parseOpaqueIdentifier('controlled-tool-result', 'BlockId')),
          kind: 'tool_result',
          callId: identityBase.ref.callId,
          outcome: 'unavailable',
          visibility: { toHuman: true, toModel: true },
          blocks: [],
        },
      },
    },
  })
  if ('invalid' in ended) throw new Error('invalid controlled Tool terminal')
  const identity = { ...identityBase, originalPosition: native.entry.dedupeKey! }
  const claim = Object.freeze(
    {},
  ) as import('@omne-harness-lite/tool-execution-runtime').ToolOriginalIssueClaim
  let failStage = false
  const participant: import('@omne-harness-lite/tool-execution-runtime').ToolOriginalIssueParticipant =
    {
      identity,
      expected: { ownerGeneration: 'controlled-backing-generation', tail: prepared.source.tail },
      stopped: Promise.resolve(),
      async stageOriginalIn(unit) {
        const source = await support.log.sourceIn(unit, support.access, p.scope)
        if ('failure' in source) throw new Error('source unavailable in shared unit')
        const prefix = await support.log.readPrefixIn(unit, support.access, source.source)
        if ('failure' in prefix) throw new Error('prefix unavailable in shared unit')
        if (prefix.entries.some(entry => entry.dedupeKey === identity.originalPosition))
          return { kind: 'alreadyIssued', identity }
        const request = checkAppendInput(
          p.scope.session,
          terminal
            ? [native.entry, ended.entry, ...(conclusionMode ? [conclusion.entry] : [])]
            : [native.entry],
          { kind: 'unfenced' },
          { kind: 'tailEquals', tail: source.source.tail },
        )
        if ('failure' in request) throw new Error('bad Tool fixture append')
        const result = await support.log.appendIn(unit, support.access, request.ok, source.source)
        if ('failure' in result) throw new Error('Tool fixture append failed')
        return failStage
          ? { kind: 'conflict' }
          : { kind: 'staged', identity, claim, positions: result.entries.map(e => e.position) }
      },
      async consumeOriginalIn(unit, candidate) {
        unit.assertStorage(f.storage)
        return candidate === claim ? { kind: 'staged', identity } : { kind: 'invalidInput' }
      },
    }
  return {
    f,
    p,
    prepared,
    support,
    identity,
    claim,
    participant,
    current,
    verifyResult,
    conclusionKey: conclusionMode ? conclusion.entry.dedupeKey! : undefined,
    failStage: () => {
      failStage = true
    },
  }
}

describe('Session original Tool shared transaction', () => {
  it('stages the Tool intent and Session proof together after actual preparation, then consumes the same claim', async () => {
    const t = await sessionToolFixture()
    expect(await t.support.admission.admitOriginal(t.participant)).toMatchObject({
      kind: 'issued',
      identity: t.identity,
      claim: t.claim,
    })
    expect(await t.f.count('sr_tool_issue')).toEqual({ n: 1 })
    const original = await t.f.log().readSince(t.p.scope.session, t.prepared.source.tail)
    if ('failure' in original) throw new Error('actual Tool log unavailable')
    expect(original.entries.map(e => e.dedupeKey)).toEqual([t.identity.originalPosition])
    expect(await t.support.admission.consumeOriginal(t.claim)).toEqual({
      kind: 'launch',
      identity: t.identity,
    })
    expect(await t.support.admission.consumeOriginal(Object.freeze({}) as typeof t.claim)).toEqual({
      kind: 'invalidInput',
    })
  })
  it('rolls back the native staged fact when original participation rejects', async () => {
    const t = await sessionToolFixture()
    t.failStage()
    expect(await t.support.admission.admitOriginal(t.participant)).toEqual({ kind: 'conflict' })
    expect(await t.f.count('sr_tool_issue')).toEqual({ n: 0 })
    expect(await t.f.log().readSince(t.p.scope.session, t.prepared.source.tail)).toHaveProperty(
      'entries.length',
      0,
    )
  })
  it('rechecks current Tool qualification before consumption', async () => {
    const t = await sessionToolFixture()
    expect(await t.support.admission.admitOriginal(t.participant)).toHaveProperty('kind', 'issued')
    t.current.mockResolvedValue({ kind: 'denied' })
    expect(await t.support.admission.consumeOriginal(t.claim)).toEqual({ kind: 'denied' })
    expect(await t.f.count('sr_tool_issue')).toEqual({ n: 1 })
  })
  it('refuses a foreign original identity without staging its fact', async () => {
    const t = await sessionToolFixture()
    expect(
      await t.support.admission.admitOriginal({
        ...t.participant,
        identity: {
          ...t.identity,
          ref: {
            ...t.identity.ref,
            tenant: unwrap(parseTenantId({ organization: 'other', account: 'owner' })),
          },
        },
      }),
    ).toEqual({ kind: 'denied' })
    expect(await t.f.count('sr_tool_issue')).toEqual({ n: 0 })
  })
})

it('recognizes the original Tool Session proof after its real commit return is lost', async () => {
  const t = await sessionToolFixture()
  const atomic = t.f.storage.atomic.bind(t.f.storage)
  const fault = vi.spyOn(t.f.storage, 'atomic').mockImplementationOnce(async action => {
    await atomic(action)
    throw new StorageUnavailable('controlled original Tool commit return lost')
  })
  expect(await t.support.admission.admitOriginal(t.participant)).toEqual({
    kind: 'unknownCommit',
    identity: t.identity,
  })
  fault.mockRestore()
  expect(await t.f.count('sr_tool_issue')).toEqual({ n: 1 })
  expect(await t.support.admission.admitOriginal(t.participant)).toEqual({
    kind: 'alreadyIssued',
    identity: t.identity,
  })
  expect(await t.support.admission.consumeOriginal(t.claim)).toEqual({
    kind: 'launch',
    identity: t.identity,
  })
})

it('retains read-only original Tool proof after Run completion and denies old permit consumption', async () => {
  const t = await sessionToolFixture()
  expect(await t.support.admission.admitOriginal(t.participant)).toHaveProperty('kind', 'issued')
  const read = await t.f.runtime.journal.readPrefix(t.f.runtime.access, t.p.scope.session)
  if (!('kind' in read) || read.kind !== 'prefix') throw new Error('actual prefix unavailable')
  expect(
    await t.f.runtime.lifecycle.commitStep(
      t.f.runtime.coordinationAuthority,
      t.p.scope,
      read.source,
      {
        kind: 'finish',
        stepKey: 'finish-tool-original',
        run: t.p.step.run,
        attempt: t.p.step.attempt,
        permit: t.p.step.permit,
        terminal: 'completed',
        reason: 'controlled-settled-source',
      },
    ),
  ).toHaveProperty('kind', 'committed')
  expect(await t.support.admission.consumeOriginal(t.claim)).toEqual({ kind: 'staleAttempt' })
  await t.f.runtime.close()
  expect(
    await t.f.storage.atomic(unit => t.support.log.sourceIn(unit, t.support.access, t.p.scope)),
  ).toHaveProperty('kind', 'source')
  expect(await t.f.runtime.toolInvocation.support(t.f.runtime.coordinationAuthority)).toEqual({
    unavailable: true,
  })
})

it('reports unavailable before Tool staging without claiming an unknown commit', async () => {
  const t = await sessionToolFixture()
  const fault = vi
    .spyOn(t.f.storage, 'atomic')
    .mockRejectedValueOnce(new StorageUnavailable('before original Tool transaction'))
  expect(await t.support.admission.admitOriginal(t.participant)).toEqual({ kind: 'unavailable' })
  fault.mockRestore()
  expect(await t.f.count('sr_tool_issue')).toEqual({ n: 0 })
})

it('rejects a staged Tool position that does not reach the actual shared-unit tail', async () => {
  const t = await sessionToolFixture()
  const participant = {
    ...t.participant,
    async stageOriginalIn(unit: Parameters<typeof t.participant.stageOriginalIn>[0]) {
      const staged = await t.participant.stageOriginalIn(unit)
      return staged.kind === 'staged' ? { ...staged, positions: [] } : staged
    },
  }
  await expect(t.support.admission.admitOriginal(participant)).rejects.toThrow(
    'Tool issue positions do not end at the staged source',
  )
  expect(await t.f.count('sr_tool_issue')).toEqual({ n: 0 })
  expect(await t.f.log().readSince(t.p.scope.session, t.prepared.source.tail)).toHaveProperty(
    'entries.length',
    0,
  )
})

it('rejects a Session preparation presented as the original Tool intent', async () => {
  const t = await sessionToolFixture()
  const identity = { ...t.identity, originalPosition: t.p.step.originalPosition }
  const participant = {
    ...t.participant,
    identity,
    async stageOriginalIn(unit: Parameters<typeof t.participant.stageOriginalIn>[0]) {
      const staged = await t.participant.stageOriginalIn(unit)
      return staged.kind === 'staged' ? { ...staged, identity } : staged
    },
  }
  await expect(t.support.admission.admitOriginal(participant)).rejects.toThrow(
    'Tool issue lacks original intent',
  )
  expect(await t.f.count('sr_tool_issue')).toEqual({ n: 0 })
  expect(await t.f.log().readSince(t.p.scope.session, t.prepared.source.tail)).toHaveProperty(
    'entries.length',
    0,
  )
})

describe('Session Tool result custody', () => {
  it('rejects a copied authority before reading the original Tool result', async () => {
    const f = await fixture()
    expect(
      await f.runtime.toolResults.read(
        Object.freeze({}) as typeof f.runtime.coordinationAuthority,
        { tenant, session: unwrap(parseOpaqueIdentifier('unknown', 'SessionRef')) },
        'tool-call',
        'tool-result',
      ),
    ).toEqual({ failure: 'denied' })
  })
  it('does not claim custody without an explicit original Tool result source', async () => {
    const f = await fixture()
    expect(
      await f.runtime.toolResults.read(
        f.runtime.coordinationAuthority,
        { tenant, session: unwrap(parseOpaqueIdentifier('unknown', 'SessionRef')) },
        'tool-call',
        'tool-result',
      ),
    ).toEqual({ failure: 'unavailable' })
  })
})

async function toolCustodyFixture(conclusionMode?: 'observed' | 'foreignAttempt') {
  const t = await sessionToolFixture(true, conclusionMode)
  expect(await t.support.admission.admitOriginal(t.participant)).toHaveProperty('kind', 'issued')
  const prefix = await t.f.runtime.journal.readPrefix(t.f.runtime.access, t.p.scope.session)
  if (!('kind' in prefix) || prefix.kind !== 'prefix')
    throw new Error('missing original Tool prefix')
  const projected = projectToolJournal(t.p.scope, prefix.entries)
  if ('invalid' in projected) throw new Error('invalid original Tool history')
  const terminal = projected.executions.get(t.identity.ref.callId)?.terminal
  if (!terminal) throw new Error('missing original Tool terminal')
  return {
    ...t,
    input: {
      resultKey: 'original-tool-result',
      source: prefix.source,
      original: t.identity,
      terminal,
    },
  }
}

it('stores and recognizes the original Tool terminal once without rereading its source', async () => {
  const t = await toolCustodyFixture()
  const saved = await t.f.runtime.toolResults.store(
    t.f.runtime.coordinationAuthority,
    t.p.scope,
    t.input,
  )
  expect(saved).toHaveProperty('kind', 'custodied')
  if (!('witness' in saved)) throw new Error('missing original Tool custody')
  t.verifyResult.mockRejectedValue(new Error('released original Tool source must not be reused'))
  const read = await t.f.runtime.toolResults.read(
    t.f.runtime.coordinationAuthority,
    t.p.scope,
    t.identity.ref.callId,
    t.input.resultKey,
  )
  expect(read).toEqual({ ...saved, kind: 'alreadyCustodied' })
  expect(
    await t.f.runtime.toolResults.store(t.f.runtime.coordinationAuthority, t.p.scope, t.input),
  ).toEqual(read)
  expect(t.verifyResult).toHaveBeenCalledTimes(1)
  expect(await t.f.count('sr_tool_result')).toEqual({ n: 1 })
  expect(
    await t.f.runtime.toolResults.store(t.f.runtime.coordinationAuthority, t.p.scope, {
      ...t.input,
      resultKey: 'other-result',
    }),
  ).toEqual({ failure: 'identityConflict' })
})

it('retains Tool custody when the actual commit reply is lost', async () => {
  const t = await toolCustodyFixture()
  const atomic = t.f.storage.atomic.bind(t.f.storage)
  const fault = vi.spyOn(t.f.storage, 'atomic').mockImplementationOnce(async action => {
    await atomic(action)
    throw new StorageUnavailable('Tool custody commit reply lost')
  })
  expect(
    await t.f.runtime.toolResults.store(t.f.runtime.coordinationAuthority, t.p.scope, t.input),
  ).toEqual({
    kind: 'unknownCommit',
    scope: t.p.scope,
    call: t.identity.ref.callId,
    resultKey: t.input.resultKey,
  })
  fault.mockRestore()
  expect(
    await t.f.runtime.toolResults.read(
      t.f.runtime.coordinationAuthority,
      t.p.scope,
      t.identity.ref.callId,
      t.input.resultKey,
    ),
  ).toHaveProperty('kind', 'alreadyCustodied')
  expect(t.verifyResult).toHaveBeenCalledTimes(1)
  expect(await t.f.count('sr_tool_result')).toEqual({ n: 1 })
})

it('does not save Tool custody when the actual source is unavailable', async () => {
  const t = await toolCustodyFixture()
  t.verifyResult.mockResolvedValue({ failure: 'unavailable' })
  expect(
    await t.f.runtime.toolResults.store(t.f.runtime.coordinationAuthority, t.p.scope, t.input),
  ).toEqual({ failure: 'unavailable' })
  expect(await t.f.count('sr_tool_result')).toEqual({ n: 0 })
})

it('rejects Tool custody when the original terminal has been changed', async () => {
  const t = await toolCustodyFixture()
  expect(
    await t.f.runtime.toolResults.store(t.f.runtime.coordinationAuthority, t.p.scope, {
      ...t.input,
      terminal: { ...t.input.terminal, key: 'substituted-terminal' },
    }),
  ).toEqual({ failure: 'invalidSource' })
  expect(t.verifyResult).not.toHaveBeenCalled()
})

it('custodies an original Tool terminal after its Run has ended without a new permit', async () => {
  const t = await toolCustodyFixture()
  expect(
    await t.f.runtime.lifecycle.commitStep(
      t.f.runtime.coordinationAuthority,
      t.p.scope,
      t.input.source,
      {
        kind: 'finish',
        stepKey: 'finish-before-tool-custody',
        run: t.p.step.run,
        attempt: t.p.step.attempt,
        permit: t.p.step.permit,
        terminal: 'completed',
        reason: 'controlled-settled-source',
      },
    ),
  ).toHaveProperty('kind', 'committed')
  t.f.setDecision('rejected')
  expect(
    await t.f.runtime.toolResults.store(t.f.runtime.coordinationAuthority, t.p.scope, t.input),
  ).toHaveProperty('kind', 'custodied')
  expect(t.verifyResult).toHaveBeenCalledTimes(1)
})

it('reports a defect when a stored Tool custody loses its original issue proof', async () => {
  const t = await toolCustodyFixture()
  expect(
    await t.f.runtime.toolResults.store(t.f.runtime.coordinationAuthority, t.p.scope, t.input),
  ).toHaveProperty('kind', 'custodied')
  await t.f.storage.atomic(unit =>
    unit.mutate(tx =>
      narrow<{ sr_tool_issue: { session: string } }>(tx)
        .deleteFrom('sr_tool_issue')
        .where('session', '=', t.p.scope.session)
        .execute(),
    ),
  )
  await expect(
    t.f.runtime.toolResults.read(
      t.f.runtime.coordinationAuthority,
      t.p.scope,
      t.identity.ref.callId,
      t.input.resultKey,
    ),
  ).rejects.toThrow('stored Tool custody lost original proof')
})

describe('ordinary Tool delivery', () => {
  it('requires the original coordination authority', async () => {
    const f = await fixture()
    await expect(
      f.runtime.toolDelivery.confirm(
        Object.freeze({}) as typeof f.runtime.coordinationAuthority,
        { tenant, session: unwrap(parseOpaqueIdentifier('unknown', 'SessionRef')) },
        {} as import('../src/tool-result-types.ts').ToolDeliveryInput,
      ),
    ).resolves.toEqual({ failure: 'denied' })
  })
  it('requires an explicit original conclusion interpreter', async () => {
    const f = await fixture()
    await expect(
      f.runtime.toolDelivery.confirm(
        f.runtime.coordinationAuthority,
        { tenant, session: unwrap(parseOpaqueIdentifier('unknown', 'SessionRef')) },
        {} as import('../src/tool-result-types.ts').ToolDeliveryInput,
      ),
    ).resolves.toEqual({ failure: 'unavailable' })
  })
})

async function toolDeliveryFixture(conclusionMode?: 'observed' | 'foreignAttempt') {
  const t = await toolCustodyFixture(conclusionMode)
  const saved = await t.f.runtime.toolResults.store(
    t.f.runtime.coordinationAuthority,
    t.p.scope,
    t.input,
  )
  if (!('witness' in saved)) throw new Error('actual Tool custody unavailable')
  const prefix = await t.f.runtime.journal.readPrefix(t.f.runtime.access, t.p.scope.session)
  if (!('kind' in prefix) || prefix.kind !== 'prefix')
    throw new Error('actual Tool source unavailable')
  const message = judgeMessage({
    id: 'ordinary-tool-message',
    type: 'tool',
    callId: t.identity.ref.callId,
    createdAt: at,
    blocks: [t.input.terminal.value.delivery.result],
  })
  if ('rejected' in message || message.ok.type !== 'tool')
    throw new Error('invalid Tool message fixture')
  return {
    ...t,
    delivery: {
      witness: saved.witness,
      source: prefix.source,
      permit: t.p.step.permit,
      result: message.ok.blocks[0],
      message: message.ok,
      conclusions: t.conclusionKey ? [t.conclusionKey] : [],
    },
  }
}

it('commits ordinary Tool ready, message, confirmation and adoption in one actual unit', async () => {
  const t = await toolDeliveryFixture()
  const result = await t.f.runtime.toolDelivery.confirm(
    t.f.runtime.coordinationAuthority,
    t.p.scope,
    t.delivery,
  )
  expect(result).toHaveProperty('kind', 'confirmed')
  if (!('source' in result)) throw new Error('actual Tool delivery missing')
  const prefix = await t.f.runtime.journal.readPrefix(t.f.runtime.access, t.p.scope.session)
  if (!('kind' in prefix) || prefix.kind !== 'prefix') throw new Error('missing delivered prefix')
  expect(
    prefix.entries.filter(entry => compareInteger(entry.position, t.delivery.source.tail) > 0),
  ).toHaveLength(4)
  const projected = projectToolJournal(t.p.scope, prefix.entries)
  if ('invalid' in projected) throw new Error('invalid delivered Tool history')
  expect(projected.executions.get(t.identity.ref.callId)?.confirmed?.value.message).toEqual(
    t.delivery.message,
  )
  expect(
    prefix.entries.find(entry => compareInteger(entry.position, result.messagePosition) === 0)
      ?.payload,
  ).toMatchObject({
    kind: 'message',
    owner: 'messages',
    value: t.delivery.message,
  })
  expect(await t.f.count('sr_tool_delivery')).toEqual({ n: 1 })
  expect(
    await t.f.runtime.toolDelivery.confirm(
      t.f.runtime.coordinationAuthority,
      t.p.scope,
      t.delivery,
    ),
  ).toEqual({ ...result, kind: 'alreadyConfirmed' })
  expect(await t.f.count('sr_tool_delivery')).toEqual({ n: 1 })
})

it('rolls back the complete ordinary Tool delivery batch on actual transaction failure', async () => {
  const t = await toolDeliveryFixture()
  const atomic = t.f.storage.atomic.bind(t.f.storage)
  const fault = vi.spyOn(t.f.storage, 'atomic').mockImplementationOnce(action =>
    atomic(async unit => {
      await action(unit)
      throw new StorageUnavailable('controlled Tool delivery rollback')
    }),
  )
  expect(
    await t.f.runtime.toolDelivery.confirm(
      t.f.runtime.coordinationAuthority,
      t.p.scope,
      t.delivery,
    ),
  ).toHaveProperty('kind', 'unknownCommit')
  fault.mockRestore()
  expect(await t.f.count('sr_tool_delivery')).toEqual({ n: 0 })
  expect(await t.f.log().readSince(t.p.scope.session, t.delivery.source.tail)).toHaveProperty(
    'entries.length',
    0,
  )
})

it('recognizes ordinary Tool delivery after the actual commit reply is lost', async () => {
  const t = await toolDeliveryFixture()
  const atomic = t.f.storage.atomic.bind(t.f.storage)
  const fault = vi.spyOn(t.f.storage, 'atomic').mockImplementationOnce(async action => {
    await atomic(action)
    throw new StorageUnavailable('controlled Tool delivery reply loss')
  })
  expect(
    await t.f.runtime.toolDelivery.confirm(
      t.f.runtime.coordinationAuthority,
      t.p.scope,
      t.delivery,
    ),
  ).toEqual({
    kind: 'unknownCommit',
    scope: t.p.scope,
    call: t.identity.ref.callId,
    resultKey: t.delivery.witness.receipt.resultKey,
  })
  fault.mockRestore()
  expect(
    await t.f.runtime.toolDelivery.confirm(
      t.f.runtime.coordinationAuthority,
      t.p.scope,
      t.delivery,
    ),
  ).toHaveProperty('kind', 'alreadyConfirmed')
  expect(await t.f.count('sr_tool_delivery')).toEqual({ n: 1 })
  expect(await t.f.log().readSince(t.p.scope.session, t.delivery.source.tail)).toHaveProperty(
    'entries.length',
    4,
  )
})

it('denies ordinary Tool delivery with a copied permit and retains original custody', async () => {
  const t = await toolDeliveryFixture()
  expect(
    await t.f.runtime.toolDelivery.confirm(t.f.runtime.coordinationAuthority, t.p.scope, {
      ...t.delivery,
      permit: Object.freeze({}) as typeof t.delivery.permit,
    }),
  ).toEqual({ failure: 'staleAttempt' })
  expect(await t.f.count('sr_tool_delivery')).toEqual({ n: 0 })
  expect(await t.f.count('sr_tool_result')).toEqual({ n: 1 })
})

it('rejects caller-declared Tool conclusion keys absent from the original pass', async () => {
  const t = await toolDeliveryFixture()
  expect(
    await t.f.runtime.toolDelivery.confirm(t.f.runtime.coordinationAuthority, t.p.scope, {
      ...t.delivery,
      conclusions: ['made-up-conclusion'],
    }),
  ).toEqual({ failure: 'invalidSource' })
  expect(await t.f.count('sr_tool_delivery')).toEqual({ n: 0 })
})

it('does not change a confirmed ordinary Tool projection under the same original result', async () => {
  const t = await toolDeliveryFixture()
  expect(
    await t.f.runtime.toolDelivery.confirm(
      t.f.runtime.coordinationAuthority,
      t.p.scope,
      t.delivery,
    ),
  ).toHaveProperty('kind', 'confirmed')
  expect(
    await t.f.runtime.toolDelivery.confirm(t.f.runtime.coordinationAuthority, t.p.scope, {
      ...t.delivery,
      message: {
        ...t.delivery.message,
        id: unwrap(parseOpaqueIdentifier('other-tool-message', 'MessageId')),
      },
    }),
  ).toEqual({ failure: 'identityConflict' })
  expect(await t.f.count('sr_tool_delivery')).toEqual({ n: 1 })
})

it('rejects an incomplete stored ordinary Tool delivery proof', async () => {
  const t = await toolDeliveryFixture()
  expect(
    await t.f.runtime.toolDelivery.confirm(
      t.f.runtime.coordinationAuthority,
      t.p.scope,
      t.delivery,
    ),
  ).toHaveProperty('kind', 'confirmed')
  await t.f.storage.atomic(unit =>
    unit.mutate(async tx => {
      const db = narrow<{ sr_tool_delivery: { session: string; record: string } }>(tx)
      const row = await db
        .selectFrom('sr_tool_delivery')
        .selectAll()
        .where('session', '=', t.p.scope.session)
        .executeTakeFirstOrThrow()
      const record = JSON.parse(row.record)
      record.batch.pop()
      await db
        .updateTable('sr_tool_delivery')
        .set({ record: JSON.stringify(record) })
        .where('session', '=', t.p.scope.session)
        .execute()
    }),
  )
  await expect(
    t.f.runtime.toolDelivery.confirm(t.f.runtime.coordinationAuthority, t.p.scope, t.delivery),
  ).rejects.toThrow('Tool delivery batch is incomplete')
})

it('uses the actual nonempty after-action conclusion history for ordinary Tool delivery', async () => {
  const t = await toolDeliveryFixture('observed')
  expect(t.delivery.conclusions).toEqual([t.conclusionKey])
  expect(
    await t.f.runtime.toolDelivery.confirm(
      t.f.runtime.coordinationAuthority,
      t.p.scope,
      t.delivery,
    ),
  ).toHaveProperty('kind', 'confirmed')
})

it('does not use another attempt conclusion for ordinary Tool delivery', async () => {
  const t = await toolDeliveryFixture('foreignAttempt')
  expect(
    await t.f.runtime.toolDelivery.confirm(
      t.f.runtime.coordinationAuthority,
      t.p.scope,
      t.delivery,
    ),
  ).toEqual({ failure: 'invalidSource' })
  expect(await t.f.count('sr_tool_delivery')).toEqual({ n: 0 })
})

it('rejects new ordinary Tool delivery after the original Run ends', async () => {
  const t = await toolDeliveryFixture()
  expect(
    await t.f.runtime.lifecycle.commitStep(
      t.f.runtime.coordinationAuthority,
      t.p.scope,
      t.delivery.source,
      {
        kind: 'finish',
        stepKey: 'finish-before-tool-delivery',
        run: t.p.step.run,
        attempt: t.p.step.attempt,
        permit: t.p.step.permit,
        terminal: 'completed',
        reason: 'controlled-settled-source',
      },
    ),
  ).toHaveProperty('kind', 'committed')
  expect(
    await t.f.runtime.toolDelivery.confirm(
      t.f.runtime.coordinationAuthority,
      t.p.scope,
      t.delivery,
    ),
  ).toEqual({ failure: 'staleAttempt' })
  expect(await t.f.count('sr_tool_delivery')).toEqual({ n: 0 })
  expect(await t.f.count('sr_tool_result')).toEqual({ n: 1 })
})

it('recognizes a completed ordinary Tool batch after Run termination without granting new delivery', async () => {
  const t = await toolDeliveryFixture()
  const confirmed = await t.f.runtime.toolDelivery.confirm(
    t.f.runtime.coordinationAuthority,
    t.p.scope,
    t.delivery,
  )
  if (!('source' in confirmed)) throw new Error('actual Tool delivery unavailable')
  expect(
    await t.f.runtime.lifecycle.commitStep(
      t.f.runtime.coordinationAuthority,
      t.p.scope,
      confirmed.source,
      {
        kind: 'finish',
        stepKey: 'finish-after-tool-delivery',
        run: t.p.step.run,
        attempt: t.p.step.attempt,
        permit: t.p.step.permit,
        terminal: 'completed',
        reason: 'controlled-settled-source',
      },
    ),
  ).toHaveProperty('kind', 'committed')
  expect(
    await t.f.runtime.toolDelivery.confirm(
      t.f.runtime.coordinationAuthority,
      t.p.scope,
      t.delivery,
    ),
  ).toEqual({ ...confirmed, kind: 'alreadyConfirmed' })
  expect(await t.f.count('sr_tool_delivery')).toEqual({ n: 1 })
})

it('does not claim unknown ordinary Tool delivery before entering the original transaction', async () => {
  const t = await toolDeliveryFixture()
  const fault = vi
    .spyOn(t.f.storage, 'atomic')
    .mockRejectedValueOnce(new StorageUnavailable('before Tool delivery transaction'))
  expect(
    await t.f.runtime.toolDelivery.confirm(
      t.f.runtime.coordinationAuthority,
      t.p.scope,
      t.delivery,
    ),
  ).toEqual({ failure: 'unavailable' })
  fault.mockRestore()
  expect(await t.f.count('sr_tool_delivery')).toEqual({ n: 0 })
})

import {
  createOriginalIssueToolRuntime,
  createToolImplementationRegistry,
  createToolInvoker,
  createToolOriginalIssueVerifier,
  toolOriginalIssueMigrations,
} from '@omne-harness-lite/tool-execution-local'
import {
  openToolResultStorage,
  openToolResultCustodySource,
} from '@omne-harness-lite/tool-result-files'
import {
  createParameterJudge,
  isToolReturn,
  toolResultOf,
  type ToolDefinition,
} from '@omne-harness-lite/tool-definition'
import {
  createAssemblyManifestStore,
  assemblyManifestMigrations,
} from '@omne-harness-lite/assembly-manifest-store'
import { createRunnerTaskOwner } from '@omne-harness-lite/loop-extension-runner-local'
import type {
  ToolRuntimeOriginalIssueDependencies,
  ExecutionSubmission,
  ToolOriginalIssueParticipant,
} from '@omne-harness-lite/tool-execution-runtime'

it('composes the public native Tool factory with Session original issue, actual immutable files and ordinary delivery', async () => {
  let actualSource: Awaited<ReturnType<typeof openToolResultCustodySource>> | undefined
  const qualified = vi.fn(async () => ({ kind: 'authorized' as const }))
  const f = await fixture(undefined, 32, () => ({
    toolIssue: { maxRecords: 8, current: { authorizeIn: qualified } },
    toolResults: {
      maxRecords: 8,
      source: {
        verifyIn: (...args) => {
          if (!actualSource) throw new Error('actual file source is not ready')
          return actualSource.source.verifyIn(...args)
        },
      },
    },
    toolDelivery: { readConclusions: readPassConclusions },
  }))
  const p = await preparedAttempt(f)
  const prepared = await f.runtime.lifecycle.commitStep(
    f.runtime.coordinationAuthority,
    p.scope,
    p.attempt.source,
    p.step,
  )
  if (!('kind' in prepared) || prepared.kind !== 'committed')
    throw new Error('actual preparation failed')
  for (const migration of [...toolOriginalIssueMigrations, ...assemblyManifestMigrations])
    await f.storage.write(tx => migration.migration.up(tx.db))
  const support = await f.runtime.toolInvocation.support(f.runtime.coordinationAuthority)
  if ('unavailable' in support) throw new Error('actual support unavailable')
  const callId = unwrap(parseOpaqueIdentifier(p.step.call, 'CallId'))
  const origin = {
    run: p.step.run,
    attempt: p.step.attempt,
    assistantMessage: 'actual-native-tool-reply',
  }
  const access = Object.freeze({}) as import('@omne-harness-lite/session-tenancy').SessionAccess
  const recovery = Object.freeze({}) as ToolRuntimeOriginalIssueDependencies['recovery']
  const definition: ToolDefinition = {
    name: 'fixture-echo',
    description: 'Echo the exact input.',
    paradigm: 'single',
    origin: { kind: 'authored' },
    input: {
      type: 'object',
      description: 'Echo input.',
      properties: { value: { type: 'string', description: 'Value.' } },
      required: ['value'],
    },
    permissions: { execute: { default: 'auto' } },
  }
  const request: ExecutionSubmission = {
    scope: p.scope,
    access,
    origin,
    adoption: 'native-adopted',
    admissionToken: 'controlled-root-token' as NonNullable<ExecutionSubmission['admissionToken']>,
    call: {
      id: unwrap(parseOpaqueIdentifier('native-call-block', 'BlockId')),
      kind: 'tool_call',
      complete: true,
      visibility: { toHuman: true, toModel: true },
      callId,
      tool: definition.name,
      arguments: { value: 'exact native reply' },
    },
  }
  const prefix = async () => {
    const current = await f.runtime.journal.readPrefix(f.runtime.access, p.scope.session)
    if (!('kind' in current) || current.kind !== 'prefix')
      throw new Error('actual prefix unavailable')
    return current
  }
  const generation = f.log().backing.ownerGeneration
  const backing = f.log().backing
  const history: ToolRuntimeOriginalIssueDependencies['history'] = {
    inspect(checked, id) {
      const tools = projectToolJournal(p.scope, checked.entries)
      if ('invalid' in tools) return { kind: 'unavailable' }
      const tool = tools.executions.get(id)
      return {
        kind: 'known',
        facts: {
          origin,
          latestAttempt: origin.attempt,
          runState: 'open',
          calls: [request.call],
          route: tool
            ? { kind: 'execution', intentKey: tool.intent.entry.dedupeKey! }
            : { kind: 'none' },
          adoption: {
            key: request.adoption,
            tools: [
              {
                name: definition.name,
                capability: 'tool:fixture-echo',
                asset: 'native-echo',
                version: '1',
                definition,
              },
            ],
            report: {
              session: p.scope.session,
              runId: origin.run,
              attempt: origin.attempt,
              computedAt: unwrap(instantFromRfc3339(at)),
              snapshots: [],
              availability: [],
              mcpActions: [],
              endpointHoldings: [],
              effectivePermissions: {},
              skillGate: [],
            },
          },
          batch: {
            kind: 'complete',
            completion: {
              key: 'controlled-native-batch',
              gate: { kind: 'available' },
              items: [
                {
                  callId,
                  effectiveCall: request.call,
                  conclusions: ['controlled-native-allow'],
                  decision: { kind: 'allow', conclusion: 'controlled-native-allow' },
                },
              ],
            },
          },
        },
      }
    },
  }
  const authorization: ToolRuntimeOriginalIssueDependencies['authorization'] = {
    async authorize(candidate, scope) {
      if (candidate !== access || writeJsonLossless(scope) !== writeJsonLossless(p.scope))
        return { kind: 'rejected', reason: 'notAuthorized' }
      return {
        kind: 'authorized',
        identity: {
          binding: 'controlled-root-tool',
          principal: 'owner',
          principalKind: 'human',
          scope,
          consumer: 'tool',
          contextKeys: [],
        },
      }
    },
  }
  const manifest = createAssemblyManifestStore(f.storage)
  const filled = await manifest.append(p.scope.session, 0, {
    evaluation: { kind: 'given', ref: 'native-empty-loop-evaluation' },
    tables: { loop_extension: { filledAt: unwrap(instantFromRfc3339(at)), composition: [] } },
    content: {
      evaluation: {
        root: input.definition,
        assets: [
          {
            capability: input.definition,
            asset: 'controlled-native-root',
            version: 1,
            from: 'factory',
            replaced: [],
          },
        ],
        composition: [],
        values: [],
        filteredOut: [],
        unresolved: [],
      },
      compositionOrder: [],
      filledBy: { kind: 'assembly' },
    },
  })
  if ('failure' in filled) throw new Error('actual manifest fill failed: ' + JSON.stringify(filled))
  const binding = { session: p.scope.session, tenant, logGeneration: generation }
  const chainSources = {
    sessionTenancy: f.runtime.tenancy,
    manifest,
    history: { read: async () => ({ failure: 'unavailable' as const, stage: 'source' as const }) },
    isActive: () => true,
  }
  expect(
    await readRunnerChain({ session: p.scope.session, binding, sources: chainSources }),
  ).toEqual([])
  const files = await openToolResultStorage(
    { directory: join(f.root, 'native-results'), storage: 'native-results' },
    {
      authorization,
      backing,
      history,
      recoveryAuthority: {
        authorizeRecovery: async candidate =>
          candidate === recovery ? 'authorized' : 'notAuthorized',
      },
    },
  )
  const taskOwner = createRunnerTaskOwner(binding)
  const implementation = vi.fn<import('@omne-harness-lite/tool-execution-runtime').ToolExecutor>(
    async args => {
      if (
        args === null ||
        typeof args !== 'object' ||
        Array.isArray(args) ||
        !('value' in args) ||
        typeof args.value !== 'string'
      )
        throw new TypeError('Expected echo value')
      return args.value
    },
  )
  const registry = createToolImplementationRegistry()
  const withdraw = registry.register({
    capability: 'tool:fixture-echo',
    asset: 'native-echo',
    version: '1',
    definition,
    executor: implementation,
  })
  const issued: ToolOriginalIssueParticipant[] = []
  const admission: ReturnType<ToolRuntimeOriginalIssueDependencies['admission']> = {
    forPass: async () => ({ kind: 'rejected', reason: 'passUnavailable' }),
    verifyToken: async () => {
      const current = await prefix()
      return {
        kind: 'valid',
        checked: { scope: p.scope, ownerGeneration: generation, tail: current.source.tail },
      }
    },
  }
  const native = createOriginalIssueToolRuntime(
    {
      frameQueueBytes: 4096,
      tailRetry: { attempts: 2, minDelayMs: 0, maxDelayMs: 0 },
      resultStorage: 'native-results',
    },
    {
      backing,
      history,
      authorization,
      recovery,
      owner: {
        enumerate: async candidate =>
          candidate === recovery
            ? {
                kind: 'sessions',
                sessions: [{ scope: p.scope, locator: 'controlled-native-scope' }],
              }
            : { kind: 'rejected', reason: 'notAuthorized' },
        readPrefix: async () => {
          const current = await prefix()
          return {
            kind: 'prefix',
            prefix: {
              scope: p.scope,
              ownerGeneration: generation,
              entries: current.entries,
              tail: current.source.tail,
            },
          }
        },
        borrow: async () => ({ kind: 'rejected', reason: 'notAuthorized' }),
      },
      admission: () => admission,
      implementations: registry,
      context: {
        bind: async () => ({
          kind: 'bound',
          reader: {
            read: async () => ({ kind: 'values', values: [] }),
            snapshot: async () => ({ kind: 'rejected', reason: 'unavailable' }),
            changes: async () => ({ kind: 'rejected', reason: 'unavailable' }),
          },
        }),
      },
      environments: {
        recover: async () => [],
        recoverOwned: async () => ({ kind: 'recovered', values: [], failures: [] }),
        resolvePlacement: async () => ({ kind: 'notApplicable' }),
        acquire: async () => ({ kind: 'rejected', reason: 'unavailable' }),
      },
      results: files.operations,
      runnerHost: {
        acquireDispatch: async () => ({ failure: 'unavailable' }),
        acquireReplay: async () => ({
          binding,
          owner: taskOwner,
          isActive: () => true,
          release() {},
          sources: {
            sessionTenancy: f.runtime.tenancy,
            manifest,
            history: { read: async () => ({ failure: 'unavailable', stage: 'source' }) },
            isActive: () => true,
          },
        }),
      },
      invoke: createToolInvoker({
        parameters: createParameterJudge(),
        judgeResult: value =>
          isToolReturn(value)
            ? {
                kind: 'valid',
                result:
                  typeof value === 'string'
                    ? value
                    : toolResultOf(
                        value,
                        unwrap(parseOpaqueIdentifier('native-judged', 'BlockId')),
                      ),
              }
            : { kind: 'invalid' },
      }),
      clock: { now: async () => unwrap(instantFromRfc3339(at)) },
      originalIssue: {
        ...support,
        admission: {
          admitOriginal: async participant => {
            issued.push(participant)
            return support.admission.admitOriginal(participant)
          },
          consumeOriginal: support.admission.consumeOriginal,
        },
      },
    },
  )
  try {
    actualSource = await openToolResultCustodySource(
      { directory: join(f.root, 'native-results'), storage: 'native-results' },
      {
        storage: f.storage,
        log: support.log,
        access: support.access,
        original: createToolOriginalIssueVerifier(f.storage),
      },
    )
    await native.ready
    expect(await native.operations.submit(request)).toEqual({
      kind: 'recorded',
      execution: { ...p.scope, callId },
    })
    await native.idle()
    expect(implementation).toHaveBeenCalledTimes(1)
    expect(await native.operations.submit(request)).toEqual({
      kind: 'recorded',
      execution: { ...p.scope, callId },
    })
    await native.idle()
    expect(implementation).toHaveBeenCalledTimes(1)
    expect(await f.count('tool_original_issue')).toEqual({ n: 1 })
    expect(await f.count('sr_tool_issue')).toEqual({ n: 1 })
    expect(issued).toHaveLength(2)
    expect(issued[1]).toBe(issued[0])
    await issued[0]!.stopped
    const current = await prefix()
    const tools = projectToolJournal(p.scope, current.entries)
    if ('invalid' in tools) throw new Error('actual native history invalid')
    const terminal = tools.executions.get(callId)!.terminal!
    expect(terminal.value.terminal).toEqual({ outcome: 'completed', result: 'exact native reply' })
    expect(
      await f.storage.atomic(unit =>
        actualSource!.source.verifyIn(
          unit,
          { ...issued[0]!.identity, executionGeneration: 'copied-native-generation' },
          terminal,
        ),
      ),
    ).toEqual({ failure: 'invalidSource' })
    const custody = await f.runtime.toolResults.store(f.runtime.coordinationAuthority, p.scope, {
      original: issued[0]!.identity,
      source: current.source,
      terminal,
      resultKey: 'native-result',
    })
    expect(custody).toHaveProperty('kind', 'custodied')
    if (!('witness' in custody))
      throw new Error('actual native custody failed: ' + JSON.stringify(custody))
    expect(custody.result.stored!.result.content[0]).toHaveProperty('text', 'exact native reply')
    await native.close()
    await files.close()
    expect(
      await f.storage.atomic(unit =>
        actualSource!.source.verifyIn(unit, issued[0]!.identity, terminal),
      ),
    ).toHaveProperty('verified.stored.result.content.0.text', 'exact native reply')
    expect(
      await f.runtime.toolResults.read(
        f.runtime.coordinationAuthority,
        p.scope,
        callId,
        'native-result',
      ),
    ).toHaveProperty('kind', 'alreadyCustodied')
    const tail = await prefix()
    const projected = terminal.value.delivery.result
    const message = judgeMessage({
      id: 'native-tool-message',
      type: 'tool',
      callId,
      createdAt: at,
      blocks: [projected],
    })
    if ('rejected' in message || message.ok.type !== 'tool' || !p.attempt.permit)
      throw new Error('actual ToolMessage or permit rejected')
    const confirmed = await f.runtime.toolDelivery.confirm(
      f.runtime.coordinationAuthority,
      p.scope,
      {
        witness: custody.witness,
        source: tail.source,
        permit: p.attempt.permit,
        result: message.ok.blocks[0],
        conclusions: [],
        message: message.ok,
      },
    )
    expect(confirmed).toHaveProperty('kind', 'confirmed')
    expect(await native.operations.submit(request)).toEqual({
      kind: 'rejected',
      reason: 'ownerStopped',
    })
    expect(implementation).toHaveBeenCalledTimes(1)
  } finally {
    await native.close()
    await actualSource?.close()
    await files.close()
    await withdraw()
    taskOwner.closeAdmission()
    await taskOwner.drain()
    await manifest.close()
  }
})

describe('driver original model binding', () => {
  async function binding() {
    const m = await modelFixture()
    let available = true
    const launched = vi.fn()
    const retained = vi.fn(async () => {})
    const issue = bindDriverOriginal({
      options: { ingress: m.f.runtime, model: { original: m.owner } },
      prepared: { preparation: m.p.step },
      scope: m.p.scope,
      available: () => available,
      launched,
      retain: retained,
    })
    return {
      ...m,
      issue,
      launched,
      retained,
      withdraw: () => {
        available = false
      },
    }
  }
  it('commits through the actual Session Unit and consumes only its original claim once', async () => {
    const m = await binding()
    expect(await m.owner.admitOriginal(m.original)).toEqual({ kind: 'denied' })
    const admitted = await m.issue.admitOriginal(m.original)
    if (!('confirmed' in admitted)) throw new Error('actual driver admission missing')
    expect(await m.f.count('sr_model_issue')).toEqual({ n: 1 })
    expect(await m.issue.consumeOriginal({ ...admitted.claim })).toEqual({ kind: 'invalidInput' })
    expect(await m.issue.consumeOriginal(admitted.claim)).toEqual({ kind: 'launch' })
    expect(await m.issue.consumeOriginal(admitted.claim)).toEqual({ kind: 'unavailable' })
    expect(m.launched).toHaveBeenCalledOnce()
    expect(m.retained).not.toHaveBeenCalled()
    expect(await m.issue.admitOriginal(m.original)).toEqual({ kind: 'conflict' })
  })
  it('withdraws new admission and launch without closing the borrowed original owner', async () => {
    const m = await binding()
    const admitted = await m.issue.admitOriginal(m.original)
    if (!('confirmed' in admitted)) throw new Error('actual driver admission missing')
    m.withdraw()
    expect(await m.issue.consumeOriginal(admitted.claim)).toEqual({ kind: 'unavailable' })
    expect(await m.issue.admitOriginal(m.original)).toEqual({ kind: 'unavailable' })
    expect(m.launched).not.toHaveBeenCalled()
    expect(await m.owner.consumeOriginal(admitted.claim)).toEqual({ kind: 'launch' })
  })
  it('rechecks the real current model qualification before launch', async () => {
    const m = await binding()
    const admitted = await m.issue.admitOriginal(m.original)
    if (!('confirmed' in admitted)) throw new Error('actual driver admission missing')
    m.current.mockResolvedValueOnce({ kind: 'denied' })
    expect(await m.issue.consumeOriginal(admitted.claim)).toEqual({ kind: 'denied' })
    expect(m.launched).not.toHaveBeenCalled()
    expect(await m.f.count('sr_model_issue')).toEqual({ n: 1 })
  })
  it('retains an unknown original commit and never turns it into another launch', async () => {
    const m = await binding()
    const admit = m.f.runtime.modelInvocation.admit
    const issue = bindDriverOriginal({
      options: {
        model: { original: m.owner },
        ingress: {
          ...m.f.runtime,
          modelInvocation: {
            admit: async (...args) => {
              const committed = await admit(...args)
              if (!('kind' in committed) || committed.kind !== 'issued')
                throw new Error('actual original issue was not committed')
              return {
                kind: 'unknownCommit',
                scope: m.p.scope,
                call: m.p.step.call,
                originalPosition: m.p.step.originalPosition,
              }
            },
          },
        },
      },
      scope: m.p.scope,
      prepared: { preparation: m.p.step },
      available: () => true,
      launched: m.launched,
      retain: m.retained,
    })
    expect(await issue.admitOriginal(m.original)).toEqual({ kind: 'unavailable' })
    expect(m.retained).toHaveBeenCalledOnce()
    expect(m.retained.mock.calls[0]).toMatchObject([
      {
        stage: 'originalIssue',
        reason: {
          kind: 'unknownCommit',
          call: m.p.step.call,
          originalPosition: m.p.step.originalPosition,
        },
      },
    ])
    expect(m.launched).not.toHaveBeenCalled()
    expect(await m.f.count('sr_model_issue')).toEqual({ n: 1 })
  })
})

describe('driver original model turn construction', () => {
  async function construction() {
    const m = await modelFixture()
    const identities = driverIdentityFixture()
    const prepared = {
      kind: 'prepared' as const,
      preparation: m.p.step,
      identities: {
        ...identities.model(),
        call: unwrap(parseOpaqueIdentifier(m.p.step.call, 'ModelCallId')),
      },
      source: m.prepared.source,
    }
    const unused = async (): Promise<never> => {
      throw new Error('unexpected model execution')
    }
    const absent = (): never => {
      throw new Error('unexpected source consumer')
    }
    const operations: ModelRuntimeOperations = {
      acquireCall: unused,
      legalTargets: unused,
      displayList: unused,
      selectModel: unused,
      effectiveModel: vi.fn<ModelRuntimeOperations['effectiveModel']>(async () => ({
        effectiveModel: {
          routeName: 'controlled/model',
          selected: 'controlled/model',
          selectedBy: 'session',
          profile: { origin: 'official', routeName: 'controlled/model' },
        },
      })),
      openCall: unused,
      dispatch: unused,
      dispatchAgain: unused,
      interrupt: unused,
      releaseCall: unused,
      reconcile: unused,
      readAttempts: unused,
      settleReply: unused,
      canDispatchAgain: unused,
      acknowledgeCall: unused,
    }
    const instant = unwrap(instantFromRfc3339(at))
    const report = {
      session: m.p.scope.session,
      runId: m.p.step.run,
      attempt: m.p.step.attempt,
      computedAt: instant,
      snapshots: [],
      availability: [],
      mcpActions: [],
      endpointHoldings: [],
      effectivePermissions: {},
      skillGate: [],
    }
    const refresh = vi.fn(async () => ({ report }))
    const list = vi.fn(async () => ({ entries: [] }))
    const read = vi.fn(async () => ({ failure: 'unavailable' as const }))
    const sources: SessionDriverRunSources = {
      scope: m.p.scope,
      run: m.p.step.run,
      registry: { refreshAvailability: refresh, list },
      evaluation: { read },
      get context() {
        return absent()
      },
      contextGeneration: () => 'controlled-context',
      get toolAccess() {
        return absent()
      },
      get actions() {
        return absent()
      },
      providers: {
        tools: { lookup: unused },
        catalog: {
          readProfile: unused,
          listProfiles: unused,
          credentialPresent: unused,
        },
        credentials: { value: unused },
        sourceVersions: { fixture: 'controlled-source' },
      },
      selection: {
        owner: {
          name: 'controlled-selection',
          admission: () => 'open',
          opened: () => ({ confirmed: true }),
          unresolvedWrites: () => [],
          acquire: () => ({ unavailable: true }),
        },
        concurrent: 1,
        sessionTenancy: m.f.runtime.tenancy,
        catalog: { listProfiles: unused, credentialPresent: unused },
        projection: unused,
        compatible: () => ({ ok: true }),
        now: async () => at,
        diagnostic() {},
        onDiagnosticFailure() {},
      },
      host: {
        callPresence: { read: unused },
        history: { call: absent, calibration: absent, failure: absent, run: absent },
        recovery: { authorize: unused, enter: unused },
      },
      projection: {
        rules: {
          version: 'controlled-driver',
          external: null,
          system: [],
          pendingCardBlocks: null,
          lastModelRequestPrefixLength: null,
        },
      },
      release: vi.fn(async () => {}),
    }
    const release = vi.fn(async () => {})
    let host: ModelRuntimeHostInputs | undefined
    const results = createSessionModelResultSource({
      storage: m.f.storage,
      tenant,
      executionSource: () => undefined,
      maxCaptures: 4,
      retainReferencesIn: unused,
    })
    const acquire = vi.fn(async (inputs: ModelRuntimeHostInputs) => {
      host = inputs
      return { operations, release }
    })
    const options = {
      ingress: m.f.runtime,
      identities,
      model: {
        original: m.owner,
        factory: { acquire },
        results,
        executionSource: () => undefined,
        settlement: { create: absent },
        maxCallReads: 4,
      },
    }
    let open = true
    const retain = vi.fn(async () => {})
    const segment = createDriverModelSegment(
      options,
      m.p.scope,
      prepared,
      sources,
      () => open,
      retain,
    )
    return {
      segment,
      m,
      sources,
      prepared,
      options,
      acquire,
      refresh,
      list,
      read,
      release,
      retain,
      host: () => host,
      withdraw: () => {
        open = false
      },
      build: segment.build,
    }
  }
  it('builds its own original binding, actual coordinates, report and native input identities', async () => {
    const f = await construction()
    const built = await f.build()
    if ('failure' in built) throw new Error('actual driver binding missing')
    expect(f.refresh).toHaveBeenCalledWith(
      f.m.p.scope.session,
      { kind: 'start', runId: f.m.p.step.run },
      f.m.p.step.attempt,
    )
    expect(f.list).toHaveBeenCalledWith(f.m.p.scope.session, 'tool', {
      kind: 'run',
      report: built.turn.call.report,
    })
    expect(f.host()?.identities.call()).toBe(f.m.p.step.call)
    expect(
      await f.host()?.sessions.bind(unwrap(parseOpaqueIdentifier('foreign-session', 'SessionRef'))),
    ).toEqual({ failure: 'invalidInput' })
    const actual = await f.host()!.sessions.bind(f.m.p.scope.session)
    if (!('binding' in actual)) throw new Error('actual binding missing')
    expect(actual.binding).toBe(built.turn.linked.binding)
    expect(built.turn.preparation).toBe(f.m.p.step)
    expect(built.turn.resultKey).toBe(f.prepared.identities.resultKey)
    expect(built.turn.call).toMatchObject({ target: 'controlled/model', tools: [] })
    const stop = vi.fn(async () => ({ released: true as const }))
    const registered = built.turn.call.host.register(stop)
    if (!('registration' in registered)) throw new Error('original host registration missing')
    f.withdraw()
    expect(built.turn.call.host.stopping()).toBe(true)
    expect(built.turn.call.host.signal.aborted).toBe(false)
    registered.registration.unregister()
    await built.release()
    await built.release()
    expect(f.release).toHaveBeenCalledOnce()
    expect(stop).not.toHaveBeenCalled()
    expect(f.sources.release).not.toHaveBeenCalled()
    expect(await actual.binding.currentEvaluationInputs.read(f.m.p.scope.session, tenant)).toEqual({
      failure: 'unavailable',
    })
    expect(f.read).not.toHaveBeenCalled()
  })
  it('keeps an already launched original host live when only the driver withdraws', async () => {
    const f = await construction()
    const built = await f.build()
    if ('failure' in built) throw new Error('actual driver binding missing')
    const issue = built.turn.linked.binding.log.originalIssue
    if (!issue) throw new Error('actual original admission missing')
    const admitted = await issue.admitOriginal(f.m.original)
    if (!('confirmed' in admitted)) throw new Error('actual launch claim missing')
    expect(await issue.consumeOriginal(admitted.claim)).toEqual({ kind: 'launch' })
    f.withdraw()
    expect(built.turn.call.host.stopping()).toBe(false)
    expect(built.turn.call.host.signal.aborted).toBe(false)
    await built.release()
    expect(built.turn.call.host.stopping()).toBe(true)
  })
  it('returns the same retained host callbacks after failure without conflating registrations', async () => {
    const f = await construction()
    const owned = createDriverModelSegment(
      f.options,
      f.m.p.scope,
      f.prepared,
      f.sources,
      () => true,
      f.retain,
    )
    const built = await owned.build()
    if ('failure' in built) throw new Error('actual driver binding missing')
    const defect = new Error('original callback return failed')
    const close = vi.fn(async () => ({ released: true as const }))
    const first = built.turn.call.host.register(close)
    const second = built.turn.call.host.register(close)
    if (!('registration' in first) || !('registration' in second))
      throw new Error('actual registrations missing')
    first.registration.unregister()
    close.mockRejectedValueOnce(defect)
    await expect(owned.release()).rejects.toBe(defect)
    expect(f.release).not.toHaveBeenCalled()
    await owned.release()
    expect(close).toHaveBeenCalledTimes(2)
    expect(f.release).toHaveBeenCalledOnce()
    expect(f.sources.release).not.toHaveBeenCalled()
  })
  it('recognizes concurrent builds without allocating a second original binding', async () => {
    const f = await construction()
    const first = f.segment.build()
    expect(f.segment.build()).toBe(first)
    const built = await first
    if ('failure' in built) throw new Error('actual driver binding missing')
    expect(f.acquire).toHaveBeenCalledOnce()
    await f.segment.release()
    expect(await f.segment.build()).toBe(built)
    expect(built.turn.call.host.stopping()).toBe(true)
  })
  it('waits for a late actual borrow and returns it without reading the report after close', async () => {
    const f = await construction()
    let enter!: () => void, continueBuild!: () => void
    const entered = new Promise<void>(resolve => {
      enter = resolve
    })
    const waiting = new Promise<void>(resolve => {
      continueBuild = resolve
    })
    const original = f.acquire.getMockImplementation()!
    f.acquire.mockImplementationOnce(async inputs => {
      enter()
      await waiting
      return original(inputs)
    })
    const building = f.segment.build()
    await entered
    let returned = false
    const closing = f.segment.release().then(() => {
      returned = true
    })
    await Promise.resolve()
    expect(returned).toBe(false)
    continueBuild()
    expect(await building).toEqual({ failure: 'unavailable' })
    await closing
    expect(f.release).toHaveBeenCalledOnce()
    expect(f.refresh).not.toHaveBeenCalled()
  })
  it('rejects foreign Run sources before touching its factory or registry', async () => {
    const f = await construction()
    expect(() =>
      createDriverModelSegment(
        f.options,
        f.m.p.scope,
        f.prepared,
        Object.assign(Object.create(f.sources), { run: 'foreign-run' }),
        () => true,
        f.retain,
      ),
    ).toThrow('actual original Run sources')
    expect(f.acquire).not.toHaveBeenCalled()
    expect(f.refresh).not.toHaveBeenCalled()
  })
  it('returns actual allocated binding when the report owner gives unavailable', async () => {
    const f = await construction()
    const sources: SessionDriverRunSources = Object.assign(Object.create(f.sources), {
      registry: {
        ...f.sources.registry,
        refreshAvailability: async () => ({ failure: 'unavailable' as const }),
      },
    })
    expect(
      await createDriverModelSegment(
        f.options,
        f.m.p.scope,
        f.prepared,
        sources,
        () => true,
        f.retain,
      ).build(),
    ).toEqual({ failure: 'unavailable' })
    expect(f.release).toHaveBeenCalledOnce()
    expect(f.list).not.toHaveBeenCalled()
  })
  it('does not start construction after withdrawal', async () => {
    const f = await construction()
    f.withdraw()
    expect(await f.build()).toEqual({ failure: 'unavailable' })
    expect(f.acquire).not.toHaveBeenCalled()
  })
})
