// C7, host part (I-9, I-10): the cost of one Tools call on the host paths does not depend on how
// many calls the tenant has settled before it. The seam is the real SQLite store of this member
// under the public host factories of `tool-host-local`: the start coordinator, the invocation
// source with its forwarding slot and receiver, the control subjects, the environment ledgers and
// the result delivery worker over a real Tool ledger. Each seeded call does what a settled Tools
// call leaves behind on these paths: a source binding, a controller association, a consumed start,
// an environment acquisition with a retained terminal in the session's long-lived retention scope
// (stopped and closed as a settled call leaves it), a forwarded target with its consumed start and
// one received result copy, and the parent's own result delivery driven to `done`, which releases
// that copy. The counting store sees every ledger read the host makes; the two runs must read the
// same number of records and the same number of bytes, so nothing the host reads per call may grow
// with the history. The `start-guards` domain grows with control actions only; its size is
// reported, not compared. The retention scope spans every call of the session, so its size must
// not grow with the calls.
//
// @module-tag slow: real SQLite under 2000 seeded calls, several minutes of IO and CPU.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import { succeed } from '@omne-harness/operation-result'
import {
  canonicalDigest,
  type CallRecord,
  type LedgerDomain,
  type LedgerRecord,
  type ResultRecord,
  type ToolLedgerStore,
} from '@omne-harness/tool'
import { createMemoryToolMaterials, createTestResultChannels } from '@omne-harness/tool/testing'
import {
  decodeToolOperationId,
  encodeToolInvocationRef,
  type FixedToolRequest,
  type ToolCallId,
  type ToolDelivery,
} from '@omne-harness/tool-contract'
import {
  decodeToolDeliveryId,
  decodeToolResultVersion,
  decodeToolRevision,
  type ToolTask,
} from '@omne-harness/tool-contract/provider'
import {
  createEnvironmentResourceLedger,
  createEnvironmentStateStore,
  createLocalInvocationSource,
  createLocalStartCoordinator,
  createLocalTextResults,
  createLocalToolControlSubjects,
  createLocalToolResultDelivery,
  createRetainedTerminalLedger,
  retentionHostDomain,
  type GuardResource,
  type StartCoordinatorAccess,
} from '@omne-harness/tool-host-local'
import { openApp, TENANT_A, type App } from './fixtures/app.ts'
import {
  acquisitionOf,
  alice,
  callIdOf,
  evidence,
  isParent,
  ok,
  parentRequest,
  preparationOf,
  principalCodec,
  runningCall,
  startOf,
  targetIntent,
  targetRequest,
  terminalOf,
  width,
  type Principal,
} from './fixtures/host-paths.ts'
import { ledgerWorld, type Principal as LedgerPrincipal } from './fixtures/ledger.ts'

const GUARD: GuardResource = { owner: 'permissions', resource: 'scope-1/read_file' }
/** The retention scope of the session every seeded call belongs to. */
const SCOPE = targetRequest().requesterScope
const N = 2000

/** What the host read through the store: calls, records and the bytes of those records. */
type ReadCount = { reads: number; records: number; bytes: number }

function countingStore(store: ToolLedgerStore): ToolLedgerStore & { count: ReadCount } {
  const count: ReadCount = { reads: 0, records: 0, bytes: 0 }
  const seen = (records: readonly LedgerRecord[]) => {
    count.reads += 1
    count.records += records.length
    count.bytes += Buffer.byteLength(JSON.stringify(records), 'utf8')
  }
  return {
    durability: store.durability,
    count,
    read: async domain => {
      const answer = await store.read(domain)
      seen(answer.kind === 'complete' ? answer.records : [])
      return answer
    },
    readRecord: async (domain, key) => {
      const answer = await store.readRecord(domain, key)
      seen(answer.kind === 'complete' && answer.record !== null ? [answer.record] : [])
      return answer
    },
    commit: input => store.commit(input),
  }
}

const access: StartCoordinatorAccess<Principal> = {
  qualify: async () => ({ kind: 'allowed' }),
}

/** The host over `store`: the public factories of `tool-host-local` and a real Tool ledger. */
async function host(store: ToolLedgerStore) {
  const authority = createLocalStartCoordinator<Principal>({
    store,
    access,
    permitRequirements: {
      check: async () => ({
        kind: 'not-required',
        source: { owner: 'test-only', record: 'no-permit', revision: '1', digest: 'sha256:none' },
      }),
    },
    guardsOf: () => [GUARD],
    commitAttempts: 4,
  })
  const source = createLocalInvocationSource<Principal, ContentBlock>({
    store,
    authority: {
      qualify: async () => ({ kind: 'allowed' }),
      samePrincipal: async ({ current, original }) =>
        current.subject === original.subject
          ? { kind: 'allowed' }
          : { kind: 'denied', reason: 'different-subject' },
    },
    principalCodec,
    commitAttempts: 4,
    forwarding: { authority: () => authority, isParent },
  })
  const subjects = createLocalToolControlSubjects<Principal>({
    store,
    project: async principal =>
      succeed({
        tenant: TENANT_A,
        kind: 'acting-for-tenant',
        actor: { component: 'sessionWorkPrincipals' },
        work: { owner: 'session', work: principal.session },
      }),
    resolveSessionWork: async ({ session }) => succeed({ subject: 'alice', session }),
    qualify: async () => ({ kind: 'allowed' }),
    commitAttempts: 4,
  })
  const environments = createEnvironmentStateStore({ store })
  const world = await ledgerWorld(TENANT_A)
  const materials = createMemoryToolMaterials<LedgerPrincipal>()
  const ledger = world.ledgerOver(store, materials)
  let operations = 0
  const delivery = createLocalToolResultDelivery<LedgerPrincipal, ContentBlock>({
    store,
    commands: ledger.commands,
    reads: ledger.reads,
    resultDelivery: ledger.delivery,
    identities: {
      newOperation: async () =>
        succeed(ok(decodeToolOperationId(`worker-${width((operations += 1))}`))),
    },
    access: { qualify: async () => ({ kind: 'allowed' }) },
    position: {
      access: async ({ tenant, call }) =>
        succeed({ principal: world.access.principal, tenant, call }),
      receiver: async () =>
        succeed({
          push: async ({ delivery: pushed }) =>
            succeed({
              key: pushed.key,
              evidence: { ...evidence('saved'), owner: pushed.consumer.owner },
            }),
        }),
    },
    accountAtFreeze: async () => succeed(null),
    capacity: 2,
    forwardedCopies: source.releaseReceivedCopies,
  })
  return {
    store,
    authority,
    source,
    subjects,
    environments,
    delivery,
    materials,
    principal: world.access.principal,
  }
}

type Host = Awaited<ReturnType<typeof host>>

/** One consumed start of `call`, as the driver does it: prepare, consume, inspect. */
async function consumedStart(
  ports: Host,
  call: ToolCallId,
  request: FixedToolRequest,
  index: number,
): Promise<void> {
  const start = startOf(TENANT_A, call)
  const callAccess = { principal: alice, tenant: TENANT_A, call }
  const permit = ok(await ports.authority.prepare({ ...callAccess, start, request }))
  const consumed = ok(
    await ports.authority.consume({
      ...callAccess,
      permit,
      executorReceipt: evidence(`capsule-${width(index)}`),
    }),
  )
  if (consumed.kind !== 'started') throw new Error(`consume: ${consumed.kind}`)
  const inspected = ok(await ports.authority.inspect({ ...callAccess, start }))
  if (inspected.kind !== 'started') throw new Error(`inspect: ${inspected.kind}`)
}

/**
 * The environment work of one call: its acquisition record bound to the session's retention
 * scope, a retained terminal planned and permitted in that scope, the terminal's confirmed stop,
 * and the closed acquisition, as a settled call leaves them.
 */
async function environmentOf(
  ports: Host,
  call: ToolCallId,
  request: FixedToolRequest,
  index: number,
) {
  const preparation = preparationOf(TENANT_A, call, request)
  const authorize = async () => 'authorized' as const
  ok(await ports.environments.update(preparation, () => succeed(acquisitionOf(preparation, SCOPE))))
  const retained = await createRetainedTerminalLedger({
    state: ports.environments,
    address: preparation,
    scope: SCOPE,
    authorize,
  })
  const terminal = terminalOf(index)
  if ((await retained.plan(terminal)) !== 'recorded') throw new Error('retained plan')
  if ((await retained.permit(terminal.key)) !== 'confirmed') throw new Error('retained permit')
  if ((await retained.stopped(terminal.key, 'confirmed')) !== 'recorded')
    throw new Error('retained stop')
  const acquisition = await createEnvironmentResourceLedger({
    state: ports.environments,
    address: preparation,
    authorize,
  })
  if ((await acquisition.close()) !== 'confirmed') throw new Error('acquisition close')
}

/** The forwarding of one Tools call: its target slot, the target's start and one received copy. */
async function forwardedOf(
  ports: Host,
  parent: { call: ToolCallId; request: FixedToolRequest },
  index: number,
) {
  const parentAccess = {
    principal: alice,
    tenant: TENANT_A,
    call: parent.call,
    start: startOf(TENANT_A, parent.call),
    request: parent.request,
  }
  const target = await ports.source.forwarding.resolve({
    ...parentAccess,
    intent: targetIntent,
    target: targetRequest(),
  })
  if (target.kind !== 'bound') throw new Error(`forwarding: ${JSON.stringify(target)}`)
  await consumedStart(ports, target.call, target.request, index)
  const reference = ok(
    encodeToolInvocationRef({ tenant: TENANT_A, call: target.call, admission: target.admission }),
  )
  const delivery: Extract<ToolDelivery<ContentBlock>, { kind: 'result' }> = {
    kind: 'result',
    key: {
      kind: 'result',
      producer: 'tool',
      reference,
      result: ok(decodeToolResultVersion('result-1')),
    },
    consumer: target.request.consumer,
    delivery: ok(decodeToolDeliveryId('delivery-1')),
    relation: 'original',
    terminal: { kind: 'completed' },
    actualTerminal: null,
    effect: { kind: 'not-started' },
    source: evidence('target'),
    value: ok(createLocalTextResults().text(`target result ${width(index)}`)),
    account: null,
  }
  ok(
    await ports.source.receiver.push({
      access: { principal: alice, tenant: TENANT_A },
      delivery,
      signal: new AbortController().signal,
    }),
  )
}

/**
 * The parent settles with one result owed to its consumer, and the delivery worker drives that
 * delivery to `done`: frozen, pushed, released through the real ledger, the forwarded copies
 * released.
 */
async function deliveredOf(ports: Host, running: CallRecord, index: number) {
  const call = running.call
  const callAccess = { principal: ports.principal, tenant: TENANT_A, call }
  const version = ok(decodeToolResultVersion('result-1'))
  const consumer = running.request.consumer
  const pending = {
    kind: 'pending' as const,
    delivery: ok(decodeToolDeliveryId('delivery-1')),
    consumer,
  }
  const task: ToolTask = {
    kind: 'deliver',
    operation: ok(decodeToolOperationId(`${call}/deliver`)),
    state: 'pending',
    diagnostic: null,
    result: version,
    delivery: pending.delivery,
    consumer,
  }
  const result: ResultRecord = {
    tenant: TENANT_A,
    call,
    result: version,
    relation: 'original',
    terminal: { kind: 'completed' },
    actual: null,
    effect: { kind: 'not-started' },
    value: await createTestResultChannels({
      materials: ports.materials,
      access: callAccess,
      operation: task.operation,
      source: evidence('original'),
      value: ok(createLocalTextResults().text(`parent result ${width(index)}`)),
    }),
    delivery: pending,
    source: evidence('original'),
    settledBy: task.operation,
    custody: { kind: 'synthetic' },
  }
  const settled: CallRecord = {
    ...running,
    state: {
      ...running.state,
      foreground: { kind: 'final', result: version },
      delivery: pending,
      phase: 'settled',
      wait: { kind: 'none' },
      result: version,
      relation: 'foreground',
      terminal: result.terminal,
    },
  }
  const committed = await ports.store.commit({
    domain: { kind: 'call', tenant: TENANT_A, call },
    expected: ok(decodeToolRevision('1')),
    revision: ok(decodeToolRevision('2')),
    writes: [
      { kind: 'put', record: { kind: 'call', call: settled } },
      { kind: 'put', record: { kind: 'result', result } },
      { kind: 'put', record: { kind: 'task', task } },
    ],
  })
  if (committed.kind !== 'committed') throw new Error(`settle: ${committed.kind}`)
  const driven = ok(
    await ports.delivery.drive({ ...callAccess, signal: new AbortController().signal }),
  )
  if (driven.pending !== 0) throw new Error(`delivery pending: ${String(driven.pending)}`)
}

/**
 * The host work of one Tools call: the source binding and controller association of the Tools
 * call, its call record, its consumed start, its environment, the target it forwards to with the
 * target's consumed start and one received copy, and the parent's own delivery.
 */
async function toolsCall(ports: Host, index: number): Promise<void> {
  const request = parentRequest(index)
  const bound = await ports.source.issuer.resolve({ principal: alice, tenant: TENANT_A, request })
  if (bound.kind !== 'bound') throw new Error(`source: ${JSON.stringify(bound)}`)
  const call = bound.call
  const fixed = { ...request, invocation: bound.invocation }
  const verified = await ports.source.guard.verify({
    principal: alice,
    tenant: TENANT_A,
    call,
    operation: bound.admission,
    request: fixed,
  })
  if (verified.kind !== 'trusted') throw new Error(`guard: ${verified.kind}`)
  ok(await ports.subjects.capture({ principal: alice, tenant: TENANT_A, call }))
  const preparation = preparationOf(TENANT_A, call, fixed)
  const running = runningCall({
    tenant: TENANT_A,
    call,
    admission: bound.admission,
    request: fixed,
    preparation,
  })
  const committed = await ports.store.commit({
    domain: { kind: 'call', tenant: TENANT_A, call },
    expected: ok(decodeToolRevision('0')),
    revision: ok(decodeToolRevision('1')),
    writes: [{ kind: 'put', record: { kind: 'call', call: running } }],
  })
  if (committed.kind !== 'committed') throw new Error(`call record: ${committed.kind}`)
  await consumedStart(ports, call, fixed, index)
  await environmentOf(ports, call, fixed, index)
  await forwardedOf(ports, { call, request: fixed }, index)
  await deliveredOf(ports, running, index)
}

async function seeded(n: number) {
  const app = await openApp()
  const ports = await host(app.store)
  for (let index = 0; index < n; index += 1) await toolsCall(ports, index)
  return app
}

/** The records and bytes of one host domain that spans calls, for the report. */
async function domainSize(store: ToolLedgerStore, domain: LedgerDomain) {
  const read = await store.read(domain)
  return read.kind === 'complete'
    ? { records: read.records.length, bytes: Buffer.byteLength(JSON.stringify(read.records)) }
    : { unavailable: read.diagnostic }
}

describe(`the host paths after 20 and after ${String(N)} settled Tools calls`, () => {
  const apps: Record<string, App> = {}

  beforeAll(async () => {
    for (const n of [20, N]) apps[String(n)] = await seeded(n)
  }, 900_000)

  afterAll(() => {
    for (const app of Object.values(apps)) app.close()
  })

  it(
    `one Tools call reads the same records and bytes after 20 and after ${String(N)} settled calls, and the session's retention scope does not grow`,
    { timeout: 120_000 },
    async () => {
      const counts: Record<string, ReadCount> = {}
      const retention: Record<string, unknown> = {}
      for (const n of [20, N]) {
        const app = apps[String(n)]
        if (app === undefined) throw new Error('seeding did not run')
        const counting = countingStore(app.store)
        await toolsCall(await host(counting), n)
        counts[String(n)] = { ...counting.count }
        retention[String(n)] = await domainSize(
          app.store,
          retentionHostDomain(TENANT_A, canonicalDigest(SCOPE)),
        )
        // Reported, not compared: the guard domain grows with control actions, never with calls.
        console.info(
          `start-guards after ${String(n)} calls`,
          await domainSize(app.store, { kind: 'host', tenant: TENANT_A, key: 'start-guards' }),
        )
      }
      console.info('one Tools call reads', counts, 'retention scope', retention)
      expect(counts[String(N)]).toEqual(counts['20'])
      expect(retention[String(N)]).toEqual(retention['20'])
    },
  )

  it(
    `a new Tools call starts after ${String(N)} settled calls of the tenant`,
    { timeout: 120_000 },
    async () => {
      const app = apps[String(N)]
      if (app === undefined) throw new Error('seeding did not run')
      const call = callIdOf('fresh-call')
      const callAccess = { principal: alice, tenant: TENANT_A, call }
      const ports = await host(app.store)
      const request = {
        ...parentRequest(N),
        invocation: { kind: 'direct' as const, source: evidence('entry') },
      }
      const permit = await ports.authority.prepare({
        ...callAccess,
        start: startOf(TENANT_A, call),
        request,
      })
      expect(permit).toHaveProperty('ok')
      const consumed = await ports.authority.consume({
        ...callAccess,
        permit: ok(permit),
        executorReceipt: evidence('capsule-fresh'),
      })
      expect(consumed).toMatchObject({ ok: { kind: 'started' } })
    },
  )
})
