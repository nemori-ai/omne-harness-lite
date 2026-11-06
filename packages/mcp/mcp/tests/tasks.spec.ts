// The task operations (SPEC S2, S8, MC-17): the initiator can use them; anyone else, and any task
// not in the table, gets the same unknown; a connection is reused without a port asked; a new
// one needs the gate's `granted` and the same peer account; the transport's answers are reported
// as S2 says; after `closeAll` the initiator check comes first.
import { describe, expect, it } from 'vitest'
import type { DefinitionDigest, McpPorts, TaskRef } from '@omne-harness/mcp-contract'
import {
  actionNameOf,
  correlationKeyOf,
  endpointRefOf,
  generationOf,
  jsonOf,
  millisOf,
  taskIdOf,
  type PeerScript,
  type PlainJson,
  type TaskScript,
} from '@omne-harness/mcp-contract/testing'
import type { TableRuntime } from '../src/internal/table.ts'
import { manualBounds } from './doubles/bounds.ts'
import { only } from './doubles/calls.ts'
import { settled } from './doubles/deferred.ts'
import { alice, aliceAway, bob, mallory, type Principal } from './doubles/identities.ts'
import { listing, peer, services, taskHandle, taskStatus, text, type Peer } from './doubles/peer.ts'
import { adoptionBefore, armedEligibility, stallingLanding } from './doubles/stalls.ts'
import { reshapedTransports } from './doubles/transports.ts'
import { MAIN, adoptHttp, adoptStdio, storedRecord } from './doubles/world.ts'

/** What a case replaces in the peer's ports, and the table runtime it runs on. */
type Shape = Readonly<{ ports?: Partial<McpPorts<Principal, string>>; runtime?: TableRuntime }>

const files = endpointRefOf('files')
const READ = actionNameOf('read')
const T1 = taskIdOf('t1')
const anonymousKey = {
  tenant: alice.tenant,
  account: { kind: 'anonymous' as const },
  holding: files.holding,
}
const UNKNOWN = { failure: { kind: 'unknown' } }
const NO_CONNECTION = { failure: { kind: 'effect-unknown', cause: 'no-connection' } }
const WORKING = taskStatus('t1', 'working')

/**
 * A peer whose `read` answers with the task `t1`, which answers `tasks/get` as scripted; `files`
 * adopted for alice as stdio, the catalog stored, and the task started by alice.
 */
async function started(
  t1: TaskScript = { get: WORKING },
  script: PeerScript = {},
  outputSchema?: PlainJson,
  shape: (p: Peer) => Shape = () => ({}),
) {
  const p = peer({
    listing: {
      '': listing([outputSchema === undefined ? { name: 'read' } : { name: 'read', outputSchema }]),
    },
    calls: { read: taskHandle('t1') },
    tasks: { t1 },
    ...script,
  })
  adoptStdio(p, files)
  const shaped = shape(p)
  const { services: s, table } = services(
    { ...p, ports: { ...p.ports, ...shaped.ports } },
    shaped.runtime,
  )
  // The catalog comes from the peer's listing, so the task's action carries its output schema.
  expect(await s.discovery.refresh(alice, { ref: files })).toMatchObject({
    ok: { kind: 'published' },
  })
  const current = await s.discovery.current(alice, files)
  if (!('ok' in current) || current.ok.kind !== 'acquired') throw new Error('not acquired')
  const digest = current.ok.actions[0]?.definitionDigest
  if (digest === undefined) throw new Error('no digest')
  await invokeTask(s.invoker, digest)
  return { p, digest, table, ...s }
}

/** Alice's call that the peer answers with the task `t1`, issued at `issuedAt`. */
async function invokeTask(
  invoker: Awaited<ReturnType<typeof started>>['invoker'],
  digest: DefinitionDigest,
  correlationKey = correlationKeyOf('c1'),
  issuedAt = generationOf(1),
) {
  const result = await invoker.invoke(alice, {
    ref: files,
    action: READ,
    args: jsonOf({}),
    expectedDefinition: digest,
    correlationKey,
    signal: new AbortController().signal,
  })
  expect(result).toMatchObject({
    kind: 'sent',
    outcome: { kind: 'task', taskId: 't1', issuedAt },
  })
}

const task: TaskRef = { ref: files, taskId: T1, issuedAt: generationOf(1) }

function portCalls(p: Peer) {
  return { adoption: p.adoption.calls(), eligibility: p.eligibility.calls() }
}

describe('the task table opens the operations to the initiator only (SPEC S2)', () => {
  it('answers the initiator from the task on the connection it was started on', async () => {
    const c = await started()
    expect(await c.invoker.queryTask(alice, task)).toEqual({ ok: { status: 'working' } })
    expect(c.p.requests('tasks/get')).toHaveLength(1)
    expect(c.p.requests('tasks/get')[0]?.params).toMatchObject({ taskId: 't1' })
  })

  it('answers another principal, another tenant, and a task not in the table, with the same unknown, asking no port', async () => {
    const c = await started()
    const asked = portCalls(c.p)
    const other = await c.invoker.queryTask(bob, task)
    const elsewhere = await c.invoker.queryTask(mallory, task)
    const sameText = await c.invoker.queryTask(aliceAway, task)
    const absent = await c.invoker.queryTask(alice, { ...task, taskId: taskIdOf('t9') })
    expect(other).toStrictEqual(UNKNOWN)
    expect(elsewhere).toStrictEqual(other)
    expect(sameText).toStrictEqual(other)
    expect(absent).toStrictEqual(other)
    expect(await c.invoker.taskResult(bob, task)).toStrictEqual(UNKNOWN)
    expect(await c.invoker.provideTaskInput(bob, task, jsonOf({}))).toStrictEqual(UNKNOWN)
    expect(await c.invoker.cancelTask(bob, task)).toStrictEqual(UNKNOWN)
    expect(portCalls(c.p)).toEqual(asked)
    expect(c.p.requests('tasks/get')).toHaveLength(0)
  })
})

describe('the connection of a task operation (SPEC S2)', () => {
  it('reuses the existing connection without asking adoption or eligibility', async () => {
    const c = await started()
    const asked = portCalls(c.p)
    expect(await c.invoker.queryTask(alice, task)).toEqual({ ok: { status: 'working' } })
    expect(await c.invoker.cancelTask(alice, task)).toEqual({ ok: 'requested' })
    expect(portCalls(c.p)).toEqual(asked)
    expect(c.p.opens()).toBe(1)
  })

  it.each([
    ['queryTask', (c: Awaited<ReturnType<typeof started>>) => c.invoker.queryTask(alice, task)],
    ['cancelTask', (c: Awaited<ReturnType<typeof started>>) => c.invoker.cancelTask(alice, task)],
  ] as const)(
    '%s: a new connection needs eligibility granted; otherwise effect-unknown (no-connection) and no transport is opened',
    async (_name, operation) => {
      const c = await started()
      await c.connections.release(alice, files)
      c.p.eligibility.revoke(alice, files)
      expect(await operation(c)).toEqual(NO_CONNECTION)
      c.p.eligibility.setUnreadable(alice, files, true)
      expect(await operation(c)).toEqual(NO_CONNECTION)
      c.p.eligibility.setUnreadable(alice, files, false)
      c.p.eligibility.block(alice, files, 'disabled')
      expect(await operation(c)).toEqual(NO_CONNECTION)
      expect(c.p.opens()).toBe(1)
      c.p.eligibility.grant(alice, files)
      expect(await operation(c)).toMatchObject({ ok: expect.anything() })
      expect(c.p.opens()).toBe(2)
    },
  )

  it('a new connection needs the adoption: withdrawn is effect-unknown (no-connection), unreadable is unknown', async () => {
    const c = await started()
    await c.connections.release(alice, files)
    c.p.adoption.setUnreadable(true)
    expect(await c.invoker.queryTask(alice, task)).toEqual(UNKNOWN)
    c.p.adoption.setUnreadable(false)
    c.p.adoption.withdraw(alice.tenant, files)
    expect(await c.invoker.queryTask(alice, task)).toEqual(NO_CONNECTION)
    expect(c.p.opens()).toBe(1)
  })

  it('a new connection needs the setting values of S4: a missing one is effect-unknown (no-connection)', async () => {
    const c = await started()
    await c.connections.release(alice, files)
    c.p.adoption.update(alice.tenant, files, {
      settings: {
        target: { kind: 'absent' },
        credential: { kind: 'absent' },
        connectTimeout: { kind: 'absent' },
      },
    })
    expect(await c.invoker.queryTask(alice, task)).toEqual(NO_CONNECTION)
    expect(c.p.opens()).toBe(1)
  })

  it('does not act on the task through another peer account: no request, effect-unknown (no-connection)', async () => {
    const c = await started()
    await c.connections.release(alice, files)
    c.p.adoption.update(alice.tenant, files, {
      body: jsonOf({
        name: 'files',
        transport: 'stdio',
        auth: 'static',
        launch: { command: 'mcp' },
      }),
      settings: {
        target: { kind: 'absent' },
        credential: { kind: 'value', value: MAIN },
        connectTimeout: { kind: 'value', value: millisOf(30_000) },
      },
    })
    c.p.credentials.store({
      tenant: alice.tenant,
      holding: files.holding,
      binding: MAIN,
      secret: 's',
    })
    expect(await c.invoker.queryTask(alice, task)).toEqual(NO_CONNECTION)
    expect(c.p.opens()).toBe(1)
    expect(c.p.requests('tasks/get')).toHaveLength(0)
  })

  it('a connection on another peer account is not reused either', async () => {
    const c = await started()
    c.p.adoption.update(alice.tenant, files, {
      body: jsonOf({
        name: 'files',
        transport: 'stdio',
        auth: 'static',
        launch: { command: 'mcp' },
      }),
      settings: {
        target: { kind: 'absent' },
        credential: { kind: 'value', value: MAIN },
        connectTimeout: { kind: 'value', value: millisOf(30_000) },
      },
    })
    c.p.credentials.store({
      tenant: alice.tenant,
      holding: files.holding,
      binding: MAIN,
      secret: 's',
    })
    await storedRecord(c.p, { ...anonymousKey, account: { kind: 'credential', binding: MAIN } }, [
      'read',
    ])
    expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({ ok: {} })
    expect(c.p.opens()).toBe(2)
    expect(await c.invoker.queryTask(alice, task)).toEqual(NO_CONNECTION)
    expect(c.p.requests('tasks/get')).toHaveLength(0)
  })
})

describe('the answers of the task operations (SPEC S2, T6)', () => {
  it('no answer is effect-unknown with the same cause, and the connection is lost', async () => {
    const c = await started({ get: { kind: 'stream-breaks' } })
    expect(await c.invoker.queryTask(alice, task)).toEqual({
      failure: { kind: 'effect-unknown', cause: 'stream-broken' },
    })
    expect(await c.status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'lost', reason: 'stream-broken' } },
    })
    expect(c.p.requests('tasks/get')).toHaveLength(1)
  })

  it('a request the connection bound cuts off has no answer: effect-unknown (abandoned); the connection stays', async () => {
    const p = peer({
      listing: { '': listing([{ name: 'read' }]) },
      calls: { read: taskHandle('t1') },
      tasks: { t1: { get: { kind: 'silent' } } },
    })
    adoptStdio(p, files)
    const bounds = manualBounds()
    const { services: s } = services(p, bounds.runtime)
    expect(await s.discovery.refresh(alice, { ref: files })).toMatchObject({
      ok: { kind: 'published' },
    })
    const current = await s.discovery.current(alice, files)
    if (!('ok' in current) || current.ok.kind !== 'acquired') throw new Error('not acquired')
    const digest = current.ok.actions[0]?.definitionDigest
    if (digest === undefined) throw new Error('no digest')
    await invokeTask(s.invoker, digest)
    const query = s.invoker.queryTask(alice, task)
    await settled()
    expect(p.requests('tasks/get')).toHaveLength(1)
    bounds.fire('task')
    expect(await query).toEqual({ failure: { kind: 'effect-unknown', cause: 'abandoned' } })
    expect(await s.status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'ready' } },
    })
  })

  it('a JSON-RPC error and an unreadable answer are passed on as they are', async () => {
    const error = await started({ get: { kind: 'error', error: { code: -32000, message: 'no' } } })
    expect(await error.invoker.queryTask(alice, task)).toEqual({
      failure: { kind: 'error-answer', code: -32000, message: 'no' },
    })
    const malformed = await started({ get: taskStatus('t1', 'weird') })
    expect(await malformed.invoker.queryTask(alice, task)).toEqual({
      failure: { kind: 'answer-malformed', what: 'status-unknown' },
    })
  })

  it('queryTask reports the status with the input requests and hints; a -32602 is expired', async () => {
    const c = await started({
      get: [
        taskStatus('t1', 'input_required', { inputRequests: { q: 1 }, pollIntervalMs: 200 }),
        { kind: 'error', error: { code: -32602, message: 'Task not found' } },
      ],
    })
    expect(await c.invoker.queryTask(alice, task)).toEqual({
      ok: {
        status: 'input_required',
        inputRequests: { untrusted: jsonOf({ q: 1 }) },
        pollIntervalMs: 200,
      },
    })
    expect(await c.invoker.queryTask(alice, task)).toEqual({ ok: 'expired' })
  })

  it("taskResult: not finished, cancelled, expired, and a finished result classified on the task's output schema", async () => {
    const c = await started(
      {
        get: [
          WORKING,
          taskStatus('t1', 'cancelled'),
          { kind: 'error', error: { code: -32602, message: 'gone' } },
          taskStatus('t1', 'completed', {
            result: { content: [text('ok')], structuredContent: { n: 1 } },
          }),
          taskStatus('t1', 'failed', { error: { code: -32001, message: 'failed' } }),
        ],
      },
      {},
      { type: 'object' },
    )
    expect(await c.invoker.taskResult(alice, task)).toEqual({ ok: 'not-finished' })
    expect(await c.invoker.taskResult(alice, task)).toEqual({ ok: 'cancelled' })
    expect(await c.invoker.taskResult(alice, task)).toEqual({ ok: 'expired' })
    expect(await c.invoker.taskResult(alice, task)).toMatchObject({
      ok: { kind: 'complete', structured: jsonOf({ n: 1 }), output: { kind: 'conforms' } },
    })
    expect(c.p.checks.calls()).toBe(1)
    expect(await c.invoker.taskResult(alice, task)).toEqual({
      ok: { kind: 'protocolError', fault: { kind: 'peer-error', code: -32001, message: 'failed' } },
    })
  })

  it('provideTaskInput hands the responses to the peer and answers accepted; cancelTask answers requested', async () => {
    const c = await started({ get: WORKING, update: { kind: 'result', result: {} } })
    expect(await c.invoker.provideTaskInput(alice, task, jsonOf({ q: 'a' }))).toEqual({
      ok: 'accepted',
    })
    expect(c.p.requests('tasks/update')[0]?.params).toMatchObject({
      taskId: 't1',
      inputResponses: { q: 'a' },
    })
    expect(await c.invoker.cancelTask(alice, task)).toEqual({ ok: 'requested' })
    expect(c.p.requests('tasks/cancel')[0]?.params).toMatchObject({ taskId: 't1' })
  })

  it('after closeAll: the initiator check first, then effect-unknown (no-connection), with no port asked (S8)', async () => {
    const c = await started()
    await c.connections.closeAll()
    const asked = portCalls(c.p)
    expect(await c.invoker.queryTask(bob, task)).toStrictEqual(UNKNOWN)
    expect(await c.invoker.queryTask(alice, task)).toEqual(NO_CONNECTION)
    expect(await c.invoker.cancelTask(alice, task)).toEqual(NO_CONNECTION)
    expect(portCalls(c.p)).toEqual(asked)
    expect(c.p.opens()).toBe(1)
  })

  it('closeAll while the operation waits on the gate: effect-unknown (no-connection), the same as after closeAll; nothing is built (S8)', async () => {
    let armed: ReturnType<typeof armedEligibility> | undefined
    const c = await started(undefined, {}, undefined, p => {
      armed = armedEligibility(p.eligibility)
      return { ports: { eligibility: armed.port } }
    })
    if (armed === undefined) throw new Error('not shaped')
    await c.connections.release(alice, files)
    const gate = armed.arm()
    const query = c.invoker.queryTask(alice, task)
    await gate.reached
    await c.connections.closeAll()
    gate.release()
    expect(await query).toEqual(NO_CONNECTION)
    // The check the gate was waiting on is counted when it is let go; nothing is asked after it.
    const asked = portCalls(c.p)
    expect(await c.invoker.queryTask(alice, task)).toEqual(NO_CONNECTION)
    expect(portCalls(c.p)).toEqual(asked)
    expect(c.p.opens()).toBe(1)
    expect(c.p.requests('tasks/get')).toHaveLength(0)
  })
})

describe('a task request the build does not get to send (SPEC S2, R7, MC-17 step 3)', () => {
  const CONNECTION_UNAVAILABLE = { failure: { kind: 'connection-unavailable' } }

  it('a discover without an answer on the new connection is connection-unavailable, not effect-unknown', async () => {
    const c = await started(undefined, {}, undefined, p => ({
      ports: {
        transports: reshapedTransports(p.ports.transports, (_transport, opened) =>
          opened === 2
            ? { discover: async () => ({ failure: { kind: 'no-answer', cause: 'stream-broken' } }) }
            : {},
        ),
      },
    }))
    await c.connections.release(alice, files)
    expect(await c.invoker.queryTask(alice, task)).toEqual(CONNECTION_UNAVAILABLE)
    expect(c.p.opens()).toBe(2)
    expect(c.p.requests('tasks/get')).toHaveLength(0)
  })

  it('a build bound that fires first is connection-unavailable', async () => {
    const bounds = manualBounds()
    let stalled: ReturnType<typeof stallingLanding> | undefined
    const c = await started(undefined, {}, undefined, p => {
      stalled = stallingLanding(p.landing, only(2))
      return { ports: { landing: stalled.port }, runtime: bounds.runtime }
    })
    if (stalled === undefined) throw new Error('not shaped')
    await c.connections.release(alice, files)
    const query = c.invoker.queryTask(alice, task)
    await settled()
    expect(stalled.calls()).toBe(2)
    bounds.fire('build', 1)
    expect(await query).toEqual(CONNECTION_UNAVAILABLE)
    stalled.gate.resolve()
    await settled()
    expect(c.p.requests('tasks/get')).toHaveLength(0)
  })

  it('a shutdown under way while the connection is built is connection-unavailable', async () => {
    let stalled: ReturnType<typeof stallingLanding> | undefined
    const c = await started(undefined, {}, undefined, p => {
      stalled = stallingLanding(p.landing, only(2))
      return { ports: { landing: stalled.port } }
    })
    if (stalled === undefined) throw new Error('not shaped')
    await c.connections.release(alice, files)
    const query = c.invoker.queryTask(alice, task)
    await settled()
    expect(stalled.calls()).toBe(2)
    const closing = c.connections.closeAll()
    await settled()
    stalled.gate.resolve()
    expect(await query).toEqual(CONNECTION_UNAVAILABLE)
    await closing
    expect(c.p.requests('tasks/get')).toHaveLength(0)
  })

  it.each([
    [
      'cannot be read again: unknown',
      (_p: Peer) => {
        throw new Error('adoption unreadable')
      },
      UNKNOWN,
    ],
    [
      'is withdrawn by then: effect-unknown (no-connection)',
      (p: Peer) => p.adoption.withdraw(alice.tenant, files),
      NO_CONNECTION,
    ],
  ] as const)(
    'the adoption passed the gate but, read again before the build, %s; nothing is built',
    async (_name, change, failure) => {
      // The gate reads the adoption once; the critical section reads it again before the build
      // (MC-5). The change lands between the two reads of the one query.
      let readAgain = Number.POSITIVE_INFINITY
      const c = await started(undefined, {}, undefined, p => ({
        ports: {
          adoption: adoptionBefore(p.adoption, call => {
            if (call === readAgain) change(p)
          }),
        },
      }))
      await c.connections.release(alice, files)
      readAgain = c.p.adoption.calls() + 2
      expect(await c.invoker.queryTask(alice, task)).toEqual(failure)
      expect(c.p.opens()).toBe(1)
      expect(c.p.requests('tasks/get')).toHaveLength(0)
    },
  )

  it('a task request the transport could not send is the connection failure, and the connection is lost (S7)', async () => {
    const c = await started({ get: { kind: 'unsent' } })
    expect(await c.invoker.queryTask(alice, task)).toEqual(CONNECTION_UNAVAILABLE)
    expect(await c.status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'lost', reason: 'stream-broken' } },
    })
    expect(c.p.requests('tasks/get')).toHaveLength(0)
  })

  it('a task request refused for authorization is authorization-required with the discovery, and the connection is lost', async () => {
    const p = peer({
      listing: { '': listing([{ name: 'read' }]) },
      calls: { read: taskHandle('t1') },
      tasks: {
        t1: {
          get: { kind: 'http', status: 401, headers: { 'www-authenticate': 'Bearer scope="a"' } },
        },
      },
    })
    adoptHttp(p, files)
    const { services: s } = services(p)
    expect(await s.discovery.refresh(alice, { ref: files })).toMatchObject({
      ok: { kind: 'published' },
    })
    const current = await s.discovery.current(alice, files)
    if (!('ok' in current) || current.ok.kind !== 'acquired') throw new Error('not acquired')
    const digest = current.ok.actions[0]?.definitionDigest
    if (digest === undefined) throw new Error('no digest')
    await invokeTask(s.invoker, digest)
    expect(await s.invoker.queryTask(alice, task)).toMatchObject({
      failure: { kind: 'authorization-required', discovery: { scopes: ['a'] } },
    })
    expect(await s.status.inspect(alice, files)).toMatchObject({
      ok: { connection: { kind: 'lost', reason: 'authorization-required' } },
    })
  })
})

describe('the task reference names the task it was issued as (SPEC S2, MC-17 step 1)', () => {
  it('an issuedAt other than the recorded one is unknown: not this task, no port asked, no request', async () => {
    const c = await started()
    const asked = portCalls(c.p)
    const other = { ...task, issuedAt: generationOf(2) }
    expect(await c.invoker.queryTask(alice, other)).toStrictEqual(UNKNOWN)
    expect(await c.invoker.taskResult(alice, other)).toStrictEqual(UNKNOWN)
    expect(await c.invoker.provideTaskInput(alice, other, jsonOf({}))).toStrictEqual(UNKNOWN)
    expect(await c.invoker.cancelTask(alice, other)).toStrictEqual(UNKNOWN)
    expect(portCalls(c.p)).toEqual(asked)
    expect(c.p.requests('tasks/get')).toHaveLength(0)
    expect(await c.invoker.queryTask(alice, task)).toEqual({ ok: { status: 'working' } })
  })
})

describe('the task table keys by tenant, principal, holding and task id; the peer account is recorded, not keyed (SPEC S2, MC-17)', () => {
  /** The adoption of `files` changed to a credential account, with the credential stored and the catalog published. */
  async function movedToCredentialAccount(c: Awaited<ReturnType<typeof started>>) {
    c.p.adoption.update(alice.tenant, files, {
      body: jsonOf({
        name: 'files',
        transport: 'stdio',
        auth: 'static',
        launch: { command: 'mcp' },
      }),
      settings: {
        target: { kind: 'absent' },
        credential: { kind: 'value', value: MAIN },
        connectTimeout: { kind: 'value', value: millisOf(30_000) },
      },
    })
    c.p.credentials.store({
      tenant: alice.tenant,
      holding: files.holding,
      binding: MAIN,
      secret: 's',
    })
    expect(await c.discovery.refresh(alice, { ref: files })).toMatchObject({ ok: {} })
  }

  it('a task id the peer gave again on another peer account makes the key ambiguous: both references are unknown, no port asked, no request sent', async () => {
    const c = await started()
    await movedToCredentialAccount(c)
    // The second connection has its own key, so its generation starts at 1 again: the two
    // references of `t1` are told apart by nothing but the peer account, which the key lacks.
    await invokeTask(c.invoker, c.digest, correlationKeyOf('c2'))
    expect(c.p.opens()).toBe(2)
    const asked = portCalls(c.p)
    expect(await c.invoker.queryTask(alice, task)).toStrictEqual(UNKNOWN)
    expect(await c.invoker.taskResult(alice, task)).toStrictEqual(UNKNOWN)
    expect(await c.invoker.provideTaskInput(alice, task, jsonOf({}))).toStrictEqual(UNKNOWN)
    expect(await c.invoker.cancelTask(alice, task)).toStrictEqual(UNKNOWN)
    expect(portCalls(c.p)).toEqual(asked)
    expect(c.p.requests('tasks/get')).toHaveLength(0)
    expect(c.p.opens()).toBe(2)
  })

  it('a task id the peer gave again on the same account is the newer record: the earlier reference is unknown, the newer one is answered', async () => {
    const c = await started()
    expect(await c.connections.release(alice, files)).toMatchObject({ ok: {} })
    await invokeTask(c.invoker, c.digest, correlationKeyOf('c2'), generationOf(2))
    expect(await c.invoker.queryTask(alice, task)).toStrictEqual(UNKNOWN)
    expect(await c.invoker.queryTask(alice, { ...task, issuedAt: generationOf(2) })).toEqual({
      ok: { status: 'working' },
    })
    expect(c.p.requests('tasks/get')).toHaveLength(1)
  })
})

describe('the result of a finished task is classified outside the port call (SPEC O1, MC-15, MC-17 step 5)', () => {
  it('a checkOutput that throws is absorbed: the result carries violates (output-check-failed), not effect-unknown', async () => {
    const throwing = () => {
      throw new Error('schema engine: unsupported keyword')
    }
    const c = await started(
      {
        get: taskStatus('t1', 'completed', {
          result: { content: [text('ok')], structuredContent: { n: 1 } },
        }),
      },
      {},
      { type: 'object' },
      () => ({ ports: { checkOutput: throwing } }),
    )
    expect(await c.invoker.taskResult(alice, task)).toMatchObject({
      ok: {
        kind: 'complete',
        structured: jsonOf({ n: 1 }),
        output: { kind: 'violates', reason: 'output-check-failed' },
      },
    })
    expect(c.p.requests('tasks/get')).toHaveLength(1)
  })
})
