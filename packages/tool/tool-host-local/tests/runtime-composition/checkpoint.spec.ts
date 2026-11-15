import { expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import {
  encodeToolInvocationRef,
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

const CLOSED = 'Nothing was answered: the question was closed.'

function bridge(lost: boolean) {
  const registrations = new Map<string, DurableEvidence>()
  const ensured: string[] = []
  const inspected: string[] = []
  let polls = 0
  let undecided: ((input: Parameters<ToolDecisionBridge<unknown>['inspect']>[0]) => void) | null =
    null
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
    inspect: async input => {
      polls += 1
      const registration = registrations.get(`${input.wait}/ensure`)
      if (registration === undefined)
        return fail({ kind: 'invalid', field: 'wait', reason: 'not-registered' })
      const decision = decided.has(input.wait) ? decisionOf(input.wait) : null
      if (decision === null) {
        const heard = undecided
        undecided = null
        heard?.(input)
      }
      return succeed({ registration, decision })
    },
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
  const whenUndecided = (heard: NonNullable<typeof undecided>) => void (undecided = heard)
  return {
    decisions,
    ensured,
    inspected,
    resolved,
    invalidated,
    decide,
    whenUndecided,
    polls: () => polls,
  }
}

it.each([false, true])(
  'a suspended segment parks its entry and opens its wait in the whole local host (registration answer lost: %s)',
  async lost => {
    const scripted = bridge(lost)
    let segments = 0
    const world = await fixture(
      undefined,
      undefined,
      32,
      false,
      undefined,
      undefined,
      undefined,
      undefined,
      {
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
      },
    )
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
      const intent = recovery.waits[0]?.intent
      if (wait === undefined || intent?.kind !== 'ask') throw new Error('no Ask wait')
      expect(recovery.waitRequest?.wait).toBe(wait)
      expect(intent.request.digest).toBe(canonicalDigest(recovery.waitRequest?.request))
      expect(recovery.checkpointState?.payload).toEqual(recovery.checkpoint)
      expect(recovery.checkpoint?.digest).toBe(canonicalDigest(recovery.checkpointState?.state))
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
  const world = await fixture(
    undefined,
    undefined,
    32,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    {
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
    },
  )
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
    scripted.decide(wait, { kind: 'answer', value: { kind: 'string', value: 'b.txt' } })
    unbox(await world.root.toolInstanceHost.schedule({ tenant: world.tenantA, call: parts.call }))
    await expect.poll(phase, { timeout: 3_000 }).toBe('settled')
    expect(resumed).toEqual([
      { state: '{"asked":1}', response: { kind: 'answer', value: 'b.txt' } },
    ])
    expect(scripted.resolved).toEqual([wait])
    const after = unbox(await world.root.toolCommands.loadRecovery(access))
    expect(after.state).toMatchObject({ phase: 'settled', terminal: { kind: 'completed' } })
    expect(after.waits).toMatchObject([{ phase: 'closed', cause: 'continued' }])
    expect(after.invocations.map(start => start.kind)).toEqual(['start', 'resume'])
    expect(after.invocations[1]).toMatchObject({ operation: `${wait}/resume` })
    const result = await world.settled(reference)
    expect(JSON.stringify(result)).toContain('resumed')
  } finally {
    await world.close()
  }
})

const askingAuthor = (scripted: ReturnType<typeof bridge>) => ({
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
        kind: 'suspended' as const,
        closedResult: CLOSED,
        state: new TextEncoder().encode('{"asked":1}'),
        wait: {
          kind: 'ask' as const,
          key: 'k',
          contract: ask,
          request: { kind: 'string' as const, value: 'which?' },
        },
      }),
    resume: async () => succeed({ kind: 'completed' as const, value: 'resumed' }),
  },
})

async function askedCall(
  scripted: ReturnType<typeof bridge>,
  arm: (world: Awaited<ReturnType<typeof fixture>>) => void = () => undefined,
) {
  const world = await fixture(
    undefined,
    undefined,
    32,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    askingAuthor(scripted) as never,
  )
  arm(world)
  const reference = accepted(await world.api.invoke(world.invocation('asked')))
  const parts = unbox(resolveToolInvocationRef(reference, world.tenantA))
  const access = { tenant: world.tenantA, principal: 'alice', call: parts.call }
  const recovery = async () => unbox(await world.root.toolCommands.loadRecovery(access))
  const executor = () => {
    const diagnostics = world.plugins.diagnostics().executor
    if (diagnostics === null) throw new Error('the world has no executor')
    return diagnostics
  }
  return { world, parts, recovery, executor }
}

async function waitingCall(scripted: ReturnType<typeof bridge>) {
  const asked = await askedCall(scripted)
  await expect
    .poll(async () => (await asked.recovery()).waits[0]?.phase, { timeout: 3_000 })
    .toBe('open')
  const wait = (await asked.recovery()).waits[0]!.intent.wait
  return { ...asked, wait }
}

it('a call that waits for a person leaves the executor: no slot of its table, and no run at the retry interval', async () => {
  const scripted = bridge(false)
  const { world, recovery, executor } = await waitingCall(scripted)
  try {
    await expect.poll(() => executor().knownCalls, { timeout: 3_000 }).toBe(0)
    expect(executor().dormantExits).toBeGreaterThanOrEqual(1)
    const asked = scripted.polls()
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(scripted.polls()).toBe(asked)
    expect((await recovery()).state.phase).toBe('suspended')
  } finally {
    await world.close()
  }
})

it('a contact takes a call that waits for a person back: holding, and the run it queued lets the call go again', async () => {
  const scripted = bridge(false)
  const { world, parts, recovery, executor } = await waitingCall(scripted)
  try {
    await expect.poll(() => executor().knownCalls, { timeout: 3_000 }).toBe(0)
    const exits = executor().dormantExits
    const reference = unbox(encodeToolInvocationRef({ ...parts, tenant: world.tenantA }))
    expect(unbox(await world.api.queries.contact(world.query(reference)))).toEqual({
      kind: 'holding',
    })
    await expect.poll(() => executor().dormantExits, { timeout: 3_000 }).toBe(exits + 1)
    expect(executor().knownCalls).toBe(0)
    expect((await recovery()).state.phase).toBe('suspended')
  } finally {
    await world.close()
  }
})

it('the hint of a decision brings the dormant call back, and it resumes once', async () => {
  const scripted = bridge(false)
  const { world, parts, recovery, wait, executor } = await waitingCall(scripted)
  try {
    await expect.poll(() => executor().knownCalls, { timeout: 3_000 }).toBe(0)
    scripted.decide(wait, { kind: 'answer', value: { kind: 'string', value: 'b.txt' } })
    unbox(await world.root.toolInstanceHost.schedule({ tenant: world.tenantA, call: parts.call }))
    await expect
      .poll(async () => (await recovery()).state.phase, { timeout: 3_000 })
      .toBe('settled')
    expect(executor().reentries).toBe(1)
    expect(executor().unownedRuns).toBe(0)
    expect(scripted.resolved).toEqual([wait])
  } finally {
    await world.close()
  }
})

it('a decision that comes while the idle run ends is taken by the run its hint queued', async () => {
  const scripted = bridge(false)
  const { world, recovery, executor } = await askedCall(scripted, armed => {
    scripted.whenUndecided(input => {
      scripted.decide(input.wait, { kind: 'answer', value: { kind: 'string', value: 'b.txt' } })
      void armed.root.toolInstanceHost.schedule({ tenant: input.tenant, call: input.call })
    })
  })
  try {
    await expect
      .poll(async () => (await recovery()).state.phase, { timeout: 3_000 })
      .toBe('settled')
    expect(executor().dormantExits).toBe(1)
    expect(executor().reentries).toBe(1)
    expect(scripted.resolved).toHaveLength(1)
  } finally {
    await world.close()
  }
})

it('a decision whose hint was lost is found by the recovery scan, which runs again at a long period', async () => {
  const scripted = bridge(false)
  const { world, recovery, wait, executor } = await waitingCall(scripted)
  try {
    await expect.poll(() => executor().knownCalls, { timeout: 3_000 }).toBe(0)
    scripted.decide(wait, { kind: 'answer', value: { kind: 'string', value: 'b.txt' } })
    await expect
      .poll(async () => (await recovery()).state.phase, { timeout: 5_000 })
      .toBe('settled')
    expect(scripted.resolved).toEqual([wait])
    expect(executor().recoveredCalls).toBeGreaterThanOrEqual(1)
  } finally {
    await world.close()
  }
})

it('a run for a call the ledger owes nothing is not taken into the table', async () => {
  const scripted = bridge(false)
  const { world, parts, recovery, wait, executor } = await waitingCall(scripted)
  try {
    scripted.decide(wait, { kind: 'answer', value: { kind: 'string', value: 'b.txt' } })
    unbox(await world.root.toolInstanceHost.schedule({ tenant: world.tenantA, call: parts.call }))
    await expect
      .poll(async () => (await recovery()).state.phase, { timeout: 3_000 })
      .toBe('settled')
    await expect.poll(() => executor().knownCalls, { timeout: 3_000 }).toBe(0)
    const before = executor().unownedRuns
    unbox(await world.root.toolInstanceHost.schedule({ tenant: world.tenantA, call: parts.call }))
    await expect.poll(() => executor().unownedRuns).toBe(before + 1)
    expect(executor().knownCalls).toBe(0)
  } finally {
    await world.close()
  }
})

it('takes over a suspended call in a second executor by its recovery scan, accepts a decision that came while no executor ran, and resumes from the kept checkpoint, once', async () => {
  const scripted = bridge(false)
  const resumed: Readonly<{ state: string; response: ToolDecision<unknown> }>[] = []
  const world = await fixture(
    undefined,
    undefined,
    32,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    {
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
    },
  )
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
    await world.plugins.close()
    scripted.decide(wait, { kind: 'answer', value: { kind: 'string', value: 'b.txt' } })
    reopened = await world.newExecutor()
    const next = reopened
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
  const world = await fixture(
    undefined,
    undefined,
    32,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    {
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
    },
  )
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
  } finally {
    await world.close()
  }
})
