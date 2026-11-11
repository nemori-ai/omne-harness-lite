// A checkpointed author through the whole local host: the runtime plugins, the start coordinator,
// the local binding with its custody and the real ledger and driver. The decision owner is a
// scripted double; the store is the in-memory one declared durable, so this proves the assembly,
// not durability. A decision then resumes the call from its checkpoint once, and the call ends.
import { expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  resolveToolInvocationRef,
  type DecisionValue,
  type DurableEvidence,
  type ToolDecision,
} from '@omne-harness/tool-contract'
import {
  defineToolWaitContract,
  type ToolDecisionBridge,
  type ToolValueSchema,
} from '@omne-harness/tool-contract/provider'
import { waitRequestOperation } from '@omne-harness/tool-host-local'
import { adoption, request } from '../coordinator-values.ts'
import { accepted, fixture, unbox } from './fixture.ts'

function schema(id: string): ToolValueSchema<unknown> {
  return {
    identity: { id, revision: '1', digest: `sha256:${id}` },
    ref: { id: id as never, load: () => Promise.reject(new Error('no schema is loaded')) },
    maxBytes: 1_024,
  }
}

const ask = unbox(
  defineToolWaitContract({
    kind: 'ask',
    adoption: adoption('ask-protocol'),
    request: schema('ask-request'),
    response: schema('ask-response'),
    expiry: 'forbidden',
  }),
)

/** The result the authors of these tests wrote for a wait that a control closes. */
const CLOSED = 'Nothing was answered: the question was closed.'

function bridge(lost: boolean) {
  const registrations = new Map<string, DurableEvidence>()
  const ensured: string[] = []
  const inspected: string[] = []
  const resolved: string[] = []
  const invalidated: string[] = []
  const decided = new Map<string, DecisionValue>()
  const decisionOf = (wait: string): DurableEvidence => ({
    owner: 'scripted-decisions',
    record: `decision/${wait}`,
    revision: '1',
    digest: `sha256:decision/${wait}`,
  })
  const decisions: ToolDecisionBridge<unknown> = {
    ensure: async input => {
      ensured.push(input.operation)
      const registration = {
        owner: 'scripted-decisions',
        record: `registration/${input.wait}`,
        revision: '1',
        digest: `sha256:${input.wait}`,
      }
      registrations.set(input.operation, registration)
      return lost
        ? fail({ kind: 'commit-unknown', operation: input.operation })
        : succeed(registration)
    },
    inspectOperation: async input => {
      inspected.push(input.operation)
      const receipt = registrations.get(input.operation)
      return succeed(
        receipt === undefined
          ? { kind: 'unknown', operation: input.operation, diagnostic: 'not seen' }
          : { kind: 'committed', operation: input.operation, receipt },
      )
    },
    // A registered wait reports no decision until the person decides it.
    inspect: async input => {
      const registration = registrations.get(`${input.wait}/ensure`)
      if (registration === undefined)
        return fail({ kind: 'invalid', field: 'wait', reason: 'not-registered' })
      return succeed({
        registration,
        decision: decided.has(input.wait) ? decisionOf(input.wait) : null,
      })
    },
    // 失效按操作记下，回执由等待派生。
    invalidate: async input => {
      invalidated.push(input.operation)
      return succeed({
        owner: 'scripted-decisions',
        record: `invalidated/${input.wait}`,
        revision: '1',
        digest: `sha256:invalidated/${input.wait}`,
      })
    },
    resolve: async input => {
      resolved.push(input.wait)
      const value = decided.get(input.wait)
      return value === undefined || input.decision.record !== `decision/${input.wait}`
        ? fail({ kind: 'invalid', field: 'decision', reason: 'not-the-decision' })
        : succeed(value)
    },
  }
  const decide = (wait: string, value: DecisionValue) => void decided.set(wait, value)
  return { decisions, ensured, inspected, resolved, invalidated, decide }
}

it.each([false, true])(
  'a suspended segment parks its entry and opens its wait in the whole local host (registration answer lost: %s)',
  async lost => {
    const scripted = bridge(lost)
    let segments = 0
    const world = await fixture(undefined, undefined, 32, false, undefined, undefined, {
      waits: [ask],
      decisions: scripted.decisions,
      executor: {
        checkpoint: {
          schema: { id: 'state', revision: '1', digest: 'sha256:state' },
          codec: adoption('state-codec'),
          maxBytes: 64,
        },
        initial: async () => {
          segments += 1
          return succeed({
            kind: 'suspended',
            closedResult: CLOSED,
            state: new TextEncoder().encode('{"asked":1}'),
            wait: {
              kind: 'ask',
              key: 'k',
              contract: ask,
              request: { kind: 'string', value: 'which?' },
            },
          })
        },
        resume: async () => fail({ kind: 'unsupported', reason: 'not here' }),
      },
    })
    try {
      const reference = accepted(await world.api.invoke(world.invocation('asked')))
      const query = world.query(reference)
      await expect
        .poll(
          async () => {
            const found = unbox(await world.api.queries.lookup(query))
            return found.kind === 'found' ? [found.state.phase, found.state.wait.kind] : found.kind
          },
          { timeout: 3_000 },
        )
        .toEqual(['suspended', 'ask'])
      const parts = unbox(resolveToolInvocationRef(reference, world.tenantA))
      const recovery = unbox(
        await world.root.toolCommands.loadRecovery({
          tenant: world.tenantA,
          principal: 'alice',
          call: parts.call,
        }),
      )
      const wait = recovery.waits[0]?.intent.wait
      expect(recovery.waits).toMatchObject([{ phase: 'open' }])
      expect(recovery.state).toMatchObject({ execution: { kind: 'suspended' } })
      expect(segments).toBe(1)
      expect(scripted.ensured).toEqual([`${wait}/ensure`])
      expect(scripted.inspected).toEqual(lost ? [`${wait}/ensure`] : [])
      // The request of the wait is kept under the operation that the wait identity derives, and
      // that keeping is the request evidence of the wait: the decision owner finds it from the wait.
      const intent = recovery.waits[0]?.intent
      if (wait === undefined || intent?.kind !== 'ask') throw new Error('no Ask wait')
      const kept = unbox(
        await world.custody.inspect({
          principal: 'alice',
          tenant: world.tenantA,
          call: parts.call,
          operation: unbox(waitRequestOperation(wait)),
        }),
      )
      expect(kept).toMatchObject({ kind: 'retained', raw: { custody: intent.request } })
      // The checkpoint is kept in the host's custody before the wait is published.
      expect(recovery.state.phase === 'suspended' && recovery.state.checkpoint.owner).toBeTruthy()
      const { scope } = request()
      const queue = await world.store.read({
        kind: 'queue',
        tenant: world.tenantA,
        key: JSON.stringify([scope.owner, scope.key]),
      })
      if (queue.kind !== 'complete') throw new Error('the queue domain is unreadable')
      expect(
        queue.records.flatMap(record =>
          record.kind === 'queue-entry' ? [record.entry.stage] : [],
        ),
      ).toEqual(['parked'])
    } finally {
      await world.close()
    }
  },
)

it('resumes the call from its checkpoint once after the decision, and ends it with the resume segment', async () => {
  const scripted = bridge(false)
  const resumed: Readonly<{ state: string; response: ToolDecision<unknown> }>[] = []
  const world = await fixture(undefined, undefined, 32, false, undefined, undefined, {
    waits: [ask],
    decisions: scripted.decisions,
    executor: {
      checkpoint: {
        schema: { id: 'state', revision: '1', digest: 'sha256:state' },
        codec: adoption('state-codec'),
        maxBytes: 64,
      },
      initial: async () =>
        succeed({
          kind: 'suspended',
          closedResult: CLOSED,
          state: new TextEncoder().encode('{"asked":1}'),
          wait: {
            kind: 'ask',
            key: 'k',
            contract: ask,
            request: { kind: 'string', value: 'which?' },
          },
        }),
      resume: async input => {
        resumed.push({
          state: new TextDecoder().decode(input.checkpoint),
          response: input.response,
        })
        return succeed({ kind: 'completed', value: 'resumed' })
      },
    },
  })
  try {
    const reference = accepted(await world.api.invoke(world.invocation('asked')))
    const query = world.query(reference)
    const phase = async () => {
      const found = unbox(await world.api.queries.lookup(query))
      return found.kind === 'found' ? found.state.phase : found.kind
    }
    await expect.poll(phase, { timeout: 3_000 }).toBe('suspended')
    const parts = unbox(resolveToolInvocationRef(reference, world.tenantA))
    const access = { tenant: world.tenantA, principal: 'alice', call: parts.call }
    const before = unbox(await world.root.toolCommands.loadRecovery(access))
    const wait = before.waits[0]?.intent.wait
    if (wait === undefined) throw new Error('no wait')
    await expect
      .poll(async () => unbox(await world.root.toolCommands.loadRecovery(access)).waits[0]?.phase)
      .toBe('open')
    // The person decides, and the decision owner's wake-up schedules the call.
    scripted.decide(wait, { kind: 'answer', value: { kind: 'string', value: 'b.txt' } })
    unbox(await world.root.toolInstanceHost.schedule({ tenant: world.tenantA, call: parts.call }))
    await expect.poll(phase, { timeout: 3_000 }).toBe('settled')
    // 作者收到的答复值是普通 JSON：json-text 树在交给作者之前解码（tool-contract SPEC「恢复型执行者按段执行」）。
    expect(resumed).toEqual([
      { state: '{"asked":1}', response: { kind: 'answer', value: 'b.txt' } },
    ])
    expect(scripted.resolved).toEqual([wait])
    const after = unbox(await world.root.toolCommands.loadRecovery(access))
    expect(after.state).toMatchObject({ phase: 'settled', terminal: { kind: 'completed' } })
    expect(after.waits).toMatchObject([{ phase: 'closed', cause: 'continued' }])
    expect(after.invocations.map(start => start.kind)).toEqual(['start', 'resume'])
    // The resume went through the local start coordinator: a permit of its own was accepted.
    expect(after.invocations[1]).toMatchObject({ operation: `${wait}/resume` })
    const result = await world.settled(reference)
    expect(JSON.stringify(result)).toContain('resumed')
  } finally {
    await world.close()
  }
})

it('takes over a suspended call in a second executor by its recovery scan, accepts a decision that came while no executor ran, and resumes from the kept checkpoint, once', async () => {
  const scripted = bridge(false)
  const resumed: Readonly<{ state: string; response: ToolDecision<unknown> }>[] = []
  const world = await fixture(undefined, undefined, 32, false, undefined, undefined, {
    waits: [ask],
    decisions: scripted.decisions,
    executor: {
      checkpoint: {
        schema: { id: 'state', revision: '1', digest: 'sha256:state' },
        codec: adoption('state-codec'),
        maxBytes: 64,
      },
      initial: async () =>
        succeed({
          kind: 'suspended',
          closedResult: CLOSED,
          state: new TextEncoder().encode('{"asked":1}'),
          wait: {
            kind: 'ask',
            key: 'k',
            contract: ask,
            request: { kind: 'string', value: 'which?' },
          },
        }),
      resume: async input => {
        resumed.push({
          state: new TextDecoder().decode(input.checkpoint),
          response: input.response,
        })
        return succeed({ kind: 'completed', value: 'resumed' })
      },
    },
  })
  let reopened: Awaited<ReturnType<typeof world.newExecutor>> | null = null
  try {
    const reference = accepted(await world.api.invoke(world.invocation('asked')))
    const parts = unbox(resolveToolInvocationRef(reference, world.tenantA))
    const access = { tenant: world.tenantA, principal: 'alice', call: parts.call }
    await expect
      .poll(async () => unbox(await world.root.toolCommands.loadRecovery(access)).waits[0]?.phase, {
        timeout: 3_000,
      })
      .toBe('open')
    const wait = unbox(await world.root.toolCommands.loadRecovery(access)).waits[0]?.intent.wait
    if (wait === undefined) throw new Error('no wait')
    // The first executor stops while the wait is open; the person answers afterwards, and no
    // wake-up reaches any executor.
    await world.plugins.close()
    scripted.decide(wait, { kind: 'answer', value: { kind: 'string', value: 'b.txt' } })
    reopened = await world.newExecutor()
    const next = reopened
    // Nothing names the call to the second executor: its startup scan finds the suspended call,
    // and the driver reads the decision, accepts it, prepares the resume segment's environment and
    // resumes from the state that custody kept, not from the first executor's memory.
    await expect
      .poll(
        async () =>
          unbox(await world.root.toolCommands.loadRecovery(access)).invocations.map(
            start => start.operation,
          ),
        { timeout: 3_000 },
      )
      .toEqual([expect.any(String), `${wait}/resume`])
    await world.settled(reference)
    expect(resumed).toEqual([
      { state: '{"asked":1}', response: { kind: 'answer', value: 'b.txt' } },
    ])
    const after = unbox(await world.root.toolCommands.loadRecovery(access))
    expect(after.state).toMatchObject({ phase: 'settled', terminal: { kind: 'completed' } })
    expect(after.waits).toMatchObject([{ phase: 'closed', cause: 'continued' }])
    expect(after.invocations[1]?.execution.instance).not.toBe(
      after.invocations[0]?.execution.instance,
    )
    expect(scripted.resolved).toEqual([wait])
    expect(next.plugins.diagnostics().executor).toMatchObject({
      recoveryScan: 'done',
      recoveredCalls: 1,
      foreignExecutionRuns: 0,
      unownedRuns: 0,
    })
  } finally {
    await reopened?.close()
    await world.close()
  }
})

it('stops the call suspended on its wait in the whole local host: it settles, the registration is invalidated once and the queue holds no entry', async () => {
  const scripted = bridge(false)
  const world = await fixture(undefined, undefined, 32, false, undefined, undefined, {
    waits: [ask],
    decisions: scripted.decisions,
    executor: {
      checkpoint: {
        schema: { id: 'state', revision: '1', digest: 'sha256:state' },
        codec: adoption('state-codec'),
        maxBytes: 64,
      },
      initial: async () =>
        succeed({
          kind: 'suspended',
          closedResult: CLOSED,
          state: new TextEncoder().encode('{"asked":1}'),
          wait: {
            kind: 'ask',
            key: 'k',
            contract: ask,
            request: { kind: 'string', value: 'which?' },
          },
        }),
      resume: async () => fail({ kind: 'unsupported', reason: 'not here' }),
    },
  })
  try {
    const reference = accepted(await world.api.invoke(world.invocation('asked')))
    const parts = unbox(resolveToolInvocationRef(reference, world.tenantA))
    const access = { tenant: world.tenantA, principal: 'alice', call: parts.call }
    await expect
      .poll(async () => unbox(await world.root.toolCommands.loadRecovery(access)).waits[0]?.phase, {
        timeout: 3_000,
      })
      .toBe('open')
    const wait = unbox(await world.root.toolCommands.loadRecovery(access)).waits[0]?.intent.wait
    const stopped = await world.api.commands.control({
      ...world.query(reference),
      intent: { kind: 'stop' },
    })
    expect(stopped).toMatchObject({ kind: 'committed', receipt: { state: { phase: 'settled' } } })
    // 公开 control 提交后调度原调用：失效与释放两项待办由推进协程完成。
    await expect
      .poll(
        async () =>
          unbox(await world.root.toolCommands.loadRecovery(access)).tasks.filter(
            task => task.kind === 'wait-registration' || task.kind === 'queue',
          ).length,
        { timeout: 3_000 },
      )
      .toBe(0)
    expect(scripted.invalidated).toEqual([`${wait}/invalidate`])
    const after = unbox(await world.root.toolCommands.loadRecovery(access))
    expect(after.state).toMatchObject({
      phase: 'settled',
      terminal: { kind: 'interrupted', cause: { kind: 'control', withdrawn: false } },
    })
    expect(after.waits).toMatchObject([{ phase: 'closed', cause: 'cancelled' }])
    // What the caller reads: the text the author wrote for a closed wait, not an answer of a person.
    const result = await world.settled(reference)
    expect(result.terminal).toMatchObject({ kind: 'interrupted' })
    expect(result.value.content).toMatchObject([{ kind: 'text', text: CLOSED }])
    const { scope } = request()
    const queue = await world.store.read({
      kind: 'queue',
      tenant: world.tenantA,
      key: JSON.stringify([scope.owner, scope.key]),
    })
    if (queue.kind !== 'complete') throw new Error('the queue domain is unreadable')
    expect(queue.records.filter(record => record.kind === 'queue-entry')).toEqual([])
    expect(
      queue.records.flatMap(record =>
        record.kind === 'queue-release' ? [record.release.call] : [],
      ),
    ).toEqual([parts.call])
  } finally {
    await world.close()
  }
})
