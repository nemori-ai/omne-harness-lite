import { describe, expect, it } from 'vitest'
import type {
  FollowedTask,
  Millis,
  OperationFailure,
  TaskRef,
  TaskWatch,
} from '@omne-harness/mcp-contract'
import { jsonOf } from '@omne-harness/mcp-contract/testing'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { createSchemaProvider, validate } from '@omne-harness/schema-provider'
import type {
  ToolCallId,
  ToolOperationId,
  ToolWaitId,
  WaitRecord,
} from '@omne-harness/tool-contract'
import type { ToolRecovery, ToolTask } from '@omne-harness/tool-contract/provider'
import { testingTenant } from '@omne-harness/tool-contract/testing'
import { createTaskWaitBridge, mcpTaskWait } from '../src/index.ts'
import {
  readTaskWaitAnswer,
  readTaskWaitRequest,
  taskWaitAnswer,
  taskWaitRequest,
} from '../src/task-wait.ts'

const WAIT = 'op-c1/start/wait' as ToolWaitId
const ACCESS = {
  principal: 'driver',
  tenant: testingTenant('org_c0nf0rmance000000000000000', 'acc_c0nf0rmance000000000000000'),
  call: 'call-1' as ToolCallId,
}
const evidence = (record: string) => ({
  owner: 'test-owner',
  record,
  revision: '1',
  digest: `sha256:${record}`,
})
const REQUEST = { endpoint: 'desk', holding: 'h1', task: 't1', issuedAt: 3, round: 2 }

type Facts = Pick<ToolRecovery, 'waits' | 'waitRequest' | 'tasks'>
type Phase = 'open' | 'continued' | 'cancelled'

function waitRecord(phase: Phase, contract = mcpTaskWait.adoption): WaitRecord {
  const intent = { kind: 'ask', wait: WAIT, schemas: { contract } }
  if (phase === 'open') return { phase, intent } as never
  return { phase: 'closed', cause: phase, intent, evidence: evidence('closed') } as never
}

const facts = (change: Partial<Facts> = {}): Facts => ({
  waits: [waitRecord('open')],
  waitRequest: { wait: WAIT, request: JSON.stringify(REQUEST) },
  tasks: [],
  ...change,
})

function world(start: FollowedTask | 'down' | 'no-watch', recovery: Facts = facts()) {
  const followed: Array<Readonly<{ principal: unknown; task: TaskRef }>> = []
  const dropped: Array<Readonly<{ task: TaskRef; cancel: boolean }>> = []
  let seen = start
  const watch: TaskWatch<unknown> = {
    follow: async (access, task): Promise<Outcome<FollowedTask, OperationFailure>> => {
      followed.push({ principal: access.principal, task })
      return seen === 'down' || seen === 'no-watch' ? fail({ kind: 'unknown' }) : succeed(seen)
    },
    drop: async (_access, task, cancel) => {
      dropped.push({ task, cancel })
      return succeed('dropped')
    },
    following: async () => succeed([]),
    subscribe: () => () => undefined,
  }
  const bridge = createTaskWaitBridge<unknown>({
    watch: () => (start === 'no-watch' ? undefined : watch),
    recoveryOf: async () => succeed(recovery),
    connectBound: 7000 as Millis,
  })
  return {
    bridge,
    followed,
    dropped,
    set: (next: FollowedTask) => {
      seen = next
    },
  }
}

const inspect = (w: ReturnType<typeof world>) => w.bridge.inspect({ ...ACCESS, wait: WAIT })
const FOLLOWING: FollowedTask = { state: 'following', round: 2 }
const DONE: FollowedTask = {
  state: 'arrived',
  round: 2,
  arrival: { kind: 'terminal', status: 'completed' },
}

describe('the decision bridge of the task wait (C111, MC-28)', () => {
  it('ensure follows the task as the principal of the call, and registers the wait', async () => {
    const w = world(FOLLOWING)
    const registered = await w.bridge.ensure({
      ...ACCESS,
      operation: 'ensure-1' as ToolOperationId,
      wait: WAIT,
      request: evidence('request'),
    })
    expect(registered).toMatchObject({ ok: { owner: '@omne-harness/mcp-bridge' } })
    expect(w.followed).toEqual([
      {
        principal: 'driver',
        task: {
          ref: { name: 'desk', holding: 'h1' },
          taskId: 't1',
          issuedAt: 3,
          connectBound: 7000,
        },
      },
    ])
  })

  it('a task still followed has no decision; once it arrived in the round of the wait, the decision is where it got', async () => {
    const w = world(FOLLOWING)
    const before = await inspect(w)
    expect(before).toMatchObject({ ok: { decision: null } })
    w.set(DONE)
    const after = await inspect(w)
    if (!('ok' in after) || after.ok.decision === null) throw new Error('no decision')
    expect('ok' in before && before.ok.registration).toEqual(after.ok.registration)
    expect(await w.bridge.resolve({ ...ACCESS, wait: WAIT, decision: after.ok.decision })).toEqual({
      ok: { kind: 'answer', value: jsonOf({ kind: 'terminal', status: 'completed' }) },
    })
  })

  it('an arrival of another round is not the decision of this wait', async () => {
    const w = world({ ...DONE, round: 3 })
    expect(await inspect(w)).toMatchObject({ ok: { decision: null } })
    const awaiting = world({ state: 'awaiting', round: 2, arrival: { kind: 'input' } })
    expect(await inspect(awaiting)).not.toMatchObject({ ok: { decision: null } })
  })

  it('a decision that is not where the task got to is refused', async () => {
    const w = world(DONE)
    expect(
      await w.bridge.resolve({ ...ACCESS, wait: WAIT, decision: evidence('forged') }),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'decision' } })
  })

  it('without a watcher, or when the task cannot be read, the decision cannot be had now', async () => {
    for (const start of ['down', 'no-watch'] as const)
      expect(await inspect(world(start))).toMatchObject({ failure: { kind: 'unavailable' } })
  })

  it('a closed wait drops its task: a cancelled call asks the peer to cancel it, another closing does not', async () => {
    for (const [cause, cancel] of [
      ['cancelled', true],
      ['terminal', false],
    ] as const) {
      const w = world(FOLLOWING)
      const closed = await w.bridge.invalidate({
        ...ACCESS,
        operation: 'close-1' as ToolOperationId,
        wait: WAIT,
        terminal: evidence('terminal'),
        cause,
      })
      expect(closed).toMatchObject({ ok: { owner: '@omne-harness/mcp-bridge' } })
      expect(w.dropped).toEqual([{ task: expect.objectContaining({ taskId: 't1' }), cancel }])
    }
  })

  it('a wait of another contract, or a request that names no task, is refused', async () => {
    const stranger = { owner: 'x', name: 'y', revision: '1', digest: 'sha256:x' }
    expect(
      await inspect(world(FOLLOWING, facts({ waits: [waitRecord('open', stranger)] }))),
    ).toMatchObject({ failure: { kind: 'invalid', field: 'wait' } })
    for (const request of ['{}', 'not json', JSON.stringify({ ...REQUEST, round: 0 })])
      expect(
        await inspect(world(FOLLOWING, facts({ waitRequest: { wait: WAIT, request } }))),
      ).toMatchObject({ failure: { kind: 'invalid', field: 'request' } })
  })

  it('an operation is recalled from the duty of the call: a registration, or the closing of a closed wait', async () => {
    const duty = (action: 'ensure' | 'invalidate'): ToolTask =>
      ({
        kind: 'wait-registration',
        operation: 'op-1',
        wait: WAIT,
        action,
        evidence: evidence('terminal'),
      }) as never
    const ensured = world(FOLLOWING, facts({ tasks: [duty('ensure')] }))
    const operation = 'op-1' as ToolOperationId
    expect(await ensured.bridge.inspectOperation({ ...ACCESS, operation })).toMatchObject({
      ok: { kind: 'committed' },
    })
    const closed = world(
      FOLLOWING,
      facts({ tasks: [duty('invalidate')], waits: [waitRecord('cancelled')] }),
    )
    expect(await closed.bridge.inspectOperation({ ...ACCESS, operation })).toMatchObject({
      ok: { kind: 'committed' },
    })
    const open = world(FOLLOWING, facts({ tasks: [duty('invalidate')] }))
    expect(await open.bridge.inspectOperation({ ...ACCESS, operation })).toMatchObject({
      ok: { kind: 'unknown' },
    })
    expect(await world(FOLLOWING).bridge.inspectOperation({ ...ACCESS, operation })).toMatchObject({
      ok: { kind: 'unknown' },
    })
  })
})

describe('the answer of a task wait', () => {
  it.each([
    [{ kind: 'terminal', status: 'failed' }],
    [{ kind: 'expired' }],
    [{ kind: 'unknown' }],
    [{ kind: 'input' }],
    [
      {
        kind: 'input',
        inputRequests: { untrusted: jsonOf({ a: { method: 'elicitation/create' } }) },
      },
    ],
  ] as const)('reads back what it wrote: %j', arrival => {
    const plain = JSON.parse(JSON.stringify(readable(taskWaitAnswer(arrival)))) as unknown
    expect(readTaskWaitAnswer(plain)).toEqual(arrival)
  })

  it.each([
    [null],
    [{ kind: 'terminal', status: 'working' }],
    [{ kind: 'arrived' }],
    [{ kind: 'input', inputRequests: [1] }],
  ])('anything else is not one this bridge gave out: %j', value => {
    expect(readTaskWaitAnswer(value)).toBeUndefined()
  })
})

function readable(value: ReturnType<typeof taskWaitAnswer>): unknown {
  switch (value.kind) {
    case 'object':
      return Object.fromEntries(value.entries.map(entry => [entry.key, readable(entry.value)]))
    case 'array':
      return value.items.map(readable)
    case 'number':
      return Number(value.lexeme)
    case 'null':
      return null
    default:
      return value.value
  }
}

const provider = createSchemaProvider({
  maxSnapshots: 4,
  maxConstructDepth: 16,
  maxConstructNodes: 512,
  failureBackoffMs: 0,
  maxAttempts: 1,
})
const judge = async (which: 'request' | 'response', value: unknown) =>
  (await validate(provider, mcpTaskWait[which].ref, { kind: 'ok', value: jsonOf(value) })).kind

describe('the wait contract of a task of an MCP endpoint', () => {
  it('waits in the background, never expires, and its request names a task in a round', async () => {
    expect(mcpTaskWait).toMatchObject({ kind: 'ask', expiry: 'forbidden', background: 'waits' })
    const wait = {
      ref: { name: 'desk', holding: 'h1' },
      taskId: 't1',
      issuedAt: 3,
      round: 2,
    } as const
    const request = taskWaitRequest(wait as never)
    expect(await judge('request', REQUEST)).toBe('valid')
    expect(request).toEqual(jsonOf(REQUEST))
    expect(await judge('request', { ...REQUEST, round: 0 })).not.toBe('valid')
    expect(await judge('request', { ...REQUEST, task: '' })).not.toBe('valid')
    expect(await judge('request', { ...REQUEST, more: 'x' })).not.toBe('valid')
    const { round: _round, ...short } = REQUEST
    expect(await judge('request', short)).not.toBe('valid')
  })

  it('answers where the task got to, closed to anything else', async () => {
    for (const valid of [
      { kind: 'terminal', status: 'completed' },
      { kind: 'input' },
      { kind: 'input', inputRequests: { a: {} } },
      { kind: 'expired' },
      { kind: 'unknown' },
    ])
      expect(await judge('response', valid)).toBe('valid')
    for (const invalid of [
      { kind: 'terminal' },
      { kind: 'terminal', status: 'working' },
      { kind: 'expired', more: 1 },
      { kind: 'input', inputRequests: 'x' },
      { kind: 'arrived' },
    ])
      expect(await judge('response', invalid)).not.toBe('valid')
  })

  it.each([
    ['not JSON', 'nope'],
    ['no object', '[1]'],
    ['an empty endpoint', JSON.stringify({ ...REQUEST, endpoint: '' })],
    ['an empty holding', JSON.stringify({ ...REQUEST, holding: '' })],
    ['an empty task', JSON.stringify({ ...REQUEST, task: '' })],
    ['a holding that is no text', JSON.stringify({ ...REQUEST, holding: 1 })],
    ['a negative issue', JSON.stringify({ ...REQUEST, issuedAt: -1 })],
    ['a fractional issue', JSON.stringify({ ...REQUEST, issuedAt: 1.5 })],
    ['an issue that is no number', JSON.stringify({ ...REQUEST, issuedAt: '1' })],
    ['round zero', JSON.stringify({ ...REQUEST, round: 0 })],
  ])('a kept request with %s names no task', (_label, kept) => {
    expect(readTaskWaitRequest(kept)).toBeNull()
  })

  it('a kept request reads back with an issue of zero and round one', () => {
    expect(readTaskWaitRequest(JSON.stringify({ ...REQUEST, issuedAt: 0, round: 1 }))).toEqual({
      ref: { name: 'desk', holding: 'h1' },
      taskId: 't1',
      issuedAt: 0,
      round: 1,
    })
  })
})

describe('what the decision bridge reads and writes, strictly (C111)', () => {
  const OTHER = 'op-c1/start/other' as ToolWaitId

  it('names its registration, decision and closing by the task and its round', async () => {
    const w = world(DONE)
    const inspected = await inspect(w)
    if (!('ok' in inspected) || inspected.ok.decision === null) throw new Error('no decision')
    expect(inspected.ok.registration.record).toBe('task-wait/t1/2')
    expect(inspected.ok.decision.record).toBe('task-arrival/t1')
    expect(inspected.ok.decision.revision).toBe('1')
    const other = world({ ...DONE, arrival: { kind: 'expired' } })
    const changed = await inspect(other)
    expect('ok' in changed && changed.ok.decision?.digest).not.toBe(inspected.ok.decision.digest)
    const closed = await w.bridge.invalidate({
      ...ACCESS,
      operation: 'close-1' as ToolOperationId,
      wait: WAIT,
      terminal: evidence('terminal'),
      cause: 'cancelled',
    })
    expect(closed).toMatchObject({
      ok: { record: expect.stringMatching(/^task-wait-closed\/sha256:/u) },
    })
  })

  it('a dropped row, or one that arrived without saying where, has no decision', async () => {
    expect(
      await inspect(world({ state: 'dropped', round: 2, arrival: { kind: 'unknown' } })),
    ).toMatchObject({
      ok: { decision: null },
    })
    expect(await inspect(world({ state: 'arrived', round: 2 }))).toMatchObject({
      ok: { decision: null },
    })
  })

  it('a wait the call does not have beside its task wait, or a kept request of another wait, is refused', async () => {
    const beside = facts({
      waits: [
        { ...waitRecord('open'), intent: { ...waitRecord('open').intent, wait: OTHER } } as never,
      ],
    })
    expect(await inspect(world(FOLLOWING, beside))).toMatchObject({
      failure: {
        kind: 'invalid',
        field: 'wait',
        reason: 'the wait is not a task wait of an MCP endpoint',
      },
    })
    const elsewhere = facts({ waitRequest: { wait: OTHER, request: JSON.stringify(REQUEST) } })
    expect(await inspect(world(FOLLOWING, elsewhere))).toMatchObject({
      failure: { kind: 'invalid', field: 'request', reason: 'the wait request is not kept' },
    })
    expect(await inspect(world(FOLLOWING, facts({ waitRequest: null })))).toMatchObject({
      failure: { field: 'request' },
    })
  })

  it('ensure and resolve refuse what inspect refuses, and resolve needs the decision there now', async () => {
    const odd = facts({ waitRequest: { wait: WAIT, request: 'x' } })
    const ensured = await world(FOLLOWING, odd).bridge.ensure({
      ...ACCESS,
      operation: 'ensure-1' as ToolOperationId,
      wait: WAIT,
      request: evidence('request'),
    })
    expect(ensured).toMatchObject({ failure: { kind: 'invalid', field: 'request' } })
    const decided = await inspect(world(DONE))
    if (!('ok' in decided) || decided.ok.decision === null) throw new Error('no decision')
    const decision = decided.ok.decision
    expect(
      await world(DONE, odd).bridge.resolve({ ...ACCESS, wait: WAIT, decision }),
    ).toMatchObject({
      failure: { kind: 'invalid', field: 'request' },
    })
    expect(await world('down').bridge.resolve({ ...ACCESS, wait: WAIT, decision })).toMatchObject({
      failure: { kind: 'unavailable' },
    })
    expect(
      await world(FOLLOWING).bridge.resolve({ ...ACCESS, wait: WAIT, decision }),
    ).toMatchObject({
      failure: { kind: 'invalid', field: 'decision' },
    })
  })

  it('a closing without a watcher, or of a wait that names no task, still closes and drops nothing', async () => {
    const closing = {
      ...ACCESS,
      operation: 'close-1' as ToolOperationId,
      wait: WAIT,
      terminal: evidence('t'),
      cause: 'cancelled' as const,
    }
    const none = world('no-watch')
    expect(await none.bridge.invalidate(closing)).toMatchObject({
      ok: { owner: '@omne-harness/mcp-bridge' },
    })
    const odd = world(FOLLOWING, facts({ waitRequest: { wait: WAIT, request: 'x' } }))
    expect(await odd.bridge.invalidate(closing)).toMatchObject({ ok: {} })
    expect(odd.dropped).toEqual([])
  })

  it('an operation is recalled only from a duty of that operation, and a closing only of a wait closed by a control or a terminal', async () => {
    const duty = (action: 'ensure' | 'invalidate', operation = 'op-1'): ToolTask =>
      ({
        kind: 'wait-registration',
        operation,
        wait: WAIT,
        action,
        evidence: evidence('terminal'),
      }) as never
    const operation = 'op-1' as ToolOperationId
    const recall = (recovery: Facts) =>
      world(FOLLOWING, recovery).bridge.inspectOperation({ ...ACCESS, operation })
    expect(await recall(facts({ tasks: [duty('ensure', 'op-2')] }))).toMatchObject({
      ok: { kind: 'unknown' },
    })
    expect(await recall(facts({ tasks: [duty('ensure')], waitRequest: null }))).toMatchObject({
      ok: { kind: 'unknown' },
    })
    expect(
      await recall(facts({ tasks: [duty('invalidate')], waits: [waitRecord('continued')] })),
    ).toMatchObject({
      ok: { kind: 'unknown' },
    })
    const closed = await recall(
      facts({ tasks: [duty('invalidate')], waits: [waitRecord('cancelled')] }),
    )
    expect(closed).toMatchObject({
      ok: { kind: 'committed', receipt: { record: expect.stringMatching(/^task-wait-closed\//u) } },
    })
  })
})
