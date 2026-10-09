import { Context } from '@deepseek-ai/cordis'
import { DatabaseSync } from 'node:sqlite'
import { RUNTIME_CONTEXT } from '@omne-harness-lite/runtime-context/cordis'
import { definePlugin } from '@omne-harness-lite/kernel-basis/cordis'
import { z } from 'zod'
import {
  prepareToolJournalEntry,
  projectToolJournal,
} from '@omne-harness-lite/tool-execution-runtime'
import { readPassConclusions } from '@omne-harness-lite/loop-extension-runner-local'
import { prepareRunnerConclusion, readRunnerChain } from '@omne-harness-lite/loop-extension-runner'
import { judgeDefinition } from '@omne-harness-lite/loop-extension'
import { REGISTERED_CATEGORIES, buildTableContents } from '@omne-harness-lite/asset-registry'
import { evaluate, type NonConnectorEvaluationInput } from '@omne-harness-lite/asset-evaluation'
import { capabilityCanonicalString } from '@omne-harness-lite/asset-model'
import { driverActionFixture } from './driver-action-fixture.ts'
import { createDriverToolRun } from '../src/driver-tool-run.ts'
import { driverNativeToolFixture } from './driver-native-tool-fixture.ts'
import { publishDriverActionBatch } from '../src/driver-action-batch.ts'
import { createSessionToolActionHistory } from '../src/driver-action-history.ts'
import { inspectActionBatch, sessionActionBatchOwner } from '../src/driver-action-facts.ts'
import { modelName } from '@omne-harness-lite/tool-definition'
// @module-tag slow
// Uses real root and tenant SQLite transactions, log owners and Cordis lifetimes.
import {
  createOriginalIssueOwner,
  originalIssueMigrations,
  type OriginalIssueOwner,
  createModelRuntime,
  createSettlementCoordinator,
  modelCallContentMigrations,
} from '@omne-harness-lite/model-request-runtime-local'
import {
  captureModelLogValue,
  readModelLogEnvelope,
  prepareModelLogEntry,
  createModelLogReadInspector,
  type OriginalIssueInput,
  type OriginalIssueAuthority,
} from '@omne-harness-lite/model-request-runtime'
import {
  SessionDriverStartupService,
  SESSION_DRIVER_CONTROL,
  SESSION_DRIVER_STARTUP,
  SESSION_INGRESS,
  SESSION_LIFECYCLE,
  SESSION_WORK_READING,
  SESSION_RUN_JOURNAL,
} from '@omne-harness-lite/session-runtime/cordis'
import { SessionDriver, createLocalSessionIngressBinding } from '../src/cordis.ts'
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
import { compareInteger, checkAppendInput, checkLogPayload } from '@omne-harness-lite/session-log'
import {
  judgePendingModelResponse,
  type PendingModelResponse,
} from '@omne-harness-lite/model-response'
import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
  copyJsonValue,
  toOpaqueJson,
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
  inspectContextLogEntry,
} from '@omne-harness-lite/runtime-context-local'
import { judgeMessage, type UserMessage } from '@omne-harness-lite/messages'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import { createLocalSessionIngress } from '../src/runtime.ts'
import { createSessionDriverWorkOwner } from '../src/driver-work.ts'
import { startDriverRun } from '../src/driver-run.ts'
import { bindDriverOriginal, createDriverModelSegment } from '../src/driver-model.ts'
import { createDriverModelRunTask } from '../src/driver-model-run.ts'
import { readDriverModelHistory, DriverHistoryInvalid } from '../src/driver-model-history.ts'
import { readDriverToolBatch } from '../src/driver-tool-source.ts'
import { createLocalSessionDriver } from '../src/index.ts'
import { createDriverRunTask } from '../src/driver-run-task.ts'
import {
  nativeCallFixturePorts,
  nativeModelConstruction,
  controlledTimingDeclarations,
} from './driver-native-fixture.ts'
import { createSessionModelResultSource } from '../src/model-result-source.ts'
import type { SessionDriverRunSources, LocalSessionDriverOptions } from '../src/driver-types.ts'
import type { FactReader } from '@omne-harness-lite/model-message-projection'
import type { CurrentEvaluationInputs } from '@omne-harness-lite/asset-evaluation'
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
const runResources: Array<() => Promise<void>> = []
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
  for (const close of runResources.splice(0).reverse()) await close()
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
it('owns dynamic injected sources and event hints in each actual independent Session Context', async () => {
  const f = await fixture(),
    a = await create(f)
  const createdB = await f.runtime.operations.createSession(f.runtime.access, {
    ...input,
    operationKey: 'dynamic-context-b',
  })
  if (!('kind' in createdB) || createdB.kind !== 'created')
    throw new Error('actual second Session not created')
  for (const migration of runtimeContextMigrations)
    await f.storage.write(tx => migration.migration.up(tx.db))
  function assemble(scope: SessionScope) {
    const provider = createRuntimeContextLocal(),
      mounted = Promise.withResolvers<Context>()
    // Trusted test root composes the actual provider, preserving its original ready/close ownership.
    const plugin = Object.assign(
      definePlugin({
        name: 'actual-session-composition',
        Config: z.object({}).strict(),
        apply(ctx) {
          mounted.resolve(ctx)
          ctx.plugin(provider.plugin, {})
        },
      }),
      { assemblyLifecycle: 1 as const },
    )
    const host = assembleSessionContext({
      scope,
      storage: f.storage,
      logBacking: f.log().backing,
      access: { authorize: async () => ({ kind: 'rejected', reason: 'notAuthorized' }) },
      clock: { now: async () => unwrap(instantFromRfc3339(at)) },
      runtimeContext: { ...provider, plugin },
    })
    return { host, mounted: mounted.promise }
  }
  const one = assemble({ tenant, session: a.session }),
    two = assemble({ tenant, session: createdB.session })
  const handles: import('@omne-harness-lite/runtime-context').ContextSourceHandle[] = []
  const hints = [vi.fn(), vi.fn()]
  const contribution = definePlugin({
    name: 'same-session-source',
    inject: [RUNTIME_CONTEXT],
    Config: z.object({ index: z.number().int().min(0).max(1) }).strict(),
    apply(ctx, config) {
      handles[config.index] = ctx.runtimeContext.registerSource({
        name: 'same-injected-source',
        recovery: 'reread_source',
        consumers: ['model'],
        requiredKeys: [],
        read: async () => ({ kind: 'values', values: [] }),
      })
      ctx.on('runtime-context/cache-invalidated', hints[config.index]!)
    },
  })
  try {
    await one.host.ready
    await two.host.ready
    const seed = { required: [], initial: [], fixed: [] }
    expect(await one.host.initializer.initializeContextSession(one.host.scope, seed)).toMatchObject(
      { kind: 'applied' },
    )
    expect(await two.host.initializer.initializeContextSession(two.host.scope, seed)).toMatchObject(
      { kind: 'applied' },
    )
    const first = await one.mounted,
      second = await two.mounted
    expect(first).not.toBe(second)
    expect(first.get(SESSION_DRIVER_STARTUP)).toBeUndefined()
    expect(second.get(SESSION_DRIVER_STARTUP)).toBeUndefined()
    expect(first.get(SESSION_LIFECYCLE)).toBeUndefined()
    expect(second.get(SESSION_LIFECYCLE)).toBeUndefined()
    const fiberA = first.plugin(contribution, { index: 0 }),
      fiberB = second.plugin(contribution, { index: 1 })
    await fiberA
    await fiberB
    expect(handles[0]!.generation).not.toBe(handles[1]!.generation)
    const before = await f.log().readSince(a.session, 0)
    first.emit('runtime-context/cache-invalidated')
    expect(hints[0]).toHaveBeenCalledOnce()
    expect(hints[1]).not.toHaveBeenCalled()
    // A hint alone is neither a durable business fact nor execution authority.
    expect(await f.log().readSince(a.session, 0)).toEqual(before)
    expect(await handles[0]!.invalidate(two.host.scope, [])).toMatchObject({ kind: 'rejected' })
    expect(
      await handles[0]!.invalidate(
        {
          ...one.host.scope,
          tenant: unwrap(parseTenantId({ ...tenant, organization: 'other-tenant' })),
        },
        [],
      ),
    ).toMatchObject({ kind: 'rejected' })
    await fiberA.dispose()
    expect(await handles[0]!.invalidate(one.host.scope, [])).toMatchObject({ kind: 'rejected' })
    expect(await handles[1]!.invalidate(two.host.scope, [])).toEqual({ kind: 'invalidated' })
    const originalGeneration = handles[0]!.generation
    const replacement = first.plugin(contribution, { index: 0 })
    await replacement
    expect(handles[0]!.generation).not.toBe(originalGeneration)
    expect(await handles[0]!.invalidate(one.host.scope, [])).toEqual({ kind: 'invalidated' })
    one.host.requestStop()
    expect(await one.host.closed).toMatchObject({ complete: true })
    expect(await handles[0]!.invalidate(one.host.scope, [])).toMatchObject({ kind: 'rejected' })
    expect(await handles[1]!.invalidate(two.host.scope, [])).toEqual({ kind: 'invalidated' })
    expect(two.host.currentGeneration()).toEqual(expect.any(String))
    await fiberB.dispose()
    expect(await handles[1]!.invalidate(two.host.scope, [])).toMatchObject({ kind: 'rejected' })
  } finally {
    one.host.requestStop()
    two.host.requestStop()
    await Promise.all([one.host.closed, two.host.closed])
  }
  expect(await f.runtime.operations.readSession(f.runtime.access, a.session)).toHaveProperty(
    'kind',
    'session',
  )
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
      snapshots: REGISTERED_CATEGORIES.map(category => ({
        category,
        filledAt: unwrap(instantFromRfc3339(at)),
      })),
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
    expect(await issue.admitOriginal(f.m.original)).toEqual({ kind: 'unavailable' })
    expect(await f.m.f.count('mr_original_issue')).toEqual({ n: 0 })
    const prefix = await f.m.f.runtime.journal.readPrefix(f.m.f.runtime.access, f.m.p.scope.session)
    if (!('kind' in prefix) || prefix.kind !== 'prefix')
      throw new Error('actual dispatch source missing')
    const admitted = await issue.admitOriginal(modelInput(f.m.p, prefix.source))
    expect(admitted).toHaveProperty('confirmed')
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

import {
  inspectSessionToolAdoption,
  sessionToolActionOwner,
  persistDriverToolAdoption,
} from '../src/driver-tool-adoption.ts'

describe('driver complete original Model Run', () => {
  async function running(
    gate?: { readonly entered: () => void; readonly wait: Promise<void> },
    retainedIssue = false,
    toolCalls: Parameters<typeof nativeCallFixturePorts>[4] = [],
    maxSettlementBytes = 65536,
  ) {
    let original!: OriginalIssueOwner
    let native: ReturnType<typeof createModelRuntime> | undefined
    let results!: ReturnType<typeof createSessionModelResultSource>
    let work!: ReturnType<typeof createSessionDriverWorkOwner>
    const toolQualified = vi.fn(async () => ({ kind: 'authorized' as const }))
    let toolResultSource:
      import('@omne-harness-lite/tool-execution-runtime').ToolResultCustodySource | undefined
    const f = await fixture(
      undefined,
      32,
      storage => {
        work = createSessionDriverWorkOwner({ storage, tenant, maxRecords: 8 })
        results = createSessionModelResultSource({
          storage,
          tenant,
          executionSource: () => native?.executionSource,
          maxCaptures: 4,
          retainReferencesIn: async unit => {
            unit.assertStorage(storage)
            return 'retained'
          },
        })
        return {
          toolIssue: { maxRecords: 8, current: { authorizeIn: toolQualified } },
          toolResults: {
            maxRecords: 8,
            source: {
              verifyIn: (...args) => {
                if (!toolResultSource) throw new Error('actual Tool result source missing')
                return toolResultSource.verifyIn(...args)
              },
            },
          },
          toolDelivery: { readConclusions: readPassConclusions },
          modelResults: { maxRecords: 8, source: results.source },
          modelIssue: {
            maxRecords: 8,
            current: { authorizeIn: async () => ({ kind: 'authorized' }) },
            create: binding => {
              original = createOriginalIssueOwner({ storage, ...binding, limit: 8 })
              modelOwners.push(original)
              return original.participant
            },
          },
        }
      },
      async () => at,
      (...args) => work.readIn(...args),
    )
    for (const migration of modelCallContentMigrations('sqlite'))
      await f.storage.write(tx => migration.migration.up(tx.db))
    const created = await create(f)
    const scope = { tenant, session: created.session }
    await f.runtime.operations.submitInput(
      f.runtime.access,
      scope.session,
      'driver-native-input',
      user(),
    )
    const identities = driverIdentityFixture()
    const prepared = await startDriverRun({ ingress: f.runtime, identities }, scope, () => true)
    if (prepared.kind !== 'prepared') throw new Error('original Run not prepared')
    const root = { category: 'agent_definition' as const, name: 'controlled-driver-root' }
    const attributes = controlledTimingDeclarations()
    const evaluation: CurrentEvaluationInputs = {
      read: async (session, requestedTenant) => {
        if (
          session !== scope.session ||
          writeJsonLossless(requestedTenant) !== writeJsonLossless(tenant)
        )
          return { failure: 'unavailable' }
        return {
          input: {
            tenant,
            standing: { standing: 'effective', role: 'member' },
            root: {
              definition: root,
              source: { asset: 'controlled-driver-root', version: 1 },
              references: [],
              attributes,
            },
            definitions: [
              {
                id: 'controlled-driver-root',
                capability: root,
                origin: 'official',
                versions: [
                  {
                    number: 1,
                    publishedAt: at,
                    content: {
                      category: 'agent_definition',
                      body: toOpaqueJson({ references: [], attributes }),
                    },
                  },
                ],
              },
            ],
            holdings: [
              {
                holder: { layer: 'factory' },
                capability: root,
                asset: 'controlled-driver-root',
                basis: { kind: 'official' },
                versionSelection: { kind: 'current' },
                immutable: false,
                assignments: [],
                since: at,
              },
            ],
          },
        }
      },
    }
    const ports = nativeCallFixturePorts(scope, f.runtime, f.storage, gate, toolCalls)
    const baseConstruction = nativeModelConstruction(f.storage)
    const construction = ports.configure({
      ...baseConstruction,
      settlementContention: {
        ...baseConstruction.settlementContention,
        limits: {
          ...baseConstruction.settlementContention.limits,
          retainedBytes: maxSettlementBytes,
        },
      },
    })
    native = createModelRuntime(construction)
    const releaseModel = vi.fn(async () => {})
    const model: LocalSessionDriverOptions['model'] = {
      original,
      factory: {
        acquire: async (host: ModelRuntimeHostInputs) => {
          const operations = native!.project(host, construction.callFacts)
          // Explicit test deployment selection, not a driver default or a production factory policy.
          expect(
            await operations.selectModel({ session: scope.session, routeName: 'controlled/model' }),
          ).toEqual({ selected: 'controlled/model' })
          return { operations, release: releaseModel }
        },
      },
      executionSource: () => native?.executionSource,
      results,
      settlement: {
        create: binding =>
          createSettlementCoordinator({
            ...binding,
            settlementContention: construction.settlementContention,
            settlementScheduler: construction.settlementScheduler,
            diagnostic() {},
          }),
      },
      maxCallReads: 4,
    }
    const unavailable = async (): Promise<never> => {
      throw new Error('unexpected source consumer')
    }
    const sources: SessionDriverRunSources = {
      scope,
      run: prepared.preparation.run,
      evaluation,
      registry: {
        refreshAvailability: async () => ({
          report: {
            session: scope.session,
            runId: prepared.preparation.run,
            attempt: prepared.preparation.attempt,
            computedAt: unwrap(instantFromRfc3339(at)),
            snapshots: REGISTERED_CATEGORIES.map(category => ({
              category,
              filledAt: unwrap(instantFromRfc3339(at)),
            })),
            availability: [],
            mcpActions: [],
            endpointHoldings: [],
            effectivePermissions: {},
            skillGate: [],
          },
        }),
        list: async () => ({ entries: [] }),
      },
      get context(): never {
        throw new Error('the model segment reads the explicit Context generation')
      },
      contextGeneration: () => 'controlled-driver-context',
      get toolAccess(): never {
        throw new Error('the normal Model reply needs no tool access')
      },
      get actions(): never {
        throw new Error('normal reply does not run tools')
      },
      providers: {
        catalog: ports.catalog,
        credentials: ports.credentials,
        tools: { lookup: unavailable },
        sourceVersions: { fixture: 'controlled-driver-deployment' },
      },
      selection: {
        owner: ports.owner,
        concurrent: 1,
        sessionTenancy: f.runtime.tenancy,
        catalog: ports.catalog,
        projection: async () => ({ known: [] }),
        compatible: () => ({ ok: true }),
        now: async () => at,
        diagnostic() {},
        onDiagnosticFailure() {},
      },
      host: {
        history: construction.history,
        recovery: construction.recovery,
        callPresence: construction.callPresence,
      },
      projection: {
        rules: {
          version: 'controlled-driver-projection',
          external: null,
          system: [],
          pendingCardBlocks: null,
          lastModelRequestPrefixLength: null,
        },
      },
      release: vi.fn(async () => {}),
    }
    const borrowed = await f.runtime.runJournal.borrow(
      f.runtime.coordinationAuthority,
      scope,
      prepared.preparation.run,
    )
    if (!('journal' in borrowed)) throw new Error('actual driver original journal missing')
    runResources.push(async () => {
      // Unknown original issue has no native stop proof. Fixture disposal does not settle it.
      const expected = retainedIssue ? { unavailable: true } : { released: true }
      expect(await native!.close()).toEqual(expected)
      expect(native!.executionSource.release()).toEqual(expected)
      expect(results.close()).toEqual({ released: true })
      await borrowed.journal.close()
    })
    const input = {
      options: {
        ingress: f.runtime,
        identities: { ...identities, modelContent: construction.identities },
        model,
        work,
        tools: { acquire: async () => ({ unavailable: true as const }) },
      },
      scope,
      prepared,
      journal: borrowed.journal,
      sources,
    }
    return {
      input,
      f,
      native,
      scope,
      work,
      ports,
      sources,
      releaseModel,
      borrowed,
      prepared,
      toolQualified,
      installToolResultSource: (
        source: import('@omne-harness-lite/tool-execution-runtime').ToolResultCustodySource,
      ) => {
        toolResultSource = source
      },
    }
  }
  async function sourcesForRun(
    f: Awaited<ReturnType<typeof running>>,
    journal: import('../src/run-journal-types.ts').BorrowedRunJournal,
  ): Promise<SessionDriverRunSources> {
    const prefix = await journal.readPrefix()
    if ('failure' in prefix) throw new Error('actual new Run prefix missing')
    const attempt = prefix.entries
      .map(entry => readSessionFact(entry))
      .find(
        read =>
          'fact' in read && read.fact.kind === 'attempt_started' && read.fact.run === journal.run,
      )
    if (!attempt || !('fact' in attempt) || attempt.fact.kind !== 'attempt_started')
      throw new Error('actual new attempt missing')
    const originalAttempt = attempt.fact.attempt
    return Object.assign(Object.create(f.sources), {
      run: journal.run,
      registry: {
        list: f.sources.registry.list,
        refreshAvailability: async () => ({
          report: {
            session: f.scope.session,
            runId: journal.run,
            attempt: originalAttempt,
            computedAt: unwrap(instantFromRfc3339(at)),
            snapshots: REGISTERED_CATEGORIES.map(category => ({
              category,
              filledAt: unwrap(instantFromRfc3339(at)),
            })),
            availability: [],
            mcpActions: [],
            endpointHoldings: [],
            effectivePermissions: {},
            skillGate: [],
          },
        }),
      },
    })
  }
  function toolSources(
    base: SessionDriverRunSources,
    table: ReturnType<typeof evaluatedDriverTool>,
    actual: {
      readonly actions: () => SessionDriverRunSources['actions']
      readonly access: () => SessionDriverRunSources['toolAccess']
    },
  ): SessionDriverRunSources {
    const sources: SessionDriverRunSources = Object.create(base)
    Object.defineProperties(sources, {
      actions: {
        get: () => {
          return actual.actions()
        },
      },
      toolAccess: {
        get: () => {
          return actual.access()
        },
      },
      evaluation: { value: { read: async () => ({ input: table.input }) } },
      registry: {
        value: {
          list: async () => ({ entries: table.entries }),
          refreshAvailability: async (
            ...args: Parameters<SessionDriverRunSources['registry']['refreshAvailability']>
          ) => {
            const value = await base.registry.refreshAvailability(...args)
            return 'report' in value
              ? {
                  report: {
                    ...value.report,
                    availability: table.entries.map(({ capability, availability }) => ({
                      capability,
                      availability,
                    })),
                    effectivePermissions: {
                      [modelName(table.capability.name)]: table.permission,
                    },
                  },
                }
              : value
          },
        },
      },
      providers: {
        value: {
          ...base.providers,
          tools: {
            lookup: async (_session: unknown, _category: unknown, name: string) => {
              const entry = table.entries.find(entry => modelName(entry.capability.name) === name)
              return entry ? { entry } : { none: true }
            },
          },
        },
      },
    })
    return sources
  }
  function evaluatedDriverTool() {
    const root = { category: 'agent_definition', name: 'example:root' } as const
    const capability = { category: 'tool', name: 'example:read' } as const
    const references = [{ capability, resident: true }]
    const attributes = controlledTimingDeclarations()
    const definition = {
      name: capability.name,
      paradigm: 'single',
      description: 'Read the controlled test value.',
      origin: { kind: 'authored' },
      input: { type: 'object', properties: {}, additionalProperties: false },
      permissions: { execute: { default: 'auto' } },
    } as const
    const input: NonConnectorEvaluationInput = {
      tenant,
      standing: { standing: 'effective', role: 'member' },
      root: {
        definition: root,
        source: { asset: 'ast_driver_root', version: 1 },
        references,
        attributes,
      },
      definitions: [
        {
          id: 'ast_driver_root',
          capability: root,
          origin: 'official',
          versions: [
            {
              number: 1,
              publishedAt: at,
              content: {
                category: 'agent_definition',
                body: toOpaqueJson({ references, attributes }),
              },
            },
          ],
        },
        {
          id: 'ast_driver_read',
          capability,
          origin: 'official',
          versions: [1, 2].map(number => ({
            number,
            publishedAt: at,
            content: { category: 'tool', definition },
          })),
        },
      ],
      holdings: [root, capability].map(capability => ({
        holder: { layer: 'factory' },
        capability,
        asset: capability.category === 'tool' ? 'ast_driver_read' : 'ast_driver_root',
        basis: { kind: 'official' },
        versionSelection: { kind: 'pinned', number: 1 },
        immutable: false,
        assignments: [],
        since: at,
      })),
    }
    const evaluated = evaluate(input)
    expect(evaluated).toHaveProperty('ok')
    if (!('ok' in evaluated)) throw new Error('controlled tool evaluation rejected')
    const built = buildTableContents(evaluated.ok, [capability], input.definitions)
    expect(built).toHaveProperty('plans')
    if (!('plans' in built)) throw new Error('actual table construction failed')
    const entries = built.plans.find(plan => plan.category === 'tool')!.entries
    const permission = evaluated.ok.values.find(value => value.item === 'execute')
    if (!permission) throw new Error('evaluated execute permission missing')
    return { input, entries, capability, definition, permission }
  }
  it('persists the exact nonempty evaluated tool version and rejects a changed table without another append', async () => {
    const f = await running()
    const { input, entries, capability, definition, permission } = evaluatedDriverTool()
    const refreshed = await f.sources.registry.refreshAvailability(
      f.scope.session,
      { kind: 'start', runId: f.prepared.preparation.run },
      f.prepared.preparation.attempt,
    )
    if (!('report' in refreshed)) throw new Error('original report missing')
    const report = {
      ...refreshed.report,
      availability: entries.map(({ capability, availability }) => ({ capability, availability })),
      effectivePermissions: { [modelName(capability.name)]: permission },
    }
    const request = {
      scope: f.scope,
      log: f.borrowed.journal.log,
      preparation: f.prepared.preparation,
      report,
      entries,
      inputs: { read: async () => ({ input }) },
    }
    const first = await persistDriverToolAdoption(request)
    expect(first).toMatchObject({
      adoption: {
        tools: [
          {
            name: modelName(capability.name),
            capability: capabilityCanonicalString(capability),
            asset: 'ast_driver_read',
            version: '1',
            definition,
          },
        ],
      },
    })
    expect(await persistDriverToolAdoption(request)).toEqual(first)
    const wrong = entries.map(entry => ({ ...entry, from: 'tenant' as const }))
    expect(await persistDriverToolAdoption({ ...request, entries: wrong })).toEqual({
      unavailable: true,
    })
    const changed = entries.map(entry => ({
      ...entry,
      content: {
        category: 'tool' as const,
        definition: { ...definition, description: 'Changed body.' },
      },
    }))
    expect(await persistDriverToolAdoption({ ...request, entries: changed })).toEqual({
      unavailable: true,
    })
    const prefix = await f.borrowed.journal.readPrefix()
    if ('failure' in prefix) throw new Error('actual adopted prefix missing')
    const facts = prefix.entries.filter(entry => {
      const payload = checkLogPayload(entry.payload)
      return 'payload' in payload && payload.payload.owner === sessionToolActionOwner
    })
    expect(facts).toHaveLength(1)
    if (!('adoption' in first)) throw new Error('actual adoption missing')
    expect(inspectSessionToolAdoption(f.scope, facts[0]!)).toEqual({
      kind: 'adoption',
      adoption: first.adoption,
    })
    expect(f.ports.sends()).toBe(0)
    expect(f.native.executionSource.snapshot(f.scope.session)).toEqual([])
    await f.borrowed.journal.close()
  })
  it('derives the complete ordered tool batch from its actual adopted Model reply, including unparseable calls', async () => {
    const judged = judgeMessage({
      id: 'controlled-tool-reply-data',
      type: 'assistant',
      response: 'controlled-response-data',
      ending: 'complete',
      createdAt: at,
      blocks: [
        {
          id: 'tool-one',
          kind: 'tool_call',
          complete: true,
          callId: 'call-one',
          tool: 'example__read',
          arguments: { path: 'one' },
          visibility: { toHuman: true, toModel: true },
        },
        {
          id: 'tool-invalid',
          kind: 'tool_call',
          complete: true,
          callId: 'call-invalid',
          tool: 'example__read',
          unparseable: true,
          rawArguments: '{',
          visibility: { toHuman: true, toModel: true },
        },
        {
          id: 'tool-two',
          kind: 'tool_call',
          complete: true,
          callId: 'call-two',
          tool: 'example__read',
          arguments: { path: 'two' },
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    if (!('ok' in judged) || judged.ok.type !== 'assistant')
      throw new Error('controlled tool data rejected')
    const calls: import('@omne-harness-lite/content-blocks').ToolCallBlock[] = []
    for (const block of judged.ok.blocks)
      if (block.kind === 'tool_call' && block.complete === true) calls.push(block)
    const f = await running(undefined, false, calls)
    const task = createDriverModelRunTask(f.input)
    expect(await task.completion).toBe('retained')
    const read = await f.borrowed.journal.readPrefix()
    if ('failure' in read) throw new Error('actual tool reply prefix missing')
    const prefix = {
      scope: f.scope,
      ownerGeneration: read.source.journalGeneration,
      entries: read.entries,
      tail: read.tail,
    }
    const saved = await f.f.runtime.modelResults.read(
      f.f.runtime.coordinationAuthority,
      f.scope,
      f.prepared.preparation.call,
      f.prepared.identities.resultKey,
    )
    expect(saved, JSON.stringify(f.ports.trace)).toHaveProperty('pending.outcome', 'complete')
    const replies = [...readDriverModelHistory(prefix).replies.values()]
    expect(replies).toHaveLength(1)
    const reply = replies[0]!
    const batch = readDriverToolBatch(prefix, reply.message.id)
    expect(batch).toMatchObject({
      kind: 'batch',
      batch: {
        origin: {
          run: f.prepared.preparation.run,
          attempt: f.prepared.preparation.attempt,
          assistantMessage: reply.message.id,
        },
        latestAttempt: f.prepared.preparation.attempt,
        runState: 'open',
        calls,
        adoption: { adoption: { call: f.prepared.preparation.call, tools: [] } },
      },
    })
    expect(readDriverToolBatch(prefix, 'absent-message')).toEqual({ kind: 'notFound' })
    expect(
      readDriverToolBatch(
        {
          ...prefix,
          entries: prefix.entries.filter(
            entry => !('adoption' in inspectSessionToolAdoption(f.scope, entry)),
          ),
        },
        reply.message.id,
      ),
    ).toEqual({ kind: 'unavailable' })
    expect(
      readDriverToolBatch(
        {
          ...prefix,
          entries: prefix.entries.filter(entry => {
            const parsed = readSessionFact(entry)
            return !('fact' in parsed && parsed.fact.kind === 'attempt_started')
          }),
        },
        reply.message.id,
      ),
    ).toEqual({ kind: 'unavailable' })
    expect(
      readDriverToolBatch(
        {
          ...prefix,
          scope: {
            ...prefix.scope,
            session: unwrap(parseOpaqueIdentifier('foreign-tool-batch', 'SessionRef')),
          },
        },
        reply.message.id,
      ),
    ).toEqual({ kind: 'unavailable' })
    expect(f.ports.sends()).toBe(1)
    expect(await task.close()).toBe('pending')
    await f.borrowed.journal.close()
  })
  it.each([
    { lostReturn: false, asked: false },
    { lostReturn: true, asked: false },
    { lostReturn: false, asked: true },
    { lostReturn: false, asked: false, native: 'complete' },
    { lostReturn: false, asked: false, native: 'unknown' },
    { lostReturn: false, asked: false, native: 'stopPending' },
  ])(
    'publishes the whole actual Runner batch before recognition, $lostReturn lost return, $asked asked, Native $native',
    async ({ lostReturn, asked, native }) => {
      const judged = judgeMessage({
        id: 'action-source-data',
        type: 'assistant',
        response: 'action-source-response',
        ending: 'complete',
        createdAt: at,
        blocks: ['one', 'bad', 'two'].map(id => ({
          id: `action-${id}`,
          kind: 'tool_call',
          complete: true,
          callId: `action-${id}`,
          tool: 'example__read',
          ...(id === 'bad'
            ? { unparseable: true, rawArguments: '{' }
            : { arguments: native ? {} : { path: id } }),
          visibility: { toHuman: true, toModel: true },
        })),
      })
      if (!('ok' in judged) || judged.ok.type !== 'assistant')
        throw new Error('controlled action data rejected')
      const calls: import('@omne-harness-lite/content-blocks').ToolCallBlock[] = []
      for (const block of judged.ok.blocks)
        if (block.kind === 'tool_call' && block.complete === true) calls.push(block)
      const f = await running(undefined, false, calls)
      const table = evaluatedDriverTool()
      const registry: SessionDriverRunSources['registry'] = {
        list: async () => ({ entries: table.entries }),
        refreshAvailability: async (...args) => {
          const value = await f.sources.registry.refreshAvailability(...args)
          if (!('report' in value)) return value
          return {
            report: {
              ...value.report,
              availability: table.entries.map(({ capability, availability }) => ({
                capability,
                availability,
              })),
              effectivePermissions: { [modelName(table.capability.name)]: table.permission },
            },
          }
        },
      }
      const sources: SessionDriverRunSources = Object.assign(Object.create(f.sources), {
        registry,
        evaluation: { read: async () => ({ input: table.input }) },
        providers: {
          ...f.sources.providers,
          tools: {
            lookup: async (_session: unknown, _category: unknown, name: string) => {
              const entry = table.entries.find(entry => modelName(entry.capability.name) === name)
              return entry ? { entry } : { none: true as const }
            },
          },
        },
      })
      const task = createDriverModelRunTask({ ...f.input, sources })
      expect(await task.completion).toBe('retained')
      const read = await f.borrowed.journal.readPrefix()
      if ('failure' in read) throw new Error('actual action prefix missing')
      const prefix = {
        scope: f.scope,
        ownerGeneration: read.source.journalGeneration,
        entries: read.entries,
        tail: read.tail,
      }
      const replies = [...readDriverModelHistory(prefix).replies.values()]
      expect(replies, JSON.stringify(f.ports.trace)).toHaveLength(1)
      const reply = replies[0]!
      const found = readDriverToolBatch(prefix, reply.message.id)
      if (found.kind !== 'batch') throw new Error('actual original Model action batch missing')
      const runner = await driverActionFixture(f.borrowed.journal, found.batch).open()
      runResources.push(runner.close)
      if (asked)
        runner.judge.mockImplementation(async (_access, _scope, _pass, candidates) => {
          const results = candidates.map(
            (candidate): import('@omne-harness-lite/tool-admission').AdmissionResult => ({
              kind: 'ask',
              card: {
                explanation: 'Confirm this controlled action.',
                options: [{ id: 'yes', label: 'Yes' }],
                about: { position: 'before_action', callId: candidate.call.callId },
              },
            }),
          )
          if (!results[0]) throw new Error('controlled ask candidates are empty')
          return { kind: 'decisions', results: [results[0], ...results.slice(1)] }
        })
      const history = createSessionToolActionHistory({ readConclusions: readPassConclusions })
      expect(history.inspect(prefix, calls[0]!.callId)).toMatchObject({
        kind: 'known',
        facts: { batch: { kind: 'pending' } },
      })
      let lost = false
      const actual = f.borrowed.journal.log
      const log: typeof actual = {
        ...actual,
        append: async (...args) => {
          const result = await actual.append(...args)
          if (
            lostReturn &&
            !lost &&
            args[1].some(entry => {
              const payload = checkLogPayload(entry.payload)
              return 'payload' in payload && payload.payload.owner === sessionActionBatchOwner
            }) &&
            'positions' in result
          ) {
            lost = true
            return { failure: 'unavailable' }
          }
          return result
        },
      }
      const journal = { ...f.borrowed.journal, log }
      const request = {
        journal,
        message: reply.message.id,
        actions: runner.actions,
        signal: new AbortController().signal,
      }
      const withdrawn = new AbortController()
      withdrawn.abort()
      expect(await publishDriverActionBatch({ ...request, signal: withdrawn.signal })).toEqual({
        kind: 'unavailable',
      })
      expect(runner.append).not.toHaveBeenCalled()
      expect(runner.judge).not.toHaveBeenCalled()
      const result = await publishDriverActionBatch(request)
      if (asked) {
        expect(result).toEqual({ kind: 'waiting' })
        const waiting = await journal.readPrefix()
        if ('failure' in waiting) throw new Error('actual asked prefix unavailable')
        expect(waiting.entries.some(entry => inspectActionBatch(prefix, entry))).toBe(false)
        expect(
          history.inspect(
            { ...prefix, entries: waiting.entries, tail: waiting.tail },
            calls[0]!.callId,
          ),
        ).toMatchObject({ kind: 'known', facts: { batch: { kind: 'pending' } } })
        await runner.close()
        expect(await task.close()).toBe('pending')
        await journal.close()
        return
      }
      expect(result, JSON.stringify(result)).toHaveProperty(
        'kind',
        lostReturn ? 'unconfirmed' : 'complete',
      )
      if (lostReturn) expect(result).not.toHaveProperty('admissions')
      else
        expect(result).toMatchObject({
          admissions: [
            { callId: calls[0]!.callId, token: expect.any(String) },
            { callId: calls[2]!.callId, token: expect.any(String) },
          ],
        })
      const current = await journal.readPrefix()
      if ('failure' in current) throw new Error('actual completed prefix missing')
      const completed = { ...prefix, ...current }
      const records = completed.entries.flatMap(entry => {
        const read = inspectActionBatch(completed, entry)
        return read ? [read] : []
      })
      expect(records).toHaveLength(1)
      expect(records[0]!.value.completion.items.map(item => item.callId)).toEqual(
        calls.map(call => call.callId),
      )
      expect(records[0]!.value.completion.items.map(item => item.decision.kind)).toEqual([
        'allow',
        'notExecutable',
        'allow',
      ])
      expect(history.inspect(completed, calls[0]!.callId)).toMatchObject({
        kind: 'known',
        facts: { batch: { kind: 'complete' }, route: { kind: 'none' } },
      })
      const count = runner.judge.mock.calls.length
      expect(await publishDriverActionBatch(request)).toMatchObject({
        kind: 'complete',
        admissions: [
          { callId: calls[0]!.callId, token: expect.any(String) },
          { callId: calls[2]!.callId, token: expect.any(String) },
        ],
      })
      expect(runner.judge).toHaveBeenCalledTimes(count)
      expect(
        history.inspect(
          { ...completed, entries: completed.entries.filter(entry => entry !== records[0]!.entry) },
          calls[1]!.callId,
        ),
      ).toEqual({ kind: 'unavailable' })
      const badPayload = copyJsonValue({
        kind: 'fact',
        owner: sessionActionBatchOwner,
        version: '1',
        value: {
          ...records[0]!.value,
          completion: {
            ...records[0]!.value.completion,
            items: [...records[0]!.value.completion.items].reverse(),
          },
        },
      })
      if (!('ok' in badPayload)) throw new Error('controlled reordered payload is not JSON')
      const broken = completed.entries.map(entry =>
        entry === records[0]!.entry ? { ...entry, payload: badPayload.ok } : entry,
      )
      expect(history.inspect({ ...completed, entries: broken }, calls[0]!.callId)).toEqual({
        kind: 'unavailable',
      })
      const future = completed.entries.map(entry =>
        entry === records[0]!.entry
          ? {
              ...entry,
              payload: {
                ...(entry.payload as import('@omne-harness-lite/content-blocks').JsonObject),
                version: 'unknown-version',
              },
            }
          : entry,
      )
      expect(history.inspect({ ...completed, entries: future }, calls[0]!.callId)).toEqual({
        kind: 'unavailable',
      })
      expect(
        history.inspect(
          {
            ...completed,
            scope: {
              ...completed.scope,
              tenant: unwrap(
                parseTenantId({ organization: 'foreign-organization', account: 'foreign-member' }),
              ),
            },
          },
          calls[0]!.callId,
        ),
      ).toEqual({ kind: 'unavailable' })
      expect(f.ports.sends()).toBe(1)
      expect(lost).toBe(lostReturn)
      if (native) {
        const entered = Promise.withResolvers<void>(),
          returned = Promise.withResolvers<void>()
        const tool = await driverNativeToolFixture({
          ...(native === 'stopPending'
            ? {
                execute: async () => {
                  entered.resolve()
                  await returned.promise
                  return 'actual stopped result'
                },
              }
            : {}),
          storage: f.f.storage,
          root: f.f.root,
          ingress: f.f.runtime,
          backing: f.f.log().backing,
          journal,
          history,
          call: calls[0]!.callId,
        })
        try {
          const consumer = createDriverToolRun({
            options: {
              ...f.input.options,
              tools: {
                acquire: async support => {
                  const acquired = await tool.factory.acquire(
                    native === 'unknown'
                      ? {
                          ...support,
                          admission: {
                            ...support.admission,
                            admitOriginal: async participant => {
                              const result = await support.admission.admitOriginal(participant)
                              return result.kind === 'issued'
                                ? { kind: 'unknownCommit', identity: result.identity }
                                : result
                            },
                          },
                        }
                      : support,
                  )
                  f.installToolResultSource(tool.custody!.source)
                  return acquired
                },
              },
              identities: {
                ...f.input.options.identities,
                tool: (_scope, _run, _attempt, _position, call) => ({
                  prepareKey: `driver-tool-prepare:${call}`,
                  originalPosition: `tool-runtime/1/${JSON.stringify(['execution_intended', call])}`,
                  resultKey: `driver-tool-result:${call}`,
                  adoptionKey: `driver-tool-adopt:${call}`,
                }),
              },
            },
            scope: f.scope,
            journal,
            message: reply.message.id,
            permit: f.prepared.preparation.permit,
            signal: new AbortController().signal,
            sources: { actions: runner.actions, toolAccess: tool.access },
          })
          if (native === 'unknown') {
            expect(await consumer.completion).toBe('retained')
            expect(consumer.work).toHaveLength(1)
            expect(consumer.work[0]!.participant!.identity.ref.callId).toBe(calls[0]!.callId)
            expect(tool.author).not.toHaveBeenCalled()
            expect(await f.f.count('sr_tool_issue')).toEqual({ n: 1 })
            expect(await f.f.count('tool_original_issue')).toEqual({ n: 1 })
            expect(await consumer.close()).toBe('pending')
            expect(tool.release).not.toHaveBeenCalled()
            expect(
              await f.f.storage.atomic(unit =>
                f.work.readIn(unit, f.scope, f.prepared.preparation.run),
              ),
            ).toBe('pending')
            await tool.close()
          } else if (native === 'stopPending') {
            await entered.promise
            expect(consumer.work[0]!.stopped).toBe(false)
            expect(await consumer.close()).toBe('pending')
            expect(tool.release).not.toHaveBeenCalled()
            returned.resolve()
            expect(await consumer.completion).toBe('retained')
            expect(consumer.work).toHaveLength(1)
            expect(consumer.work[0]!.stopped).toBe(true)
            expect(tool.author).toHaveBeenCalledOnce()
            expect(await consumer.close()).toBe('released')
            expect(tool.release).toHaveBeenCalledOnce()
            expect(
              await f.f.storage.atomic(unit =>
                f.work.readIn(unit, f.scope, f.prepared.preparation.run),
              ),
            ).toBe('pending')
          } else {
            expect(await consumer.completion).toBe('ended')
            expect(consumer.work).toHaveLength(3)
            expect(consumer.work.map(work => work.stopped)).toEqual([true, true, true])
            expect(consumer.work.map(work => work.terminal!.value.terminal.outcome)).toEqual([
              'completed',
              'failed',
              'completed',
            ])
            expect(tool.author).toHaveBeenCalledTimes(2)
            expect(await f.f.count('sr_tool_issue')).toEqual({ n: 3 })
            expect(await f.f.count('sr_tool_result')).toEqual({ n: 3 })
            expect(await f.f.count('sr_tool_delivery')).toEqual({ n: 3 })
            for (const work of consumer.work) {
              expect(work.deliveryResult).toHaveProperty('kind', 'confirmed')
              expect(work.custody!.result.terminal.value.account).toEqual(
                work.terminal!.value.account,
              )
            }
            expect(await f.f.count('tool_original_issue')).toEqual({ n: 3 })
            const actual = await tool.prefix()
            expect(history.inspect(actual, calls[0]!.callId)).toMatchObject({
              kind: 'known',
              facts: { route: { kind: 'execution' } },
            })
            expect(
              await f.f.storage.atomic(unit =>
                f.work.readIn(unit, f.scope, f.prepared.preparation.run),
              ),
            ).toBe('pending')
            expect(await consumer.close()).toBe('released')
            expect(tool.release).toHaveBeenCalledOnce()
            const observed = await tool.native!.operations.acquire(tool.access, {
              ...f.scope,
              callId: calls[0]!.callId,
            })
            expect(observed).toHaveProperty('kind', 'acquired')
            if (observed.kind === 'acquired') observed.observer.release()
            expect(tool.author).toHaveBeenCalledTimes(2)
          }
        } finally {
          returned.resolve()
          await tool.close()
        }
      }
      await runner.close()
      expect(await task.close()).toBe('pending')
      await journal.close()
    },
  )
  it.each(['none', 'custody', 'delivery'] as const)(
    'continues or retains the original Model Run after actual Tool result $0 return loss',
    async lostReturn => {
      const judged = judgeMessage({
        id: 'driver-native-tool-source',
        type: 'assistant',
        response: 'driver-native-tool-response',
        ending: 'complete',
        createdAt: at,
        blocks: [
          {
            id: 'driver-native-call-block',
            callId: 'driver-native-call',
            kind: 'tool_call',
            tool: 'example__read',
            complete: true,
            arguments: {},
            visibility: { toHuman: true, toModel: true },
          },
        ],
      })
      if (!('ok' in judged) || judged.ok.type !== 'assistant')
        throw new Error('controlled tool reply rejected')
      const calls: import('@omne-harness-lite/content-blocks').ToolCallBlock[] = []
      for (const block of judged.ok.blocks)
        if (block.kind === 'tool_call' && block.complete === true) calls.push(block)
      const f = await running(undefined, false, send => (send === 1 ? calls : []))
      const table = evaluatedDriverTool()
      const history = createSessionToolActionHistory({ readConclusions: readPassConclusions })
      let runner: Awaited<ReturnType<ReturnType<typeof driverActionFixture>['open']>> | undefined
      let tool: Awaited<ReturnType<typeof driverNativeToolFixture>> | undefined
      const startRunner = async () => {
        if (runner) return runner
        const read = await f.borrowed.journal.readPrefix()
        if ('failure' in read) throw new Error('actual driver prefix missing')
        const prefix = {
          scope: f.scope,
          ownerGeneration: read.source.journalGeneration,
          entries: read.entries,
          tail: read.tail,
        }
        const replies = [...readDriverModelHistory(prefix).replies.values()]
        const found = readDriverToolBatch(prefix, replies[0]!.message.id)
        if (found.kind !== 'batch') throw new Error('actual Model source absent')
        runner = await driverActionFixture(f.borrowed.journal, found.batch).open()
        return runner
      }
      const sources = toolSources(f.sources, table, {
        actions: () => {
          if (!runner) throw new Error('actual Runner not acquired')
          return runner.actions
        },
        access: () => {
          if (!tool) throw new Error('actual Tool not acquired')
          return tool.access
        },
      })
      const ingress: typeof f.f.runtime = Object.create(f.f.runtime)
      const store = vi.fn<typeof f.f.runtime.toolResults.store>(async (...args) => {
        const result = await f.f.runtime.toolResults.store(...args)
        return lostReturn === 'custody' && 'witness' in result
          ? {
              kind: 'unknownCommit',
              scope: args[1],
              call: args[2].original.ref.callId,
              resultKey: args[2].resultKey,
            }
          : result
      })
      const confirm = vi.fn<typeof f.f.runtime.toolDelivery.confirm>(async (...args) => {
        const result = await f.f.runtime.toolDelivery.confirm(...args)
        return lostReturn === 'delivery' && 'messagePosition' in result
          ? {
              kind: 'unknownCommit',
              scope: args[1],
              call: args[2].witness.original.ref.callId,
              resultKey: args[2].witness.receipt.resultKey,
            }
          : result
      })
      Object.defineProperties(ingress, {
        toolResults: { value: { ...f.f.runtime.toolResults, store } },
        toolDelivery: { value: { ...f.f.runtime.toolDelivery, confirm } },
      })
      const workEvents: string[] = []
      const tokenCalls = new Map<import('../src/driver-types.ts').SessionDriverWorkToken, string>()
      const trackedWork = {
        ...f.work,
        begin: (...args: Parameters<typeof f.work.begin>) => {
          const token = f.work.begin(...args)
          tokenCalls.set(token, args[1].call)
          workEvents.push(`begin:${args[1].call}`)
          return token
        },
        complete: (token: Parameters<typeof f.work.complete>[0]) => {
          workEvents.push(`complete:${tokenCalls.get(token)}`)
          f.work.complete(token)
        },
      }
      const task = createDriverModelRunTask({
        ...f.input,
        sources,
        options: {
          ...f.input.options,
          ingress,
          work: trackedWork,
          identities: {
            ...f.input.options.identities,
            model: (_scope, _run, _attempt, position) => ({
              prepareKey: `tool-next:${position}`,
              originalPosition: `tool-next-position:${position}`,
              resultKey: `tool-next-result:${position}`,
              adoptionKey: `tool-next-adopt:${position}`,
              call: unwrap(parseOpaqueIdentifier(`tool-next-call:${position}`, 'ModelCallId')),
              creationKey: unwrap(
                parseOpaqueIdentifier(`tool-next-create:${position}`, 'CreationKey'),
              ),
            }),
            tool: (_scope, _run, _attempt, _position, call) => ({
              prepareKey: `native-driver:${call}`,
              originalPosition: `tool-runtime/1/${JSON.stringify(['execution_intended', call])}`,
              resultKey: `native-driver-result:${call}`,
              adoptionKey: `native-driver-adoption:${call}`,
            }),
          },
          tools: {
            acquire: async support => {
              tool = await driverNativeToolFixture({
                storage: f.f.storage,
                root: f.f.root,
                ingress: f.f.runtime,
                backing: f.f.log().backing,
                journal: f.borrowed.journal,
                history,
                call: calls[0]!.callId,
              })
              await startRunner()
              const acquired = await tool.factory.acquire(support)
              f.installToolResultSource(tool.custody!.source)
              return acquired
            },
          },
        },
      })
      try {
        expect(await task.completion).toBe(lostReturn === 'none' ? 'released' : 'retained')
        expect(tool!.author).toHaveBeenCalledOnce()
        expect(f.ports.sends()).toBe(lostReturn === 'none' ? 2 : 1)
        if (lostReturn === 'none') {
          expect(
            await f.f.runtime.readWork(f.f.runtime.coordinationAuthority, f.scope, 1),
          ).toMatchObject({ head: { run: { state: 'completed' } }, inputs: [] })
          const request = JSON.stringify(f.ports.sentRequests[1]!.messages)
          expect(request).toContain('actual driver native result')
          expect(request).not.toContain('attempt_started')
          expect(request).not.toContain('tools_adopted')
          expect(request).not.toContain('actions_completed')
          const next = workEvents.findIndex(event => event.startsWith('begin:tool-next-call:'))
          expect(next).toBeGreaterThan(0)
          expect(workEvents.indexOf(`complete:${f.prepared.preparation.call}`)).toBeGreaterThan(
            next,
          )
        }
        expect(store).toHaveBeenCalledOnce()
        expect(confirm).toHaveBeenCalledTimes(lostReturn === 'custody' ? 0 : 1)
        expect(await f.f.count('sr_tool_issue')).toEqual({ n: 1 })
        expect(await f.f.count('sr_tool_result')).toEqual({ n: 1 })
        expect(await f.f.count('sr_tool_delivery')).toEqual({ n: lostReturn === 'custody' ? 0 : 1 })
        expect(
          await f.f.runtime.toolResults.read(
            f.f.runtime.coordinationAuthority,
            f.scope,
            calls[0]!.callId,
            `native-driver-result:${calls[0]!.callId}`,
          ),
        ).toMatchObject({
          kind: 'alreadyCustodied',
          result: { stored: { result: { content: [{ text: 'actual driver native result' }] } } },
        })
        expect(
          await f.f.storage.atomic(unit =>
            f.work.readIn(unit, f.scope, f.prepared.preparation.run),
          ),
        ).toBe(lostReturn === 'none' ? 'unavailable' : 'pending')
        expect(f.releaseModel).toHaveBeenCalledTimes(lostReturn === 'none' ? 2 : 1)
        expect(await task.close()).toBe(lostReturn === 'none' ? 'released' : 'pending')
        expect(tool!.release).toHaveBeenCalledOnce()
        if (lostReturn === 'delivery') {
          expect(await f.f.runtime.toolDelivery.confirm(...confirm.mock.calls[0]!)).toHaveProperty(
            'kind',
            'alreadyConfirmed',
          )
          expect(f.ports.sends()).toBe(1)
          expect(tool!.author).toHaveBeenCalledOnce()
        }
        const finalPrefix = await f.f.runtime.journal.readPrefix(
          f.f.runtime.access,
          f.scope.session,
        )
        if (!('kind' in finalPrefix) || finalPrefix.kind !== 'prefix')
          throw new Error('actual completed prefix unavailable')
        expect(
          history.inspect(
            {
              scope: f.scope,
              ownerGeneration: finalPrefix.source.journalGeneration,
              entries: finalPrefix.entries,
              tail: finalPrefix.source.tail,
            },
            calls[0]!.callId,
          ),
        ).toMatchObject({
          kind: 'known',
          facts: { route: { kind: 'execution' } },
        })
      } finally {
        await tool?.close()
        await runner?.close()
      }
    },
  )
  it('reads an actual settled Model reply and rejects missing or duplicate provenance anchors', async () => {
    const f = await running()
    const task = createDriverModelRunTask(f.input)
    expect(await task.completion).toBe('released')
    const read = await f.f.runtime.journal.readPrefix(f.f.runtime.access, f.scope.session)
    if (!('kind' in read) || read.kind !== 'prefix') throw new Error('actual model prefix missing')
    const prefix = {
      scope: f.scope,
      ownerGeneration: read.source.journalGeneration,
      entries: read.entries,
      tail: read.source.tail,
    }
    const history = readDriverModelHistory(prefix)
    expect(history.replies.size).toBe(1)
    const reply = [...history.replies.values()][0]!
    expect(reply.message.response).toBe(reply.response.response!.id)
    expect(reply.created.run).toBe(f.prepared.preparation.run)
    expect(reply.dispatched.attempt).toEqual(f.prepared.preparation.attempt)
    const onlyMessage = { ...prefix, entries: [reply.entry] }
    expect(() => readDriverModelHistory(onlyMessage)).toThrow(DriverHistoryInvalid)
    expect(() =>
      readDriverModelHistory({
        ...prefix,
        entries: prefix.entries.filter(entry => entry.dedupeKey !== reply.created.dedupeKey),
      }),
    ).toThrow(DriverHistoryInvalid)
    expect(() =>
      readDriverModelHistory({
        ...prefix,
        entries: prefix.entries.filter(entry => entry.dedupeKey !== reply.dispatched.dedupeKey),
      }),
    ).toThrow(DriverHistoryInvalid)
    expect(() =>
      readDriverModelHistory({ ...prefix, entries: [...prefix.entries, reply.dispatched] }),
    ).toThrow(DriverHistoryInvalid)
    expect(() =>
      readDriverModelHistory({ ...prefix, entries: [...prefix.entries, reply.entry] }),
    ).toThrow(DriverHistoryInvalid)
  })
  it('persists the original adopted tool table before native Model IO, with no Tool permission from the fact', async () => {
    const f = await running()
    const task = createDriverModelRunTask(f.input)
    expect(await task.completion).toBe('released')
    const prefix = await f.f.runtime.journal.readPrefix(f.f.runtime.access, f.scope.session)
    if (!('kind' in prefix) || prefix.kind !== 'prefix') throw new Error('actual prefix missing')
    const adopted = prefix.entries.filter(entry => {
      const payload = checkLogPayload(entry.payload)
      return 'payload' in payload && payload.payload.owner === sessionToolActionOwner
    })
    expect(adopted).toHaveLength(1)
    const inspected = inspectSessionToolAdoption(f.scope, adopted[0]!)
    expect(inspected).toMatchObject({
      kind: 'adoption',
      adoption: {
        kind: 'tools_adopted',
        call: f.prepared.preparation.call,
        run: f.prepared.preparation.run,
        attempt: f.prepared.preparation.attempt,
        tools: [],
      },
    })
    const model = createModelLogReadInspector({
      ...f.scope,
      prefix: { entries: prefix.entries, tail: prefix.source.tail },
    })
    if (!('ok' in model)) throw new Error('actual Model provenance unavailable')
    const creation = model.ok.entries.find(
      item => item.captured.record?.kind === 'model_call_created',
    )
    expect(creation).toBeDefined()
    expect(compareInteger(adopted[0]!.position, creation!.entry.position)).toBeLessThan(0)
    expect(f.ports.sends()).toBe(1)
    expect(writeJsonLossless(f.ports.sentRequests)).not.toContain(sessionToolActionOwner)
    expect(
      inspectSessionToolAdoption(f.scope, {
        ...adopted[0]!,
        payload: { ...(adopted[0]!.payload as object), version: 'unknown' },
      }),
    ).toEqual({ failure: 'invalidInput' })
    expect(
      inspectSessionToolAdoption(
        {
          ...f.scope,
          session: unwrap(parseOpaqueIdentifier('foreign-adoption-session', 'SessionRef')),
        },
        adopted[0]!,
      ),
    ).toEqual({ failure: 'invalidInput' })
    expect(
      inspectSessionToolAdoption(f.scope, { ...adopted[0]!, dedupeKey: 'another-call-adoption' }),
    ).toEqual({ failure: 'invalidInput' })
    expect(await task.close()).toBe('released')
  })
  it('retains an unconfirmed original tool adoption with zero Model IO, then recognizes only its exact snapshot', async () => {
    const f = await running()
    let lost = false
    const originalBorrow = f.f.runtime.runJournal.borrow
    const borrow: typeof originalBorrow = async (...args) => {
      const result = await originalBorrow(...args)
      if (!('journal' in result)) return result
      const original = result.journal
      return {
        journal: {
          ...original,
          log: {
            ...original.log,
            append: async (...input) => {
              const result = await original.log.append(...input)
              const adoption = input[1].some(entry => {
                const value = checkLogPayload(entry.payload)
                return 'payload' in value && value.payload.owner === sessionToolActionOwner
              })
              if (adoption && 'positions' in result && !lost) {
                lost = true
                return { failure: 'unavailable' }
              }
              return result
            },
          },
        },
      }
    }
    const task = createDriverModelRunTask({
      ...f.input,
      options: {
        ...f.input.options,
        ingress: {
          ...f.f.runtime,
          runJournal: { borrow },
        },
      },
    })
    expect(await task.completion).toBe('retained')
    expect(lost).toBe(true)
    expect(await task.close()).toBe('pending')
    expect(f.ports.sends()).toBe(0)
    expect(f.native.executionSource.snapshot(f.scope.session)).toEqual([])
    const report = await f.sources.registry.refreshAvailability(
      f.scope.session,
      { kind: 'start', runId: f.prepared.preparation.run },
      f.prepared.preparation.attempt,
    )
    if (!('report' in report)) throw new Error('actual original report unavailable')
    const request = {
      scope: f.scope,
      log: f.borrowed.journal.log,
      preparation: f.prepared.preparation,
      report: report.report,
      entries: [],
      inputs: f.sources.evaluation,
    }
    const recognized = await persistDriverToolAdoption(request)
    expect(recognized).toHaveProperty('adoption')
    expect(
      await persistDriverToolAdoption({
        ...request,
        report: {
          ...request.report,
          computedAt: unwrap(instantFromRfc3339('2026-10-08T00:00:01Z')),
        },
      }),
    ).toEqual({ unavailable: true })
    const prefix = await f.borrowed.journal.readPrefix()
    if ('failure' in prefix) throw new Error('actual adopted prefix missing')
    expect(
      prefix.entries.filter(entry => 'adoption' in inspectSessionToolAdoption(f.scope, entry)),
    ).toHaveLength(1)
    expect(f.ports.sends()).toBe(0)
    expect(await f.f.runtime.readWork(f.f.runtime.coordinationAuthority, f.scope, 1)).toMatchObject(
      { head: { run: { state: 'runnable' } } },
    )
  })
  it('uses Agent Loop, original native issue, custody, settlement and ACK before actual Run finish and return', async () => {
    const f = await running()
    const task = createDriverModelRunTask(f.input)
    expect(await task.completion).toBe('released')
    expect(await task.close()).toBe('released')
    expect(f.ports.sends()).toBe(1)
    expect(f.sources.release).toHaveBeenCalledOnce()
    expect(f.releaseModel).toHaveBeenCalledOnce()
    expect(f.borrowed.journal.currentGeneration()).toBeNull()
    expect(await f.f.count('sr_model_issue')).toEqual({ n: 1 })
    expect(await f.f.count('sr_model_result')).toEqual({ n: 1 })
    expect(await f.f.count('sr_result_adoption')).toEqual({ n: 1 })
    const state = await f.f.runtime.readWork(f.f.runtime.coordinationAuthority, f.scope, 1)
    expect(state).toMatchObject({
      kind: 'work',
      inputs: [],
      head: { run: { id: f.prepared.preparation.run, state: 'completed' } },
    })
    const snapshot = f.native.executionSource.snapshot(f.scope.session)
    expect(snapshot).toHaveLength(1)
    expect(snapshot[0]!.copyReleased).toBe(true)
  })
  it('withdraws local waits while the exact original native job remains owned, then finishes after its actual ACK', async () => {
    const entered = Promise.withResolvers<void>(),
      returned = Promise.withResolvers<void>()
    const f = await running({ entered: entered.resolve, wait: returned.promise })
    runResources.push(async () => returned.resolve())
    const task = createDriverModelRunTask(f.input)
    await entered.promise
    task.requestStop()
    expect(await task.close()).toBe('pending')
    expect(f.sources.release).not.toHaveBeenCalled()
    expect(f.releaseModel).not.toHaveBeenCalled()
    expect(f.borrowed.journal.currentGeneration()).not.toBeNull()
    expect(f.native.executionSource.snapshot(f.scope.session)[0]!.copyReleased).toBe(false)
    expect(await f.f.runtime.readWork(f.f.runtime.coordinationAuthority, f.scope, 1)).toMatchObject(
      { head: { run: { state: 'runnable' } } },
    )
    returned.resolve()
    expect(await task.completion).toBe('released')
    expect(await task.close()).toBe('released')
    expect(f.ports.sends()).toBe(1)
    expect(f.releaseModel).toHaveBeenCalledOnce()
    expect(f.native.executionSource.snapshot(f.scope.session)[0]!.copyReleased).toBe(true)
  })
  it('retains the original completed Run borrow on return failure and retries that return without model redispatch', async () => {
    const f = await running()
    const defect = new Error('original source return failure')
    vi.mocked(f.sources.release).mockRejectedValueOnce(defect)
    const task = createDriverModelRunTask(f.input)
    await expect(task.completion).rejects.toBe(defect)
    expect(f.releaseModel).toHaveBeenCalledOnce()
    expect(f.borrowed.journal.currentGeneration()).not.toBeNull()
    expect(await task.close()).toBe('released')
    expect(await task.close()).toBe('released')
    expect(f.sources.release).toHaveBeenCalledTimes(2)
    expect(f.releaseModel).toHaveBeenCalledOnce()
    expect(f.ports.sends()).toBe(1)
    expect(f.borrowed.journal.currentGeneration()).toBeNull()
  })
  it('starts the next queued round with another actual Run only after the previous Run and its borrows finish', async () => {
    const f = await running()
    const first = createDriverModelRunTask(f.input)
    expect(await first.completion).toBe('released')
    const identities = driverIdentityFixture()
    identities.run.mockReturnValue({ startKey: 'driver-run-2', attemptKey: 'driver-attempt-2' })
    identities.model.mockReturnValue({
      prepareKey: 'driver-model-prepare-2',
      originalPosition: 'driver-model-position-2',
      resultKey: 'driver-model-result-2',
      adoptionKey: 'driver-model-adopt-2',
      call: unwrap(parseOpaqueIdentifier('driver-model-call-2', 'ModelCallId')),
      creationKey: unwrap(parseOpaqueIdentifier('driver-model-create-2', 'CreationKey')),
    })
    expect(
      await f.f.runtime.operations.submitInput(
        f.f.runtime.access,
        f.scope.session,
        'driver-round-2',
        user('Second round', 'driver-round-2'),
      ),
    ).toMatchObject({ kind: 'accepted' })
    const acquire = vi.fn<LocalSessionDriverOptions['sources']['acquire']>(
      async (scope, journal) => {
        expect(scope).toEqual(f.scope)
        expect(journal.scope).toEqual(f.scope)
        expect(journal.run).not.toBe(f.prepared.preparation.run)
        return sourcesForRun(f, journal)
      },
    )
    const task = createDriverRunTask(
      {
        ...f.input.options,
        identities: { ...identities, modelContent: f.input.options.identities.modelContent },
        sources: { acquire },
      },
      f.scope,
    )
    expect(await task.completion).toBe('released')
    expect(await task.close()).toBe('released')
    expect(acquire).toHaveBeenCalledOnce()
    expect(f.ports.sends()).toBe(2)
    expect(f.ports.sentRequests[1]!.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'user' }),
        expect.objectContaining({ type: 'assistant' }),
      ]),
    )
    expect(f.releaseModel).toHaveBeenCalledTimes(2)
    expect(f.sources.release).toHaveBeenCalledTimes(2)
    expect(acquire.mock.calls[0]![1].currentGeneration()).toBeNull()
    expect(await f.f.count('sr_model_result')).toEqual({ n: 2 })
    expect(await f.f.count('sr_result_adoption')).toEqual({ n: 2 })
    expect(
      f.native.executionSource.snapshot(f.scope.session).every(execution => execution.copyReleased),
    ).toBe(true)
  })
  it('adopts an input received during native IO in the same original Run before the next model call and finish', async () => {
    const entered = Promise.withResolvers<void>(),
      returned = Promise.withResolvers<void>()
    const f = await running({ entered: entered.resolve, wait: returned.promise })
    runResources.push(async () => returned.resolve())
    const model: LocalSessionDriverOptions['identities']['model'] = (
      _scope,
      _run,
      _attempt,
      position,
    ) => ({
      prepareKey: `continue-prepare:${position}`,
      originalPosition: `continue-position:${position}`,
      resultKey: `continue-result:${position}`,
      adoptionKey: `continue-adopt:${position}`,
      call: unwrap(parseOpaqueIdentifier(`continue-call:${position}`, 'ModelCallId')),
      creationKey: unwrap(parseOpaqueIdentifier(`continue-create:${position}`, 'CreationKey')),
    })
    const probes = f.f.probe.mock.calls.length
    const task = createDriverModelRunTask({
      ...f.input,
      options: { ...f.input.options, identities: { ...f.input.options.identities, model } },
    })
    await entered.promise
    expect(
      await f.f.runtime.operations.submitInput(
        f.f.runtime.access,
        f.scope.session,
        'during-model',
        user('New input during model IO', 'during-model'),
      ),
    ).toMatchObject({ kind: 'accepted' })
    returned.resolve()
    expect(await task.completion).toBe('released')
    expect(await task.close()).toBe('released')
    expect(f.ports.sends()).toBe(2)
    expect(f.f.probe.mock.calls.length).toBe(probes)
    expect(f.sources.release).toHaveBeenCalledOnce()
    expect(f.releaseModel).toHaveBeenCalledTimes(2)
    expect(f.ports.sentRequests[1]!.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'assistant' }),
        expect.objectContaining({
          type: 'user',
          blocks: expect.arrayContaining([
            expect.objectContaining({ text: 'New input during model IO' }),
          ]),
        }),
      ]),
    )
    const state = await f.f.runtime.readWork(f.f.runtime.coordinationAuthority, f.scope, 2)
    expect(state).toMatchObject({
      kind: 'work',
      inputs: [],
      head: { run: { id: f.prepared.preparation.run, state: 'completed' } },
    })
    const prefix = await f.f.runtime.journal.readPrefix(f.f.runtime.access, f.scope.session)
    if (!('kind' in prefix) || prefix.kind !== 'prefix')
      throw new Error('actual final prefix missing')
    const facts = prefix.entries.flatMap(entry => {
      const read = readSessionFact(entry)
      return 'fact' in read ? [read.fact] : []
    })
    expect(facts.filter(fact => fact.kind === 'run_started')).toHaveLength(1)
    expect(facts.filter(fact => fact.kind === 'attempt_started')).toHaveLength(1)
    expect(facts.filter(fact => fact.kind === 'input_adopted')).toHaveLength(1)
    expect(facts.filter(fact => fact.kind === 'call_prepared')).toHaveLength(2)
    expect(
      f.native.executionSource.snapshot(f.scope.session).every(execution => execution.copyReleased),
    ).toBe(true)
  })
  function driverOptions(f: Awaited<ReturnType<typeof running>>): LocalSessionDriverOptions {
    return {
      ...f.input.options,
      tenant,
      clock: { now: async () => unwrap(instantFromRfc3339(at)) },
      policy: {
        scanLimit: 4,
        intervalMs: 20,
        maxTasks: 2,
        maxHeld: 4,
        maxFailures: 4,
        maxStepsPerPass: 4,
      },
      sources: { acquire: async (_scope, journal) => sourcesForRun(f, journal) },
      tools: {
        acquire: async () => {
          throw new Error('ordinary model reply must not borrow tools')
        },
      },
      diagnostic: vi.fn(),
    }
  }
  it.each(['function', 'cordis'] as const)(
    'public $0 driver scans durable work and independently completes the next normal Model Run',
    async entry => {
      const f = await running()
      expect(await createDriverModelRunTask(f.input).completion).toBe('released')
      const identities = driverIdentityFixture()
      identities.run.mockReturnValue({ startKey: 'public-run-2', attemptKey: 'public-attempt-2' })
      identities.model.mockReturnValue({
        prepareKey: 'public-model-prepare-2',
        originalPosition: 'public-model-position-2',
        resultKey: 'public-model-result-2',
        adoptionKey: 'public-model-adopt-2',
        call: unwrap(parseOpaqueIdentifier('public-model-call-2', 'ModelCallId')),
        creationKey: unwrap(parseOpaqueIdentifier('public-model-create-2', 'CreationKey')),
      })
      await f.f.runtime.operations.submitInput(
        f.f.runtime.access,
        f.scope.session,
        'public-input',
        user('Public next round', 'public-input'),
      )
      const options = driverOptions(f)
      const construction = {
        ...options,
        identities: { ...identities, modelContent: options.identities.modelContent },
      }
      let plugin: import('@deepseek-ai/cordis').Fiber | undefined
      let root: import('@deepseek-ai/cordis').Fiber | undefined
      let bound: import('@deepseek-ai/cordis').Fiber | undefined
      let original: import('@omne-harness-lite/session-runtime').SessionDriverControl | undefined
      let control: import('@omne-harness-lite/session-runtime').SessionDriverControl
      if (entry === 'function') {
        control = await createLocalSessionDriver(construction, new AbortController().signal)
      } else {
        const ctx = new Context()
        class Startup extends SessionDriverStartupService {
          readonly start: import('@omne-harness-lite/session-runtime').SessionDriverStartup['start'] =
            async (policy, signal) => {
              original = await createLocalSessionDriver({ ...construction, policy }, signal)
              return original
            }
        }
        root = ctx.plugin(
          definePlugin({
            name: 'actual-public-driver-root',
            Config: z.object({}).strict(),
            apply(inner) {
              new Startup(inner)
            },
          }),
          {},
        )
        await root
        bound = ctx.plugin(createLocalSessionIngressBinding(f.f.runtime), {})
        await bound
        expect(
          await ctx.get(SESSION_INGRESS)!.readSession(f.f.runtime.access, f.scope.session),
        ).toEqual(await f.f.runtime.operations.readSession(f.f.runtime.access, f.scope.session))
        expect(
          await ctx
            .get(SESSION_WORK_READING)!
            .readWork(Object.freeze({}) as typeof f.f.runtime.coordinationAuthority, f.scope, 1),
        ).toEqual({ failure: 'denied' })
        expect(ctx.get(SESSION_LIFECYCLE)).toBeDefined()
        const borrowed = await ctx
          .get(SESSION_RUN_JOURNAL)!
          .borrow(f.f.runtime.coordinationAuthority, f.scope, f.prepared.preparation.run)
        expect(borrowed).toHaveProperty('journal')
        if ('journal' in borrowed) await borrowed.journal.close()
        plugin = ctx.plugin(SessionDriver, options.policy)
        await plugin
        await vi.waitFor(() => expect(ctx.get(SESSION_DRIVER_CONTROL)).toBeDefined())
        control = ctx.get(SESSION_DRIVER_CONTROL)!
      }
      runResources.push(async () => {
        control.requestStop()
        expect(await control.close()).toEqual({ closed: true })
        await plugin?.dispose()
        await bound?.dispose()
        await root?.dispose()
      })
      await vi.waitFor(
        async () => {
          expect(f.ports.sends()).toBe(2)
          expect(
            await f.f.runtime.readWork(f.f.runtime.coordinationAuthority, f.scope, 1),
          ).toMatchObject({ head: { run: { state: 'completed' } }, inputs: [] })
          expect(f.sources.release).toHaveBeenCalledTimes(2)
        },
        { timeout: 10000, interval: 20 },
      )
      control.requestStop()
      expect(await control.close()).toEqual({ closed: true })
      if (entry === 'cordis') {
        await plugin!.dispose()
        await bound!.dispose()
        expect(await original!.close()).toEqual({ closed: true })
      }
      expect(options.diagnostic).not.toHaveBeenCalled()
      expect(
        f.native.executionSource.snapshot(f.scope.session).every(row => row.copyReleased),
      ).toBe(true)
      expect(
        await f.f.runtime.operations.readSession(f.f.runtime.access, f.scope.session),
      ).toHaveProperty('kind', 'session')
    },
  )
  it('public Cordis driver completes the actual native Tool round trip without caller turn execution', async () => {
    const checked = judgeMessage({
      id: 'public-tool-source',
      type: 'assistant',
      response: 'public-tool-response',
      ending: 'complete',
      createdAt: at,
      blocks: [
        {
          id: 'public-tool-block',
          callId: 'public-tool-call',
          kind: 'tool_call',
          tool: 'example__read',
          complete: true,
          arguments: {},
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    if (!('ok' in checked) || checked.ok.type !== 'assistant')
      throw new Error('controlled public Tool reply rejected')
    const calls: import('@omne-harness-lite/content-blocks').ToolCallBlock[] = []
    for (const block of checked.ok.blocks)
      if (block.kind === 'tool_call' && block.complete) calls.push(block)
    // This three-call prefix exceeded the original 64 KiB fixture budget (69,262 bytes).
    const f = await running(undefined, false, send => (send === 2 ? calls : []), 131072)
    expect(await createDriverModelRunTask(f.input).completion).toBe('released')
    const table = evaluatedDriverTool(),
      history = createSessionToolActionHistory({ readConclusions: readPassConclusions })
    let journal: import('../src/run-journal-types.ts').BorrowedRunJournal | undefined
    let runner: Awaited<ReturnType<ReturnType<typeof driverActionFixture>['open']>> | undefined
    let tool: Awaited<ReturnType<typeof driverNativeToolFixture>> | undefined
    let original: import('@omne-harness-lite/session-runtime').SessionDriverControl | undefined
    const options = driverOptions(f)
    const identities = {
      ...options.identities,
      run: () => ({ startKey: 'public-tool-run', attemptKey: 'public-tool-attempt' }),
      model: (
        _scope: SessionScope,
        _run: string,
        _attempt: import('@omne-harness-lite/call-accounts').AttemptId,
        position: import('@omne-harness-lite/content-blocks').JsonNumber,
      ) => ({
        prepareKey: `public-tool-model:${position}`,
        originalPosition: `public-tool-model-position:${position}`,
        resultKey: `public-tool-model-result:${position}`,
        adoptionKey: `public-tool-model-adopt:${position}`,
        call: unwrap(parseOpaqueIdentifier(`public-tool-model-call:${position}`, 'ModelCallId')),
        creationKey: unwrap(
          parseOpaqueIdentifier(`public-tool-model-create:${position}`, 'CreationKey'),
        ),
      }),
      tool: (
        _scope: SessionScope,
        _run: string,
        _attempt: import('@omne-harness-lite/call-accounts').AttemptId,
        _position: import('@omne-harness-lite/content-blocks').JsonNumber,
        call: import('@omne-harness-lite/content-blocks').CallId,
      ) => ({
        prepareKey: `public-native:${call}`,
        originalPosition: `tool-runtime/1/${JSON.stringify(['execution_intended', call])}`,
        resultKey: `public-native-result:${call}`,
        adoptionKey: `public-native-adopt:${call}`,
      }),
    }
    const sources: LocalSessionDriverOptions['sources'] = {
      acquire: async (_scope, current) => {
        journal = current
        return toolSources(await sourcesForRun(f, current), table, {
          actions: () => {
            if (!runner) throw new Error('actual public Runner not acquired')
            return runner.actions
          },
          access: () => {
            if (!tool) throw new Error('actual public Tool not acquired')
            return tool.access
          },
        })
      },
    }
    const tools: LocalSessionDriverOptions['tools'] = {
      acquire: async support => {
        if (!journal) throw new Error('actual public Run not acquired')
        const read = await journal.readPrefix()
        if ('failure' in read) throw new Error('actual public batch unavailable')
        const prefix = {
          scope: f.scope,
          ownerGeneration: read.source.journalGeneration,
          entries: read.entries,
          tail: read.tail,
        }
        const reply = [...readDriverModelHistory(prefix).replies.values()].find(value =>
          value.message.blocks.some(block => block.kind === 'tool_call'),
        )
        if (!reply) throw new Error('actual public Tool reply absent')
        const found = readDriverToolBatch(prefix, reply.message.id)
        if (found.kind !== 'batch') throw new Error('actual public Tool batch absent')
        runner = await driverActionFixture(journal, found.batch).open()
        tool = await driverNativeToolFixture({
          storage: f.f.storage,
          root: f.f.root,
          ingress: f.f.runtime,
          backing: f.f.log().backing,
          journal,
          history,
          call: calls[0]!.callId,
        })
        const borrowed = await tool.factory.acquire(support)
        f.installToolResultSource(tool.custody!.source)
        return borrowed
      },
    }
    const ctx = new Context()
    class Startup extends SessionDriverStartupService {
      readonly start: import('@omne-harness-lite/session-runtime').SessionDriverStartup['start'] =
        async (policy, signal) => {
          original = await createLocalSessionDriver(
            { ...options, identities, sources, tools, policy },
            signal,
          )
          return original
        }
    }
    const root = ctx.plugin(
      definePlugin({
        name: 'actual-public-tool-root',
        Config: z.object({}).strict(),
        apply(inner) {
          new Startup(inner)
        },
      }),
      {},
    )
    await root
    const bound = ctx.plugin(createLocalSessionIngressBinding(f.f.runtime), {})
    await bound
    expect(
      await ctx
        .get(SESSION_INGRESS)!
        .submitInput(
          f.f.runtime.access,
          f.scope.session,
          'public-tool-input',
          user('Use the Tool', 'public-tool-input'),
        ),
    ).toHaveProperty('kind', 'accepted')
    const plugin = ctx.plugin(SessionDriver, options.policy)
    await plugin
    try {
      await vi.waitFor(
        async () => {
          expect(f.ports.sends()).toBe(3)
          expect(
            await ctx
              .get(SESSION_WORK_READING)!
              .readWork(f.f.runtime.coordinationAuthority, f.scope, 1),
          ).toMatchObject({ head: { run: { state: 'completed' } }, inputs: [] })
          expect(f.sources.release).toHaveBeenCalledTimes(2)
        },
        { timeout: 15000, interval: 20 },
      )
      expect(tool!.author).toHaveBeenCalledOnce()
      expect(await f.f.count('sr_tool_result')).toEqual({ n: 1 })
      expect(await f.f.count('sr_tool_delivery')).toEqual({ n: 1 })
      expect(JSON.stringify(f.ports.sentRequests[2]!.messages)).toContain(
        'actual driver native result',
      )
      expect(options.diagnostic).not.toHaveBeenCalled()
      expect(tool!.release).toHaveBeenCalledOnce()
      await plugin.dispose()
      expect(await original!.close()).toEqual({ closed: true })
      expect(
        f.native.executionSource.snapshot(f.scope.session).every(row => row.copyReleased),
      ).toBe(true)
    } finally {
      original?.requestStop()
      await plugin.dispose()
      await original?.close()
      await bound.dispose()
      await root.dispose()
      await tool?.close()
      await runner?.close()
    }
  })
  it('public driver refuses new Model IO after an actual SQLite call-preparation failure and retains the original Run', async () => {
    const f = await running()
    expect(await createDriverModelRunTask(f.input).completion).toBe('released')
    expect(f.ports.sends()).toBe(1)
    const options = driverOptions(f),
      acquire = vi.fn(options.model.factory.acquire)
    const identities = driverIdentityFixture()
    identities.run.mockReturnValue({
      startKey: 'sql-rejected-run',
      attemptKey: 'sql-rejected-attempt',
    })
    identities.model.mockReturnValue({
      prepareKey: 'sql-rejected-prepare',
      originalPosition: 'sql-rejected-position',
      resultKey: 'sql-rejected-result',
      adoptionKey: 'sql-rejected-adopt',
      call: unwrap(parseOpaqueIdentifier('sql-rejected-call', 'ModelCallId')),
      creationKey: unwrap(parseOpaqueIdentifier('sql-rejected-create', 'CreationKey')),
    })
    const sql = new DatabaseSync(join(f.f.root, 'tenant.sqlite'))
    sql.exec(
      "CREATE TRIGGER reject_model_prepare BEFORE INSERT ON sr_call_preparation BEGIN SELECT RAISE(ABORT, 'controlled actual SQL prepare rejection'); END",
    )
    expect(
      await f.f.runtime.operations.submitInput(
        f.f.runtime.access,
        f.scope.session,
        'sql-rejected-model-input',
        user('Do not lose this input', 'sql-rejected-model-input'),
      ),
    ).toHaveProperty('kind', 'accepted')
    const control = await createLocalSessionDriver(
      {
        ...options,
        identities: { ...identities, modelContent: options.identities.modelContent },
        model: { ...options.model, factory: { ...options.model.factory, acquire } },
      },
      new AbortController().signal,
    )
    try {
      await vi.waitFor(() => expect(options.diagnostic).toHaveBeenCalledOnce(), { timeout: 10000 })
      expect(f.ports.sends()).toBe(1)
      expect(acquire).not.toHaveBeenCalled()
      expect(await f.f.count('sr_call_preparation')).toEqual({ n: 1 })
      expect(await f.f.count('sr_model_issue')).toEqual({ n: 1 })
      const work = await options.ingress.readWork(options.ingress.coordinationAuthority, f.scope, 1)
      expect(work).toMatchObject({ kind: 'work', head: { run: { state: 'runnable' } } })
      await expect(control.close()).rejects.toBeInstanceOf(AggregateError)
      expect(
        f.native.executionSource.snapshot(f.scope.session).every(row => row.copyReleased),
      ).toBe(true)
    } finally {
      control.requestStop()
      await control.close().catch(() => undefined)
      sql.exec('DROP TRIGGER reject_model_prepare')
      sql.close()
    }
  })
  it('public driver aborted before startup does not scan, acquire or consume persistent input', async () => {
    const f = await running()
    const signal = new AbortController()
    signal.abort()
    const scan = vi.fn(f.f.runtime.scanWork),
      options = driverOptions(f)
    const control = await createLocalSessionDriver(
      { ...options, ingress: { ...f.f.runtime, scanWork: scan } },
      signal.signal,
    )
    expect(await control.close()).toEqual({ closed: true })
    expect(scan).not.toHaveBeenCalled()
    expect(f.ports.sends()).toBe(0)
    expect(await f.f.count('sr_model_issue')).toEqual({ n: 0 })
  })
  it('public driver retains original scan and diagnostic failures without reporting a closed owner', async () => {
    const f = await running(),
      options = driverOptions(f)
    const fault = new Error('actual scan owner defect'),
      reportFault = new Error('actual diagnostic defect')
    const scan = vi.fn<typeof f.f.runtime.scanWork>(async () => {
      throw fault
    })
    const diagnostic = vi.fn(() => {
      throw reportFault
    })
    const control = await createLocalSessionDriver(
      { ...options, ingress: { ...f.f.runtime, scanWork: scan }, diagnostic },
      new AbortController().signal,
    )
    await vi.waitFor(() => expect(diagnostic).toHaveBeenCalledWith(fault))
    try {
      await control.close()
      throw new Error('failed driver must not close successfully')
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError)
      if (!(error instanceof AggregateError)) throw error
      expect(error.errors).toEqual(expect.arrayContaining([fault, reportFault]))
    }
    expect(scan).toHaveBeenCalledOnce()
    expect(f.ports.sends()).toBe(0)
  })
  it('public driver refuses unavailable Clock before reading or launching Session work', async () => {
    const f = await running(),
      options = driverOptions(f)
    const scan = vi.fn(f.f.runtime.scanWork),
      diagnostic = vi.fn()
    const control = await createLocalSessionDriver(
      {
        ...options,
        clock: { now: async () => 'unavailable' },
        ingress: { ...f.f.runtime, scanWork: scan },
        diagnostic,
      },
      new AbortController().signal,
    )
    await vi.waitFor(() => expect(diagnostic).toHaveBeenCalledOnce())
    await expect(control.close()).rejects.toThrow('Session driver failed')
    expect(scan).not.toHaveBeenCalled()
    expect(f.ports.sends()).toBe(0)
  })
  it('public driver waits for the actual in-flight scan before declaring close', async () => {
    const f = await running(),
      options = driverOptions(f)
    const entered = Promise.withResolvers<void>(),
      returned = Promise.withResolvers<void>()
    const scan: typeof f.f.runtime.scanWork = async (...args) => {
      entered.resolve()
      await returned.promise
      return f.f.runtime.scanWork(...args)
    }
    const control = await createLocalSessionDriver(
      { ...options, ingress: { ...f.f.runtime, scanWork: scan } },
      new AbortController().signal,
    )
    runResources.push(async () => {
      returned.resolve()
      await control.close()
    })
    await entered.promise
    let closed = false
    const closing = control.close().then(result => {
      closed = true
      return result
    })
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(closed).toBe(false)
    returned.resolve()
    expect(await closing).toEqual({ closed: true })
    expect(f.ports.sends()).toBe(0)
    expect(f.sources.release).not.toHaveBeenCalled()
  })
  async function actualContext(f: Awaited<ReturnType<typeof running>>) {
    for (const fragment of runtimeContextMigrations)
      await f.f.storage.write(tx => fragment.migration.up(tx.db))
    const host = createLocalSessionContext({
      scope: f.scope,
      storage: f.f.storage,
      logBacking: f.f.log().backing,
      access: { authorize: async () => ({ kind: 'rejected', reason: 'notAuthorized' }) },
      clock: { now: async () => unwrap(instantFromRfc3339(at)) },
    })
    runResources.push(async () => {
      host.requestStop()
      expect(await host.closed).toMatchObject({ complete: true })
    })
    const context = await host.ready
    expect(
      await host.initializer.initializeContextSession(f.scope, {
        required: [],
        initial: [],
        fixed: [],
      }),
    ).toMatchObject({ kind: 'applied' })
    const sources: SessionDriverRunSources = Object.create(f.sources, {
      context: { value: context },
      contextGeneration: { value: host.currentGeneration },
      projection: {
        value: {
          ...f.sources.projection,
          options: {
            factReaders: new Map<string, FactReader>([
              [
                'runtime-context',
                (_value, entry) =>
                  'event' in inspectContextLogEntry(f.scope, entry) ? 'valid' : 'invalid',
              ],
            ]),
          },
        },
      },
    })
    return { host, sources }
  }
  it('consumes the actual isolated Cordis Context generation and returns borrows without stopping that Context', async () => {
    const f = await running()
    const { host, sources } = await actualContext(f)
    const generation = host.currentGeneration()
    expect(generation).toEqual(expect.any(String))
    const task = createDriverModelRunTask({ ...f.input, sources })
    expect(await task.completion).toBe('released')
    expect(await task.close()).toBe('released')
    expect(f.ports.sends()).toBe(1)
    expect(host.currentGeneration()).toBe(generation)
    expect(f.native.executionSource.snapshot(f.scope.session)[0]!.copyReleased).toBe(true)
  })
  it('requires the actual Context fact reader before projecting its journal into a model request', async () => {
    const f = await running()
    const { sources } = await actualContext(f)
    const withoutCodec: SessionDriverRunSources = Object.create(sources, {
      projection: { value: f.sources.projection },
    })
    const task = createDriverModelRunTask({ ...f.input, sources: withoutCodec })
    expect(await task.completion).toBe('retained')
    expect(await task.close()).toBe('pending')
    expect(f.ports.sends()).toBe(0)
    expect(await f.f.count('sr_model_issue')).toEqual({ n: 0 })
    expect(f.sources.release).not.toHaveBeenCalled()
  })
  it('blocks original Model IO when the actual Session Context has withdrawn its generation', async () => {
    const f = await running()
    const { host, sources } = await actualContext(f)
    host.requestStop()
    expect(host.currentGeneration()).toBeNull()
    const task = createDriverModelRunTask({ ...f.input, sources })
    expect(await task.completion).toBe('retained')
    expect(await task.close()).toBe('pending')
    expect(f.ports.sends()).toBe(0)
    expect(await f.f.count('sr_model_issue')).toEqual({ n: 0 })
    expect(f.sources.release).not.toHaveBeenCalled()
    expect(await host.closed).toMatchObject({ complete: true })
  })
  it.each(['custody', 'adoption'] as const)(
    'retains an unknown complete-result %s and recognizes its original bytes without ACK or redispatch',
    async stage => {
      const f = await running()
      const source = f.input.options.model.results
      let captured: Awaited<ReturnType<typeof source.capture>> | undefined
      const capture: typeof source.capture = async (...args) => {
        captured = await source.capture(...args)
        return captured
      }
      const loseNextWrite = () => {
        const write = f.f.storage.write.bind(f.f.storage)
        vi.spyOn(f.f.storage, 'write').mockImplementationOnce(async (...writeArgs) => {
          await write(...writeArgs)
          throw new StorageUnavailable(`actual driver complete-result ${stage} return lost`)
        })
      }
      const store: typeof f.f.runtime.modelResults.store = async (...args) => {
        if (stage === 'custody') loseNextWrite()
        return f.f.runtime.modelResults.store(...args)
      }
      const commitStep: typeof f.f.runtime.lifecycle.commitStep = async (...args) => {
        if (stage === 'adoption' && args[3].kind === 'adoptResult') loseNextWrite()
        return f.f.runtime.lifecycle.commitStep(...args)
      }
      const task = createDriverModelRunTask({
        ...f.input,
        options: {
          ...f.input.options,
          ingress: {
            ...f.f.runtime,
            modelResults: { ...f.f.runtime.modelResults, store },
            lifecycle: { commitStep },
          },
          model: { ...f.input.options.model, results: { ...source, capture } },
        },
      })
      expect(await task.completion).toBe('retained')
      expect(await task.close()).toBe('pending')
      expect(f.ports.sends()).toBe(1)
      expect(await f.f.count('sr_model_result')).toEqual({ n: 1 })
      expect(f.native.executionSource.snapshot(f.scope.session)[0]!.copyReleased).toBe(false)
      expect(f.sources.release).not.toHaveBeenCalled()
      expect(f.releaseModel).not.toHaveBeenCalled()
      expect(source.close()).toEqual({ pending: true })
      if (!captured || !('captured' in captured))
        throw new Error('actual original result capture missing')
      const saved = await f.f.runtime.modelResults.read(
        f.f.runtime.coordinationAuthority,
        f.scope,
        f.prepared.preparation.call,
        f.prepared.identities.resultKey,
      )
      expect(saved).toMatchObject({ kind: 'alreadyCustodied', pending: captured.captured.pending })
      if (stage === 'custody')
        expect(await source.release(captured.captured)).toEqual({ pending: true })
      expect(
        await source.confirmCustody(
          captured.captured,
          f.f.runtime,
          f.prepared.identities.resultKey,
        ),
      ).toEqual({ confirmed: true })
      // Return only this recognized observation. This does not settle the original reply or ACK it.
      expect(await source.release(captured.captured)).toEqual({ released: true })
      expect(source.close()).toEqual({ released: true })
      expect(await task.close()).toBe('pending')
      expect(f.native.executionSource.snapshot(f.scope.session)[0]!.copyReleased).toBe(false)
      expect(f.ports.sends()).toBe(1)
      expect(await f.f.count('sr_model_result')).toEqual({ n: 1 })
      expect(
        await f.f.runtime.readWork(f.f.runtime.coordinationAuthority, f.scope, 1),
      ).toMatchObject({ head: { run: { state: 'runnable' } } })
    },
  )
  it('retains both original-issue uncertainty and the original native turn without claiming ACK or launching IO', async () => {
    const f = await running(undefined, true)
    const admit: typeof f.f.runtime.modelInvocation.admit = async (...args) => {
      const actual = await f.f.runtime.modelInvocation.admit(...args)
      if (!('kind' in actual) || actual.kind !== 'issued')
        throw new Error('actual original issue missing before lost return')
      return {
        kind: 'unknownCommit',
        scope: f.scope,
        call: args[3].call,
        originalPosition: args[3].originalPosition,
      }
    }
    const task = createDriverModelRunTask({
      ...f.input,
      options: { ...f.input.options, ingress: { ...f.f.runtime, modelInvocation: { admit } } },
    })
    expect(await task.completion).toBe('retained')
    expect(await task.close()).toBe('pending')
    expect(f.ports.sends()).toBe(0)
    expect(f.sources.release).not.toHaveBeenCalled()
    expect(f.releaseModel).not.toHaveBeenCalled()
    expect(await f.f.count('sr_model_issue')).toEqual({ n: 1 })
    expect(await f.f.count('mr_original_issue')).toEqual({ n: 1 })
    expect(await f.f.count('sr_model_result')).toEqual({ n: 0 })
    expect(await f.f.runtime.readWork(f.f.runtime.coordinationAuthority, f.scope, 1)).toMatchObject(
      { head: { run: { state: 'runnable' } } },
    )
  })
  it('retains queued input after withdrawal and does not adopt or launch another model segment', async () => {
    const entered = Promise.withResolvers<void>(),
      returned = Promise.withResolvers<void>()
    const f = await running({ entered: entered.resolve, wait: returned.promise })
    runResources.push(async () => returned.resolve())
    const next = vi.fn<LocalSessionDriverOptions['identities']['model']>(() => {
      throw new Error('withdrawn task must not create another invocation')
    })
    const task = createDriverModelRunTask({
      ...f.input,
      options: { ...f.input.options, identities: { ...f.input.options.identities, model: next } },
    })
    await entered.promise
    await f.f.runtime.operations.submitInput(
      f.f.runtime.access,
      f.scope.session,
      'stop-pending',
      user('Keep pending after withdrawal', 'stop-pending'),
    )
    task.requestStop()
    expect(await task.close()).toBe('pending')
    returned.resolve()
    expect(await task.completion).toBe('retained')
    expect(await task.close()).toBe('pending')
    expect(next).not.toHaveBeenCalled()
    expect(f.ports.sends()).toBe(1)
    expect(f.native.executionSource.snapshot(f.scope.session)[0]!.copyReleased).toBe(true)
    expect(f.releaseModel).toHaveBeenCalledOnce()
    expect(f.sources.release).not.toHaveBeenCalled()
    expect(await f.f.count('sr_pending_input')).toEqual({ n: 1 })
    expect(await f.f.runtime.readWork(f.f.runtime.coordinationAuthority, f.scope, 2)).toMatchObject(
      { head: { run: { id: f.prepared.preparation.run, state: 'runnable' } } },
    )
  })
  it('re-reads a finish/input race and adopts the actual queued input without redispatching the completed call', async () => {
    const f = await running()
    let inserted = false
    const commitStep: typeof f.f.runtime.lifecycle.commitStep = async (...args) => {
      if (args[3].kind === 'finish' && !inserted) {
        inserted = true
        expect(
          await f.f.runtime.operations.submitInput(
            f.f.runtime.access,
            f.scope.session,
            'finish-race',
            user('Arrival before finish commit', 'finish-race'),
          ),
        ).toMatchObject({ kind: 'accepted' })
      }
      return f.f.runtime.lifecycle.commitStep(...args)
    }
    const model: LocalSessionDriverOptions['identities']['model'] = (
      _scope,
      _run,
      _attempt,
      position,
    ) => ({
      prepareKey: `race-prepare:${position}`,
      originalPosition: `race-position:${position}`,
      resultKey: `race-result:${position}`,
      adoptionKey: `race-adopt:${position}`,
      call: unwrap(parseOpaqueIdentifier(`race-call:${position}`, 'ModelCallId')),
      creationKey: unwrap(parseOpaqueIdentifier(`race-create:${position}`, 'CreationKey')),
    })
    const task = createDriverModelRunTask({
      ...f.input,
      options: {
        ...f.input.options,
        ingress: { ...f.f.runtime, lifecycle: { commitStep } },
        identities: { ...f.input.options.identities, model },
      },
    })
    expect(await task.completion).toBe('released')
    expect(await task.close()).toBe('released')
    expect(f.ports.sends()).toBe(2)
    expect(f.sources.release).toHaveBeenCalledOnce()
    expect(f.releaseModel).toHaveBeenCalledTimes(2)
    expect(await f.f.count('sr_model_issue')).toEqual({ n: 2 })
    expect(await f.f.count('sr_model_result')).toEqual({ n: 2 })
    expect(await f.f.runtime.readWork(f.f.runtime.coordinationAuthority, f.scope, 1)).toMatchObject(
      { inputs: [], head: { run: { id: f.prepared.preparation.run, state: 'completed' } } },
    )
  })
  it('owns a late original source borrow through withdrawal and refuses any subsequent Model construction', async () => {
    const f = await running()
    expect(await createDriverModelRunTask(f.input).completion).toBe('released')
    const identities = driverIdentityFixture()
    identities.run.mockReturnValue({ startKey: 'late-run', attemptKey: 'late-attempt' })
    identities.model.mockReturnValue({
      ...identities.model(),
      prepareKey: 'late-prepare',
      originalPosition: 'late-position',
      resultKey: 'late-result',
      adoptionKey: 'late-adopt',
      call: unwrap(parseOpaqueIdentifier('late-call', 'ModelCallId')),
      creationKey: unwrap(parseOpaqueIdentifier('late-create', 'CreationKey')),
    })
    await f.f.runtime.operations.submitInput(
      f.f.runtime.access,
      f.scope.session,
      'late-input',
      user('Late original borrow', 'late-input'),
    )
    const entered = Promise.withResolvers<void>(),
      arrived = Promise.withResolvers<void>()
    const acquire = vi.fn<LocalSessionDriverOptions['sources']['acquire']>(
      async (_scope, journal) => {
        entered.resolve()
        await arrived.promise
        return sourcesForRun(f, journal)
      },
    )
    const modelAcquire = vi.fn(f.input.options.model.factory.acquire)
    const task = createDriverRunTask(
      {
        ...f.input.options,
        identities: { ...identities, modelContent: f.input.options.identities.modelContent },
        model: { ...f.input.options.model, factory: { acquire: modelAcquire } },
        sources: { acquire },
      },
      f.scope,
    )
    runResources.push(async () => {
      arrived.resolve()
      await task.completion
      await task.close()
    })
    await entered.promise
    task.requestStop()
    expect(await task.close()).toBe('pending')
    expect(modelAcquire).not.toHaveBeenCalled()
    expect(acquire.mock.calls[0]![1].currentGeneration()).not.toBeNull()
    arrived.resolve()
    expect(await task.completion).toBe('retained')
    expect(await task.close()).toBe('released')
    expect(acquire.mock.calls[0]![1].currentGeneration()).toBeNull()
    expect(modelAcquire).not.toHaveBeenCalled()
    expect(f.ports.sends()).toBe(1)
    expect(f.sources.release).toHaveBeenCalledTimes(2)
    expect(await f.f.runtime.readWork(f.f.runtime.coordinationAuthority, f.scope, 1)).toMatchObject(
      { head: { run: { state: 'runnable' } } },
    )
  })
})
