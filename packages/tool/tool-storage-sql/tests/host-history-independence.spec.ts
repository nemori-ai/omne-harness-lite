// C7, host part (I-9, I-10): the cost of one Tools call on the host paths does not depend on how
// many calls the tenant has settled before it. The seam is the real SQLite store of this member
// under the public host factories of `tool-host-local`: the start coordinator, the invocation
// source and the control subjects. Each seeded call does what a settled Tools call leaves behind on
// these paths: a consumed start, a source binding and a controller association. The counting store
// sees every ledger read the host makes; the two runs must read the same number of records and
// the same number of bytes, so nothing the host reads per call may grow with the history. The
// `start-guards` domain grows with control actions only; its size is reported, not compared.
//
// @module-tag slow: real SQLite under 2000 seeded calls, several seconds of IO and CPU.
import { afterEach, expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import type { LedgerDomain, LedgerRecord, ToolLedgerStore } from '@omne-harness/tool'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type FixedToolRequest,
  type ToolCallId,
} from '@omne-harness/tool-contract'
import { decodeToolInstanceId } from '@omne-harness/tool-contract/provider'
import {
  createLocalInvocationSource,
  createLocalStartCoordinator,
  createLocalToolControlSubjects,
  type GuardResource,
  type PrincipalJson,
  type StartCoordinatorAccess,
} from '@omne-harness/tool-host-local'
import { openApp, TENANT_A, type App } from './fixtures/app.ts'
import { fixedRequest } from './fixtures/ledger.ts'

type Principal = Readonly<{ subject: string; session: string }>

const alice: Principal = { subject: 'alice', session: 'session-a' }
const GUARD: GuardResource = { owner: 'permissions', resource: 'scope-1/read_file' }
const opened: App[] = []

afterEach(() => {
  for (const app of opened.splice(0)) app.close()
})

function ok<T>(answer: { ok: T } | { failure: unknown }): T {
  if ('failure' in answer) throw new Error(`expected success: ${JSON.stringify(answer.failure)}`)
  return answer.ok
}

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

const isJsonObject = (value: PrincipalJson): value is Readonly<{ [key: string]: PrincipalJson }> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const access: StartCoordinatorAccess<Principal> = {
  qualify: async () => ({ kind: 'allowed' }),
}

function host(store: ToolLedgerStore) {
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
  const source = createLocalInvocationSource<Principal>({
    store,
    authority: {
      qualify: async () => ({ kind: 'allowed' }),
      samePrincipal: async ({ current, original }) =>
        current.subject === original.subject
          ? { kind: 'allowed' }
          : { kind: 'denied', reason: 'different-subject' },
    },
    principalCodec: {
      encode: principal => ({ ...principal }),
      decode: value => {
        const fields: Readonly<Record<string, unknown>> = isJsonObject(value) ? value : {}
        const subject = fields['subject']
        const session = fields['session']
        return typeof subject === 'string' && typeof session === 'string'
          ? succeed({ subject, session })
          : { failure: { reason: 'shape' } }
      },
    },
    commitAttempts: 4,
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
  return { authority, source, subjects }
}

const evidence = (record: string) => ({
  owner: 'test',
  record,
  revision: '1',
  digest: `sha256:${record}`,
})

/** One consumed start of `call`, as the driver does it: prepare, consume, inspect. */
async function consumedStart(
  ports: ReturnType<typeof host>,
  call: ToolCallId,
  request: FixedToolRequest,
  index: number,
): Promise<void> {
  const start = {
    kind: 'start' as const,
    operation: ok(decodeToolOperationId(`${call}/start`)),
    executor: { owner: 'test', name: 'exec', revision: '1', digest: 'sha256:exec' },
    execution: {
      tenant: TENANT_A,
      call,
      instance: ok(decodeToolInstanceId('instance-1')),
      generation: '1',
    },
  }
  const callAccess = { principal: alice, tenant: TENANT_A, call }
  const permit = ok(await ports.authority.prepare({ ...callAccess, start, request }))
  const consumed = ok(
    await ports.authority.consume({
      ...callAccess,
      permit,
      executorReceipt: evidence(`capsule-${String(index).padStart(6, '0')}`),
    }),
  )
  if (consumed.kind !== 'started') throw new Error(`consume: ${consumed.kind}`)
  const inspected = ok(await ports.authority.inspect({ ...callAccess, start }))
  if (inspected.kind !== 'started') throw new Error(`inspect: ${inspected.kind}`)
}

/**
 * The host work of one Tools call: the source binding and controller association of the Tools
 * call, its consumed start, and the consumed start of the target call it forwards to.
 */
async function toolsCall(ports: ReturnType<typeof host>, index: number): Promise<void> {
  const { invocation: _entry, ...request } = fixedRequest()
  // Fixed-width identities: the bytes of one call must not depend on the digits of its index.
  const consumer = { ...request.consumer, work: `work-${String(index).padStart(6, '0')}` }
  const bound = await ports.source.issuer.resolve({
    principal: alice,
    tenant: TENANT_A,
    request: { ...request, consumer },
  })
  if (bound.kind !== 'bound') throw new Error(`source: ${JSON.stringify(bound)}`)
  const call = bound.call
  const fixed = { ...request, consumer, invocation: bound.invocation }
  const verified = await ports.source.guard.verify({
    principal: alice,
    tenant: TENANT_A,
    call,
    operation: bound.admission,
    request: fixed,
  })
  if (verified.kind !== 'trusted') throw new Error(`guard: ${verified.kind}`)
  ok(await ports.subjects.capture({ principal: alice, tenant: TENANT_A, call }))
  await consumedStart(ports, call, fixed, index)
  await consumedStart(ports, ok(decodeToolCallId(`${call}-target`)), fixed, index)
}

async function seeded(n: number) {
  const app = await openApp()
  opened.push(app)
  const ports = host(app.store)
  for (let index = 0; index < n; index += 1) await toolsCall(ports, index)
  return app
}

/** The records and bytes of one tenant-level host domain, for the report. */
async function domainSize(store: ToolLedgerStore, key: string) {
  const domain: LedgerDomain = { kind: 'host', tenant: TENANT_A, key }
  const read = await store.read(domain)
  return read.kind === 'complete'
    ? { records: read.records.length, bytes: Buffer.byteLength(JSON.stringify(read.records)) }
    : { unavailable: read.diagnostic }
}

const N = 2000

it(
  `a new Tools call starts after ${String(N)} settled calls of the tenant`,
  { timeout: 600_000 },
  async () => {
    const app = await seeded(N)
    const call = ok(decodeToolCallId('fresh-call'))
    const start = {
      kind: 'start' as const,
      operation: ok(decodeToolOperationId('fresh-call/start')),
      executor: { owner: 'test', name: 'exec', revision: '1', digest: 'sha256:exec' },
      execution: {
        tenant: TENANT_A,
        call,
        instance: ok(decodeToolInstanceId('instance-1')),
        generation: '1',
      },
    }
    const callAccess = { principal: alice, tenant: TENANT_A, call }
    const ports = host(app.store)
    const permit = await ports.authority.prepare({ ...callAccess, start, request: fixedRequest() })
    expect(permit).toHaveProperty('ok')
    const consumed = await ports.authority.consume({
      ...callAccess,
      permit: ok(permit),
      executorReceipt: evidence('capsule-fresh'),
    })
    expect(consumed).toMatchObject({ ok: { kind: 'started' } })
  },
)

it(
  `one Tools call reads the same records and bytes after 20 and after ${String(N)} settled calls`,
  { timeout: 600_000 },
  async () => {
    const counts: Record<string, ReadCount> = {}
    for (const n of [20, N]) {
      const app = await seeded(n)
      const counting = countingStore(app.store)
      await toolsCall(host(counting), n)
      counts[String(n)] = { ...counting.count }
      // Reported, not compared: the guard domain grows with control actions, never with calls.
      console.info(
        `start-guards after ${String(n)} calls`,
        await domainSize(app.store, 'start-guards'),
      )
    }
    expect(counts[String(N)]).toEqual(counts['20'])
  },
)
