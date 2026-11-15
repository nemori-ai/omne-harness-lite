// @module-tag slow: real SQLite under 200 seeded calls, about half a minute of IO and CPU.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import { succeed } from '@omne-harness/operation-result'
import { decodeToolInstant } from '@omne-harness/tool-contract/provider'
import {
  canonicalDigest,
  hostKey,
  type CallRecord,
  type LedgerRecord,
  type ResultRecord,
  type ToolLedgerStore,
} from '@omne-harness/tool'
import { createTestResultChannels } from '@omne-harness/tool/testing'
import {
  decodeToolOperationId,
  encodeToolInvocationRef,
  type FixedToolRequest,
  type ToolBodyPage,
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
import { domainNameOf, openApp, TENANT_A, type App } from './fixtures/app.ts'
import {
  acquisitionOf,
  alice,
  callIdOf,
  evidence,
  isParent,
  ok,
  parentRequest,
  preparationOf,
  processOf,
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
import { ok as answered, settledOffloaded } from './fixtures/settled-offloaded.ts'
import {
  statementMeter,
  withoutDecimals,
  type OwnedCost,
  type StatementMeter,
} from './fixtures/statement-meter.ts'

const GUARD: GuardResource = { owner: 'permissions', resource: 'scope-1/read_file' }
const SCOPE = targetRequest().requesterScope
const SCOPE_DOMAIN = retentionHostDomain(TENANT_A, canonicalDigest(SCOPE))
const N = 200

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
    scanPending: input => store.scanPending(input),
    due: (tenant, now, limit) => store.due(tenant, now, limit),
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
  const ledger = world.ledgerOver(store)
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
    principal: world.access.principal,
  }
}

type Host = Awaited<ReturnType<typeof host>>

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
      request,
      executorReceipt: evidence(`capsule-${width(index)}`),
    }),
  )
  if (consumed.kind !== 'started') throw new Error(`consume: ${consumed.kind}`)
  const inspected = ok(await ports.authority.inspect({ ...callAccess, start }))
  if (inspected.kind !== 'started') throw new Error(`inspect: ${inspected.kind}`)
}

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
  const process = processOf(index)
  if ((await acquisition.plan(process)) !== 'recorded') throw new Error('process plan')
  if ((await retained.plan(process)) !== 'recorded') throw new Error('process reservation')
  if ((await retained.adopt(process.key)) !== 'confirmed') throw new Error('process handover')
  if ((await retained.stopped(process.key, 'confirmed')) !== 'recorded')
    throw new Error('process stop')
  if ((await retained.ended(process.key)) !== 'confirmed') throw new Error('process end fact')
  if ((await acquisition.close()) !== 'confirmed') throw new Error('acquisition close')
}

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
    value: createTestResultChannels({
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

type Offloaded = Awaited<ReturnType<typeof settledOffloaded>>

function offloadedOf(live: Offloaded) {
  const original = live.value.original
  if (original.kind !== 'offloaded') throw new Error('the body was not offloaded')
  return original
}

async function readBack(live: Offloaded): Promise<number> {
  const body = offloadedOf(live)
  let after: string | null = null
  let bytes = 0
  do {
    const page: ToolBodyPage = answered(
      await live.ledger.reads.body.read({
        ...live.access,
        result: live.result,
        bodyId: body.bodyId,
        after,
        maxBytes: 65_536,
      }),
    )
    if (page.kind !== 'text') throw new Error(`page: ${page.kind}`)
    bytes += Buffer.byteLength(page.text, 'utf8')
    after = page.next
  } while (after !== null)
  return bytes
}

function heldBodies(app: App) {
  const count = (table: string) =>
    Number(
      app.sqlite.inspect(domainNameOf(TENANT_A), `SELECT COUNT(*) AS n FROM ${table}`)[0]?.['n'],
    )
  return { manifests: count('tl_body_manifest'), due: count("tl_due WHERE key LIKE 'body:%'") }
}

function tenantHostDomains(app: App) {
  return Object.fromEntries(
    app.sqlite
      .inspect(
        domainNameOf(TENANT_A),
        `SELECT name, COUNT(*) AS records, SUM(length(CAST(record AS BLOB))) AS bytes
         FROM tl_record WHERE kind = 'host' AND instr(name, '@') = 0 GROUP BY name ORDER BY name`,
      )
      .map(row => [
        String(row['name']),
        { records: Number(row['records']), bytes: Number(row['bytes']) },
      ]),
  )
}

const DUE_ENTRIES_PER_SWEEP = 1000

type Seeded = Readonly<{ app: App; meter: StatementMeter; held: ReturnType<typeof heldBodies> }>

async function seeded(n: number): Promise<Seeded> {
  const meter = statementMeter()
  const app = await openApp({ observe: meter.observe })
  const ports = await host(app.store)
  let last: Offloaded | null = null
  for (let index = 0; index < n; index += 1) {
    await toolsCall(ports, index)
    last = await settledOffloaded(app)
    offloadedOf(last)
  }
  if (last === null) throw new Error('nothing was seeded')
  const expiresAt = offloadedOf(last).retention.expiresAt
  const before = answered(decodeToolInstant(new Date(Date.parse(expiresAt) - 1).toISOString()))
  last.setNow(before)
  for (let round = 0; round <= Math.ceil(n / DUE_ENTRIES_PER_SWEEP); round += 1)
    answered(await last.ledger.sweep(TENANT_A, before, DUE_ENTRIES_PER_SWEEP))
  last.setNow(expiresAt)
  const swept = answered(
    await last.ledger.sweep(TENANT_A, answered(decodeToolInstant(expiresAt)), n / 2),
  )
  if (swept.reclaimed !== n / 2)
    throw new Error(`swept ${String(swept.reclaimed)} of ${String(n / 2)}`)
  return { app, meter, held: heldBodies(app) }
}

async function scopeRecordBytes(store: ToolLedgerStore) {
  const read = await store.readRecord(SCOPE_DOMAIN, hostKey('scope'))
  if (read.kind !== 'complete') throw new Error(`scope record: ${read.diagnostic}`)
  return Buffer.byteLength(JSON.stringify(read.record), 'utf8')
}

async function endFacts(store: ToolLedgerStore) {
  const read = await store.read(SCOPE_DOMAIN)
  if (read.kind !== 'complete') throw new Error(`scope domain: ${read.diagnostic}`)
  return read.records.filter(
    record => record.kind === 'host' && record.host.key.startsWith('ended/'),
  ).length
}

async function endedRead(store: ToolLedgerStore, index: number): Promise<ReadCount> {
  const counting = countingStore(store)
  const ports = await host(counting)
  const call = callIdOf(`ended-reader-${width(index)}`)
  const request = {
    ...parentRequest(index),
    invocation: { kind: 'direct' as const, source: evidence('entry') },
  }
  const preparation = preparationOf(TENANT_A, call, request)
  const view = await createRetainedTerminalLedger({
    state: ports.environments,
    address: preparation,
    scope: SCOPE,
    authorize: async () => 'authorized',
  })
  const before = { ...counting.count }
  if ((await view.ended(processOf(index).key)) !== 'confirmed') throw new Error('end fact')
  return {
    reads: counting.count.reads - before.reads,
    records: counting.count.records - before.records,
    bytes: counting.count.bytes - before.bytes,
  }
}

describe(`the Tool and host paths after 20 and after ${String(N)} settled Tools calls`, () => {
  const runs: Record<string, Seeded> = {}

  beforeAll(async () => {
    for (const n of [20, N]) runs[String(n)] = await seeded(n)
  }, 1_800_000)

  afterAll(() => {
    for (const run of Object.values(runs)) run.app.close()
  })

  it('the history holds reclaimed entries next to linked bodies', () => {
    for (const n of [20, N]) expect(runs[String(n)]?.held).toEqual({ manifests: n / 2, due: n / 2 })
  })

  it(
    `one Tools call that offloads a body and reads it back costs the same SQL after 20 and after ${String(N)} settled calls, and the tenant-level host domains and the retention scope record do not grow`,
    { timeout: 120_000 },
    async () => {
      const statements: Record<string, OwnedCost> = {}
      const counts: Record<string, ReadCount> = {}
      const scopeRecord: Record<string, number> = {}
      const ended: Record<string, number> = {}
      const endedReads: Record<string, ReadCount> = {}
      const tenantDomains: Record<string, ReturnType<typeof tenantHostDomains>> = {}
      for (const n of [20, N]) {
        const run = runs[String(n)]
        if (run === undefined) throw new Error('seeding did not run')
        const { app, meter } = run
        const counting = countingStore(app.store)
        statements[String(n)] = await meter.count(async () => {
          await toolsCall(await host(counting), n)
          expect(await readBack(await settledOffloaded(app))).toBe(70 * 1024)
        })
        counts[String(n)] = { ...counting.count }
        scopeRecord[String(n)] = await scopeRecordBytes(app.store)
        ended[String(n)] = await endFacts(app.store)
        expect(ended[String(n)]).toBe(n + 1)
        endedReads[String(n)] = await endedRead(app.store, 0)
        expect(endedReads[String(n)]).toMatchObject({ reads: 1, records: 1 })
        tenantDomains[String(n)] = tenantHostDomains(app)
      }
      console.info('one Tools call runs', JSON.stringify(statements))
      console.info('one Tools call reads', counts, 'retention scope record bytes', scopeRecord)
      console.info('retention scope end facts', ended, 'one ended(key) reads', endedReads)
      console.info('tenant-level host domains', JSON.stringify(tenantDomains))
      const after20 = statements['20']
      const afterN = statements[String(N)]
      if (after20 === undefined || afterN === undefined) throw new Error('the meter did not count')
      expect(withoutDecimals(afterN)).toEqual(withoutDecimals(after20))
      for (const owner of ['tool', 'host'] as const)
        expect(afterN[owner].bytes - after20[owner].bytes).toBe(
          afterN[owner].decimal - after20[owner].decimal,
        )
      expect(statements['20']?.tool.statements).toBeGreaterThan(0)
      expect(statements['20']?.host.statements).toBeGreaterThan(0)
      expect(counts[String(N)]).toEqual(counts['20'])
      expect(scopeRecord[String(N)]).toEqual(scopeRecord['20'])
      expect(endedReads[String(N)]).toEqual(endedReads['20'])
      const { 'start-guards': _guard20, ...others20 } = tenantDomains['20'] ?? {}
      const { 'start-guards': _guardN, ...othersN } = tenantDomains[String(N)] ?? {}
      expect(othersN).toEqual(others20)
    },
  )

  it(
    `a new Tools call starts after ${String(N)} settled calls of the tenant`,
    { timeout: 120_000 },
    async () => {
      const app = runs[String(N)]?.app
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
        request,
        executorReceipt: evidence('capsule-fresh'),
      })
      expect(consumed).toMatchObject({ ok: { kind: 'started' } })
    },
  )
})
