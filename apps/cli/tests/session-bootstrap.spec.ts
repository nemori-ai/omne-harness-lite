import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStorage } from '@omne-harness-lite/storage-sql'
import { openClientLocalState } from '@omne-harness-lite/client-local-state-sqlite'
import { createGovernanceClient } from '@omne-harness-lite/governance-client-operations-local'
import {
  parseTenantId,
  parseAccountId,
  parseLoginStateId,
  unwrap,
} from '@omne-harness-lite/identity-values'
import { isGovernanceCenterId } from '@omne-harness-lite/governance-center-entry'
import {
  createLocalAdmission,
  createLocalSessionIngress,
  admissionMigrations,
  admissionUseMigrations,
  sessionStateMigrations,
  operationReceiptMigrations,
  sessionRuntimeMigrations,
  type AdmissionSource,
} from '@omne-harness-lite/session-runtime-local'
import { sessionLogMigrations, openSqlSessionLog } from '@omne-harness-lite/session-log-sql'
import { runtimeContextMigrations } from '@omne-harness-lite/runtime-context-local'
import { evaluationInputMigrations } from '@omne-harness-lite/evaluation-input-store'
import { publishLocalInputs } from '@omne-harness-lite/evaluation-input-store/publication'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import { createSessionAdmissionProbe } from '../src/session-admission-probe.ts'
import { createSessionBootstrap, type SessionBootstrapOptions } from '../src/session-bootstrap.ts'
import { narrow } from '@omne-harness-lite/storage'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
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
async function setup() {
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
  const exchanges = vi.fn(async (_options: unknown, request: unknown) => ({
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
      state: { maxPendingPerSession: 16, maxBatchSize: 16, maxRecordBytes: 65536 },
      receipts: { maxRecords: 32, maxRecordBytes: 65536 },
    },
    log: authority => {
      log ??= openSqlSessionLog({ storage, authority, operationLimit: 32 })
      return log.participant
    },
    bootstrap: { initialize: (...args) => assembly.initialize(...args) },
    now: () => now,
    workSettledIn: async () => 'settled',
  })
  cleanup.push(() => runtime.close())
  const seed = vi.fn<SessionBootstrapOptions['contextSeed']>(async () => ({
    seed: { required: [], initial: [], fixed: [] },
  }))
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
            content: { category: 'agent_definition', body: { references: [], attributes: [] } },
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
  assembly = createSessionBootstrap({
    storage,
    admission,
    source,
    tenant,
    inputSource: base,
    tenancy: runtime.tenancy,
    logBacking: log.backing,
    access: { authorize: async () => ({ kind: 'rejected', reason: 'notAuthorized' }) },
    clock: { now: () => unwrap(instantFromRfc3339(now)) },
    contextSeed: seed,
  })
  cleanup.push(() => assembly.close())
  return { directory, runtime, assembly, storage, admission, log, exchanges, seed }
}
const input = {
  operationKey: 'create-actual',
  definition,
  executionType: 'interactive' as const,
  mode: 'never' as const,
  collaboration: 'co-work' as const,
}
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
