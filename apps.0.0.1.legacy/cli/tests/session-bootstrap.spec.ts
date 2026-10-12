import { submitSessionMessage } from '../src/session-message-client.ts'
import type { Clock } from '@omne-harness-lite/offer-expiry'
import { checkedTenantBinding } from '../src/state-layout-values.ts'
import { openLeaseClock } from '@omne-harness-lite/clock-lease'
import { invokeModel } from '@omne-harness-lite/model-request-runtime-local'
import { createSessionModelReads } from '@omne-harness-lite/session-runtime-local'
import { createSessionModelSelection } from '@omne-harness-lite/session-runtime-local'
import { createSessionModelCallFacts } from '@omne-harness-lite/session-runtime-local'
import { createSettlementCoordinator } from '@omne-harness-lite/session-runtime-local'
import { sessionModelSettlement } from '@omne-harness-lite/session-runtime-local'
import { createSessionModelAcknowledgement } from '@omne-harness-lite/session-runtime-local'
import {
  publishSessionModelCallContent,
  sessionModelRequestPreparation,
} from '@omne-harness-lite/session-runtime-local'
// @module-tag slow
// Uses actual governance, SQLite, Context, model pools and background scans.
import {
  type LocalSessionDriverOptions,
  type RuntimeOptions,
} from '@omne-harness-lite/session-runtime-local'
import { createSessionCallAccess } from '@omne-harness-lite/session-runtime-local'
import { createSessionContextReadGrant } from '../src/session-context-access.ts'
import type { BorrowedRunJournal } from '@omne-harness-lite/session-runtime-local'
import { startFileSessionDriverRoot, FileSessionRuntimeFailure } from '../src/session-file-root.ts'
import { createNativeSessionModelPool } from '../src/session-native-model.ts'
import type {
  SessionNativeModelOptions,
  SessionNativeModelPool,
} from '../src/session-native-model.ts'
import { officialCatalog } from '@omne-harness-lite/pi-ai-transport'
import { prepareTenantDirectory, prepareStateDirectory, tenantPaths } from '../src/state-layout.ts'
import {
  createSessionDriverWorkOwner,
  type SessionDriverWorkOwner,
} from '@omne-harness-lite/session-runtime-local'
import { startSessionDriverHost } from '../src/session-driver-host.ts'
import { startSessionDriverRuntimeRoot } from '../src/session-runtime-root.ts'
import {
  officialSessionDefinition,
  officialSessionAsset,
  officialSessionManifest,
} from '../src/session-factory-assets.ts'
import type {
  SessionDriverRuntimeRootOptions,
  SessionDriverRootBinding,
} from '../src/session-runtime-root-types.ts'
import { sendSessionHostRequest } from '../src/session-host-client.ts'
import { createSessionForMessage } from '../src/session-creation-client.ts'
import { readSubmittedReply } from '../src/session-message-replies.ts'
import { prepareSessionModelRun } from '@omne-harness-lite/session-runtime-local'
import { readSessionSubmission } from '../src/session-submission.ts'
import {
  createSessionModelAttempt,
  createSessionModelObservations,
  type OriginalSessionModelWork,
  type SessionModelAttemptOptions,
} from '@omne-harness-lite/session-runtime-local'
import {
  runSessionModelTurn,
  type SessionModelTurnOptions,
  type RetainedSessionModelTurn,
} from '@omne-harness-lite/session-runtime-local'
import { createSessionHostEndpoint, parseSessionHostRequest } from '../src/session-host-protocol.ts'
import { messageLogPayload, compareInteger } from '@omne-harness-lite/session-log'
import { createSessionConversationReader } from '../src/session-reading.ts'
import { judgeMessage } from '@omne-harness-lite/messages'
import { createModalityProjection } from '@omne-harness-lite/model-message-projection'
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { openClientLocalState } from '@omne-harness-lite/client-local-state-sqlite'
import { createGovernanceClient } from '@omne-harness-lite/governance-client-operations-local'
import {
  parseTenantId,
  parseAccountId,
  parseLoginStateId,
  parseOpaqueIdentifier,
  unwrap,
} from '@omne-harness-lite/identity-values'
import { isGovernanceCenterId } from '@omne-harness-lite/governance-center-entry'
import {
  createLocalSessionAccess,
  createLocalAdmission,
  createLocalSessionIngress,
  admissionMigrations,
  admissionUseMigrations,
  sessionStateMigrations,
  operationReceiptMigrations,
  sessionRuntimeMigrations,
  type AdmissionSource,
  type SessionLifecycleStep,
  type ModelResultSource,
} from '@omne-harness-lite/session-runtime-local'
import {
  createSessionModelResultSource,
  type SessionModelResultSource,
} from '@omne-harness-lite/session-runtime-local'
import { originalPending } from './model-result-fixture.ts'
import { nativeCallFixturePorts, controlledTimingDeclarations } from './session-native-fixture.ts'
import { createAssetRegistry } from '@omne-harness-lite/asset-registry-local'
import {
  createAssemblyManifestStore,
  assemblyManifestMigrations,
} from '@omne-harness-lite/assembly-manifest-store'
import { evaluate } from '@omne-harness-lite/asset-evaluation'
import { createSessionRunHistory } from '@omne-harness-lite/session-runtime-local'
import type { AtomicStorage } from '@omne-harness-lite/storage'
import { StorageUnavailable } from '@omne-harness-lite/storage'
import { createSessionOriginalModelOwner } from '../src/session-model-owner.ts'
import { createSessionDriverModelFactory } from '../src/session-driver-model.ts'
import { createSessionRunAssets } from '../src/session-run-assets.ts'
import { createSessionRunRunner, type SessionRunRunnerOptions } from '../src/session-run-runner.ts'
import { createRunnerTaskOwner } from '@omne-harness-lite/loop-extension-runner-local'
import {
  createSessionRunModelBinding,
  type SessionRunModelBindingOptions,
} from '@omne-harness-lite/session-runtime-local'
import {
  originalIssueMigrations,
  createOriginalIssueOwner,
  type OriginalIssueOwner,
  createModelCallContentStore,
  modelCallContentMigrations,
} from '@omne-harness-lite/model-request-runtime-local'
import {
  createSessionModelRuntime,
  createCallContainerStore,
  type SessionModelConstruction,
} from '@omne-harness-lite/session-runtime-local'
import {
  captureModelLogValue,
  inspectModelLogEntry,
  prepareModelLogEntry,
  readSettlementPrefix,
  type SettlementLogBinding,
  type SettlementRegistration,
  type OriginalIssueInput,
  type PlannedSemantics,
  type ModelRuntimeExecutionSource,
  type ModelRuntimeCapturedExecution,
} from '@omne-harness-lite/model-request-runtime'
import { sessionLogMigrations, openSqlSessionLog } from '@omne-harness-lite/session-log-sql'
import {
  runtimeContextMigrations,
  inspectContextLogEntry,
} from '@omne-harness-lite/runtime-context-local'
import { evaluationInputMigrations } from '@omne-harness-lite/evaluation-input-store'
import {
  publishLocalInputs,
  readPublicationRevision,
  installOfficialFactoryDefinition,
} from '@omne-harness-lite/evaluation-input-store/publication'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import { contextSeedFromDefinition } from '../src/session-seed.ts'
import {
  ensureSessionFilesRegistration,
  registerSessionWorkspace,
} from '../src/session-workspace-source.ts'
import { createSessionAdmissionProbe } from '../src/session-admission-probe.ts'
import type { AccessIdentity } from '@omne-harness-lite/session-tenancy'
import { createSessionBootstrap, type SessionBootstrapOptions } from '../src/session-bootstrap.ts'
import { narrow } from '@omne-harness-lite/storage'
import { readSessionFact } from '@omne-harness-lite/session-runtime'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'

const cleanup: Array<() => Promise<void>> = []
const nativeModels: Array<ReturnType<typeof createSessionModelRuntime>> = []
afterEach(async () => {
  for (const model of nativeModels.splice(0).reverse()) {
    expect(await model.close()).toEqual({ released: true })
    expect(model.executionSource.release()).toEqual({ released: true })
  }
  for (const close of cleanup.splice(0).reverse()) await close()
})
const centerId = 'a'.repeat(32)
if (!isGovernanceCenterId(centerId)) throw new Error('bad fixture center')
const source: AdmissionSource = {
  centerId,
  accountId: unwrap(parseAccountId('bootstrap-owner')),
  loginStateHandle: unwrap(parseLoginStateId('original-login')),
}
const tenant = unwrap(parseTenantId({ organization: 'team', account: source.accountId }))
const definition = { category: 'agent_definition' as const, name: 'bootstrap:actual-root' }
const now = '2026-10-08T00:00:00Z'
it('observes original pending work with state and source without consuming it or granting an attempt', async () => {
  const f = await setup()
  const created = await f.runtime.operations.createSession(f.runtime.access, input)
  if (!('kind' in created) || created.kind !== 'created') throw new Error('Session not created')
  const scope = { tenant, session: created.session }
  const empty = await f.runtime.readWork(f.runtime.coordinationAuthority, scope, 1)
  expect(empty).toMatchObject({ kind: 'work', inputs: [], head: { run: null } })
  const message = judgeMessage({
    id: 'work-input',
    type: 'user',
    createdAt: now,
    blocks: [
      {
        kind: 'text',
        id: 'work-text',
        text: 'pending work',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if ('rejected' in message || message.ok.type !== 'user') throw new Error('message unavailable')
  const accepted = await f.runtime.operations.submitInput(
    f.runtime.access,
    scope.session,
    'work-submit',
    message.ok,
  )
  if (!('kind' in accepted) || accepted.kind !== 'accepted') throw new Error('input not accepted')
  const first = await f.runtime.readWork(f.runtime.coordinationAuthority, scope, 1)
  if (!('kind' in first) || first.kind !== 'work') throw new Error('work unavailable')
  expect(first.inputs).toHaveLength(1)
  expect(first.head.run).toBeNull()
  expect(first.source).toEqual(accepted.receipt.source)
  expect(await f.runtime.readWork(f.runtime.coordinationAuthority, scope, 1)).toEqual(first)
  const started = await f.runtime.lifecycle.commitStep(
    f.runtime.coordinationAuthority,
    scope,
    first.source,
    {
      kind: 'startRun',
      stepKey: 'work-run',
      inputPosition: first.inputs[0]!,
    },
  )
  if (!('kind' in started) || started.kind !== 'committed') throw new Error('Run not started')
  const adopted = await f.runtime.readWork(f.runtime.coordinationAuthority, scope, 1)
  expect(adopted).toMatchObject({
    kind: 'work',
    inputs: [],
    head: { run: { id: started.receipt.run, attempt: null } },
  })
  await f.admission.close()
  expect(await f.runtime.readWork(f.runtime.coordinationAuthority, scope, 1)).toEqual(adopted)
})
it('rejects a copied work-read authority and invalid scope before reading the original journal', async () => {
  const f = await setup()
  const created = await f.runtime.operations.createSession(f.runtime.access, input)
  if (!('kind' in created) || created.kind !== 'created') throw new Error('Session not created')
  const scope = { tenant, session: created.session }
  expect(await f.runtime.readWork({ ...f.runtime.coordinationAuthority }, scope, 1)).toEqual({
    failure: 'denied',
  })
  expect(
    await f.runtime.readWork(
      f.runtime.coordinationAuthority,
      {
        ...scope,
        tenant: unwrap(parseTenantId({ organization: 'other', account: tenant.account })),
      },
      1,
    ),
  ).toEqual({ failure: 'denied' })
  expect(await f.runtime.readWork(f.runtime.coordinationAuthority, scope, 0)).toEqual({
    failure: 'invalidInput',
  })
  expect(await f.runtime.readWork(f.runtime.coordinationAuthority, scope, 17)).toEqual({
    failure: 'invalidInput',
  })
  await f.runtime.close()
  expect(await f.runtime.readWork(f.runtime.coordinationAuthority, scope, 1)).toEqual({
    failure: 'unavailable',
  })
})
it('keeps an empty Session idle and validates original Run identities before starting work', async () => {
  const f = await setup()
  const created = await f.runtime.operations.createSession(f.runtime.access, input)
  if (!('kind' in created) || created.kind !== 'created') throw new Error('Session not created')
  const options = {
    ingress: f.runtime,
    scope: { tenant, session: created.session },
    identities: {
      startKey: 'empty-start',
      attemptKey: 'empty-attempt',
      prepareKey: 'empty-prepare',
      call: 'empty-call',
      originalPosition: 'empty-position',
    },
  }
  const before = await f.runtime.readWork(f.runtime.coordinationAuthority, options.scope, 1)
  expect(await prepareSessionModelRun(options)).toEqual({ kind: 'idle' })
  await expect(
    prepareSessionModelRun({ ...options, identities: { ...options.identities, call: '' } }),
  ).rejects.toThrow('original Run identities required')
  expect(await f.runtime.readWork(f.runtime.coordinationAuthority, options.scope, 1)).toEqual(
    before,
  )
})
it('does not mint a second Run or permit when the host observes an already prepared active Run', async () => {
  const original = await originalModelBinding()
  const f = original.f
  const before = await f.runtime.readWork(f.runtime.coordinationAuthority, original.scope, 1)
  expect(
    await prepareSessionModelRun({
      ingress: f.runtime,
      scope: original.scope,
      identities: {
        startKey: 'replacement-start',
        attemptKey: 'replacement-attempt',
        prepareKey: 'replacement-prepare',
        call: 'replacement-call',
        originalPosition: 'replacement-position',
      },
    }),
  ).toEqual({ failure: 'retryFromFacts' })
  expect(await f.runtime.readWork(f.runtime.coordinationAuthority, original.scope, 1)).toEqual(
    before,
  )
})
async function setup(
  maxBindings = 16,
  declareSeed: boolean | 'invalid' = true,
  withModel = false,
  resultSource?: (storage: AtomicStorage) => ModelResultSource,
  nativeTiming = false,
  workSettled?: import('@omne-harness-lite/session-runtime-local').RuntimeOptions['workSettledIn'],
  issue?: RuntimeOptions['modelIssue'],
) {
  const directory = await mkdtemp(join(tmpdir(), 'omne-formal-bootstrap-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  const root = await openStorage({
    dialect: 'sqlite',
    file: join(directory, 'admission.sqlite'),
    synchronous: 'full',
  })
  cleanup.push(() => root.close())
  const storage = await openStorage({
    dialect: 'sqlite',
    file: join(directory, 'runtime.sqlite'),
    synchronous: 'full',
  })
  cleanup.push(() => storage.close())
  for (const item of admissionMigrations) await root.write(tx => item.migration.up(tx.db))
  for (const item of [
    ...admissionUseMigrations,
    ...sessionLogMigrations,
    ...sessionStateMigrations,
    ...operationReceiptMigrations,
    ...sessionRuntimeMigrations,
    ...runtimeContextMigrations,
    ...evaluationInputMigrations,
    ...(withModel || issue !== undefined
      ? [...originalIssueMigrations, ...modelCallContentMigrations('sqlite')]
      : []),
  ])
    await storage.write(tx => item.migration.up(tx.db))
  const local = await openClientLocalState(
    { directory: join(directory, 'auth') },
    { storage: { open: file => openStorage({ dialect: 'sqlite', file, synchronous: 'full' }) } },
  )
  cleanup.push(() => local.close())
  const reading = await local.read()
  if (reading.kind !== 'read') throw new Error('auth unreadable')
  const installed = await local.compareAndReplace(
    reading.snapshot.token,
    {
      center: { centerId, endpoint: 'https://center.invalid/', trust: { mode: 'ca' } },
      login: {
        presentation: 'protected-original-login',
        handle: source.loginStateHandle,
        accountId: source.accountId,
      },
      cache: [],
    },
    'fixture-auth',
  )
  if (installed.kind !== 'installed') throw new Error('auth not installed')
  const exchanges = vi.fn<
    Parameters<typeof createGovernanceClient>[0]['transport']['exchangeGovernance']
  >(async (_options, request) => ({
    kind: 'reply' as const,
    sendAttempted: true,
    reply: {
      result: (request as { operation: string }).operation.endsWith('#S-36')
        ? tenant
        : { standing: 'effective', role: 'member' },
    },
  }))
  const client = createGovernanceClient({
    state: local,
    transport: {
      readPublicHealth: async () => ({
        kind: 'health',
        reply: { reachable: true, centerId, version: 'controlled-test' },
      }),
      exchangeGovernance: exchanges,
    },
  })
  cleanup.push(() => client.close())
  const admission = await createLocalAdmission(
    root,
    createSessionAdmissionProbe(client, source, tenant),
    { maxLogins: 8, maxTickets: 16, maxRecordBytes: 8192 },
  )
  cleanup.push(() => admission.close())
  let log!: Awaited<ReturnType<typeof openSqlSessionLog>>
  let assembly!: ReturnType<typeof createSessionBootstrap>
  const modelOwner = withModel
    ? createSessionOriginalModelOwner({
        storage,
        maxRecords: 16,
        maxInFlight: 8,
      })
    : undefined
  const runtime = createLocalSessionIngress({
    storage,
    admission,
    source,
    tenant,
    principal: 'fixture-authenticated-owner',
    policy: {
      maxSessions: 16,
      maxRecordBytes: 65536,
      maxInFlight: 8,
      maxSteps: 32,
      modelHistory: {
        maxEntries: 16384,
        maxContentBytes: 8 * 1024 * 1024,
        maxIndexReferences: 262144,
      },
      state: { maxPendingPerSession: 16, maxBatchSize: 16, maxRecordBytes: 65536 },
      receipts: { maxRecords: 32, maxRecordBytes: 65536 },
    },
    log: authority => {
      log ??= openSqlSessionLog({ storage, authority, operationLimit: 32 })
      return log.participant
    },
    bootstrap: { initialize: (...args) => assembly.initialize(...args) },
    now: async () => now,
    workSettledIn: workSettled ?? (async () => 'settled'),
    ...(modelOwner ? { modelIssue: modelOwner.modelIssue } : {}),
    ...(issue ? { modelIssue: issue } : {}),
    ...(resultSource ? { modelResults: { maxRecords: 16, source: resultSource(storage) } } : {}),
  })
  cleanup.push(() => runtime.close())
  const seed = vi.fn<SessionBootstrapOptions['contextSeed']>(contextSeedFromDefinition)
  const base = {
    storage,
    storeKey: 'actual-tenant-inputs',
    deployedOfficial: [{ capability: definition, meta: false }],
    sessionTenancy: runtime.tenancy,
    diagnostics: () => {},
    onDiagnosticFailure: () => {},
    monotonicNow: process.hrtime.bigint,
  }
  const publication = await publishLocalInputs(base, {
    expectedRevision: null,
    definitions: [
      {
        id: 'root-asset',
        capability: definition,
        origin: 'official',
        versions: [
          {
            number: 1,
            content: {
              category: 'agent_definition',
              body: {
                references: [],
                attributes: nativeTiming ? controlledTimingDeclarations() : [],
                ...(declareSeed
                  ? {
                      contextSessionSeed:
                        declareSeed === 'invalid'
                          ? { required: [], initial: [] }
                          : { required: [], initial: [], fixed: [] },
                    }
                  : {}),
              },
            },
            publishedAt: now,
          },
        ],
      },
    ],
    scopes: [
      {
        holder: { layer: 'factory' },
        holdings: [
          {
            holder: { layer: 'factory' },
            capability: definition,
            asset: 'root-asset',
            basis: { kind: 'official' },
            immutable: false,
            assignments: [],
            versionSelection: { kind: 'current' },
            since: now,
          },
        ],
      },
      { holder: { layer: 'organization', organization: tenant.organization }, holdings: [] },
      { holder: { layer: 'tenant', tenant }, holdings: [] },
    ],
  })
  if (!('revision' in publication)) throw new Error('actual asset publication failed')
  cleanup.push(() => log.close())
  const checks = vi.fn()
  let corruptIdentity: ((identity: AccessIdentity) => AccessIdentity) | undefined
  let authorityDefect: Error | undefined
  let gate: { entered: () => void; wait: Promise<void> } | undefined
  function pauseChecks() {
    let entered!: () => void, release!: () => void
    const ready = new Promise<void>(resolve => {
      entered = resolve
    })
    const wait = new Promise<void>(resolve => {
      release = resolve
    })
    gate = { entered, wait }
    return {
      entered: ready,
      release() {
        gate = undefined
        release()
      },
    }
  }
  const contextGrant = createSessionContextReadGrant(runtime, source, tenant, {
    consumers: ['model'],
    policy: { maxBindings, maxContextKeys: 16 },
  })
  const access = createLocalSessionAccess({
    ...contextGrant,
    tenant,
    authority: {
      async check(identity, operation) {
        checks()
        if (gate) {
          const currentGate = gate
          currentGate.entered()
          await currentGate.wait
        }
        const decision = await contextGrant.authority.check(identity, operation)
        if (decision.kind === 'rejected') return decision
        if (authorityDefect) throw authorityDefect
        return {
          kind: 'authorized',
          identity: corruptIdentity ? corruptIdentity(identity) : decision.identity,
        }
      },
    },
  })
  cleanup.push(() => access.close())
  assembly = createSessionBootstrap({
    storage,
    admission,
    source,
    tenant,
    inputSource: base,
    tenancy: runtime.tenancy,
    logBacking: log.backing,
    access: access.operations,
    clock: { now: async () => unwrap(instantFromRfc3339(now)) },
    contextSeed: seed,
  })
  cleanup.push(() => assembly.close())
  if (modelOwner)
    cleanup.push(async () => {
      expect(await modelOwner.close()).toEqual({ kind: 'released' })
    })
  return {
    directory,
    root,
    client,
    local,
    base,
    runtime,
    assembly,
    storage,
    admission,
    log,
    exchanges,
    seed,
    access,
    checks,
    modelOwner,
    pauseChecks,
    corruptIdentity(transform: (identity: AccessIdentity) => AccessIdentity) {
      corruptIdentity = transform
    },
    faultAuthority(error: Error) {
      authorityDefect = error
    },
  }
}
const input = {
  operationKey: 'create-actual',
  definition,
  executionType: 'interactive' as const,
  mode: 'never' as const,
  collaboration: 'co-work' as const,
}

async function rootFixture(withModel = false) {
  const f = await setup(16, true, withModel, undefined, withModel)
  await f.assembly.close()
  await f.access.close()
  await f.runtime.close()
  await f.log.close()
  await f.admission.close()
  if (f.modelOwner) expect(await f.modelOwner.close()).toEqual({ kind: 'released' })
  const unexpected = (): never => {
    throw new Error('empty Session must not execute a Run')
  }
  const configure = vi.fn<SessionDriverRuntimeRootOptions['configure']>(() => ({
    policy: {
      scanLimit: 16,
      intervalMs: 5,
      maxTasks: 8,
      maxHeld: 16,
      maxFailures: 8,
      maxStepsPerPass: 16,
    },
    identities: {
      run: unexpected,
      model: unexpected,
      tool: unexpected,
      modelContent: { response: unexpected, message: unexpected },
    },
    sources: { acquire: async () => unexpected() },
    model: {
      factory: { acquire: async () => unexpected() },
      settlement: { create: unexpected },
      maxCallReads: 4,
    },
    tools: { acquire: async () => unexpected() },
  }))
  const options: SessionDriverRuntimeRootOptions = {
    home: f.directory,
    binding: { formatVersion: 1, centerId: source.centerId, tenant },
    source,
    rootStorage: f.root,
    storage: f.storage,
    governance: f.client,
    clock: { now: async () => unwrap(instantFromRfc3339(now)) },
    inputSource: f.base,
    contextSeed: contextSeedFromDefinition,
    runtimePolicy: {
      maxSessions: 16,
      maxRecordBytes: 65536,
      maxInFlight: 8,
      maxSteps: 32,
      state: { maxPendingPerSession: 16, maxBatchSize: 16, maxRecordBytes: 65536 },
      receipts: { maxRecords: 32, maxRecordBytes: 65536 },
    },
    admissionPolicy: { maxLogins: 8, maxTickets: 16, maxRecordBytes: 8192 },
    logOperationLimit: 32,
    contextAccess: ingress =>
      createSessionContextReadGrant(ingress, source, tenant, {
        consumers: ['model'],
        policy: { maxBindings: 16, maxContextKeys: 16 },
      }),
    model: {
      maxInFlight: 8,
      maxRecords: 16,
      maxCaptures: 8,
      executionSource: () => undefined,
      retainReferencesIn: async () => {
        throw new Error('empty Session has no model result')
      },
    },
    configure,
    transport: {
      maxRequestBytes: 65536,
      maxResponseBytes: 65536,
      maxConnections: 8,
      maxInFlight: 4,
      requestTimeoutMs: 2000,
      headersTimeoutMs: 1000,
      idleTimeoutMs: 1000,
      checkIntervalMs: 100,
      maxFailureRecords: 8,
      maxHeaderBytes: 8192,
    },
    maxHeld: 16,
    diagnostic: error => {
      throw error
    },
  }
  return { f, options, configure }
}
it.each(['empty', 'startupFailure'] as const)(
  'assembles the public Driver with original root resources: %s',
  async mode => {
    const { f, options } = await rootFixture()
    const unexpected = (): never => {
      throw new Error('empty Session must not execute a Run')
    }
    const configure = vi.fn<() => SessionDriverRootBinding>(() => ({
      policy: {
        scanLimit: 16,
        intervalMs: 5,
        maxTasks: 8,
        maxHeld: 16,
        maxFailures: 8,
        maxStepsPerPass: 16,
      },
      identities: {
        run: unexpected,
        model: unexpected,
        tool: unexpected,
        modelContent: { response: unexpected, message: unexpected },
      },
      sources: { acquire: async () => unexpected() },
      model: {
        factory: { acquire: async () => unexpected() },
        settlement: { create: unexpected },
        maxCallReads: 4,
      },
      tools: { acquire: async () => unexpected() },
    }))
    const inputs = {
      ...options,
      maxHeld: options.maxHeld,
      creation: {
        definition: input.definition,
        executionType: input.executionType,
        mode: input.mode,
        collaboration: input.collaboration,
      },
      configure,
    }
    if (mode === 'startupFailure') {
      const defect = new Error('actual driver configuration defect')
      await expect(
        startSessionDriverRuntimeRoot({
          ...inputs,
          configure: () => {
            throw defect
          },
        }),
      ).rejects.toBe(defect)
    }
    const root = await startSessionDriverRuntimeRoot(inputs)
    cleanup.push(async () => {
      expect(await root.close()).toEqual({ closed: true })
    })
    const native = root.owners.originalModel.native()
    expect(native.participant).toBeDefined()
    expect(configure).toHaveBeenCalledOnce()
    const created = await createSessionForMessage({
      home: options.home,
      binding: options.binding,
      signal: new AbortController().signal,
      originalId: () => 'driver-root-create',
      policy: { timeoutMs: 2000, maxResponseBytes: 65536 },
    })
    expect(created, JSON.stringify(created)).toMatchObject({ kind: 'created-session' })
    if (created.kind !== 'created-session') throw new Error('actual Driver root creation missing')
    expect(
      await root.owners.ingress.readWork(
        root.owners.ingress.coordinationAuthority,
        { tenant, session: created.session },
        1,
      ),
    ).toMatchObject({ kind: 'work', inputs: [], head: { run: null } })
    expect(await root.close()).toEqual({ closed: true })
    expect(() => root.owners.originalModel.native()).toThrow('not available')
    await f.storage.atomic(async unit => unit.assertStorage(f.storage))
  },
)
it('deploys the actual CLI official release and creates an independently initialized empty Session', async () => {
  const { f, options, configure } = await rootFixture()
  const creation = {
    definition: officialSessionDefinition,
    mode: input.mode,
    collaboration: input.collaboration,
    executionType: input.executionType,
  }
  const root = await startSessionDriverRuntimeRoot({ ...options, creation })
  const deployed = { ...f.base, deployedOfficial: officialSessionManifest(f.base.deployedOfficial) }
  expect(await readPublicationRevision(deployed)).toEqual({ revision: '2' })
  cleanup.push(async () => {
    expect(await root.close()).toEqual({ closed: true })
  })
  const created = await root.owners.ingress.operations.createSession(root.owners.ingress.access, {
    ...creation,
    operationKey: 'create-official-session',
  })
  if (!('kind' in created) || created.kind !== 'created')
    throw new Error('official Session not created')
  const scope = { tenant, session: created.session }
  expect(root.owners.bootstrap.context(scope)).toBeDefined()
  const supplied = await root.owners.bootstrap.inputs(scope)?.read(scope.session, tenant)
  expect(supplied).toMatchObject({
    input: {
      root: {
        definition: officialSessionDefinition,
        source: { asset: officialSessionAsset.id, version: 4 },
        references: [
          { capability: { category: 'tool', name: 'Shell' } },
          { capability: { category: 'tool', name: 'Files' } },
          { capability: { category: 'tool', name: 'Result' } },
          { capability: { category: 'loop_extension', name: 'omne-official:admission-judgment' } },
        ],
      },
    },
  })
  if (!supplied || !('input' in supplied)) throw new Error('official input unavailable')
  const given = evaluate(supplied.input)
  if (!('ok' in given)) throw new Error('official definition cannot be evaluated')
  expect(given.ok.values).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        capability: officialSessionDefinition,
        item: 'first_token_wait_limit',
        value: 'PT2M',
      }),
      expect.objectContaining({
        capability: officialSessionDefinition,
        item: 'post_first_token_stall_limit',
        value: 'PT30S',
      }),
    ]),
  )
  expect(
    await root.owners.ingress.readWork(root.owners.ingress.coordinationAuthority, scope, 1),
  ).toMatchObject({ kind: 'work', inputs: [], head: { run: null } })
  expect(configure).toHaveBeenCalledOnce()
  expect(await root.close()).toEqual({ closed: true })
  // Reopen the actual running root without republishing the immutable CLI release.
  const next = await startSessionDriverRuntimeRoot({ ...options, creation })
  expect(await readPublicationRevision(deployed)).toEqual({ revision: '2' })
  cleanup.push(async () => {
    expect(await next.close()).toEqual({ closed: true })
  })
  const recognized = await next.owners.ingress.operations.createSession(
    next.owners.ingress.access,
    {
      ...creation,
      operationKey: 'create-official-session',
    },
  )
  expect(recognized).toEqual(created)
  expect(await next.close()).toEqual({ closed: true })
  // The actual storage and CG remain borrowed; their original cleanup still belongs to f.
  expect(f.storage).toBe(options.storage)
})
it('assembles the actual runtime root and creates a legal empty Session through its socket without starting a model', async () => {
  const { f, options, configure } = await rootFixture()
  const root = await startSessionDriverRuntimeRoot(options)
  cleanup.push(async () => {
    expect(await root.close()).toEqual({ closed: true })
  })
  const request = parseSessionHostRequest({
    format: 'omne-session-host/1',
    binding: options.binding,
    command: 'createSession',
    input,
  })
  if (!request) throw new Error('invalid request')
  const reply = await sendSessionHostRequest({
    home: options.home,
    request,
    policy: { timeoutMs: 2000, maxResponseBytes: 65536 },
  })
  expect(reply, JSON.stringify(reply)).toMatchObject({ kind: 'reply', result: { kind: 'created' } })
  expect(configure).toHaveBeenCalledOnce()
  const created = await root.owners.ingress.operations.createSession(
    root.owners.ingress.access,
    input,
  )
  if (!('kind' in created) || created.kind !== 'created') throw new Error('not created')
  const scope = { tenant, session: created.session }
  expect(root.owners.bootstrap.context(scope)).toBeDefined()
  const read = await root.owners.ingress.readWork(
    root.owners.ingress.coordinationAuthority,
    scope,
    1,
  )
  expect(read).toMatchObject({ kind: 'work', inputs: [], head: { run: null } })
  expect(await root.close()).toEqual({ closed: true })
  const borrowed = await f.client.openUse()
  expect(borrowed.kind).toBe('use')
  if (borrowed.kind === 'use') await borrowed.use.close()
  await f.storage.atomic(async unit => unit.assertStorage(f.storage))
})
it('finishes the original root close after its retained model observation is explicitly returned', async () => {
  // Root/SQL/source ownership are real. Native reply metadata is controlled; no IO or ACK is authorized.
  const original = await originalModelBinding()
  const linked = await createSessionRunModelBinding(nativeBindingOptions(original))
  if ('failure' in linked) throw new Error('original Run binding missing')
  cleanup.push(linked.returnJournal)
  const pending = originalPending()
  const unused = async (): Promise<never> => {
    throw new Error('observation must not authorize execution or ACK')
  }
  const execution: ModelRuntimeCapturedExecution = {
    key: { session: original.scope.session, callId: pending.call.callId },
    session: linked.binding,
    owner: linked.binding.selection.owner,
    executionGeneration: Object.freeze({}),
    registered: true,
    released: false,
    copyReleased: false,
    invocation: {
      outcome: Promise.resolve({ replyPending: pending }),
      snapshot() {
        throw new Error('unused observation snapshot')
      },
      observedFacts: () => ({ unavailable: true }),
      abort() {},
      interrupt() {},
      borrowControl: () => ({ unavailable: true }),
      settleReply: unused,
      finishReady: unused,
      close: unused,
    },
  }
  const returned = vi.fn()
  const source: ModelRuntimeExecutionSource = {
    capture: () => ({ capture: { executions: [execution], release: returned } }),
    lookup: () => ({ execution }),
    snapshot: () => [execution],
    release: () => ({ unavailable: true }),
  }
  const { f, options } = await rootFixture()
  const root = await startSessionDriverRuntimeRoot({
    ...options,
    model: { ...options.model, executionSource: () => source },
  })
  const held = await root.owners.modelResults.capture(original.scope, pending.call.callId)
  if ('failure' in held) throw new Error('original observation unavailable')
  cleanup.push(async () => {
    await root.owners.modelResults.release(held.captured)
    await root.close()
  })
  const first = root.close()
  expect(root.close()).toBe(first)
  expect(await first).toEqual({ pending: true })
  expect(returned).not.toHaveBeenCalled()
  expect(await root.owners.modelResults.capture(original.scope, pending.call.callId)).toEqual({
    failure: 'unavailable',
  })
  expect(await root.owners.modelResults.release(held.captured)).toEqual({ released: true })
  expect(returned).toHaveBeenCalledOnce()
  const final = root.close()
  expect(root.close()).toBe(final)
  expect(await final).toEqual({ closed: true })
  expect(root.close()).toBe(final)
  // Root close never takes over the borrowed store or physical execution source.
  await f.storage.atomic(async unit => unit.assertStorage(f.storage))
})
it.each(['loginRejected', 'confirmationUnavailable'] as const)(
  'reports %s for accepted input through the actual Driver and socket without starting a model',
  async reason => {
    const { f, options } = await rootFixture()
    const root = await startSessionDriverRuntimeRoot({
      ...options,
      configure: async (...args) => {
        const configured = await options.configure(...args)
        return {
          ...configured,
          policy: { ...configured.policy, intervalMs: 100 },
          sources: { acquire: async () => ({ unavailable: true }) },
          identities: {
            ...configured.identities,
            model: (_scope, _run, _attempt, position) => ({
              prepareKey: `recovered-prepare:${position}`,
              resultKey: `recovered-result:${position}`,
              adoptionKey: `recovered-adoption:${position}`,
              creationKey: unwrap(
                parseOpaqueIdentifier(`recovered-creation:${position}`, 'CreationKey'),
              ),
              call: `recovered-call:${position}`,
              originalPosition: `recovered-position:${position}`,
            }),
            run: (_scope, position) => ({
              startKey: `blocked-start:${position}`,
              attemptKey: `blocked-attempt:${position}`,
            }),
          },
        }
      },
    })
    cleanup.push(async () => {
      expect(await root.close()).toEqual({ closed: true })
    })
    const ingress = root.owners.ingress
    const created = await ingress.operations.createSession(ingress.access, input)
    if (!('kind' in created) || created.kind !== 'created') throw new Error('Session not created')
    f.exchanges.mockImplementation(async () =>
      reason === 'loginRejected'
        ? { kind: 'entry-answer', answer: 'login-state-rejected', sendAttempted: true }
        : { kind: 'unavailable', reason: 'connection', sendAttempted: false },
    )
    const request = parseSessionHostRequest({
      format: 'omne-session-host/1',
      binding: options.binding,
      command: 'submitInput',
      session: created.session,
      operationKey: 'original-blocked-input',
      message: {
        id: 'blocked-message',
        type: 'user',
        createdAt: now,
        blocks: [
          {
            id: 'blocked-text',
            kind: 'text',
            text: 'keep this original input',
            visibility: { toHuman: true, toModel: true },
          },
        ],
      },
    })
    if (!request || request.command !== 'submitInput') throw new Error('invalid input request')
    const outcome = await submitSessionMessage({
      home: options.home,
      request,
      signal: new AbortController().signal,
      policy: { timeoutMs: 2000, maxResponseBytes: 65536, maxWaitMs: 5000, pollIntervalMs: 10 },
    })
    expect(outcome).toMatchObject({
      status: 'accepted',
      reason,
      submission: { kind: 'submission', run: null, admission: { reason } },
    })
    if (outcome.status !== 'accepted' || !outcome.submission)
      throw new Error('original admission observation missing')
    expect(outcome.submission.admission?.inputPosition).toEqual(outcome.submission.inputPosition)
    expect(outcome.receipt).not.toBeNull()
    if (!outcome.receipt) throw new Error('original receipt missing')
    const before = await ingress.journal.readPrefix(ingress.access, created.session)
    expect(
      await ingress.operations.readReceipt(ingress.access, outcome.receipt.operation),
    ).toMatchObject({ receipt: outcome.receipt })
    expect(
      await ingress.readWork(
        ingress.coordinationAuthority,
        { tenant, session: created.session },
        1,
      ),
    ).toMatchObject({
      kind: 'work',
      inputs: [outcome.submission.inputPosition],
      head: { run: null },
    })
    expect(await ingress.journal.readPrefix(ingress.access, created.session)).toEqual(before)
    f.exchanges.mockImplementation(async (_options, request) => ({
      kind: 'reply',
      sendAttempted: true,
      reply: {
        result: (request as { operation: string }).operation.endsWith('#S-36')
          ? tenant
          : { standing: 'effective', role: 'member' },
      },
    }))
    if (reason === 'loginRejected') {
      const current = await f.local.read()
      if (current.kind !== 'read' || !current.snapshot.value) throw new Error('missing local state')
      expect(
        await f.local.compareAndReplace(
          current.snapshot.token,
          {
            ...current.snapshot.value,
            login: {
              presentation: 'renewed-login',
              accountId: source.accountId,
              handle: unwrap(parseLoginStateId('renewed-login')),
            },
          },
          'login-renewed',
        ),
      ).toHaveProperty('kind', 'installed')
    }
    await vi.waitFor(
      async () => {
        const work = await ingress.readWork(
          ingress.coordinationAuthority,
          { tenant, session: created.session },
          1,
        )
        expect(work).toMatchObject({
          kind: 'work',
          inputs: [],
          head: { run: { state: 'runnable' } },
        })
      },
      { timeout: 5000 },
    )
    expect(
      await ingress.operations.readReceipt(ingress.access, outcome.receipt.operation),
    ).toMatchObject({ receipt: outcome.receipt })
    const again = await ingress.operations.createSession(ingress.access, {
      ...input,
      operationKey: 'after-login-renewal',
    })
    expect(again).toHaveProperty('kind', 'created')
  },
)
it('preserves unavailable from the actual root Clock and rolls back input, log and receipt together', async () => {
  const { options } = await rootFixture()
  let available = true
  const root = await startSessionDriverRuntimeRoot({
    ...options,
    configure: async (...args) => {
      const configured = await options.configure(...args)
      return { ...configured, policy: { ...configured.policy, intervalMs: 60_000 } }
    },
    clock: {
      now: async () => (available ? unwrap(instantFromRfc3339(now)) : 'unavailable'),
    },
  })
  cleanup.push(() => root.close().then(() => {}))
  const ingress = root.owners.ingress
  const created = await ingress.operations.createSession(ingress.access, input)
  if (!('kind' in created) || created.kind !== 'created') throw new Error('Session not created')
  const original = await ingress.journal.readPrefix(ingress.access, created.session)
  const message = judgeMessage({
    id: 'clock-unavailable-input',
    type: 'user',
    createdAt: now,
    blocks: [
      {
        id: 'clock-unavailable-text',
        kind: 'text',
        text: 'must remain unaccepted',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if ('rejected' in message || message.ok.type !== 'user') throw new Error('invalid message')
  available = false
  await expect(
    ingress.operations.submitInput(
      ingress.access,
      created.session,
      'clock-unavailable',
      message.ok,
    ),
  ).resolves.toEqual({ failure: 'unavailable' })
  expect(await ingress.journal.readPrefix(ingress.access, created.session)).toEqual(original)
  expect(
    await ingress.readWork(ingress.coordinationAuthority, { tenant, session: created.session }, 1),
  ).toMatchObject({ kind: 'work', inputs: [], head: { run: null } })
  expect(
    await ingress.operations.readReceipt(ingress.access, {
      tenant,
      principal: source.accountId,
      session: created.session,
      operation: 'submitInput',
      operationKey: 'clock-unavailable',
    }),
  ).toEqual({ kind: 'absent' })
})
it('releases the actual partial runtime root after a model configuration defect and permits fresh assembly', async () => {
  const { options } = await rootFixture()
  const defect = new Error('controlled root model configuration failure')
  await expect(
    startSessionDriverRuntimeRoot({
      ...options,
      configure: () => {
        throw defect
      },
    }),
  ).rejects.toBe(defect)
  const root = await startSessionDriverRuntimeRoot(options)
  expect(await root.close()).toEqual({ closed: true })
})
it('does not invent creation preferences or reserve a Session in an unconfigured actual root', async () => {
  const { options } = await rootFixture()
  const root = await startSessionDriverRuntimeRoot(options)
  cleanup.push(() => root.close().then(() => {}))
  const originalId = vi.fn(() => 'must-not-be-used')
  const result = await createSessionForMessage({
    home: options.home,
    binding: options.binding,
    signal: new AbortController().signal,
    policy: { timeoutMs: 2000, maxResponseBytes: 65536 },
    originalId,
  })
  expect(result).toMatchObject({
    kind: 'session-creation',
    status: 'blocked',
    request: null,
    operation: null,
  })
  expect(originalId).not.toHaveBeenCalled()
  expect(
    await root.owners.ingress.scanWork(root.owners.ingress.coordinationAuthority, null, 8),
  ).toMatchObject({ kind: 'workPage', sessions: [] })
})
it('closes a foreign-origin actual governance use before any refresh or runtime allocation', async () => {
  const { f, options, configure } = await rootFixture()
  const opened = await f.client.openUse()
  if (opened.kind !== 'use') throw new Error('actual governance use unavailable')
  const close = vi.fn(() => opened.use.close())
  const run = vi.fn(opened.use.run.bind(opened.use))
  const openUse = vi.fn(async () => ({
    ...opened,
    origin: { ...opened.origin, accountId: unwrap(parseAccountId('foreign-account')) },
    use: { ...opened.use, run, close },
  }))
  await expect(
    startSessionDriverRuntimeRoot({
      ...options,
      governance: {
        openUse,
        runAction: f.client.runAction.bind(f.client),
        runPrepared: f.client.runPrepared.bind(f.client),
        close: f.client.close.bind(f.client),
      },
    }),
  ).rejects.toThrow('opened governance use does not match')
  expect(close).toHaveBeenCalledOnce()
  expect(run).not.toHaveBeenCalled()
  expect(configure).not.toHaveBeenCalled()
})
it('publishes after actual CG, original member observation, legal source and isolated Context initialization without starting a Run', async () => {
  const f = await setup()
  const created = await f.runtime.operations.createSession(f.runtime.access, input)
  expect(created).toHaveProperty('kind', 'created')
  if (!('kind' in created) || created.kind !== 'created') throw new Error('actual creation failed')
  const scope = { tenant, session: created.session }
  expect(await f.assembly.inputs(scope)?.read(scope.session, tenant)).toHaveProperty(
    'input.standing',
    { standing: 'effective', role: 'member' },
  )
  expect(f.assembly.context(scope)).toBeDefined()
  expect(f.seed).toHaveBeenCalledTimes(1)
  expect(f.exchanges).toHaveBeenCalledTimes(2)
  const entries = await f.log.readSince(created.session, 0)
  if ('failure' in entries) throw new Error('actual log unavailable')
  expect(entries.entries.map(entry => entry.payload)).toMatchObject([
    { owner: 'session-runtime-local', value: { kind: 'session_initializing' } },
    { owner: 'runtime-context', value: { kind: 'session_initialized' } },
    { owner: 'session-runtime', value: { kind: 'session_created' } },
  ])
  expect(await f.runtime.operations.createSession(f.runtime.access, input)).toEqual(created)
  expect(f.exchanges).toHaveBeenCalledTimes(2)
  expect(f.seed).toHaveBeenCalledTimes(1)
})

it('keeps the original reservation unpublished when the actual seed owner is unavailable and recognizes it on retry', async () => {
  const f = await setup()
  f.seed.mockImplementationOnce(async () => ({ unavailable: true }))
  const first = await f.runtime.operations.createSession(f.runtime.access, input)
  expect(first).toHaveProperty('failure', 'unavailable')
  const entries = await f.storage.read(async tx =>
    narrow<{ sr_session_creation: { session: string; published: number } }>(tx)
      .selectFrom('sr_session_creation')
      .selectAll()
      .execute(),
  )
  expect(entries).toHaveLength(1)
  expect(entries[0]?.published).toBe(0)
  const session = entries[0]?.session
  if (!session) throw new Error('original reservation missing')
  expect(
    f.assembly.context({ tenant, session: session as SessionScope['session'] }),
  ).toBeUndefined()
  const retry = await f.runtime.operations.createSession(f.runtime.access, input)
  expect(retry).toHaveProperty('kind', 'created')
  expect(retry).toHaveProperty('session', session)
  expect(f.seed).toHaveBeenCalledTimes(2)
  expect(f.exchanges).toHaveBeenCalledTimes(2)
})
it('rejects a consumed original ticket for another Session and does not ask the seed owner', async () => {
  const f = await setup()
  const created = await f.runtime.operations.createSession(f.runtime.access, input)
  if (!('kind' in created) || created.kind !== 'created') throw new Error('actual creation failed')
  const { ticket } = await f.admission.reserve(source, {
    purpose: 'createSession',
    tenant,
    session: null,
    inputPosition: null,
    operationKey: input.operationKey,
  })
  const calls = f.exchanges.mock.calls.length
  expect(
    await f.assembly.initialize(
      { tenant, session: 'foreign-session' as SessionScope['session'] },
      input,
      ticket,
    ),
  ).toBe('unavailable')
  expect(f.seed).toHaveBeenCalledTimes(1)
  expect(f.exchanges).toHaveBeenCalledTimes(calls)
  expect(
    f.assembly.context({ tenant, session: 'foreign-session' as SessionScope['session'] }),
  ).toBeUndefined()
})
it('stops publication while an original seed call is pending and drains it before closing', async () => {
  const f = await setup()
  let enter!: () => void, release!: () => void
  const entered = new Promise<void>(resolve => {
    enter = resolve
  })
  const released = new Promise<void>(resolve => {
    release = resolve
  })
  f.seed.mockImplementationOnce(async () => {
    enter()
    await released
    return { seed: { required: [], initial: [], fixed: [] } }
  })
  const creating = f.runtime.operations.createSession(f.runtime.access, input)
  await entered
  let closed = false
  const closing = f.assembly.close().then(() => {
    closed = true
  })
  await Promise.resolve()
  expect(closed).toBe(false)
  release()
  expect(await creating).toHaveProperty('failure', 'unavailable')
  await closing
  const entries = await f.storage.read(async tx =>
    narrow<{ sr_session_creation: { session: string; published: number } }>(tx)
      .selectFrom('sr_session_creation')
      .selectAll()
      .execute(),
  )
  expect(entries).toHaveLength(1)
  expect(entries[0]?.published).toBe(0)
  await expect(f.storage.read(async () => 'borrowed-open')).resolves.toBe('borrowed-open')
})

async function issuedContext(f: Awaited<ReturnType<typeof setup>>) {
  const created = await f.runtime.operations.createSession(f.runtime.access, input)
  if (!('kind' in created) || created.kind !== 'created') throw new Error('actual creation failed')
  const scope = { tenant, session: created.session }
  const request = {
    principal: source.accountId,
    principalKind: 'human' as const,
    scope,
    consumer: 'model' as const,
    contextKeys: [],
    operations: ['context.read' as const],
  }
  const issued = await f.access.issuer.issue(request)
  if (issued.kind !== 'issued') throw new Error('actual live binding unavailable')
  const context = await f.assembly.context(scope)!.ready
  return { scope, request, issued, context }
}
it('uses the confirmed natural-person ingress for Context reads without granting model or tool execution', async () => {
  const f = await setup()
  const { scope } = await issuedContext(f)
  const grant = createSessionContextReadGrant(f.runtime, source, tenant, {
    consumers: ['model'],
    policy: { maxBindings: 8, maxContextKeys: 16 },
  })
  const owner = createLocalSessionAccess({ ...grant, tenant })
  cleanup.push(owner.close)
  const request = {
    principal: source.accountId,
    principalKind: 'human' as const,
    scope,
    consumer: 'model' as const,
    contextKeys: [],
    operations: ['context.read' as const],
  }
  expect(() =>
    createSessionContextReadGrant(
      f.runtime,
      source,
      {
        ...tenant,
        account: unwrap(parseAccountId('other-account')),
      },
      { consumers: ['model'], policy: { maxBindings: 8, maxContextKeys: 16 } },
    ),
  ).toThrow('Confirmed fixed Context read source required')
  const issued = await owner.issuer.issue(request)
  expect(issued.kind).toBe('issued')
  if (issued.kind !== 'issued') throw new Error('actual read grant missing')
  const context = await f.assembly.context(scope)!.ready
  expect(await context.bind(issued.access, scope, 'model')).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  expect(await owner.operations.authorize(issued.access, scope, 'context.read')).toHaveProperty(
    'kind',
    'authorized',
  )
  expect(await owner.issuer.issue({ ...request, principalKind: 'agent' })).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  expect(await owner.operations.authorize(issued.access, scope, 'tool.submit')).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  expect(await owner.operations.authorize(issued.access, scope, 'session.log.coordinate')).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  f.exchanges.mockImplementation(async (_options, request) => ({
    kind: 'reply',
    sendAttempted: true,
    reply: {
      result: (request as { operation: string }).operation.endsWith('#S-36')
        ? tenant
        : { standing: 'ineffective' },
    },
  }))
  const ticket = await f.admission.reserve(source, {
    tenant,
    session: null,
    purpose: 'createSession',
    operationKey: 'actual-grant-refusal',
    inputPosition: null,
  })
  await f.admission.query(ticket.ticket)
  expect(await owner.operations.authorize(issued.access, scope, 'context.read')).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
})
it('reads the actual isolated Context through an issued live binding and rejects copied and revoked bindings', async () => {
  const f = await setup()
  const { scope, issued, context } = await issuedContext(f)
  const binding = await context.bind(issued.access, scope, 'model')
  expect(binding).toHaveProperty('kind', 'bound')
  if (binding.kind !== 'bound') throw new Error('actual Context binding failed')
  expect(await binding.reader.read([])).toEqual({ kind: 'values', values: [] })
  expect(await context.bind({ ...issued.access }, scope, 'model')).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  f.access.issuer.revoke(issued.access)
  expect(await binding.reader.read([])).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
})
it('rejects claimed identity, scope and operation outside the trusted grant before authority IO', async () => {
  const f = await setup()
  const { scope, request, issued } = await issuedContext(f)
  const calls = f.checks.mock.calls.length
  expect(await f.access.issuer.issue({ ...request, principalKind: 'agent' })).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  expect(
    await f.access.issuer.issue({ ...request, operations: ['session.log.coordinate'] }),
  ).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
  const foreign = {
    tenant: unwrap(parseTenantId({ organization: 'foreign', account: source.accountId })),
    session: scope.session,
  }
  expect(await f.access.operations.authorize(issued.access, foreign, 'context.read')).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  expect(await f.access.operations.authorize(issued.access, scope, 'tool.submit')).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
  expect(f.checks).toHaveBeenCalledTimes(calls)
})
it('refuses an old Context reader after actual G28 observes current member refusal', async () => {
  const f = await setup()
  const { scope, issued, context } = await issuedContext(f)
  const bound = await context.bind(issued.access, scope, 'model')
  if (bound.kind !== 'bound') throw new Error('actual Context binding failed')
  f.exchanges.mockImplementation(async (_options, request) => ({
    kind: 'reply',
    sendAttempted: true,
    reply: {
      result: (request as { operation: string }).operation.endsWith('#S-36')
        ? tenant
        : { standing: 'ineffective' },
    },
  }))
  const next = await f.admission.reserve(source, {
    purpose: 'createSession',
    tenant,
    session: null,
    inputPosition: null,
    operationKey: 'member-refusal',
  })
  expect(await f.admission.query(next.ticket)).toHaveProperty('state', 'memberRejected')
  expect(await bound.reader.read([])).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
  expect(await f.access.operations.authorize(issued.access, scope, 'context.read')).toEqual({
    kind: 'rejected',
    reason: 'notAuthorized',
  })
})

it('checks revocation again after an original authority read finishes', async () => {
  const f = await setup()
  const { scope, issued } = await issuedContext(f)
  const gate = f.pauseChecks()
  const reading = f.access.operations.authorize(issued.access, scope, 'context.read')
  try {
    await gate.entered
    f.access.issuer.revoke(issued.access)
  } finally {
    gate.release()
  }
  expect(await reading).toEqual({ kind: 'rejected', reason: 'notAuthorized' })
})
it('close drains the original issue check and prevents a late token without closing borrowed runtime', async () => {
  const f = await setup()
  const { request, scope } = await issuedContext(f)
  const gate = f.pauseChecks()
  const issuing = f.access.issuer.issue(request)
  await gate.entered
  let closed = false
  const closing = f.access.close().then(() => {
    closed = true
  })
  try {
    await Promise.resolve()
    expect(closed).toBe(false)
    expect(await f.access.issuer.issue(request)).toEqual({
      kind: 'rejected',
      reason: 'ownerStopped',
    })
  } finally {
    gate.release()
  }
  expect(await issuing).toEqual({ kind: 'rejected', reason: 'ownerStopped' })
  await closing
  expect(await f.runtime.operations.readSession(f.runtime.access, scope.session)).toHaveProperty(
    'kind',
    'session',
  )
})
it('reserves capacity before concurrent issue checks and only releases an original live slot on revoke', async () => {
  const f = await setup(1)
  const { request, issued } = await issuedContext(f)
  f.access.issuer.revoke(issued.access)
  const gate = f.pauseChecks()
  const first = f.access.issuer.issue(request)
  await gate.entered
  const calls = f.checks.mock.calls.length
  try {
    expect(await f.access.issuer.issue(request)).toEqual({
      kind: 'rejected',
      reason: 'unavailable',
    })
    expect(f.checks).toHaveBeenCalledTimes(calls)
  } finally {
    gate.release()
  }
  const accepted = await first
  expect(accepted).toHaveProperty('kind', 'issued')
  if (accepted.kind !== 'issued') throw new Error('original issue failed')
  expect(await f.access.issuer.issue(request)).toEqual({ kind: 'rejected', reason: 'unavailable' })
  f.access.issuer.revoke(accepted.access)
  expect(await f.access.issuer.issue(request)).toHaveProperty('kind', 'issued')
})

it('rejects malformed or duplicate grants before checking authority', async () => {
  const f = await setup()
  const { request } = await issuedContext(f)
  const calls = f.checks.mock.calls.length
  expect(await f.access.issuer.issue({ ...request, contextKeys: ['same', 'same'] })).toEqual({
    kind: 'rejected',
    reason: 'invalidInput',
  })
  expect(
    await f.access.issuer.issue({ ...request, operations: ['context.read', 'context.read'] }),
  ).toEqual({ kind: 'rejected', reason: 'invalidInput' })
  expect(
    await f.access.issuer.issue({ ...request, scope: { ...request.scope, session: '' as never } }),
  ).toEqual({ kind: 'rejected', reason: 'invalidInput' })
  expect(f.checks).toHaveBeenCalledTimes(calls)
})
it('retains a substituted authority identity as a defect instead of issuing its changed principal kind', async () => {
  const f = await setup()
  const { request } = await issuedContext(f)
  f.corruptIdentity(identity => ({ ...identity, principalKind: 'agent' }))
  await expect(f.access.issuer.issue(request)).rejects.toThrow('substituted the original identity')
})
it('propagates the original authority defect without issuing a token or replacing it with an authorization decision', async () => {
  const f = await setup()
  const { request } = await issuedContext(f)
  const original = new Error('controlled original authority defect')
  f.faultAuthority(original)
  await expect(f.access.issuer.issue(request)).rejects.toBe(original)
})

it('does not publish or initialize a Session when its actual definition has no explicit Context declaration', async () => {
  const f = await setup(16, false)
  expect(await f.runtime.operations.createSession(f.runtime.access, input)).toEqual({
    failure: 'unavailable',
  })
  const entries = await f.storage.read(async tx =>
    narrow<{ sr_session_creation: { session: string; published: number } }>(tx)
      .selectFrom('sr_session_creation')
      .selectAll()
      .execute(),
  )
  expect(entries).toHaveLength(1)
  expect(entries[0]?.published).toBe(0)
})
it('uses the selected immutable source version and never substitutes a later version or another tenant', async () => {
  const f = await setup()
  const { scope } = await issuedContext(f)
  const reading = await f.assembly.inputs(scope)!.read(scope.session, tenant)
  if (!('input' in reading)) throw new Error('actual source unreadable')
  const original = await contextSeedFromDefinition(scope, reading.input)
  expect(original).toEqual({ seed: { required: [], initial: [], fixed: [] } })
  const absentSource = {
    ...reading.input,
    root: { ...reading.input.root, source: { ...reading.input.root.source, version: 2 } },
  }
  expect(await contextSeedFromDefinition(scope, absentSource)).toEqual({ unavailable: true })
  const foreign = {
    ...scope,
    tenant: unwrap(parseTenantId({ organization: 'other', account: source.accountId })),
  }
  expect(await contextSeedFromDefinition(foreign, reading.input)).toEqual({ unavailable: true })
})

it('rejects an invalid declaration in a legal deployed root instead of initializing an empty Context', async () => {
  const f = await setup(16, 'invalid')
  expect(await f.runtime.operations.createSession(f.runtime.access, input)).toEqual({
    failure: 'unavailable',
  })
  expect(f.seed).toHaveBeenCalledTimes(1)
  const entries = await f.storage.read(async tx =>
    narrow<{ sr_session_creation: { session: string; published: number } }>(tx)
      .selectFrom('sr_session_creation')
      .selectAll()
      .execute(),
  )
  expect(entries[0]?.published).toBe(0)
})
it('requires the actual trusted factory holding before treating root data as the Context declaration source', async () => {
  const f = await setup()
  const { scope } = await issuedContext(f)
  const reading = await f.assembly.inputs(scope)!.read(scope.session, tenant)
  if (!('input' in reading)) throw new Error('actual source unreadable')
  const missingFactory = {
    ...reading.input,
    holdings: reading.input.holdings.filter(holding => holding.holder.layer !== 'factory'),
  }
  expect(await contextSeedFromDefinition(scope, missingFactory)).toEqual({ unavailable: true })
})

it('reads human text from the actual authorized journal without starting work or exposing internal facts', async () => {
  const f = await setup()
  const created = await f.runtime.operations.createSession(f.runtime.access, input)
  if (!('kind' in created) || created.kind !== 'created') throw new Error('actual creation failed')
  const scope = { tenant, session: created.session }
  const message = judgeMessage({
    id: 'human-1',
    type: 'user',
    createdAt: now,
    blocks: [
      {
        id: 'visible-1',
        kind: 'text',
        text: 'visible input',
        visibility: { toHuman: true, toModel: true },
      },
      {
        id: 'model-1',
        kind: 'text',
        text: 'model secret',
        visibility: { toHuman: false, toModel: true },
      },
    ],
  })
  if ('rejected' in message || message.ok.type !== 'user') throw new Error('bad message fixture')
  expect(
    await f.runtime.operations.submitInput(
      f.runtime.access,
      scope.session,
      'submit-human-1',
      message.ok,
    ),
  ).toHaveProperty('kind', 'accepted')
  const before = await f.runtime.operations.readProgress(f.runtime.access, scope.session)
  const reader = createSessionConversationReader({ tenant, ingress: f.runtime })
  const reading = await reader.read(scope)
  expect(reading).toMatchObject({
    kind: 'messages',
    messages: [
      {
        id: 'human-1',
        type: 'user',
        blocks: [{ id: 'visible-1', kind: 'text', text: 'visible input' }],
      },
    ],
  })
  if ('failure' in reading) throw new Error('actual reading failed')
  expect(reading.messages).toHaveLength(1)
  expect(reading.messages[0]?.blocks).toHaveLength(1)
  expect(JSON.stringify(reading)).not.toContain('model secret')
  expect(JSON.stringify(reading)).not.toContain('session_initialized')
  expect(await reader.read(scope)).toEqual(reading)
  expect(await f.runtime.operations.readProgress(f.runtime.access, scope.session)).toEqual(before)
  expect(f.seed).toHaveBeenCalledTimes(1)
  expect(f.exchanges).toHaveBeenCalledTimes(2)
})
it('denies foreign tenant before journal work and rechecks the actual member before each text read', async () => {
  const f = await setup()
  const created = await f.runtime.operations.createSession(f.runtime.access, input)
  if (!('kind' in created) || created.kind !== 'created') throw new Error('actual creation failed')
  const read = vi.fn(f.runtime.journal.readPrefix)
  const reader = createSessionConversationReader({
    tenant,
    ingress: { ...f.runtime, journal: { readPrefix: read } },
  })
  const scope = { tenant, session: created.session }
  expect(
    await reader.read({
      ...scope,
      tenant: unwrap(parseTenantId({ organization: 'foreign', account: source.accountId })),
    }),
  ).toEqual({ failure: 'denied' })
  expect(read).not.toHaveBeenCalled()
  f.exchanges.mockImplementation(async (_options, request) => ({
    kind: 'reply',
    sendAttempted: true,
    reply: {
      result: (request as { operation: string }).operation.endsWith('#S-36')
        ? tenant
        : { standing: 'ineffective' },
    },
  }))
  expect(
    await f.admission.query(
      (
        await f.admission.reserve(source, {
          tenant,
          session: null,
          purpose: 'createSession',
          operationKey: 'deny-read',
          inputPosition: null,
        })
      ).ticket,
    ),
  ).toHaveProperty('state', 'memberRejected')
  expect(await reader.read(scope)).toEqual({ failure: 'denied' })
})

it('preserves visible tool result structure while hiding every private subtree', async () => {
  const f = await setup()
  const created = await f.runtime.operations.createSession(f.runtime.access, input)
  if (!('kind' in created) || created.kind !== 'created') throw new Error('actual creation failed')
  const text = (id: string, toHuman: boolean) => ({
    id,
    kind: 'text',
    text: id,
    visibility: { toHuman, toModel: true },
  })
  const result = (id: string, toHuman: boolean, blocks: unknown[]) => ({
    id,
    kind: 'tool_result',
    callId: 'view-call',
    outcome: 'completed',
    visibility: { toHuman, toModel: true },
    blocks,
  })
  const message = judgeMessage({
    id: 'tool-view',
    type: 'tool',
    callId: 'view-call',
    createdAt: now,
    blocks: [
      result('parent', true, [
        result('hidden-parent', false, [text('hidden-descendant', true)]),
        text('visible', true),
        text('hidden-leaf', false),
      ]),
    ],
  })
  if ('rejected' in message) throw new Error('bad nested tool message')
  expect(
    await f.log.append(
      created.session,
      [{ tenant, readKeys: [], payload: messageLogPayload(message.ok) }],
      { kind: 'unfenced' },
      { kind: 'unconditional' },
    ),
  ).toHaveProperty('tail')
  const read = await createSessionConversationReader({ tenant, ingress: f.runtime }).read({
    tenant,
    session: created.session,
  })
  expect(read).toMatchObject({
    kind: 'messages',
    messages: [
      {
        type: 'tool',
        blocks: [
          {
            id: 'parent',
            kind: 'tool_result',
            call: 'view-call',
            outcome: 'completed',
            blocks: [{ id: 'visible', kind: 'text', text: 'visible' }],
          },
        ],
      },
    ],
  })
  expect(JSON.stringify(read)).not.toContain('hidden')
  if ('failure' in read) throw new Error('actual reading failed')
  expect(read.messages[0]?.blocks).toHaveLength(1)
})
it('rejects non-data scopes without running accessors or touching the actual journal', async () => {
  const f = await setup()
  const read = vi.fn(f.runtime.journal.readPrefix)
  const reader = createSessionConversationReader({
    tenant,
    ingress: { ...f.runtime, journal: { readPrefix: read } },
  })
  const getter = vi.fn(() => tenant)
  const scope = Object.create(null, {
    tenant: { enumerable: true, get: getter },
    session: { enumerable: true, value: 'invalid' },
  }) as SessionScope
  expect(await reader.read(scope)).toEqual({ failure: 'invalidInput' })
  expect(
    await reader.read({ tenant, session: 'invalid', extra: true } as unknown as SessionScope),
  ).toEqual({ failure: 'invalidInput' })
  expect(getter).not.toHaveBeenCalled()
  expect(read).not.toHaveBeenCalled()
})

it('dispatches strict data through the original ingress and actual Context and recognizes the original operation', async () => {
  const f = await setup()
  const binding = { formatVersion: 1 as const, centerId, tenant }
  const endpoint = createSessionHostEndpoint({ binding, ingress: f.runtime })
  const request = parseSessionHostRequest({
    format: 'omne-session-host/1',
    binding,
    command: 'createSession',
    input,
  })
  if (!request) throw new Error('valid actual request rejected')
  const created = await endpoint.execute(request)
  if (!('kind' in created) || created.kind !== 'created')
    throw new Error('actual host creation failed')
  const scope = { tenant, session: created.session }
  expect(f.assembly.context(scope)).toBeDefined()
  expect(f.seed).toHaveBeenCalledTimes(1)
  expect(await endpoint.execute(request)).toEqual(created)
  expect(f.seed).toHaveBeenCalledTimes(1)
  const read = parseSessionHostRequest({
    format: 'omne-session-host/1',
    binding,
    command: 'readMessages',
    session: created.session,
  })
  if (!read) throw new Error('valid journal request rejected')
  expect(await endpoint.execute(read)).toMatchObject({ kind: 'messages', messages: [] })
  const before = f.exchanges.mock.calls.length
  const foreign = parseSessionHostRequest({
    ...read,
    binding: { ...binding, centerId: 'b'.repeat(32) },
  })
  if (!foreign) throw new Error('valid foreign identity rejected at parser')
  expect(await endpoint.execute(foreign)).toEqual({ failure: 'denied' })
  expect(f.exchanges).toHaveBeenCalledTimes(before)
})

async function originalModelInput(
  resultSource?: (storage: AtomicStorage) => ModelResultSource,
  nativeTiming = false,
  workSettled?: import('@omne-harness-lite/session-runtime-local').RuntimeOptions['workSettledIn'],
  issue?: RuntimeOptions['modelIssue'],
) {
  const f = await setup(
    16,
    true,
    issue === undefined,
    resultSource,
    nativeTiming,
    workSettled,
    issue,
  )
  const created = await f.runtime.operations.createSession(f.runtime.access, input)
  if (!('kind' in created) || created.kind !== 'created') throw new Error('Session not created')
  const scope = { tenant, session: created.session }
  const message = judgeMessage({
    id: 'model-root-message',
    type: 'user',
    createdAt: now,
    blocks: [
      {
        kind: 'text',
        id: 'model-root-block',
        text: 'one request',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if ('rejected' in message || message.ok.type !== 'user')
    throw new Error('invalid original user message')
  const accepted = await f.runtime.operations.submitInput(
    f.runtime.access,
    scope.session,
    'model-root-input',
    message.ok,
  )
  if (!('kind' in accepted) || accepted.kind !== 'accepted') throw new Error('input not accepted')
  return { f, scope, accepted }
}
it('reassembles an explicitly selected release root without changing the original Session log', async () => {
  const f = await originalModelInput()
  const prepared = await prepareSessionModelRun({
    ingress: f.f.runtime,
    scope: f.scope,
    identities: {
      startKey: 'upgrade-run',
      attemptKey: 'upgrade-attempt',
      prepareKey: 'upgrade-prepare',
      call: 'upgrade-call',
      originalPosition: 'upgrade-origin',
    },
  })
  if (!('kind' in prepared) || prepared.kind !== 'prepared')
    throw new Error('original Run preparation unavailable')
  const borrowed = await f.f.runtime.runJournal.borrow(
    f.f.runtime.coordinationAuthority,
    f.scope,
    prepared.preparation.run,
  )
  if (!('journal' in borrowed)) throw new Error('original Run journal unavailable')
  cleanup.push(borrowed.journal.close)
  for (const migration of assemblyManifestMigrations)
    await f.f.storage.write(tx => migration.migration.up(tx.db))
  const manifest = createAssemblyManifestStore(f.f.storage)
  cleanup.push(() => manifest.close())
  const options = {
    bootstrap: f.f.assembly,
    journal: borrowed.journal,
    tenancy: f.f.runtime.tenancy,
    initialFillRef: 'release-v1-fill',
    evaluation: { toolEnvironmentPermission: 'always-allow' as const },
    registry: {
      manifest,
      deployedMeta: [],
      clock: { now: async () => unwrap(instantFromRfc3339(now)) },
      diagnostic() {},
      diagnosticFailure() {},
      monotonicNow: process.hrtime.bigint,
      conflictPolicy: { maxRetries: 0 },
      maxInFlight: 4,
    },
  }
  const first = createSessionRunAssets(options)
  cleanup.push(first.close)
  const original = await first.ready
  if ('unavailable' in original) throw new Error('initial registry unavailable')
  const initial = await original.input.read(f.scope.session, tenant)
  if (!('input' in initial)) throw new Error('original evaluation inputs unavailable')
  const root = initial.input.definitions.find(item => item.id === 'root-asset')
  if (!root) throw new Error('actual release root unavailable')
  const next = await installOfficialFactoryDefinition(f.f.base, {
    definition: {
      ...root,
      versions: [
        ...root.versions,
        { ...root.versions[0], number: 2, publishedAt: '2026-10-10T00:00:00Z' },
      ],
    },
    since: '2026-10-10T00:00:00Z',
    holders: [
      { layer: 'organization', organization: tenant.organization },
      { layer: 'tenant', tenant },
    ],
  })
  expect(next).not.toHaveProperty('failure')
  await first.close()
  const before = await borrowed.journal.readPrefix()
  const fixed = createSessionRunAssets({ ...options, initialFillRef: 'must-retain-original' })
  cleanup.push(fixed.close)
  const retained = await fixed.ready
  if ('unavailable' in retained) throw new Error('fixed registry unavailable')
  expect(
    await retained.registry.refreshAvailability(
      f.scope.session,
      { kind: 'start', runId: prepared.preparation.run },
      prepared.preparation.attempt,
    ),
  ).toEqual({ failure: 'unavailable' })
  expect(await manifest.readHead(f.scope.session)).toHaveProperty('head', 1)
  await fixed.close()
  const upgraded = createSessionRunAssets({
    ...options,
    refreshRoot: definition,
  })
  cleanup.push(upgraded.close)
  const current = await upgraded.ready
  if ('unavailable' in current) throw new Error('release reassembly unavailable')
  expect(
    await current.registry.refreshAvailability(
      f.scope.session,
      { kind: 'start', runId: prepared.preparation.run },
      prepared.preparation.attempt,
    ),
  ).toHaveProperty('report')
  expect(await manifest.readHead(f.scope.session)).toHaveProperty('head', 2)
  expect(await borrowed.journal.readPrefix()).toEqual(before)
  await upgraded.close()
  const replay = createSessionRunAssets({
    ...options,
    initialFillRef: 'must-not-fill-again',
    refreshRoot: definition,
  })
  cleanup.push(replay.close)
  expect(await replay.ready).not.toHaveProperty('unavailable')
  expect(await manifest.readHead(f.scope.session)).toHaveProperty('head', 2)
})
it.each(['normal', 'foreignScope', 'fillReceiptLost'] as const)(
  'public driver pairs the original Run reader with actual bootstrap, Context and adopted registry: %s',
  async fault => {
    let native: ReturnType<typeof createSessionModelRuntime> | undefined
    let bridge!: SessionModelResultSource,
      work!: SessionDriverWorkOwner,
      original!: OriginalIssueOwner
    let sourceStorage!: AtomicStorage
    const accepted = await originalModelInput(
      storage => {
        sourceStorage = storage
        work = createSessionDriverWorkOwner({ storage, tenant, maxRecords: 16 })
        bridge = createSessionModelResultSource({
          storage,
          tenant,
          executionSource: () => native?.executionSource,
          maxCaptures: 4,
          retainReferencesIn: async unit => {
            unit.assertStorage(storage)
            return 'retained'
          },
        })
        return bridge.source
      },
      true,
      (...args) => work.readIn(...args),
      {
        maxRecords: 16,
        create(binding) {
          original = createOriginalIssueOwner({
            storage: sourceStorage,
            log: binding.log,
            access: binding.access,
            authority: binding.authority,
            limit: 8,
          })
          return original.participant
        },
      },
    )
    const { f, scope } = accepted
    let returnedScope = scope
    if (fault === 'foreignScope') {
      const other = await f.runtime.operations.createSession(f.runtime.access, {
        ...input,
        operationKey: 'public-source-foreign-session',
      })
      if (!('kind' in other) || other.kind !== 'created')
        throw new Error('actual foreign Session unavailable')
      returnedScope = { tenant, session: other.session }
    }
    cleanup.push(async () => {
      expect(await original.close()).toEqual({ kind: 'released' })
    })
    cleanup.push(async () => {
      expect(bridge.close()).toEqual({ released: true })
    })
    const ports = nativeCallFixturePorts(scope, f.runtime, f.storage)
    const construction = ports.configure(nativeModelConstruction(f.storage))
    native = createSessionModelRuntime(construction)
    nativeModels.push(native)
    for (const migration of assemblyManifestMigrations)
      await f.storage.write(tx => migration.migration.up(tx.db))
    const manifest = createAssemblyManifestStore(f.storage)
    cleanup.push(() => manifest.close())
    const returned = vi.fn(),
      diagnostic = vi.fn()
    const acquire: LocalSessionDriverOptions['sources']['acquire'] = async (requested, journal) => {
      expect(requested).toEqual(scope)
      expect(journal.scope).toEqual(scope)
      const context = f.assembly.context(requested)
      if (!context) throw new Error('actual original bootstrap Context missing')
      const runtimeContext = await context.ready
      const registryPolicy = {
        manifest,
        deployedMeta: [] as const,
        clock: { now: async () => unwrap(instantFromRfc3339(now)) },
        diagnostic() {},
        diagnosticFailure() {},
        monotonicNow: process.hrtime.bigint,
        conflictPolicy: { maxRetries: 0 },
        maxInFlight: 4,
      }
      const assetOptions = {
        bootstrap: f.assembly,
        journal,
        tenancy: f.runtime.tenancy,
        initialFillRef: 'public-driver-root-fill',
        evaluation: { toolEnvironmentPermission: 'always-allow' as const },
        registry: registryPolicy,
      }
      if (fault === 'normal' && returned.mock.calls.length === 0) {
        const stopped = createSessionRunAssets(assetOptions)
        await stopped.close()
        expect(await stopped.ready).toEqual({ unavailable: true })
        const unavailable = createSessionRunAssets({
          ...assetOptions,
          registry: {
            ...registryPolicy,
            manifest: {
              ...manifest,
              readHead: async () => ({ failure: 'unavailable' as const }),
            },
          },
        })
        cleanup.push(unavailable.close)
        expect(await unavailable.ready).toEqual({ unavailable: true })
        expect(await manifest.readHead(scope.session)).toEqual({ head: 0, latest: {} })
        await unavailable.close()
      }
      if (fault === 'fillReceiptLost') {
        const append = vi.fn(async (...args: Parameters<typeof manifest.append>) => {
          const result = await manifest.append(...args)
          return 'seq' in result ? { failure: 'unavailable' as const } : result
        })
        const lost = createSessionRunAssets({
          ...assetOptions,
          registry: { ...registryPolicy, manifest: { ...manifest, append } },
        })
        cleanup.push(lost.close)
        expect(await lost.ready).toEqual({ unavailable: true })
        expect(append).toHaveBeenCalledOnce()
        expect(await manifest.readHead(scope.session)).toHaveProperty('head', 1)
        await lost.close()
      }
      let assetOwner = createSessionRunAssets(assetOptions)
      cleanup.push(assetOwner.close)
      let assets = await assetOwner.ready
      if ('unavailable' in assets) throw new Error('actual original Run assets unavailable')
      const first = await manifest.readHead(scope.session)
      expect(first).toHaveProperty('head', 1)
      if (fault === 'normal') {
        await assetOwner.close()
        expect(await assets.registry.list(scope.session, 'tool', { kind: 'session' })).toEqual({
          failure: 'unavailable',
        })
        expect(await assets.input.read(scope.session, tenant)).toEqual({ failure: 'unavailable' })
        assetOwner = createSessionRunAssets({
          ...assetOptions,
          initialFillRef: 'another-run-must-preserve-the-original-fill',
        })
        cleanup.push(assetOwner.close)
        assets = await assetOwner.ready
        if ('unavailable' in assets) throw new Error('actual original Run assets unavailable')
        expect(await manifest.readHead(scope.session)).toEqual(first)
      }
      const { input: reader, registry } = assets
      const runnerTasks = createRunnerTaskOwner({
        ...scope,
        logGeneration: f.log.backing.ownerGeneration,
      })
      const runnerAdmission = {
        grants: Object.freeze(
          {},
        ) as import('@omne-harness-lite/session-runtime-local').SessionDriverRunSources['actions']['admission']['grants'],
        runMode: 'never' as const,
      }
      const runnerOptions: SessionRunRunnerOptions = {
        journal,
        assets,
        manifest,
        tenancy: f.runtime.tenancy,
        backing: f.log.backing,
        access: f.access.operations,
        toolAccess: () => ({ unavailable: true }),
        taskOwner: runnerTasks,
        admission: runnerAdmission,
        ports: {
          readAskState: async () => ({ kind: 'unavailable' }),
          openHandles: async () => ({ unavailable: true }),
          verifyFailure: async () => ({ kind: 'unavailable' }),
          judgeCapabilities: async () => ({ kind: 'unavailable' }),
          now: async () => now,
          mintReminder: () => 'public-root-runner-reminder',
          fallbackNeedsProjection: async () => ({ unavailable: true }),
          invokeCommand: async () => ({ kind: 'notStartedUnavailable' }),
          commandPresence: async () => 'absent',
        },
        readMessagePrefix: async () => ({ unavailable: true }),
        subjectForCandidate: () => ({ unavailable: true }),
        isActive: () => context.currentGeneration() !== null,
      }
      if (fault === 'normal') {
        const stopped = createSessionRunRunner(runnerOptions)
        await stopped.close()
        expect(await stopped.ready).toEqual({ unavailable: true })
        const allocationDefect = new Error('original Runner log borrow failed')
        const brokenBorrow = vi.fn(() => {
          throw allocationDefect
        })
        const failed = createSessionRunRunner({
          ...runnerOptions,
          backing: { ...f.log.backing, borrow: brokenBorrow },
        })
        cleanup.push(failed.close)
        await expect(failed.ready).rejects.toBe(allocationDefect)
        await failed.close()
        expect(brokenBorrow).toHaveBeenCalledOnce()
        const releaseDefect = new Error('original Runner borrow return failed')
        let releaseAttempts = 0
        const borrowing = vi.fn(() => {
          const held = f.log.backing.borrow()
          return {
            ...held,
            async release() {
              if (++releaseAttempts === 1) throw releaseDefect
              await held.release()
            },
          }
        })
        const retained = createSessionRunRunner({
          ...runnerOptions,
          backing: { ...f.log.backing, borrow: borrowing },
        })
        cleanup.push(retained.close)
        const allocated = await retained.ready
        if ('unavailable' in allocated) throw new Error('actual retained Runner not allocated')
        await expect(retained.close()).rejects.toBe(releaseDefect)
        expect(
          await allocated.host.acquireReplay(
            {
              position: 'before_model_call',
              subject: {
                request: { target: 'example/model', parameters: {}, messages: [], tools: [] },
              },
              manifest: scope.session,
              run: journal.run,
              anchor: 'closed-Runner',
            } as Parameters<typeof allocated.host.acquireReplay>[0],
            new AbortController().signal,
          ),
        ).toEqual({ failure: 'unavailable' })
        await retained.close()
        expect(borrowing).toHaveBeenCalledOnce()
        expect(releaseAttempts).toBe(2)
      }
      const runRunner = createSessionRunRunner(runnerOptions)
      cleanup.push(runRunner.close)
      const actions = await runRunner.ready
      if ('unavailable' in actions) throw new Error('actual original Run Runner unavailable')
      const replay = {
        position: 'before_model_call',
        subject: { request: { target: 'example/model', parameters: {}, messages: [], tools: [] } },
        manifest: scope.session,
        run: journal.run,
        anchor: 'public-root-runner-replay',
      } as Parameters<typeof actions.runner.replay>[0]
      expect(await actions.runner.replay(replay)).toEqual([])
      expect(
        await actions.host.acquireReplay(
          { ...replay, manifest: 'foreign' },
          new AbortController().signal,
        ),
      ).toEqual({ failure: 'invalidInput' })
      return {
        scope: returnedScope,
        run: journal.run,
        evaluation: reader,
        registry,
        context: runtimeContext,
        contextGeneration: context.currentGeneration,
        get toolAccess(): never {
          throw new Error('normal model path must not take a tool grant')
        },
        actions: { runner: actions.runner, host: actions.host, admission: runnerAdmission },
        providers: {
          catalog: ports.catalog,
          credentials: ports.credentials,
          tools: { lookup: async () => ({ failure: 'unavailable' as const }) },
          sourceVersions: { controlled: 'normal-root-deployment' },
        },
        selection: {
          owner: ports.owner,
          concurrent: 1,
          sessionTenancy: f.runtime.tenancy,
          catalog: ports.catalog,
          projection: createModalityProjection(scope),
          compatible: (profile, projection) => {
            const blocked = projection.filter(value => !profile.inputModalities.includes(value))
            return blocked.length ? { blocked } : { ok: true }
          },
          now: async () => now,
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
            version: 'public-driver-root',
            external: null,
            system: [],
            pendingCardBlocks: null,
            lastModelRequestPrefixLength: null,
          },
          options: {
            factReaders: new Map([
              [
                'runtime-context',
                (_value, entry) =>
                  'event' in inspectContextLogEntry(scope, entry) ? 'valid' : 'invalid',
              ],
            ]),
          },
        },
        release: async () => {
          await runRunner.close()
          runnerTasks.closeAdmission()
          await runnerTasks.drain()
          await assetOwner.close()
          returned()
        },
      }
    }
    const options: LocalSessionDriverOptions = {
      tenant,
      ingress: f.runtime,
      work,
      sources: { acquire },
      clock: { now: async () => unwrap(instantFromRfc3339(now)) },
      policy: {
        scanLimit: 4,
        intervalMs: 20,
        maxTasks: 2,
        maxHeld: 4,
        maxFailures: 4,
        maxStepsPerPass: 4,
      },
      identities: {
        run: (_scope, position) => ({
          startKey: `public-root-start:${position}`,
          attemptKey: `public-root-attempt:${position}`,
        }),
        model: (_scope, _run, _attempt, position) => ({
          prepareKey: `public-root-prepare:${position}`,
          originalPosition: `public-root-position:${position}`,
          resultKey: `public-root-result:${position}`,
          adoptionKey: `public-root-adopt:${position}`,
          call: unwrap(parseOpaqueIdentifier(`public-root-call:${position}`, 'ModelCallId')),
          creationKey: unwrap(
            parseOpaqueIdentifier(`public-root-create:${position}`, 'CreationKey'),
          ),
        }),
        tool: () => {
          throw new Error('normal reply must not create tool identities')
        },
        modelContent: construction.identities,
      },
      model: {
        original,
        executionSource: () => native?.executionSource,
        results: bridge,
        maxCallReads: 4,
        factory: createSessionDriverModelFactory({
          tenant,
          initialRouteName: 'controlled/model',
          runtime: native,
          facts: construction.callFacts,
        }),
        settlement: {
          create: binding =>
            createSettlementCoordinator({
              ...binding,
              settlementContention: construction.settlementContention,
              settlementScheduler: construction.settlementScheduler,
              diagnostic() {},
            }),
        },
      },
      tools: {
        acquire: async () => {
          throw new Error('normal reply must not borrow the tool pool')
        },
      },
      diagnostic,
    }
    const hostOptions = {
      home: f.directory,
      binding: { formatVersion: 1 as const, centerId, tenant },
      transport: {
        maxRequestBytes: 65536,
        maxResponseBytes: 65536,
        maxConnections: 8,
        maxInFlight: 4,
        requestTimeoutMs: 2000,
        headersTimeoutMs: 1000,
        idleTimeoutMs: 1000,
        checkIntervalMs: 100,
        maxFailureRecords: 8,
        maxHeaderBytes: 8192,
      },
      driver: options,
    }
    if (fault === 'normal') {
      await expect(
        startSessionDriverHost({
          ...hostOptions,
          driver: { ...options, policy: { ...options.policy, maxTasks: 0 } },
        }),
      ).rejects.toThrow('fixed driver tenant, explicit policy and diagnostic required')
      expect(ports.sends()).toBe(0)
    }
    const host = await startSessionDriverHost(hostOptions)
    if (fault === 'foreignScope') {
      await vi.waitFor(() => expect(diagnostic).toHaveBeenCalledOnce(), {
        timeout: 10000,
        interval: 20,
      })
      const denied = await sendSessionHostRequest({
        home: f.directory,
        request: {
          format: 'omne-session-host/1',
          binding: hostOptions.binding,
          command: 'readSession',
          session: scope.session,
        },
        policy: { timeoutMs: 2000, maxResponseBytes: 65536 },
      })
      expect(denied).toMatchObject({ kind: 'unconfirmed', reason: 'hostRejected' })
      await expect(host.close()).rejects.toMatchObject({
        errors: [
          expect.objectContaining({ message: expect.stringContaining('Session driver failed') }),
        ],
      })
      expect(returned).toHaveBeenCalledOnce()
      expect(ports.sends()).toBe(0)
      expect(native.executionSource.snapshot(scope.session)).toEqual([])
      expect(await f.runtime.readWork(f.runtime.coordinationAuthority, scope, 1)).toMatchObject({
        head: { run: { state: 'runnable' } },
      })
      return
    }
    cleanup.push(async () => {
      expect(await host.close()).toEqual({ closed: true })
    })
    await vi.waitFor(
      async () => {
        expect(await f.runtime.readWork(f.runtime.coordinationAuthority, scope, 1)).toMatchObject({
          head: { run: { state: 'completed' } },
          inputs: [],
        })
        expect(returned).toHaveBeenCalledOnce()
      },
      { timeout: 10000, interval: 20 },
    )
    expect(ports.sends()).toBe(1)
    expect(diagnostic).not.toHaveBeenCalled()
    expect(native.executionSource.snapshot(scope.session)[0]!.copyReleased).toBe(true)
    expect(f.assembly.context(scope)!.currentGeneration()).toEqual(expect.any(String))
    if (fault === 'normal') {
      const first = await readSessionSubmission(f.runtime, accepted.accepted.receipt.operation)
      expect(first).toMatchObject({ kind: 'submission', run: { state: 'completed' } })
      const secondInput = judgeMessage({
        id: 'public-driver-second',
        type: 'user',
        createdAt: now,
        blocks: [
          {
            id: 'public-driver-second-text',
            kind: 'text',
            text: 'second public driver request',
            visibility: { toHuman: true, toModel: true },
          },
        ],
      })
      if (!('ok' in secondInput) || secondInput.ok.type !== 'user')
        throw new Error('second input invalid')
      const second = await f.runtime.operations.submitInput(
        f.runtime.access,
        scope.session,
        'public-driver-second-operation',
        secondInput.ok,
      )
      if (!('kind' in second) || second.kind !== 'accepted')
        throw new Error('second input not accepted')
      await vi.waitFor(
        async () => {
          expect(await readSessionSubmission(f.runtime, second.receipt.operation)).toMatchObject({
            kind: 'submission',
            run: { state: 'completed' },
          })
          expect(returned).toHaveBeenCalledTimes(2)
        },
        { timeout: 10000 },
      )
      const secondRead = await readSessionSubmission(f.runtime, second.receipt.operation)
      if (
        !('kind' in first) ||
        first.kind !== 'submission' ||
        !('kind' in secondRead) ||
        secondRead.kind !== 'submission'
      )
        throw new Error('original submissions missing')
      expect(secondRead.run?.id).not.toBe(first.run?.id)
      expect(
        await readSessionSubmission(f.runtime, accepted.accepted.receipt.operation),
      ).toMatchObject({ receipt: first.receipt, run: first.run })
      expect(ports.sends()).toBe(2)
      expect(JSON.stringify(ports.sentRequests[1]!.messages)).toContain(
        'second public driver request',
      )
      expect(JSON.stringify(ports.sentRequests[1]!.messages)).toContain('actual native result')
    }
    const request = parseSessionHostRequest({
      format: 'omne-session-host/1',
      binding: { formatVersion: 1, centerId, tenant },
      command: 'readMessages',
      session: scope.session,
    })
    if (!request) throw new Error('invalid actual read request')
    const before = await f.runtime.journal.readPrefix(f.runtime.access, scope.session)
    const visible = await sendSessionHostRequest({
      home: f.directory,
      request,
      policy: { timeoutMs: 2000, maxResponseBytes: 65536 },
    })
    expect(visible).toMatchObject({ kind: 'reply', result: { kind: 'messages' } })
    expect(await f.runtime.journal.readPrefix(f.runtime.access, scope.session)).toEqual(before)
    expect(await host.close()).toEqual({ closed: true })
    expect(await f.runtime.journal.readPrefix(f.runtime.access, scope.session)).toEqual(before)
  },
)

async function originalModelBinding(
  resultSource?: (storage: AtomicStorage) => ModelResultSource,
  nativeTiming = false,
) {
  const original = await originalModelInput(resultSource, nativeTiming)
  const { f, scope } = original
  const prepared = await prepareSessionModelRun({
    ingress: f.runtime,
    scope,
    identities: {
      startKey: 'model-root-run',
      attemptKey: 'model-root-attempt',
      prepareKey: 'model-root-prepare',
      call: 'model-root-call',
      originalPosition: 'model-root-loop-position',
    },
  })
  if (!('kind' in prepared) || prepared.kind !== 'prepared')
    throw new Error('original model Run not prepared')
  return originalIssueForPrepared(original, prepared)
}
async function originalIssueForPrepared(
  originalInput: Awaited<ReturnType<typeof originalModelInput>>,
  prepared: Extract<Awaited<ReturnType<typeof prepareSessionModelRun>>, { kind: 'prepared' }>,
) {
  const { f, scope, accepted } = originalInput
  const { preparation } = prepared
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
        call: preparation.call,
        dispatch: 1,
        response: 'root-response',
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
          updatedAt: now,
        },
        provider: 'controlled',
        selectedBy: 'session',
        credentialScope: { layer: 'factory' },
        parameters: {},
      },
    },
  })
  if ('invalidValue' in captured) throw new Error('invalid actual dispatched fixture')
  const entry = prepareModelLogEntry({
    session: scope.session,
    shell: { tenant, run: preparation.run, attempt: preparation.attempt },
    captured: captured.ok,
    purpose: { kind: 'record' },
    messagePrefix: null,
  })
  if ('invalidValue' in entry || !entry.ok.dedupeKey) throw new Error('invalid original entry')
  const original: OriginalIssueInput = {
    source: prepared.source,
    entry: entry.ok,
    originalPosition: entry.ok.dedupeKey,
  }
  const unknown = vi.fn(async () => {})
  const issue = f.modelOwner!.bind(f.runtime, scope, preparation, unknown)
  return { f, scope, preparation, original, issue, unknown, accepted }
}
it.each([
  'initial',
  'existing',
  'missingRoute',
  'foreignTenant',
  'unavailablePrefix',
  'lostSelectionReturn',
] as const)(
  'production model factory initializes only a missing durable selection: %s',
  async scenario => {
    const original = await originalModelBinding()
    const ports = nativeCallFixturePorts(original.scope, original.f.runtime, original.f.storage)
    const options = nativeBindingOptions(original, ports.configure)
    const append = vi.fn()
    const factory = createSessionDriverModelFactory({
      tenant:
        scenario === 'foreignTenant'
          ? unwrap(parseTenantId({ ...tenant, organization: 'foreign-organization' }))
          : tenant,
      initialRouteName: ['existing', 'missingRoute'].includes(scenario)
        ? 'not-configured/model'
        : 'controlled/model',
      runtime: options.nativeModel,
      facts: options.construction.callFacts,
    })
    const linked = await createSessionRunModelBinding({
      ...options,
      selection: {
        ...options.selection,
        owner: ports.owner,
        catalog: ports.catalog,
        projection: createModalityProjection(original.scope),
      },
      providers: { ...options.providers, catalog: ports.catalog, credentials: ports.credentials },
      model: {
        async acquire(host) {
          if (scenario === 'existing')
            expect(
              await options.nativeModel.project(host, options.construction.callFacts).selectModel({
                session: original.scope.session,
                routeName: 'controlled/model',
              }),
            ).toEqual({ selected: 'controlled/model' })
          if (scenario !== 'unavailablePrefix' && scenario !== 'lostSelectionReturn')
            return factory.acquire(host)
          return factory.acquire({
            ...host,
            sessions: {
              async bind(session) {
                const bound = await host.sessions.bind(session)
                if ('failure' in bound) return bound
                const log = {
                  ...bound.binding.log,
                  ...(scenario === 'unavailablePrefix'
                    ? { readPrefix: async () => ({ failure: 'unavailable' as const }) }
                    : {
                        log: {
                          ...bound.binding.log.log,
                          async append(...args: Parameters<typeof bound.binding.log.log.append>) {
                            const result = await bound.binding.log.log.append(...args)
                            expect(result).toHaveProperty('positions')
                            append()
                            throw new StorageUnavailable('committed selection return lost')
                          },
                        },
                      }),
                }
                return {
                  binding: {
                    ...bound.binding,
                    log,
                    selection: { ...bound.binding.selection, binding: log },
                  },
                }
              },
            },
          })
        },
      },
    })
    if ('failure' in linked) throw new Error('real model binding unavailable')
    cleanup.push(linked.returnJournal)
    const first = await linked.operations.effectiveModel({ session: original.scope.session })
    const second = await linked.operations.effectiveModel({ session: original.scope.session })
    if (scenario === 'initial' || scenario === 'existing') {
      expect(first).toMatchObject({ effectiveModel: { routeName: 'controlled/model' } })
      expect(second).toEqual(first)
    } else {
      expect(first).toEqual({ unavailable: true })
      expect(second).toEqual(first)
    }
    const prefix = await linked.binding.log.readPrefix!()
    if ('failure' in prefix) throw new Error('real original prefix unavailable')
    const entries = 'history' in prefix ? prefix.history.entries : prefix.entries
    const records = entries.filter(entry => {
      const inspected = inspectModelLogEntry({
        session: original.scope.session,
        tenant,
        entry,
        purpose: { kind: 'record' },
        messagePrefix: null,
      })
      return 'ok' in inspected && inspected.ok.captured.record?.kind === 'model_selection_changed'
    })
    expect(records).toHaveLength(
      ['initial', 'existing', 'lostSelectionReturn'].includes(scenario) ? 1 : 0,
    )
    expect(append).toHaveBeenCalledTimes(scenario === 'lostSelectionReturn' ? 1 : 0)
    expect(ports.sends()).toBe(0)
  },
)

function nativeBindingOptions(
  original: Awaited<ReturnType<typeof originalModelBinding>>,
  configure?: (
    construction: SessionModelConstruction<PlannedSemantics, object>,
  ) => SessionModelConstruction<PlannedSemantics, object>,
): SessionRunModelBindingOptions & {
  readonly nativeModel: ReturnType<typeof createSessionModelRuntime>
  readonly construction: SessionModelConstruction<PlannedSemantics, object>
} {
  const { f, scope, preparation, unknown } = original
  const inputs = f.assembly.inputs(scope)
  if (!inputs || !f.modelOwner) throw new Error('actual Session providers missing')
  const unused = async (): Promise<never> => {
    throw new Error('this journal/admission test must not use catalog or model IO')
  }
  const catalog = {
    readProfile: unused,
    listProfiles: unused,
    credentialPresent: unused,
  }
  const base = nativeModelConstruction(f.storage)
  const construction = configure ? configure(base) : base
  const model = createSessionModelRuntime(construction)
  nativeModels.push(model)
  return {
    construction,
    nativeModel: model,
    model: {
      acquire: async host => ({
        operations: model.project(host, construction.callFacts),
        release: async () => {},
      }),
    },
    host: construction,
    maxCallReads: 4,
    ingress: f.runtime,
    originalIssue: journal => f.modelOwner!.bind(f.runtime, journal.scope, preparation, unknown),
    scope,
    preparation,
    inputs: journal => f.assembly.runInputs(scope, journal),
    selection: {
      owner: {
        name: 'controlled-selection-owner',
        admission: () => 'open',
        acquire: () => ({ unavailable: true }),
        opened: () => ({ confirmed: true }),
        unresolvedWrites: () => [],
      },
      concurrent: 1,
      sessionTenancy: f.runtime.tenancy,
      catalog,
      projection: unused,
      compatible: (profile, projection) => {
        const blocked = projection.filter(value => !profile.inputModalities.includes(value))
        return blocked.length ? { blocked } : { ok: true }
      },
      now: async () => now,
      diagnostic() {},
      onDiagnosticFailure() {},
    },
    providers: {
      catalog,
      credentials: { value: unused },
      tools: { lookup: unused },
      sourceVersions: { fixture: 'explicit-controlled-deployment' },
    },
  }
}
function nativeModelConstruction(
  storage: Awaited<ReturnType<typeof openStorage>>,
): SessionModelConstruction<PlannedSemantics, object> {
  const unavailable = { unavailable: true } as const
  const callPresence: SessionModelConstruction<PlannedSemantics, object>['callPresence'] = {
    read: async () => unavailable,
  }
  const content = createModelCallContentStore({
    storage,
    policy: { maxConcurrentWrites: 2, maxContentBytes: 65536 },
  })
  return {
    execute: ({ input }) => ({ invocation: invokeModel(input) }),
    acknowledgementFactory: createSessionModelAcknowledgement,
    settlementFactory: sessionModelSettlement,
    recordPublication: publishSessionModelCallContent,
    requestPreparation: sessionModelRequestPreparation,
    selectionFactory: createSessionModelSelection,
    readFactory: createSessionModelReads,
    callAccess: { check: async () => unavailable },
    callPresence,
    callFacts: createSessionModelCallFacts({ content, presence: callPresence, maxScopes: 8 }),
    calls: createCallContainerStore(),
    maxScopes: 8,
    sessions: { bind: async () => ({ failure: 'unavailable' }) },
    transport: { clearReuseScope() {}, acquire: () => unavailable },
    settlementContention: {
      name: 'explicit-binding-test',
      limits: { submissions: 1, elapsedMs: 1, retainedBytes: 65536, concurrent: 1 },
      decide: () => ({ stop: true }),
    },
    settlementScheduler: {
      nowMonotonicMs: () => 0,
      wait: () => {
        throw new Error('this test must not retry or wait')
      },
    },
    policy: {
      now: async () => now,
      schedule: () => {
        throw new Error('this test must not invoke model IO')
      },
      firstContentTimeoutMs: 1,
      idleContentTimeoutMs: 1,
      statusCauseTable: {},
      credentialRedaction: {
        credential_fragment_min_length: 8,
        credential_header_names: [],
        credential_patterns: [],
      },
      diagnostic() {},
    },
    tokenMargin: { multiplier: 1, reserveTokens: 0 },
    identities: {
      call: () => 'unused-call',
      response: () => 'unused-response',
      message: () => unwrap(parseOpaqueIdentifier('unused-native-message', 'MessageId')),
    },
    history: {
      call: () => ({ unavailable: true, reason: 'history' }),
      calibration: () => ({ sourceUnavailable: true }),
      failure: () => unavailable,
      run: () => unavailable,
    },
    recovery: {
      authorize: async () => unavailable,
      enter: async () => unavailable,
    },
    reservationWaitPolicy: { maxWaitersPerCall: 1, timeoutMs: 1 },
    acknowledgementCleanup: { next: () => ({ stop: true }) },
    diagnostic() {},
  }
}
async function readNativePrefix(binding: SettlementLogBinding) {
  return readSettlementPrefix({ binding, registration: nativeReadRegistration() })
}
function nativeReadRegistration(): SettlementRegistration {
  return {
    start(_kind, operation) {
      const controller = new AbortController()
      const completion = operation(controller.signal)
      return {
        completion,
        requestStop: () => controller.abort(),
        stopped: completion.then(
          () => {},
          () => {},
        ),
      }
    },
    release() {},
  }
}
async function actualCallAccess() {
  const original = await originalModelBinding()
  const options = nativeBindingOptions(original)
  let borrowed: BorrowedRunJournal | undefined
  const linked = await createSessionRunModelBinding({
    ...options,
    inputs: journal => {
      borrowed = journal
      return options.inputs(journal)
    },
  })
  if ('failure' in linked || !borrowed) throw new Error('actual Run borrow missing')
  cleanup.push(linked.returnJournal)
  const owner = createSessionCallAccess({
    journal: borrowed,
    binding: linked.binding.log,
    ingress: original.f.runtime,
    preparation: original.preparation,
    maxInFlight: 2,
  })
  cleanup.push(owner.close)
  const input = {
    binding: linked.binding.log,
    ref: { session: original.scope.session, callId: original.preparation.call },
    action: 'read' as const,
  }
  return { original, linked, owner, input }
}
it('authorizes the original Run call read from its actual grant and exact preparation, without granting ACK', async () => {
  const { owner, input, original } = await actualCallAccess()
  const observed = vi.fn(
    async (evidence: import('@omne-harness-lite/model-request-runtime').CallAccessEvidence) => ({
      progress: evidence.source.progress,
    }),
  )
  const result = await owner.access.check(input, observed)
  expect(result).toHaveProperty('allowed')
  expect(observed).toHaveBeenCalledOnce()
  expect(result).toHaveProperty('evidence.source.generation', input.binding.generation)
  expect(result).toHaveProperty('evidence.revoked.aborted', false)
  const ack = vi.fn(async () => 'must not ACK')
  expect(await owner.access.check({ ...input, action: 'ack' }, ack)).toHaveProperty('denied', true)
  expect(ack).not.toHaveBeenCalled()
  for (const action of ['cancel', 'settle'] as const) {
    expect(await owner.access.check({ ...input, action }, ack)).toHaveProperty('denied', true)
  }
  expect(ack).not.toHaveBeenCalled()
  expect(
    await original.f.runtime.operations.readProgress(
      original.f.runtime.access,
      original.scope.session,
    ),
  ).toHaveProperty('progress.run', original.preparation.run)
})
it('refuses copied bindings, other calls and false original origins before entering the private callback', async () => {
  const { owner, input, original } = await actualCallAccess()
  const callback = vi.fn(async () => 'must not read')
  expect(
    await owner.access.check({ ...input, binding: { ...input.binding } }, callback),
  ).toHaveProperty('invalidInput')
  expect(
    await owner.access.check({ ...input, ref: { ...input.ref, callId: 'foreign-call' } }, callback),
  ).toHaveProperty('invalidInput')
  const falseOrigin = { ...original.scope, run: original.preparation.run, attempt: 999 }
  expect(await owner.access.check({ ...input, origin: falseOrigin }, callback)).toHaveProperty(
    'invalidInput',
  )
  expect(callback).not.toHaveBeenCalled()
})
it('revokes new call access synchronously and drains the original admitted callback before close', async () => {
  const { owner, input } = await actualCallAccess()
  const entered = Promise.withResolvers<void>(),
    returned = Promise.withResolvers<void>()
  cleanup.push(async () => returned.resolve())
  let signal: AbortSignal | undefined
  const reading = owner.access.check(input, async evidence => {
    signal = evidence.revoked
    entered.resolve()
    await returned.promise
    return 'original read ended'
  })
  await entered.promise
  const closed = vi.fn()
  const closing = owner.close().then(closed)
  expect(signal?.aborted).toBe(true)
  expect(await owner.access.check(input, async () => 'no')).toEqual({ unavailable: true })
  await Promise.resolve()
  expect(closed).not.toHaveBeenCalled()
  returned.resolve()
  expect(await reading).toEqual({ unavailable: true })
  await closing
  expect(closed).toHaveBeenCalledOnce()
})

it('assembles native prefix and unique issue consumers over the same actual original Run journal', async () => {
  const original = await originalModelBinding()
  const linked = await createSessionRunModelBinding(nativeBindingOptions(original))
  if ('failure' in linked) throw new Error('native model binding unavailable')
  cleanup.push(linked.returnJournal)
  expect(linked.binding.log).toBe(linked.binding.selection.binding)
  expect(linked.binding.log.currentGeneration()).toBe(linked.binding.log.generation)
  const prefix = await readNativePrefix(linked.binding.log)
  expect(prefix).toHaveProperty('prefix.source', original.original.source)
  const issue = linked.binding.log.originalIssue!
  const admitted = await issue.admitOriginal(original.original)
  if (!('confirmed' in admitted)) throw new Error('original model not admitted')
  expect(await issue.consumeOriginal(admitted.claim)).toEqual({ kind: 'launch' })
  expect(await issue.consumeOriginal(admitted.claim)).toEqual({ kind: 'unavailable' })
  expect(await issue.admitOriginal(original.original)).toEqual({ kind: 'conflict' })
  expect(original.unknown).not.toHaveBeenCalled()
})
it.each(['member', 'login'] as const)(
  'reads current legal inputs for the original Run after %s refusal and revokes them with its journal',
  async mode => {
    const original = await originalModelBinding()
    const { f, scope, preparation } = original
    const borrowed = await f.runtime.runJournal.borrow(
      f.runtime.coordinationAuthority,
      scope,
      preparation.run,
    )
    if (!('journal' in borrowed)) throw new Error('original journal unavailable')
    cleanup.push(borrowed.journal.close)
    const reader = f.assembly.runInputs(scope, borrowed.journal)
    if (!reader) throw new Error('original Run input reader missing')
    cleanup.push(() => reader.close())
    f.exchanges.mockImplementation(async (_options, request) =>
      mode === 'login'
        ? {
            kind: 'entry-answer',
            answer: 'login-state-rejected',
            sendAttempted: true,
          }
        : {
            kind: 'reply',
            sendAttempted: true,
            reply: {
              result: (request as { operation: string }).operation.endsWith('#S-36')
                ? tenant
                : { standing: 'ineffective' },
            },
          },
    )
    const refused = await f.admission.reserve(source, {
      tenant,
      session: null,
      purpose: 'createSession',
      operationKey: 'refuse-new-input-reader',
      inputPosition: null,
    })
    expect(await f.admission.query(refused.ticket)).toHaveProperty(
      'state',
      mode === 'login' ? 'rejected' : 'memberRejected',
    )
    const exchanges = f.exchanges.mock.calls.length
    const memberRead = await f.assembly.inputs(scope)?.read(scope.session, tenant)
    if (mode === 'member') expect(memberRead).toEqual({ failure: 'unavailable' })
    else
      expect(memberRead).toHaveProperty('input.standing', { standing: 'effective', role: 'member' })
    expect(await reader.read(scope.session, tenant)).toHaveProperty('input.root.source', {
      asset: 'root-asset',
      version: 1,
    })
    expect(f.exchanges.mock.calls.length).toBe(exchanges)
    expect(
      f.assembly.runInputs(
        { ...scope, session: 'foreign-session' as SessionScope['session'] },
        borrowed.journal,
      ),
    ).toBeUndefined()
    await borrowed.journal.close()
    expect(await reader.read(scope.session, tenant)).toEqual({ failure: 'unavailable' })
  },
)
it('keeps actual Session closure pending until the native binding returns its original journal', async () => {
  const original = await originalModelBinding()
  const options = nativeBindingOptions(original)
  const linked = await createSessionRunModelBinding(options)
  if ('failure' in linked) throw new Error('native model binding unavailable')
  cleanup.push(linked.returnJournal)
  let stopped = false
  const closing = original.f.runtime.close().then(() => {
    stopped = true
  })
  await new Promise(resolve => setImmediate(resolve))
  expect(stopped).toBe(false)
  expect(await readNativePrefix(linked.binding.log)).toHaveProperty('prefix')
  expect(await options.nativeModel.close()).toEqual({ released: true })
  expect(await original.f.modelOwner!.close()).toEqual({ kind: 'released' })
  await linked.returnJournal()
  await closing
  expect(linked.binding.log.currentGeneration()).toBeNull()
  expect(await readNativePrefix(linked.binding.log)).toHaveProperty('unavailable', true)
  expect(await original.f.log.readSince(original.scope.session, 0)).toHaveProperty('entries')
})
it('projects an actual physical ModelRuntime without exporting its private execution source', async () => {
  const original = await originalModelBinding()
  const options = nativeBindingOptions(original)
  const linked = await createSessionRunModelBinding(options)
  if ('failure' in linked) throw new Error('native model binding unavailable')
  cleanup.push(linked.returnJournal)
  expect(linked.operations).not.toHaveProperty('executionSource')
  expect(linked.operations).not.toHaveProperty('close')
  expect(Object.keys(linked.operations).sort()).toEqual(
    Object.keys(options.nativeModel.service).sort(),
  )
  expect(
    await linked.operations.effectiveModel({
      session: unwrap(parseOpaqueIdentifier('foreign-native-session', 'SessionRef')),
    }),
  ).toEqual({ invalidInput: { reason: 'malformed' } })
  expect(options.nativeModel.executionSource.snapshot(original.scope.session)).toEqual([])
  const capture = options.nativeModel.executionSource.capture(original.scope.session)
  if (!('capture' in capture)) throw new Error('actual execution source unavailable')
  expect(capture.capture.executions).toEqual([])
  expect(options.nativeModel.executionSource.release()).toEqual({ unavailable: true })
  await options.nativeModel.close()
  expect(options.nativeModel.executionSource.release()).toEqual({ unavailable: true })
  capture.capture.release()
  expect(options.nativeModel.executionSource.release()).toEqual({ released: true })
})
it('shares one physical native runtime across two original bindings and keeps current sources explicit', async () => {
  const original = await originalModelBinding()
  const options = nativeBindingOptions(original)
  const first = await createSessionRunModelBinding(options)
  const second = await createSessionRunModelBinding(options)
  if ('failure' in first || 'failure' in second)
    throw new Error('original native binding unavailable')
  cleanup.push(first.returnJournal, second.returnJournal)
  expect(first.binding.log.generation).not.toBe(second.binding.log.generation)
  expect(first.binding.currentEvaluationInputs).toBe(
    first.binding.selection.currentEvaluationInputs,
  )
  expect(second.binding.currentEvaluationInputs).toBe(
    second.binding.selection.currentEvaluationInputs,
  )
  expect(first.binding.catalog).toBe(options.providers.catalog)
  expect(await first.operations.effectiveModel({ session: original.scope.session })).toEqual({
    unavailable: true,
  })
  expect(await second.operations.effectiveModel({ session: original.scope.session })).toEqual({
    unavailable: true,
  })
  expect(await options.nativeModel.close()).toEqual({ released: true })
  expect(await first.operations.effectiveModel({ session: original.scope.session })).toEqual({
    unavailable: true,
  })
  expect(await second.operations.effectiveModel({ session: original.scope.session })).toEqual({
    unavailable: true,
  })
})
it('rejects a foreign Session before attaching a native original issue binding', async () => {
  const original = await originalModelBinding()
  const options = nativeBindingOptions(original)
  const bind = vi.fn(options.originalIssue)
  expect(
    await createSessionRunModelBinding({
      ...options,
      scope: {
        ...options.scope,
        tenant: unwrap(parseTenantId({ ...tenant, organization: 'other' })),
      },
      originalIssue: bind,
    }),
  ).toEqual({ failure: 'denied' })
  expect(bind).not.toHaveBeenCalled()
})
it('returns an allocated original journal when the trusted native owner construction fails', async () => {
  const original = await originalModelBinding()
  const options = nativeBindingOptions(original)
  const defect = new Error('actual native binding construction defect')
  await expect(
    createSessionRunModelBinding({
      ...options,
      originalIssue() {
        throw defect
      },
    }),
  ).rejects.toBe(defect)
  await original.f.runtime.close()
  expect(await original.f.log.readSince(original.scope.session, 0)).toHaveProperty('entries')
})
it('returns the original journal if native projection detects a different physical content owner', async () => {
  const original = await originalModelBinding()
  const options = nativeBindingOptions(original)
  const foreignContent = createModelCallContentStore({
    storage: original.f.storage,
    policy: { maxConcurrentWrites: 1, maxContentBytes: 65536 },
  })
  cleanup.push(async () => {
    expect(await foreignContent.close()).toEqual({ released: true })
  })
  await expect(
    createSessionRunModelBinding({
      ...options,
      model: {
        acquire: async host => ({
          operations: options.nativeModel.project(host, {
            ...options.construction.callFacts,
            content: foreignContent,
          }),
          release: async () => {},
        }),
      },
    }),
  ).rejects.toThrow('runtime projection must borrow the original content owner')
  await original.f.runtime.close()
})
it('binds the actual original model owner through Session admission and permits one native launch', async () => {
  const { f, original, issue, unknown } = await originalModelBinding()
  const issued = await issue.admitOriginal(original)
  if (!('confirmed' in issued)) throw new Error('original claim not issued')
  expect(await issue.consumeOriginal({ ...issued.claim })).toEqual({ kind: 'invalidInput' })
  expect(
    await Promise.all([issue.consumeOriginal(issued.claim), issue.consumeOriginal(issued.claim)]),
  ).toEqual([{ kind: 'launch' }, { kind: 'unavailable' }])
  expect(await issue.admitOriginal(original)).toEqual({ kind: 'conflict' })
  expect(unknown).not.toHaveBeenCalled()
  expect(
    await f.storage.read(tx =>
      tx.db
        .selectFrom('mr_original_issue')
        .select(eb => eb.fn.countAll<number>().as('n'))
        .executeTakeFirstOrThrow(),
    ),
  ).toEqual({ n: 1 })
  expect(
    await f.storage.read(tx =>
      tx.db
        .selectFrom('sr_model_issue')
        .select(eb => eb.fn.countAll<number>().as('n'))
        .executeTakeFirstOrThrow(),
    ),
  ).toEqual({ n: 1 })
})
it('rejects another Session original identity before the anchor and claim commit', async () => {
  const { f, original, issue } = await originalModelBinding()
  expect(
    await issue.admitOriginal({
      ...original,
      source: {
        ...original.source,
        session: unwrap(parseOpaqueIdentifier('another-session', 'SessionRef')),
      },
    }),
  ).toEqual({ kind: 'conflict' })
  expect(
    await f.storage.read(tx =>
      tx.db
        .selectFrom('mr_original_issue')
        .select(eb => eb.fn.countAll<number>().as('n'))
        .executeTakeFirstOrThrow(),
    ),
  ).toEqual({ n: 0 })
})
it('retains the original unknown model issue before returning unavailable and never grants a replacement claim', async () => {
  const { f, scope, preparation, original, issue, unknown } = await originalModelBinding()
  const write = f.storage.write.bind(f.storage)
  vi.spyOn(f.storage, 'write').mockImplementationOnce(async operation => {
    await write(operation)
    const { StorageUnavailable } = await import('@omne-harness-lite/storage')
    throw new StorageUnavailable('actual original model commit return lost')
  })
  expect(await issue.admitOriginal(original)).toEqual({ kind: 'unavailable' })
  expect(unknown).toHaveBeenCalledExactlyOnceWith({
    kind: 'unknownCommit',
    scope,
    call: preparation.call,
    originalPosition: preparation.originalPosition,
  })
  expect(await issue.admitOriginal(original)).toEqual({ kind: 'conflict' })
  expect(await f.modelOwner!.close()).toEqual({ kind: 'released' })
})
it('stops new original model admission through the actual model owner without closing the Session or Context', async () => {
  const { f, scope, original, issue } = await originalModelBinding()
  expect(await f.modelOwner!.close()).toEqual({ kind: 'released' })
  expect(await issue.admitOriginal(original)).toEqual({ kind: 'unavailable' })
  expect(await f.runtime.operations.readSession(f.runtime.access, scope.session)).toHaveProperty(
    'kind',
    'session',
  )
  expect(f.assembly.context(scope)).toBeDefined()
})
it('rechecks the actual Run terminal state at launch after a committed Session issue', async () => {
  const { f, scope, preparation, original, issue } = await originalModelBinding()
  const issued = await issue.admitOriginal(original)
  if (!('confirmed' in issued)) throw new Error('original claim not issued')
  const prefix = await f.runtime.journal.readPrefix(f.runtime.access, scope.session)
  if (!('kind' in prefix) || prefix.kind !== 'prefix') throw new Error('actual journal missing')
  expect(
    await f.runtime.lifecycle.commitStep(f.runtime.coordinationAuthority, scope, prefix.source, {
      kind: 'finish',
      stepKey: 'finish-before-launch',
      run: preparation.run,
      attempt: preparation.attempt,
      permit: preparation.permit,
      terminal: 'completed',
      reason: 'controlled-settled-source',
    }),
  ).toHaveProperty('kind', 'committed')
  expect(await issue.consumeOriginal(issued.claim)).toEqual({ kind: 'staleAttempt' })
  expect(await f.modelOwner!.close()).toEqual({ kind: 'released' })
})
it('propagates an unknown-responsibility owner defect without silently returning a model launch', async () => {
  const { f, scope, preparation, original } = await originalModelBinding()
  const defect = new Error('original unknown responsibility recording failed')
  const issue = f.modelOwner!.bind(f.runtime, scope, preparation, async () => {
    throw defect
  })
  const write = f.storage.write.bind(f.storage)
  vi.spyOn(f.storage, 'write').mockImplementationOnce(async operation => {
    await write(operation)
    const { StorageUnavailable } = await import('@omne-harness-lite/storage')
    throw new StorageUnavailable('actual original model commit return lost')
  })
  await expect(issue.admitOriginal(original)).rejects.toBe(defect)
  expect(await f.modelOwner!.close()).toEqual({ kind: 'released' })
})

it('recognizes actual original Session custody after lost commit before returning a controlled execution frame', async () => {
  // Native execution metadata is controlled here. Issue, custody, original read and Unit completion are real.
  let bridge!: SessionModelResultSource
  let source: ModelRuntimeExecutionSource | undefined
  const original = await originalModelBinding(storage => {
    bridge = createSessionModelResultSource({
      storage,
      tenant,
      executionSource: () => source,
      maxCaptures: 2,
      retainReferencesIn: async unit => {
        unit.assertStorage(storage)
        return 'retained'
      },
    })
    return bridge.source
  })
  const options = nativeBindingOptions(original)
  const linked = await createSessionRunModelBinding(options)
  if ('failure' in linked) throw new Error('Run binding missing')
  cleanup.push(linked.returnJournal)
  const admitted = await original.issue.admitOriginal(original.original)
  if (!('confirmed' in admitted)) throw new Error('actual original issue missing')
  expect(await original.issue.consumeOriginal(admitted.claim)).toEqual({ kind: 'launch' })
  const base = originalPending()
  if (base.outcome !== 'complete') throw new Error('fixture requires a complete reply')
  const pending = {
    ...base,
    id: 'root-response',
    call: { callId: original.preparation.call, runId: original.preparation.run },
    attemptId: original.preparation.attempt,
    reply: { ...base.reply, response: 'root-response' },
  }
  const unused = async (): Promise<never> => {
    throw new Error('must not ACK controlled execution')
  }
  const execution: ModelRuntimeCapturedExecution = {
    key: { session: original.scope.session, callId: pending.call.callId },
    session: linked.binding,
    owner: linked.binding.selection.owner,
    executionGeneration: Object.freeze({}),
    registered: true,
    released: false,
    copyReleased: false,
    invocation: {
      outcome: Promise.resolve({ replyPending: pending }),
      snapshot() {
        throw new Error('unused')
      },
      observedFacts: () => ({ unavailable: true }),
      abort() {},
      interrupt() {},
      borrowControl: () => ({ unavailable: true }),
      settleReply: unused,
      finishReady: unused,
      close: unused,
    },
  }
  const returned = vi.fn()
  source = {
    capture: () => ({ capture: { executions: [execution], release: returned } }),
    lookup: () => ({ execution }),
    snapshot: () => [execution],
    release: () => ({ unavailable: true }),
  }
  const captured = await bridge.capture(original.scope, pending.call.callId)
  if ('failure' in captured) throw new Error('actual bridge rejected controlled source')
  const prefix = await original.f.runtime.journal.readPrefix(
    original.f.runtime.access,
    original.scope.session,
  )
  if (!('kind' in prefix) || prefix.kind !== 'prefix') throw new Error('actual source missing')
  const write = original.f.storage.write.bind(original.f.storage)
  const fault = vi.spyOn(original.f.storage, 'write').mockImplementationOnce(async callback => {
    await write(callback)
    throw new StorageUnavailable('custody commit return lost')
  })
  expect(
    await original.f.runtime.modelResults.store(
      original.f.runtime.coordinationAuthority,
      original.scope,
      {
        resultKey: 'source-bridge-original-result',
        source: prefix.source,
        pending,
      },
    ),
  ).toMatchObject({
    kind: 'unknownCommit',
    call: pending.call.callId,
    resultKey: 'source-bridge-original-result',
  })
  fault.mockRestore()
  expect(await bridge.release(captured.captured)).toEqual({ pending: true })
  expect(returned).not.toHaveBeenCalled()
  expect(await bridge.confirmCustody(captured.captured, original.f.runtime, 'absent-key')).toEqual({
    failure: 'unavailable',
  })
  expect(await bridge.release(captured.captured)).toEqual({ pending: true })
  const misboundRead = vi
    .fn(original.f.runtime.modelResults.read)
    .mockImplementationOnce(async (...args) => {
      const saved = await original.f.runtime.modelResults.read(...args)
      if (!('pending' in saved)) throw new Error('actual custody missing')
      return {
        ...saved,
        witness: {
          ...saved.witness,
          receipt: { ...saved.witness.receipt, resultKey: 'foreign-key' },
        },
      }
    })
  expect(
    await bridge.confirmCustody(
      captured.captured,
      {
        coordinationAuthority: original.f.runtime.coordinationAuthority,
        modelResults: { ...original.f.runtime.modelResults, read: misboundRead },
      },
      'source-bridge-original-result',
    ),
  ).toEqual({ failure: 'invalidSource' })
  expect(await bridge.release(captured.captured)).toEqual({ pending: true })
  expect(
    await bridge.confirmCustody(
      captured.captured,
      original.f.runtime,
      'source-bridge-original-result',
    ),
  ).toEqual({ confirmed: true })
  expect(await bridge.release(captured.captured)).toEqual({ released: true })
  expect(returned).toHaveBeenCalledTimes(1)
  expect(bridge.close()).toEqual({ released: true })
})

async function actualModelTurn(
  original: Awaited<ReturnType<typeof originalModelBinding>>,
  bridge: SessionModelResultSource,
  fault: string = 'normal',
  gate?: { entered: () => void; wait: Promise<void> },
  existing?: {
    readonly ports: ReturnType<typeof nativeCallFixturePorts>
    readonly options: ReturnType<typeof nativeBindingOptions>
  },
) {
  const ports =
    existing?.ports ??
    nativeCallFixturePorts(original.scope, original.f.runtime, original.f.storage, gate)
  const options =
    existing?.options ??
    nativeBindingOptions(original, base => {
      const configured = ports.configure(base)
      return fault === 'differentCallFactory'
        ? {
            ...configured,
            identities: { ...configured.identities, call: () => 'other-global-call' },
          }
        : configured
    })
  const configured: SessionRunModelBindingOptions = {
    ...options,
    ingress: original.f.runtime,
    originalIssue: journal =>
      original.f.modelOwner!.bind(
        original.f.runtime,
        journal.scope,
        original.preparation,
        original.unknown,
      ),
    scope: original.scope,
    preparation: original.preparation,
    inputs: journal => original.f.assembly.runInputs(original.scope, journal),
    selection: {
      ...options.selection,
      owner: ports.owner,
      catalog: ports.catalog,
      projection: createModalityProjection(original.scope),
    },
    providers: { ...options.providers, catalog: ports.catalog, credentials: ports.credentials },
  }
  const linked = await createSessionRunModelBinding(configured)
  if ('failure' in linked) throw new Error('actual native Run binding failed')
  cleanup.push(linked.returnJournal)
  expect(
    await linked.operations.selectModel({
      session: original.scope.session,
      routeName: 'controlled/model',
    }),
  ).toEqual({ selected: 'controlled/model' })
  const model = await linked.operations.effectiveModel({ session: original.scope.session })
  if (!('effectiveModel' in model)) throw new Error('actual model selection failed')
  for (const migration of assemblyManifestMigrations)
    await original.f.storage.write(tx => migration.migration.up(tx.db))
  const manifest = createAssemblyManifestStore(original.f.storage)
  cleanup.push(() => manifest.close())
  const inputs = original.f.assembly.inputs(original.scope)
  if (!inputs) throw new Error('actual current input source missing')
  const registry = createAssetRegistry({
    manifest,
    currentInputs: inputs,
    sessionTenancy: original.f.runtime.tenancy,
    // This fixed-root test port only serves the unchanged original source; it cannot read a replaced historical body.
    fixedRootInput: {
      read: async request => {
        const current = await inputs.read(request.session, request.tenant)
        if (!('input' in current)) return { failure: 'unavailable', stage: 'source' }
        if (JSON.stringify(current.input.root.source) !== JSON.stringify(request.rootSource))
          return { failure: 'unavailable', stage: 'fixed_body' }
        return current
      },
    },
    deployedMeta: [],
    clock: { now: async () => unwrap(instantFromRfc3339(now)) },
    diagnostic() {},
    diagnosticFailure() {},
    monotonicNow: process.hrtime.bigint,
    conflictPolicy: { maxRetries: 0 },
    maxInFlight: 4,
  })
  cleanup.push(() => registry.close())
  const input = await inputs.read(original.scope.session, tenant)
  if (!('input' in input)) throw new Error('actual current input unavailable')
  const evaluation = evaluate(input.input)
  if (!('ok' in evaluation)) throw new Error('actual given evaluation failed')
  const filled = await registry.fill(
    original.scope.session,
    evaluation.ok,
    'native-given-evaluation',
    evaluation.ok.composition,
  )
  if (!('snapshots' in filled))
    throw new Error('actual manifest fill failed: ' + JSON.stringify(filled))
  const refreshed = await registry.refreshAvailability(
    original.scope.session,
    { kind: 'start', runId: original.preparation.run },
    original.preparation.attempt,
  )
  if (!('report' in refreshed))
    throw new Error('actual availability report failed: ' + JSON.stringify(refreshed))
  const prefixError = new Error('actual host prefix defect')
  const retentionError = new Error('actual host retention defect')
  const retained = vi.fn(async (_record: RetainedSessionModelTurn) => {
    if (fault === 'retentionDefect') throw retentionError
  })
  const ack = vi.fn(
    fault === 'ackUnavailable'
      ? async () => ({ unavailable: true as const })
      : linked.operations.acknowledgeCall,
  )
  const turn: SessionModelTurnOptions = {
    ingress: original.f.runtime,
    scope: original.scope,
    preparation: original.preparation,
    linked: { ...linked, operations: { ...linked.operations, acknowledgeCall: ack } },
    source: bridge,
    call: {
      creationKey: unwrap(parseOpaqueIdentifier('native-session-create-call', 'CreationKey')),
      report: refreshed.report,
      target: model.effectiveModel.routeName,
      basis: model.effectiveModel,
      tools: [],
      host: {
        signal: new AbortController().signal,
        stopping: () => false,
        register: () => ({ registration: { unregister() {} } }),
      },
    },
    projection: {
      options: {
        factReaders: new Map([
          [
            'runtime-context',
            (_value, entry) =>
              'event' in inspectContextLogEntry(original.scope, entry) ? 'valid' : 'invalid',
          ],
        ]),
      },
      rules: {
        version: 'controlled-projection-one',
        external: null,
        system: [],
        pendingCardBlocks: null,
        lastModelRequestPrefixLength: null,
      },
    },
    settlement: {
      owner: ports.owner,
      factory: {
        create: binding =>
          createSettlementCoordinator({
            ...binding,
            settlementContention: options.construction.settlementContention,
            settlementScheduler: options.construction.settlementScheduler,
            diagnostic() {},
          }),
      },
    },
    resultKey: 'native-session-original-result',
    adoptionKey: 'adopt-native-original-result',
    retain: retained,
  }
  return { ports, options, linked, refreshed, prefixError, retentionError, retained, ack, turn }
}

it('derives model eligibility from actual Session history and retains image requirements after compaction', async () => {
  let native: ReturnType<typeof createSessionModelRuntime> | undefined
  let bridge!: SessionModelResultSource
  const original = await originalModelBinding(storage => {
    bridge = createSessionModelResultSource({
      storage,
      tenant,
      executionSource: () => native?.executionSource,
      maxCaptures: 2,
      retainReferencesIn: async unit => {
        unit.assertStorage(storage)
        return 'retained'
      },
    })
    return bridge.source
  }, true)
  const built = await actualModelTurn(original, bridge)
  native = built.options.nativeModel
  const request = { session: original.scope.session, routeName: 'controlled/model' }
  expect(await built.linked.operations.legalTargets({ session: request.session })).toEqual({
    legalTargets: ['controlled/model'],
  })
  for (const [id, type, blocks, extra] of [
    [
      'original-image',
      'user',
      [
        {
          id: 'image',
          kind: 'image',
          mediaType: 'image/png',
          data: { inline: 'AA==' },
          visibility: { toHuman: true, toModel: true },
        },
      ],
      {},
    ],
    [
      'summary-image',
      'compaction',
      [
        {
          id: 'summary',
          kind: 'text',
          text: 'image summary',
          visibility: { toHuman: true, toModel: true },
        },
      ],
      { silenced: [{ messageId: 'original-image', blockId: 'image' }] },
    ],
  ] as const) {
    const message = judgeMessage({ id, type, createdAt: now, blocks, ...extra })
    if (!('ok' in message)) throw new Error('invalid modality fixture')
    const append = await built.linked.binding.log.log.append(
      request.session,
      [
        {
          tenant,
          run: original.preparation.run,
          attempt: original.preparation.attempt,
          readKeys: [],
          payload: messageLogPayload(message.ok),
        },
      ],
      { kind: 'unfenced' },
      { kind: 'unconditional' },
    )
    expect(append).toHaveProperty('positions')
    expect(await built.linked.operations.selectModel(request)).toEqual({
      notLegalTarget: { because: ['modality_mismatch'] },
    })
    expect(await built.linked.operations.legalTargets({ session: request.session })).toEqual({
      legalTargets: [],
    })
    expect(built.ports.sends()).toBe(0)
  }
  expect(bridge.close()).toEqual({ released: true })
})

it.each([
  'normal',
  'differentCallFactory',
  'missingCodec',
  'custodyUnknown',
  'stalePermit',
  'settlementClosed',
  'ackUnavailable',
  'prefixDefect',
  'retentionDefect',
  'agentNormal',
  'agentDenied',
  'agentSourceChanged',
  'agentMissingCurrent',
  'agentContextStopped',
  'agentReconcileNeeded',
  'agentCurrentDefect',
  'agentDetach',
  'agentTransferPending',
  'agentHandoffDefect',
] as const)('runs the host-owned model turn with original responsibility: %s', async fault => {
  // Governance/current qualification, model catalog and transport are controlled. Runtime execution and SQL are real.
  let bridge!: SessionModelResultSource
  let native: ReturnType<typeof createSessionModelRuntime> | undefined
  const original = await originalModelBinding(storage => {
    bridge = createSessionModelResultSource({
      storage,
      tenant,
      executionSource: () => native?.executionSource,
      maxCaptures: 2,
      retainReferencesIn: async unit => {
        unit.assertStorage(storage)
        return 'retained'
      },
    })
    return bridge.source
  }, true)
  const entered = Promise.withResolvers<void>(),
    released = Promise.withResolvers<void>()
  const deferred = ['agentDetach', 'agentTransferPending', 'agentHandoffDefect'].includes(fault)
  cleanup.push(async () => {
    released.resolve()
  })
  const built = await actualModelTurn(
    original,
    bridge,
    fault,
    deferred ? { entered: entered.resolve, wait: released.promise } : undefined,
  )
  const { ports, options, linked, refreshed, prefixError, retentionError, retained, ack, turn } =
    built
  native = options.nativeModel
  const log =
    fault === 'prefixDefect' || fault === 'retentionDefect'
      ? {
          ...linked.binding.log,
          readPrefix: async () => {
            throw prefixError
          },
        }
      : linked.binding.log
  const ingress =
    fault === 'custodyUnknown'
      ? {
          ...original.f.runtime,
          modelResults: {
            ...original.f.runtime.modelResults,
            store: async (...args: Parameters<typeof original.f.runtime.modelResults.store>) => {
              const saved = await original.f.runtime.modelResults.store(...args)
              if (!('pending' in saved))
                throw new Error('actual custody missing before lost result')
              return {
                kind: 'unknownCommit' as const,
                scope: original.scope,
                call: original.preparation.call,
                resultKey: turn.resultKey,
              }
            },
          },
        }
      : original.f.runtime
  const actual: SessionModelTurnOptions = {
    ...turn,
    ingress,
    linked: {
      ...linked,
      binding: { ...linked.binding, log },
      operations: { ...linked.operations, acknowledgeCall: ack },
    },
    projection: fault === 'missingCodec' ? { rules: turn.projection.rules } : turn.projection,
    settlement:
      fault === 'settlementClosed'
        ? { ...turn.settlement, owner: { ...ports.owner, admission: () => 'closed' } }
        : turn.settlement,
    preparation:
      fault === 'stalePermit'
        ? { ...turn.preparation, permit: { ...turn.preparation.permit } }
        : turn.preparation,
  }
  if (fault.startsWith('agent')) {
    const grant = await original.f.access.issuer.issue({
      principal: source.accountId,
      principalKind: 'human',
      scope: original.scope,
      consumer: 'model',
      contextKeys: [],
      operations: ['context.read'],
    })
    if (grant.kind !== 'issued') throw new Error('actual Context access unavailable')
    const contextOwner = original.f.assembly.context(original.scope)!
    const context = await contextOwner.ready
    const contextBinding = await context.bind(grant.access, original.scope, 'model')
    if (contextBinding.kind !== 'bound') throw new Error('actual readable Context unavailable')
    const currentDefect = new Error('root qualification source defect')
    const handoffDefect = new Error('root original job retention defect')
    let held: OriginalSessionModelWork | undefined,
      acceptTransfer = fault !== 'agentTransferPending'
    const transfer = vi.fn(async (work: OriginalSessionModelWork) => {
      held = work
      if (fault === 'agentHandoffDefect') throw handoffDefect
      return acceptTransfer ? ('retained' as const) : ('pending' as const)
    })
    const observe = createSessionModelObservations(actual, nativeReadRegistration(), contextOwner)
    if (fault === 'agentContextStopped') contextOwner.requestStop()
    const frame = createSessionModelAttempt({
      turn: actual,
      registration: nativeReadRegistration(),
      transfer,
      current: async facts => {
        if (fault === 'agentCurrentDefect') throw currentDefect
        const observed = await observe(facts)
        // These cases replace one real observation to exercise its rejection branch.
        return {
          ...observed,
          source:
            fault === 'agentSourceChanged'
              ? { ...facts.source, journalGeneration: 'other-generation' }
              : observed.source,
          authorized: fault === 'agentDenied' ? false : observed.authorized,
          contextGeneration: fault === 'agentMissingCurrent' ? null : observed.contextGeneration,
          reconciled: fault === 'agentReconcileNeeded' ? false : observed.reconciled,
        }
      },
    })
    if (fault === 'agentCurrentDefect') {
      await expect(frame.drive()).rejects.toBe(currentDefect)
      expect(ports.sends()).toBe(0)
      expect(await frame.close()).toEqual({ kind: 'released' })
    } else if (deferred) {
      const cancellation = new AbortController()
      const driving = frame.drive(cancellation.signal)
      await Promise.race([
        entered.promise,
        driving.then(() => {
          throw new Error('drive stopped before native send')
        }),
      ])
      cancellation.abort()
      if (fault === 'agentHandoffDefect') {
        await expect(driving).rejects.toBe(handoffDefect)
        await expect(frame.close()).rejects.toBe(handoffDefect)
        expect(transfer).toHaveBeenCalledTimes(1)
      } else {
        expect(await driving).toMatchObject({
          kind: fault === 'agentDetach' ? 'handedBack' : 'waiting',
          originalCalls: [actual.preparation.originalPosition],
        })
        acceptTransfer = true
        expect(await frame.close()).toEqual({ kind: 'released' })
      }
      expect(held?.turn).toBe(actual)
      expect(held?.originalPosition).toBe(actual.preparation.originalPosition)
      expect(ack).not.toHaveBeenCalled()
      expect(ports.sends()).toBe(1)
      released.resolve()
      expect(await held!.completion).toMatchObject({ acknowledged: true })
      expect(ack).toHaveBeenCalledTimes(1)
    } else {
      const driven = await frame.drive()
      if (fault === 'agentNormal') {
        expect(driven).toHaveProperty('kind', 'committed')
        expect(ack).toHaveBeenCalledTimes(1)
        expect(ports.sends()).toBe(1)
      } else {
        expect(driven).toMatchObject({
          kind: 'blocked',
          reason: fault === 'agentDenied' ? 'denied' : 'unavailable',
        })
        expect(ack).not.toHaveBeenCalled()
        expect(ports.sends()).toBe(0)
      }
      expect(await frame.close()).toEqual({ kind: 'released' })
      expect(transfer).not.toHaveBeenCalled()
      expect(await frame.drive()).toMatchObject({ kind: 'blocked', reason: 'released' })
    }
    expect(bridge.close()).toEqual({ released: true })
    return
  }
  if (fault === 'prefixDefect' || fault === 'retentionDefect') {
    if (fault === 'prefixDefect')
      await expect(runSessionModelTurn(actual)).rejects.toBe(prefixError)
    else {
      try {
        await runSessionModelTurn(actual)
        throw new Error('unexpected success')
      } catch (error) {
        expect(error).toBeInstanceOf(AggregateError)
        expect((error as AggregateError).errors).toEqual([prefixError, retentionError])
      }
    }
    expect(retained).toHaveBeenCalledTimes(1)
    expect(ack).not.toHaveBeenCalled()
    expect(ports.sends()).toBe(0)
    expect(bridge.close()).toEqual({ released: true })
    return
  }
  const result = await runSessionModelTurn(actual)
  if (fault !== 'normal' && fault !== 'differentCallFactory') {
    const stage =
      fault === 'missingCodec'
        ? 'projection'
        : fault === 'custodyUnknown'
          ? 'custody'
          : fault === 'stalePermit'
            ? 'adoption'
            : fault === 'settlementClosed'
              ? 'settlement'
              : 'ack'
    expect(result).toEqual({ retained: true, stage })
    expect(retained).toHaveBeenCalledTimes(1)
    expect(ack).toHaveBeenCalledTimes(fault === 'ackUnavailable' ? 1 : 0)
    expect(ports.sends()).toBe(fault === 'missingCodec' ? 0 : 1)
    const held = retained.mock.calls[0]![0]
    if (held.coordinator) await held.coordinator.close()
    if (held.captured) {
      expect(held.captured).not.toHaveProperty('invocation')
      expect(bridge.close()).toEqual({ pending: true })
      expect(
        await bridge.confirmCustody(held.captured, original.f.runtime, turn.resultKey),
      ).toEqual({ confirmed: true })
      expect(await bridge.release(held.captured)).toEqual({ released: true })
    } else if (fault === 'missingCodec')
      expect(held.reason).toMatchObject({ unavailable: true, reason: 'requiredSource' })
    else {
      expect(fault).toBe('ackUnavailable')
      // Test cleanup recognizes the original already-settled response; the consumer did not retry ACK.
      expect(
        await linked.operations.acknowledgeCall({
          ref: { session: original.scope.session, callId: original.preparation.call },
          expectedResult: { kind: 'response', response: 'actual-native-response' },
        }),
      ).toHaveProperty('acknowledged')
    }
    expect(bridge.close()).toEqual({ released: true })
    return
  }
  expect(retained.mock.calls).toEqual([])
  expect(result).toMatchObject({ acknowledged: true, adoption: { step: 'adoptResult' } })
  expect(ports.sends()).toBe(1)
  expect(ports.requests.length).toBeGreaterThan(0)
  for (const request of ports.requests)
    expect(request.messages).toMatchObject([
      { type: 'user', blocks: [{ kind: 'text', text: 'one request' }] },
    ])
  expect(retained).not.toHaveBeenCalled()
  const human = await createSessionConversationReader({ tenant, ingress: original.f.runtime }).read(
    original.scope,
  )
  if ('failure' in human) throw new Error('actual settled messages unavailable')
  expect(human.messages.filter(message => message.type === 'assistant')).toHaveLength(1)
  expect(human.messages.find(message => message.type === 'assistant')).toHaveProperty(
    'run',
    original.preparation.run,
  )
  expect(bridge.close()).toEqual({ released: true })
})

it('reads actual Run facts from its owned native prefix and refuses invented or unobserved attempts', async () => {
  const original = await originalModelBinding()
  const linked = await createSessionRunModelBinding(nativeBindingOptions(original))
  if ('failure' in linked) throw new Error('original Run binding missing')
  cleanup.push(linked.returnJournal)
  const full = await readNativePrefix(linked.binding.log)
  if (!('prefix' in full)) throw new Error('actual native prefix unavailable')
  const reader = createSessionRunHistory(original.scope)
  expect(reader(full.prefix, original.preparation.run, original.preparation.attempt)).toEqual({
    known: {
      run: original.preparation.run,
      originalAttempt: original.preparation.attempt,
      latestAttempt: original.preparation.attempt,
      terminal: 'open',
    },
  })
  expect(reader(full.prefix, 'invented-run', original.preparation.attempt)).toEqual({
    unavailable: true,
  })
  expect(reader(full.prefix, original.preparation.run, 2)).toEqual({ unavailable: true })
  expect(
    reader(
      { ...full.prefix } as unknown as typeof full.prefix,
      original.preparation.run,
      original.preparation.attempt,
    ),
  ).toEqual({ unavailable: true })
  await linked.returnJournal()
  expect(reader(full.prefix, original.preparation.run, original.preparation.attempt)).toEqual({
    unavailable: true,
  })
})

it('reads the actual terminal Run while refusing a prefix of another original Session', async () => {
  const original = await originalModelBinding()
  const linked = await createSessionRunModelBinding(nativeBindingOptions(original))
  if ('failure' in linked) throw new Error('original Run binding missing')
  cleanup.push(linked.returnJournal)
  const before = await readNativePrefix(linked.binding.log)
  if (!('prefix' in before)) throw new Error('actual prefix unavailable')
  const finished = await original.f.runtime.lifecycle.commitStep(
    original.f.runtime.coordinationAuthority,
    original.scope,
    before.prefix.source,
    {
      kind: 'finish',
      run: original.preparation.run,
      attempt: original.preparation.attempt,
      permit: original.preparation.permit,
      stepKey: 'native-history-finish',
      terminal: 'completed',
      reason: 'controlled-work-settled',
    },
  )
  if (!('kind' in finished) || finished.kind !== 'committed')
    throw new Error('actual finish failed')
  const full = await readNativePrefix(linked.binding.log)
  if (!('prefix' in full)) throw new Error('actual terminal prefix unavailable')
  expect(
    createSessionRunHistory(original.scope)(
      full.prefix,
      original.preparation.run,
      original.preparation.attempt,
    ),
  ).toMatchObject({ known: { terminal: 'ended' } })
  const foreign = createSessionRunHistory({
    ...original.scope,
    session: unwrap(parseOpaqueIdentifier('other-session', 'SessionRef')),
  })
  expect(foreign(full.prefix, original.preparation.run, original.preparation.attempt)).toEqual({
    unavailable: true,
  })
})

it('correlates the original accepted input to its actual Run and never substitutes the last completed Run', async () => {
  const original = await originalModelBinding()
  const operation = original.accepted.receipt.operation
  const active = await readSessionSubmission(original.f.runtime, operation)
  expect(active).toMatchObject({
    kind: 'submission',
    messageId: 'model-root-message',
    run: { id: original.preparation.run, state: 'running' },
  })
  const prefix = await original.f.runtime.journal.readPrefix(
    original.f.runtime.access,
    original.scope.session,
  )
  if ('failure' in prefix) throw new Error('original prefix missing')
  const finished = await original.f.runtime.lifecycle.commitStep(
    original.f.runtime.coordinationAuthority,
    original.scope,
    prefix.source,
    {
      kind: 'finish',
      run: original.preparation.run,
      attempt: original.preparation.attempt,
      permit: original.preparation.permit,
      stepKey: 'submission-original-finish',
      terminal: 'completed',
      reason: 'controlled-no-open-work',
    },
  )
  if (!('kind' in finished) || finished.kind !== 'committed')
    throw new Error('original Run not finished')
  expect(await readSessionSubmission(original.f.runtime, operation)).toMatchObject({
    kind: 'submission',
    run: { id: original.preparation.run, state: 'completed' },
  })
  const next = judgeMessage({
    id: 'submission-next-input',
    type: 'user',
    createdAt: now,
    blocks: [
      {
        id: 'next-text',
        kind: 'text',
        text: 'next request',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if ('rejected' in next || next.ok.type !== 'user') throw new Error('invalid next fixture message')
  const accepted = await original.f.runtime.operations.submitInput(
    original.f.runtime.access,
    original.scope.session,
    'submission-next-operation',
    next.ok,
  )
  if (!('kind' in accepted) || accepted.kind !== 'accepted')
    throw new Error('next input not accepted')
  const nextReading = await readSessionSubmission(original.f.runtime, accepted.receipt.operation)
  expect(nextReading).toMatchObject({ kind: 'submission', run: null, messageId: next.ok.id })
  const endpoint = createSessionHostEndpoint({
    binding: { formatVersion: 1, centerId, tenant },
    ingress: original.f.runtime,
  })
  const request = parseSessionHostRequest({
    format: 'omne-session-host/1',
    binding: { formatVersion: 1, centerId, tenant },
    command: 'readSubmission',
    operation: accepted.receipt.operation,
  })
  if (!request) throw new Error('valid submission request not parsed')
  expect(await endpoint.execute(request)).toEqual(nextReading)
})
it('reads only a submitInput receipt and leaves unknown identities absent without submitting anything', async () => {
  const original = await originalModelBinding()
  const operation = {
    ...original.accepted.receipt.operation,
    operationKey: 'missing-original-input',
  }
  const before = await original.f.log.readSince(original.scope.session, 0)
  expect(await readSessionSubmission(original.f.runtime, operation)).toEqual({ kind: 'absent' })
  expect(
    await readSessionSubmission(original.f.runtime, {
      ...operation,
      operation: 'createSession',
      session: null,
    }),
  ).toEqual({ failure: 'invalidInput' })
  expect(await original.f.log.readSince(original.scope.session, 0)).toEqual(before)
})

it('uses original work tokens and the actual tenant Unit instead of treating absent work as settled', async () => {
  const original = await originalModelBinding()
  const work = createSessionDriverWorkOwner({ storage: original.f.storage, tenant, maxRecords: 1 })
  const read = () =>
    original.f.storage.atomic(unit =>
      unit.run(() => work.readIn(unit, original.scope, original.preparation.run)),
    )
  expect(await read()).toBe('unavailable')
  const token = work.begin(original.scope, original.preparation)
  expect(work.begin(original.scope, original.preparation)).toBe(token)
  expect(() => work.begin(original.scope, { ...original.preparation })).toThrow(
    'original preparation',
  )
  expect(await read()).toBe('pending')
  expect(() => work.complete({ ...token })).toThrow('original work token')
  expect(() => work.release(token)).toThrow('uncompleted')
  expect(await read()).toBe('pending')
  const other = await openStorage({
    dialect: 'sqlite',
    file: join(original.f.directory, 'foreign-unit.sqlite'),
    synchronous: 'full',
  })
  cleanup.push(() => other.close())
  await expect(
    other.atomic(unit =>
      unit.run(() => work.readIn(unit, original.scope, original.preparation.run)),
    ),
  ).rejects.toThrow()
  const foreign = unwrap(parseTenantId({ organization: 'other', account: tenant.account }))
  expect(
    await original.f.storage.atomic(unit =>
      unit.run(() =>
        work.readIn(unit, { ...original.scope, tenant: foreign }, original.preparation.run),
      ),
    ),
  ).toBe('unavailable')
  expect(() => work.begin({ ...original.scope, tenant: foreign }, original.preparation)).toThrow(
    'foreign original work',
  )
  expect(() =>
    work.begin(
      { ...original.scope, session: unwrap(parseOpaqueIdentifier('other-session', 'SessionRef')) },
      { ...original.preparation, call: 'other-call' },
    ),
  ).toThrow('capacity')
  work.complete(token)
  expect(await read()).toBe('settled')
  work.release(token)
  expect(await read()).toBe('unavailable')
})

it('reads the durable Session workspace through the official Context source across registrations', async () => {
  const { options } = await rootFixture()
  const root = await startSessionDriverRuntimeRoot({
    ...options,
    creation: {
      definition: officialSessionDefinition,
      executionType: 'interactive',
      mode: 'never',
      collaboration: 'co-work',
    },
    contextAccess: ingress => {
      const grant = createSessionContextReadGrant(ingress, source, tenant, {
        consumers: ['tool', 'coordinator'],
        policy: { maxBindings: 16, maxContextKeys: 16 },
      })
      return {
        ...grant,
        operations: ['context.read', 'context.configure'],
        authority: {
          check: (identity, operation) =>
            operation === 'context.configure' && identity.consumer !== 'coordinator'
              ? Promise.resolve({ kind: 'rejected' as const, reason: 'notAuthorized' as const })
              : grant.authority.check(identity, 'context.read'),
        },
      }
    },
  })
  cleanup.push(async () => {
    expect(await root.close()).toEqual({ closed: true })
  })
  const created = await root.owners.ingress.operations.createSession(root.owners.ingress.access, {
    operationKey: 'workspace-source',
    definition: officialSessionDefinition,
    executionType: 'interactive',
    mode: 'never',
    collaboration: 'co-work',
    workspace: options.home,
  })
  if (!('kind' in created) || created.kind !== 'created') throw new Error('Session creation failed')
  const scope = { tenant, session: created.session }
  const context = await root.owners.bootstrap.context(scope)!.ready
  const issued = await root.owners.contextAccess.issuer.issue({
    principal: source.accountId,
    principalKind: 'human',
    scope,
    consumer: 'tool',
    operations: ['context.read'],
    contextKeys: ['shell.initial', 'files.initial'],
  })
  if (issued.kind !== 'issued') throw new Error('Context access unavailable')
  const bound = await context.bind(issued.access, scope, 'tool')
  if (bound.kind !== 'bound') throw new Error('Context binding unavailable')
  const journal = {
    scope,
    readPrefix: async () => {
      const prefix = await root.owners.ingress.journal.readPrefix(
        root.owners.ingress.access,
        scope.session,
      )
      if (!('entries' in prefix)) throw new Error('Actual Session prefix unavailable')
      return { entries: prefix.entries, source: prefix.source, tail: prefix.source.tail }
    },
  }
  for (let registration = 0; registration < 2; registration++) {
    const handle = await registerSessionWorkspace(context, journal)
    try {
      const config = await root.owners.contextAccess.issuer.issue({
        principal: source.accountId,
        principalKind: 'human',
        scope,
        consumer: 'coordinator',
        operations: ['context.configure'],
        contextKeys: ['files.initial', 'tool-results.scope'],
      })
      if (config.kind !== 'issued') throw new Error('configure unavailable')
      try {
        await ensureSessionFilesRegistration(context, config.access, scope)
      } finally {
        root.owners.contextAccess.issuer.revoke(config.access)
      }
      expect(await bound.reader.read(['files.initial'])).toMatchObject({
        kind: 'values',
        values: [{ key: 'files.initial', value: { cwd: options.home } }],
      })
      expect(await bound.reader.read(['shell.initial'])).toMatchObject({
        kind: 'values',
        values: [
          { key: 'shell.initial', value: { cwd: options.home, envs: { PATH: '/usr/bin:/bin' } } },
        ],
      })
    } finally {
      await handle.dispose()
    }
  }
  root.owners.contextAccess.issuer.revoke(issued.access)
})
it('opens the actual file Session root, creates the official Session and recognizes it on reopen', async () => {
  // Real file resources, Clock, CG client, G28, EIS, Context and listener.
  // Governance transport and model qualification are controlled; this empty Session has no model IO.
  const { f, options } = await rootFixture()
  await prepareTenantDirectory(options.home, options.binding)
  const creation = {
    definition: officialSessionDefinition,
    executionType: input.executionType,
    mode: input.mode,
    collaboration: input.collaboration,
  }
  const createModel = vi.fn((storage: AtomicStorage, clock: Clock) =>
    createNativeSessionModelPool(storage, clock, nativeFileModelOptions(f, options)),
  )
  const sources = {
    ...options,
    transport: { ...options.transport, idleTimeoutMs: 10000 },
    creation,
    inputSource: {
      ...options.inputSource,
      deployedOfficial: [{ capability: officialSessionDefinition, meta: false }],
    },
    createModel,
    initialRouteName: officialCatalog[0]!.definition.modelId,
    configure: fileDriverBinding(options),
  }
  const root = await startFileSessionDriverRoot(sources)
  cleanup.push(async () => {
    expect(await root.close()).toEqual({ closed: true })
  })
  const request = {
    format: 'omne-session-host/1' as const,
    binding: options.binding,
    command: 'createSession' as const,
    input: { ...creation, operationKey: 'file-official-create' },
  }
  const requestedAt = performance.now()
  const reply = await sendSessionHostRequest({
    home: options.home,
    request,
    policy: { timeoutMs: 5000, maxResponseBytes: 65536 },
  })
  expect(
    reply,
    JSON.stringify({ reply, elapsedMs: performance.now() - requestedAt }),
  ).toMatchObject({ kind: 'reply', result: { kind: 'created' } })
  expect(createModel).toHaveBeenCalledOnce()
  expect(await root.close()).toEqual({ closed: true })
  const reopened = await startFileSessionDriverRoot(sources)
  cleanup.push(async () => {
    expect(await reopened.close()).toEqual({ closed: true })
  })
  expect(
    await sendSessionHostRequest({
      home: options.home,
      request,
      policy: { timeoutMs: 5000, maxResponseBytes: 65536 },
    }),
  ).toEqual(reply)
  expect(await reopened.close()).toEqual({ closed: true })
  const use = await f.client.openUse()
  expect(use.kind).toBe('use')
  if (use.kind === 'use') await use.use.close()
})
it('retains actual file resources after failed model readiness until its original owner releases', async () => {
  const { options } = await rootFixture()
  await prepareTenantDirectory(options.home, options.binding)
  const failure = new Error('original physical model startup failure')
  let held = true
  let actualStorage: import('@omne-harness-lite/storage').AtomicStorage | undefined
  let actualClock: import('@omne-harness-lite/offer-expiry').Clock | undefined
  const closing = vi.fn(async () =>
    held ? { unavailable: true as const } : { released: true as const },
  )
  let retained: FileSessionRuntimeFailure | undefined
  try {
    await startFileSessionDriverRoot({
      ...options,
      initialRouteName: officialCatalog[0]!.definition.modelId,
      configure: fileDriverBinding(options),
      createModel: (storage, clock) => {
        actualStorage = storage
        actualClock = clock
        return { ready: Promise.reject(failure), close: closing }
      },
    })
  } catch (error) {
    if (!(error instanceof FileSessionRuntimeFailure)) throw error
    retained = error
  }
  if (!retained || !actualStorage || !actualClock) throw new Error('actual retained root missing')
  cleanup.push(async () => {
    held = false
    expect(await retained.closeRetained()).toEqual({ closed: true })
  })
  expect(retained.errors).toEqual([failure])
  expect(closing).toHaveBeenCalledOnce()
  await actualStorage.atomic(async unit => unit.assertStorage(actualStorage!))
  expect(await actualClock.now()).not.toBe('unavailable')
  held = false
  expect(await retained.closeRetained()).toEqual({ closed: true })
  expect(await actualClock.now()).toBe('unavailable')
  await expect(
    actualStorage.atomic(async unit => unit.assertStorage(actualStorage!)),
  ).rejects.toThrow()
})
it('rejects a different actual login before the file Session root allocates its runtime', async () => {
  const { f, options } = await rootFixture()
  const createModel = vi.fn((storage: AtomicStorage, clock: Clock) =>
    createNativeSessionModelPool(storage, clock, nativeFileModelOptions(f, options)),
  )
  await expect(
    startFileSessionDriverRoot({
      ...options,
      source: {
        ...options.source,
        loginStateHandle: unwrap(parseLoginStateId('different-actual-login')),
      },
      createModel,
      initialRouteName: officialCatalog[0]!.definition.modelId,
      configure: fileDriverBinding(options),
    }),
  ).rejects.toThrow('fixed Session source')
  expect(createModel).not.toHaveBeenCalled()
  const { access } = await import('node:fs/promises')
  await expect(access(tenantPaths(options.home, options.binding).data)).rejects.toThrow()
})

function fileDriverBinding(
  options: SessionDriverRuntimeRootOptions,
  observe: (pool: SessionNativeModelPool) => void = () => {},
) {
  return async (
    owners: Parameters<typeof options.configure>[0],
    pool: SessionNativeModelPool,
    work: Parameters<typeof options.configure>[1],
  ) => {
    observe(pool)
    const {
      model: { factory: _factory, ...model },
      ...binding
    } = await options.configure(owners, work)
    return { ...binding, model }
  }
}
function nativeFileModelOptions(
  f: Awaited<ReturnType<typeof rootFixture>>['f'],
  options: SessionDriverRuntimeRootOptions,
): SessionNativeModelOptions {
  const original = nativeModelConstruction(f.storage)
  const { calls, callFacts, transport: _unusedTransport, ...sources } = original
  cleanup.push(async () => {
    expect(await calls.close()).toEqual({ released: true })
    expect(await callFacts.close()).toEqual({ released: true })
    expect(await callFacts.content.close()).toEqual({ released: true })
  })
  return {
    // This fixture selects an actual official leaf. It does not publish a user model selection.
    modelIds: [officialCatalog[0]!.definition.modelId],
    network: {
      policy: {
        maxConnections: 2,
        idleConnectionTimeoutMs: 1000,
        connectTimeoutMs: 1000,
        maxErrorBodyBytes: 8192,
        maxSseEventBytes: 65536,
        credentialRedaction: sources.policy.credentialRedaction,
      },
    },
    retirement: {
      force: false,
      waitMilliseconds: 2000,
      schedule: (ms, callback) => {
        const timer = setTimeout(callback, ms)
        return () => clearTimeout(timer)
      },
    },
    contentPolicy: { maxConcurrentWrites: 2, maxContentBytes: 65536 },
    maxFactScopes: options.model.maxRecords,
    sources: () => sources,
  }
}
it('opens the file Session root with the actual official transport and physical ModelRuntime pool', async () => {
  const { f, options, configure } = await rootFixture()
  await prepareTenantDirectory(options.home, options.binding)
  let physical: SessionNativeModelPool | undefined
  const nativeModel = nativeFileModelOptions(f, options)
  const root = await startFileSessionDriverRoot({
    ...options,
    nativeModel,
    initialRouteName: nativeModel.modelIds[0]!,
    configure: fileDriverBinding(options, pool => {
      physical = pool
    }),
    inputSource: {
      ...options.inputSource,
      deployedOfficial: [{ capability: officialSessionDefinition, meta: false }],
    },
    creation: {
      definition: officialSessionDefinition,
      mode: input.mode,
      collaboration: input.collaboration,
      executionType: input.executionType,
    },
  })
  cleanup.push(async () => {
    expect(await root.close()).toEqual({ closed: true })
  })
  if (!physical) throw new Error('actual physical model pool not selected')
  const created = await root.owners.ingress.operations.createSession(root.owners.ingress.access, {
    ...input,
    definition: officialSessionDefinition,
  })
  expect(created).toMatchObject({ kind: 'created' })
  expect(configure).toHaveBeenCalledOnce()
  expect(await root.close()).toEqual({ closed: true })
  expect(await physical.runtime.service.openCall({} as never)).toEqual({ runtimeStopped: true })
  // The file root closes its physical pool, but still does not close the borrowed governance client.
  const use = await f.client.openUse()
  expect(use.kind).toBe('use')
  if (use.kind === 'use') await use.use.close()
})
it('owns real directory and credential lookup with the native file pool without inventing a credential', async () => {
  const { f, options } = await rootFixture(true)
  await prepareTenantDirectory(options.home, options.binding)
  const paths = tenantPaths(options.home, options.binding)
  await prepareStateDirectory(options.home, paths.auth)
  const keyFile = join(paths.auth, 'model-replica.key')
  await writeFile(keyFile, new Uint8Array(32).fill(7), { flag: 'wx', mode: 0o600 })
  let pool: SessionNativeModelPool | undefined
  const nativeModel = {
    ...nativeFileModelOptions(f, options),
    directory: {
      governance: f.client,
      source,
      tenant,
      keyFile,
      diagnostics: { record() {} },
      onDiagnosticFailure() {},
      replicaDiagnostics: { record() {}, sinkFailure() {} },
    },
  }
  const root = await startFileSessionDriverRoot({
    ...options,
    nativeModel,
    initialRouteName: nativeModel.modelIds[0]!,
    configure: fileDriverBinding(options, actual => {
      pool = actual
    }),
  })
  cleanup.push(async () => {
    expect(await root.close()).toEqual({ closed: true })
  })
  expect(pool).toHaveProperty('directory.catalog')
  if (!pool?.directory) throw new Error('production directory missing')
  const current = await pool.directory.catalog.listProfiles(tenant)
  expect(Array.isArray(current)).toBe(true)
  expect(JSON.stringify(current)).toContain(officialCatalog[0]!.definition.modelId)
  expect(await pool.directory.credentials.value(tenant, 'official')).toEqual({
    failure: 'credentialUnavailable',
  })
  const exchanges = f.exchanges.mock.calls.length
  await root.close()
  expect(await pool.directory.catalog.listProfiles(tenant)).toEqual({ failure: 'unavailable' })
  expect(await pool.directory.credentials.value(tenant, 'official')).toEqual({
    failure: 'unavailable',
  })
  expect(f.exchanges.mock.calls.length).toBe(exchanges)
  const use = await f.client.openUse()
  expect(use.kind).toBe('use')
  if (use.kind === 'use') await use.use.close()
})
it('refuses a directory for another login before any governance or file acquisition', async () => {
  const { f, options } = await rootFixture()
  const bind = vi.fn(fileDriverBinding(options))
  const nativeModel = {
    ...nativeFileModelOptions(f, options),
    directory: {
      governance: f.client,
      tenant,
      source: { ...source, loginStateHandle: unwrap(parseLoginStateId('another-login')) },
      keyFile: join(options.home, 'missing-key'),
      diagnostics: { record() {} },
      onDiagnosticFailure() {},
      replicaDiagnostics: { record() {}, sinkFailure() {} },
    },
  }
  const exchanges = f.exchanges.mock.calls.length
  await expect(
    startFileSessionDriverRoot({
      ...options,
      nativeModel,
      initialRouteName: nativeModel.modelIds[0]!,
      configure: bind,
    }),
  ).rejects.toThrow('model directory does not belong')
  expect(f.exchanges.mock.calls.length).toBe(exchanges)
  expect(bind).not.toHaveBeenCalled()
  await expect(stat(join(options.home, 'data', 'session-admission.sqlite'))).rejects.toHaveProperty(
    'code',
    'ENOENT',
  )
})
it('releases directory startup resources after a missing key and reopens the original file root', async () => {
  const { f, options } = await rootFixture()
  await prepareTenantDirectory(options.home, options.binding)
  const paths = tenantPaths(options.home, options.binding)
  await prepareStateDirectory(options.home, paths.auth)
  const keyFile = join(paths.auth, 'model-replica.key')
  const bind = vi.fn(fileDriverBinding(options))
  const nativeModel = {
    ...nativeFileModelOptions(f, options),
    directory: {
      governance: f.client,
      source,
      tenant,
      keyFile,
      diagnostics: { record() {} },
      onDiagnosticFailure() {},
      replicaDiagnostics: { record() {}, sinkFailure() {} },
    },
  }
  await expect(
    startFileSessionDriverRoot({
      ...options,
      nativeModel,
      initialRouteName: nativeModel.modelIds[0]!,
      configure: bind,
    }),
  ).rejects.toBeInstanceOf(StorageUnavailable)
  expect(bind).not.toHaveBeenCalled()
  await writeFile(keyFile, new Uint8Array(32).fill(9), { flag: 'wx', mode: 0o600 })
  const root = await startFileSessionDriverRoot({
    ...options,
    nativeModel,
    initialRouteName: nativeModel.modelIds[0]!,
    configure: bind,
  })
  cleanup.push(async () => {
    expect(await root.close()).toEqual({ closed: true })
  })
  expect(bind).toHaveBeenCalledOnce()
  expect(await root.close()).toEqual({ closed: true })
})
it('closes the original physical pool when binding fails after official transport startup', async () => {
  const { f, options } = await rootFixture()
  await prepareTenantDirectory(options.home, options.binding)
  const failure = new Error('original production model binding defect')
  let physical: SessionNativeModelPool | undefined
  const nativeModel = nativeFileModelOptions(f, options)
  const bind = (_owners: Parameters<typeof options.configure>[0], pool: SessionNativeModelPool) => {
    physical = pool
    throw failure
  }
  await expect(
    startFileSessionDriverRoot({
      ...options,
      nativeModel,
      initialRouteName: nativeModel.modelIds[0]!,
      configure: bind,
    }),
  ).rejects.toBe(failure)
  if (!physical) throw new Error('actual allocated model pool missing')
  expect(await physical.runtime.service.openCall({} as never)).toEqual({ runtimeStopped: true })
  const reopened = await startFileSessionDriverRoot({
    ...options,
    nativeModel: nativeFileModelOptions(f, options),
    initialRouteName: officialCatalog[0]!.definition.modelId,
    configure: fileDriverBinding(options),
  })
  expect(await reopened.close()).toEqual({ closed: true })
})

it('returns the original Run inputs when the public model factory is unavailable', async () => {
  const original = await originalModelBinding()
  const options = nativeBindingOptions(original)
  let journal: BorrowedRunJournal | undefined
  const acquire = vi.fn(async () => ({ unavailable: true as const }))
  const result = await createSessionRunModelBinding({
    ...options,
    inputs: current => {
      journal = current
      return options.inputs(current)
    },
    model: { acquire },
  })
  expect(result).toEqual({ failure: 'unavailable' })
  expect(acquire).toHaveBeenCalledOnce()
  expect(journal?.currentGeneration()).toBeNull()
  await original.f.runtime.close()
  expect(await original.f.log.readSince(original.scope.session, 0)).toHaveProperty('entries')
})

it('keeps the original Run journal until the public model borrow has actually returned', async () => {
  const original = await originalModelBinding()
  const options = nativeBindingOptions(original)
  const entered = Promise.withResolvers<void>()
  const stopped = Promise.withResolvers<void>()
  cleanup.push(async () => stopped.resolve())
  const linked = await createSessionRunModelBinding({
    ...options,
    model: {
      async acquire(inputs) {
        const acquired = await options.model.acquire(inputs)
        if ('unavailable' in acquired) return acquired
        return {
          operations: acquired.operations,
          async release() {
            entered.resolve()
            await stopped.promise
            await acquired.release()
          },
        }
      },
    },
  })
  if ('failure' in linked) throw new Error('actual model binding unavailable')
  cleanup.push(linked.returnJournal)
  const returning = linked.returnJournal()
  await entered.promise
  expect(linked.binding.log.currentGeneration()).toBe(linked.binding.log.generation)
  let closed = false
  const closing = original.f.runtime.close().then(() => {
    closed = true
  })
  await new Promise(resolve => setImmediate(resolve))
  expect(closed).toBe(false)
  stopped.resolve()
  await returning
  await closing
  expect(linked.binding.log.currentGeneration()).toBeNull()
})

it.each(['model', 'inputs'] as const)(
  'retries the same original model borrow return after a %s defect without constructing another binding',
  async stage => {
    const original = await originalModelBinding()
    const options = nativeBindingOptions(original)
    const failure = new Error('original model borrow return failed')
    const entered = Promise.withResolvers<void>()
    const returned = Promise.withResolvers<void>()
    cleanup.push(async () => returned.resolve())
    const release = vi.fn(async () => {})
    const releaseInputs = vi.fn(async () => {})
    const acquire = vi.fn(async (inputs: Parameters<typeof options.model.acquire>[0]) => {
      const borrowed = await options.model.acquire(inputs)
      if ('unavailable' in borrowed) return borrowed
      release.mockImplementation(async () => {
        if (stage === 'model') {
          if (release.mock.calls.length === 1) throw failure
          entered.resolve()
          await returned.promise
        }
        await borrowed.release()
      })
      return { operations: borrowed.operations, release }
    })
    const linked = await createSessionRunModelBinding({
      ...options,
      model: { acquire },
      inputs: journal => {
        const originalInputs = options.inputs(journal)
        if (!originalInputs) return undefined
        releaseInputs.mockImplementation(async () => {
          if (stage === 'inputs') {
            if (releaseInputs.mock.calls.length === 1) throw failure
            entered.resolve()
            await returned.promise
          }
          await originalInputs.close()
        })
        return { ...originalInputs, close: releaseInputs }
      },
    })
    if ('failure' in linked) throw new Error('actual model binding unavailable')
    cleanup.push(linked.returnJournal)
    await expect(linked.returnJournal()).rejects.toBe(failure)
    expect(linked.binding.log.currentGeneration()).toBe(linked.binding.log.generation)
    const retry = linked.returnJournal()
    expect(linked.returnJournal()).toBe(retry)
    expect(
      await Promise.race([
        entered.promise.then(() => 'returning'),
        retry.then(
          () => 'returned',
          () => 'failed',
        ),
      ]),
    ).toBe('returning')
    expect(linked.binding.log.currentGeneration()).toBe(linked.binding.log.generation)
    returned.resolve()
    await retry
    expect(linked.binding.log.currentGeneration()).toBeNull()
    await linked.returnJournal()
    expect(acquire).toHaveBeenCalledOnce()
    expect(release).toHaveBeenCalledTimes(stage === 'model' ? 2 : 1)
    expect(releaseInputs).toHaveBeenCalledTimes(stage === 'inputs' ? 2 : 1)
  },
)

it.each(['normal', 'startupFailure', 'heldCapture'] as const)(
  'owns the file-backed public Driver and its real native pool: %s',
  async mode => {
    const { f, options } = await rootFixture()
    await prepareTenantDirectory(options.home, options.binding)
    const nativeModel = nativeFileModelOptions(f, options)
    const defect = new Error('file Driver binding failed')
    const unexpected = (): never => {
      throw new Error('empty file Session executed a Run')
    }
    let pool: SessionNativeModelPool | undefined
    let rootManifest: ReturnType<typeof createAssemblyManifestStore> | undefined
    const configure = vi.fn<
      import('../src/session-file-root.ts').FileSessionDriverOptions['configure']
    >((owners, actual, work) => {
      pool = actual
      rootManifest = owners.manifest
      expect(owners.ingress.coordinationAuthority).toBeDefined()
      expect(work.readIn).toBeDefined()
      if (mode === 'startupFailure') throw defect
      return {
        policy: {
          scanLimit: 16,
          intervalMs: 5,
          maxTasks: 8,
          maxHeld: 16,
          maxFailures: 8,
          maxStepsPerPass: 16,
        },
        identities: {
          run: unexpected,
          model: unexpected,
          tool: unexpected,
          modelContent: { response: unexpected, message: unexpected },
        },
        sources: { acquire: async () => unexpected() },
        model: {
          settlement: { create: unexpected },
          maxCallReads: 4,
        },
        tools: { acquire: async () => unexpected() },
      }
    })
    const requested = {
      ...options,
      transport: { ...options.transport, idleTimeoutMs: 10_000 },
      nativeModel,
      initialRouteName: nativeModel.modelIds[0]!,
      model: options.model,
      maxHeld: options.maxHeld,
      inputSource: {
        ...options.inputSource,
        deployedOfficial: [{ capability: officialSessionDefinition, meta: false }],
      },
      creation: {
        definition: officialSessionDefinition,
        executionType: input.executionType,
        mode: input.mode,
        collaboration: input.collaboration,
      },
      configure,
    }
    if (mode === 'startupFailure') {
      await expect(startFileSessionDriverRoot(requested)).rejects.toBe(defect)
      expect(configure).toHaveBeenCalledOnce()
      if (!pool) throw new Error('actual failed pool was not allocated')
      expect(
        pool.runtime.executionSource.capture(
          unwrap(parseOpaqueIdentifier('closed-session', 'SessionRef')),
        ),
      ).toEqual({ unavailable: true })
      expect(await rootManifest!.readHead('failed-startup')).toEqual({ failure: 'unavailable' })
      return
    }
    const root = await startFileSessionDriverRoot(requested)
    cleanup.push(async () => {
      expect(await root.close()).toEqual({ closed: true })
    })
    expect(configure).toHaveBeenCalledOnce()
    if (!pool) throw new Error('actual file model pool missing')
    const created = await createSessionForMessage({
      home: options.home,
      binding: options.binding,
      signal: new AbortController().signal,
      originalId: () => 'file-public-driver-session',
      policy: { timeoutMs: 10_000, maxResponseBytes: 65536 },
    })
    if (created.kind !== 'created-session')
      throw new Error(`file Driver session not created: ${JSON.stringify(created)}`)
    expect(root.owners.manifest).toBe(rootManifest)
    expect(await rootManifest!.readHead(created.session)).toEqual({ head: 0, latest: {} })
    const current = root.owners.bootstrap.inputs({ tenant, session: created.session })
    if (!current) throw new Error('actual created Session inputs unavailable')
    const inputRead = await current.read(created.session, tenant)
    if (!('input' in inputRead)) throw new Error('actual created Session input missing')
    const assembly = evaluate(inputRead.input, { toolEnvironmentPermission: 'always-allow' })
    if (!('ok' in assembly)) throw new Error('actual created Session evaluation unavailable')
    const registry = createAssetRegistry({
      manifest: root.owners.manifest,
      clock: options.clock,
      sessionTenancy: root.owners.ingress.tenancy,
      currentInputs: current,
      deployedMeta: [],
      diagnostic() {},
      diagnosticFailure() {},
      monotonicNow: process.hrtime.bigint,
      conflictPolicy: { maxRetries: 0 },
      maxInFlight: 4,
    })
    cleanup.push(() => registry.close())
    expect(
      await registry.fill(
        created.session,
        assembly.ok,
        'file-initial-fill',
        assembly.ok.composition,
      ),
    ).toHaveProperty('snapshots')
    const originalManifest = await rootManifest!.readHead(created.session)
    expect(originalManifest).toHaveProperty('head', 1)
    await registry.close()
    expect(pool.runtime.executionSource.snapshot(created.session)).toEqual([])
    expect(
      await root.owners.ingress.operations.readSession(root.owners.ingress.access, created.session),
    ).toMatchObject({ kind: 'session', session: { lifecycle: 'active' } })
    if (mode === 'heldCapture') {
      const held = pool.runtime.executionSource.capture(created.session)
      if (!('capture' in held)) throw new Error('actual capture missing')
      cleanup.push(async () => held.capture.release())
      expect(await root.close()).toEqual({ pending: true })
      expect(await rootManifest!.readHead(created.session)).toEqual({ failure: 'unavailable' })
      held.capture.release()
    }
    expect(await root.close()).toEqual({ closed: true })
    expect(await rootManifest!.readHead(created.session)).toEqual({ failure: 'unavailable' })
    expect(pool.runtime.executionSource.capture(created.session)).toEqual({ unavailable: true })
    const response = await sendSessionHostRequest({
      home: options.home,
      request: {
        format: 'omne-session-host/1',
        binding: options.binding,
        command: 'readSession',
        session: created.session,
      },
      signal: new AbortController().signal,
      policy: { timeoutMs: 1000, maxResponseBytes: 65536 },
    })
    expect(response).toHaveProperty('kind', 'unconfirmed')
    if (mode === 'normal') {
      const reopened = await startFileSessionDriverRoot(requested)
      cleanup.push(async () => {
        expect(await reopened.close()).toEqual({ closed: true })
      })
      expect(await reopened.owners.manifest.readHead(created.session)).toEqual(originalManifest)
      expect(await reopened.close()).toEqual({ closed: true })
    }
  },
)

it('observes the host Clock and initial model only for its fixed tenant without starting Session work', async () => {
  const f = await setup()
  const directory = await mkdtemp(join(tmpdir(), 'host-clock-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  const clock = await openLeaseClock({ file: join(directory, 'clock.sqlite'), initialize: {} })
  cleanup.push(() => clock.close())
  const now = vi.fn(() => clock.now())
  const binding = { formatVersion: 1 as const, centerId, tenant }
  const endpoint = createSessionHostEndpoint({
    binding,
    ingress: f.runtime,
    clock: { now },
    initialRouteName: 'selected-route',
  })
  const clockRequest = parseSessionHostRequest({
    format: 'omne-session-host/1',
    binding,
    command: 'readClock',
  })
  const modelRequest = parseSessionHostRequest({
    format: 'omne-session-host/1',
    binding,
    command: 'readInitialModel',
  })
  if (!clockRequest || !modelRequest) throw new Error('invalid fixture requests')
  const observed = await endpoint.execute(clockRequest)
  expect(observed).toMatchObject({ kind: 'clock', timestamp: expect.any(String) })
  if (!('kind' in observed) || observed.kind !== 'clock') throw new Error('host Clock unavailable')
  expect(instantFromRfc3339(observed.timestamp)).toHaveProperty('ok')
  expect(now).toHaveBeenCalledOnce()
  expect(await endpoint.execute(modelRequest)).toEqual({
    kind: 'initialModel',
    routeName: 'selected-route',
  })
  expect(
    await endpoint.execute({
      ...clockRequest,
      binding: checkedTenantBinding({ ...binding, centerId: 'b'.repeat(32) }),
    }),
  ).toEqual({ failure: 'denied' })
  expect(now).toHaveBeenCalledOnce()
  const unavailable = createSessionHostEndpoint({ binding, ingress: f.runtime })
  expect(await unavailable.execute(clockRequest)).toEqual({ failure: 'unavailable' })
  expect(await unavailable.execute(modelRequest)).toEqual({ kind: 'initialModelUnavailable' })
  expect(f.seed).not.toHaveBeenCalled()
})

it('restores the persisted Session recipe and Context under the original Run after bootstrap restart', async () => {
  const { f, scope, preparation } = await originalModelBinding()
  const oldContext = f.assembly.context(scope)
  f.exchanges.mockImplementation(async () => {
    throw new Error('restoration must not obtain current membership')
  })
  const before = await f.log.readSince(scope.session, 0)
  await f.assembly.close()
  const restored = createSessionBootstrap({
    storage: f.storage,
    admission: f.admission,
    source,
    tenant,
    inputSource: f.base,
    tenancy: f.runtime.tenancy,
    logBacking: f.log.backing,
    access: f.access.operations,
    clock: { now: async () => unwrap(instantFromRfc3339(now)) },
    contextSeed: f.seed,
  })
  cleanup.push(() => restored.close())
  const borrowed = await f.runtime.runJournal.borrow(
    f.runtime.coordinationAuthority,
    scope,
    preparation.run,
  )
  if (!('journal' in borrowed)) throw new Error('original journal unavailable')
  cleanup.push(borrowed.journal.close)
  expect(
    await Promise.all([
      restored.ensureRun(scope, borrowed.journal),
      restored.ensureRun(scope, borrowed.journal),
    ]),
  ).toEqual(['ready', 'ready'])
  expect(restored.context(scope)).toBeDefined()
  expect(restored.context(scope)).not.toBe(oldContext)
  const reader = restored.runInputs(scope, borrowed.journal)
  expect(await reader?.read(scope.session, tenant)).toHaveProperty('input.root.source', {
    asset: 'root-asset',
    version: 1,
  })
  expect(await f.log.readSince(scope.session, 0)).toEqual(before)
  expect(f.seed).toHaveBeenCalledTimes(2)
  await borrowed.journal.close()
  expect(await restored.ensureRun(scope, borrowed.journal)).toBe('unavailable')
  expect(await reader?.read(scope.session, tenant)).toEqual({ failure: 'unavailable' })
})

it('drains the original restoration reader when bootstrap close races the seed read', async () => {
  const { f, scope, preparation } = await originalModelBinding()
  await f.assembly.close()
  const entered = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  cleanup.push(async () => resume.resolve())
  const restored = createSessionBootstrap({
    storage: f.storage,
    admission: f.admission,
    source,
    tenant,
    inputSource: f.base,
    tenancy: f.runtime.tenancy,
    logBacking: f.log.backing,
    access: f.access.operations,
    clock: { now: async () => unwrap(instantFromRfc3339(now)) },
    contextSeed: async (...args) => {
      entered.resolve()
      await resume.promise
      return f.seed(...args)
    },
  })
  cleanup.push(() => restored.close())
  const borrowed = await f.runtime.runJournal.borrow(
    f.runtime.coordinationAuthority,
    scope,
    preparation.run,
  )
  if (!('journal' in borrowed)) throw new Error('original journal unavailable')
  cleanup.push(borrowed.journal.close)
  const restoring = restored.ensureRun(scope, borrowed.journal)
  await entered.promise
  let closed = false
  const closing = restored.close().then(() => {
    closed = true
  })
  await new Promise(resolve => setImmediate(resolve))
  expect(closed).toBe(false)
  resume.resolve()
  expect(await restoring).toBe('unavailable')
  await closing
  expect(restored.context(scope)).toBeUndefined()
  expect(await restored.ensureRun(scope, borrowed.journal)).toBe('unavailable')
  await borrowed.journal.close()
  await restored.retryClose()
})
