import { messageLogPayload } from '@omne-harness-lite/session-log'
import { createSessionTextReader } from '../src/session-reading.ts'
import { judgeMessage } from '@omne-harness-lite/messages'
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
  createLocalSessionAccess,
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
import { contextSeedFromDefinition } from '../src/session-seed.ts'
import { createSessionAdmissionProbe } from '../src/session-admission-probe.ts'
import type { AccessIdentity } from '@omne-harness-lite/session-tenancy'
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
async function setup(maxBindings = 16, declareSeed: boolean | 'invalid' = true) {
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
                attributes: [],
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
  const access = createLocalSessionAccess({
    tenant,
    principal: { principal: source.accountId, principalKind: 'human' },
    consumers: ['model'],
    operations: ['context.read'],
    policy: { maxBindings, maxContextKeys: 16 },
    authority: {
      async check(identity, operation) {
        checks()
        if (gate) {
          const currentGate = gate
          currentGate.entered()
          await currentGate.wait
        }
        if (operation !== 'context.read') return { kind: 'rejected', reason: 'notAuthorized' }
        const view = await runtime.operations.readSession(runtime.access, identity.scope.session)
        if ('kind' in view && view.kind === 'session' && view.session.lifecycle === 'active') {
          if (authorityDefect) throw authorityDefect
          return {
            kind: 'authorized',
            identity: corruptIdentity ? corruptIdentity(identity) : identity,
          }
        }
        return {
          kind: 'rejected',
          reason:
            'failure' in view && view.failure === 'unavailable' ? 'unavailable' : 'notAuthorized',
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
    clock: { now: () => unwrap(instantFromRfc3339(now)) },
    contextSeed: seed,
  })
  cleanup.push(() => assembly.close())
  return {
    directory,
    runtime,
    assembly,
    storage,
    admission,
    log,
    exchanges,
    seed,
    access,
    checks,
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
  const reader = createSessionTextReader({ tenant, ingress: f.runtime })
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
  const reader = createSessionTextReader({
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

it('hides descendants of a non-human parent and omits non-text content from the human text facade', async () => {
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
  const read = await createSessionTextReader({ tenant, ingress: f.runtime }).read({
    tenant,
    session: created.session,
  })
  expect(read).toMatchObject({
    kind: 'messages',
    messages: [{ type: 'tool', blocks: [{ id: 'visible', kind: 'text', text: 'visible' }] }],
  })
  expect(JSON.stringify(read)).not.toContain('hidden')
  if ('failure' in read) throw new Error('actual reading failed')
  expect(read.messages[0]?.blocks).toHaveLength(1)
})
it('rejects non-data scopes without running accessors or touching the actual journal', async () => {
  const f = await setup()
  const read = vi.fn(f.runtime.journal.readPrefix)
  const reader = createSessionTextReader({
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
