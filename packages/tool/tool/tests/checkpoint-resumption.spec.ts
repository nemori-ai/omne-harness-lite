// A checkpointed call whose Ask wait took a decision resumes from its checkpoint once and ends
// through the real runtime, ledger and driver (P02, P06, P07; SuspendedSlots `Answer`, `Requeue`,
// `Hold`, `Resume`): the driver learns the decision from the decision owner, the call domain
// accepts it with its ResponseRecord, the queue domain gives the slot back, the resume segment runs
// with the committed checkpoint and the decision, and the wait closes at its `continued` fact.
import { afterEach, describe, expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import type { DriverStop } from '@omne-harness/tool'
import type { ToolWaitId } from '@omne-harness/tool-contract'
import type { DecisionValue } from '@omne-harness/tool-contract'
import {
  asking,
  askingAuthor,
  checkpointBinding,
  scriptedBridge,
  type ResumeInput,
  type Segment,
} from './checkpoint-values.ts'
import { snapshotOfCall } from './resumption-decider-values.ts'
import { callId, evidence, ok, operationId, principalA, tenantA } from './runtime-values.ts'
import {
  admitCall,
  auditQueues,
  startHarness,
  testAuthority,
  type StartOptions,
} from './start-values.ts'

afterEach(auditQueues)

function text(value: string) {
  return { kind: 'string', value } as const
}

/** The first wait of `c1`: its start is `op-c1/start`, and a start names the wait of its segment. */
const FIRST = 'op-c1/start/wait' as ToolWaitId
const ACCESS = { principal: principalA, tenant: tenantA, call: callId('c1') }

function setup(
  options: StartOptions & {
    resume?: (input: ResumeInput, count: number) => Promise<Segment>
  } = {},
) {
  const authority = testAuthority()
  const author = askingAuthor(undefined, options.resume)
  const checkpoint = checkpointBinding(authority, author)
  const bridge = scriptedBridge('registers')
  const harness = startHarness({
    authority,
    bindingsPort: () => checkpoint.bindings,
    decisions: bridge,
    driverRetryDelayMs: 5,
    environmentsPort: releasing,
    ...options,
  })
  return { harness, checkpoint, bridge, authority, author }
}

/** The environment provider of the start path, which also releases a call's environment. */
function releasing(base: Parameters<NonNullable<StartOptions['environmentsPort']>>[0]) {
  const released = { kind: 'released', evidence: evidence('environment-released') } as const
  return Object.assign(base, {
    release: () => Promise.resolve(succeed(released)),
    inspectRelease: () => Promise.resolve(succeed(released)),
  })
}

type Built = ReturnType<typeof setup>

/** Runs what the drives scheduled, until nothing is scheduled for a few rounds. */
async function settle(harness: Built['harness']): Promise<void> {
  for (let quiet = 0, round = 0; quiet < 3 && round < 200; round += 1) {
    await new Promise(resolve => setTimeout(resolve, 2))
    quiet = (await harness.host.runScheduled()) === 0 ? quiet + 1 : 0
  }
}

async function recovery(harness: Built['harness']) {
  return ok(await harness.commands.loadRecovery(ACCESS))
}

/** `c1` admitted, run to its first wait, the wait registered and its entry parked. */
async function suspended(options: Parameters<typeof setup>[0] = {}) {
  const built = setup(options)
  await admitCall(built.harness, 'c1')
  await built.harness.drive('c1')
  await settle(built.harness)
  expect((await built.harness.state('c1')).phase).toBe('suspended')
  return built
}

/** The person decides `wait`, and the decision owner's wake-up runs the call. */
async function answer(built: Built, value: DecisionValue, wait: string = FIRST): Promise<void> {
  built.bridge.decide(wait, value)
  await built.harness.drive('c1')
  await settle(built.harness)
}

describe('a decision of a suspended checkpointed call', () => {
  it('is accepted once, the checkpoint resumes once, and the call ends with the resume segment', async () => {
    const built = await suspended()
    const { harness, checkpoint, bridge, author, authority } = built
    // The wait is open and no decision was made: the call stays suspended and parked.
    await harness.drive('c1')
    await settle(harness)
    expect(bridge.resolved).toEqual([])
    expect(await harness.queue()).toEqual([{ call: 'c1', ordinal: '1', stage: 'parked' }])

    await answer(built, { kind: 'answer', value: text('a.txt') })

    const state = await harness.state('c1')
    expect(state).toMatchObject({ phase: 'settled', terminal: { kind: 'completed' } })
    // The resume segment ran once, with the state the initial segment kept and the decision.
    expect(author.resumed).toEqual([
      { state: '{"asked":"which file?"}', response: { kind: 'answer', value: text('a.txt') } },
    ])
    expect(checkpoint.segments).toEqual(['op-c1/start', `${FIRST}/resume`])
    expect(bridge.resolved).toEqual([FIRST])
    // The resume took a slot through the start authority, as the first start did.
    expect(authority.consumed).toEqual(['c1', 'c1'])
    const read = await recovery(harness)
    expect(read.invocations).toMatchObject([
      { kind: 'start', operation: 'op-c1/start' },
      {
        kind: 'resume',
        operation: `${FIRST}/resume`,
        checkpoint: { record: 'checkpoint/op-c1/start' },
      },
    ])
    expect(read.waits).toMatchObject([
      { phase: 'closed', cause: 'continued', intent: { wait: FIRST } },
    ])
    // The slot was freed by the resume segment's real end.
    expect(await harness.queue()).toEqual([])
    expect(await harness.released('c1')).toBe(true)
    // A later wake-up finds nothing to do: the checkpoint is not resumed again.
    await harness.drive('c1')
    await settle(harness)
    expect(author.resumed).toHaveLength(1)
    expect(bridge.resolved).toEqual([FIRST])
  })

  it.each<DecisionValue>([
    {
      kind: 'answer',
      value: {
        kind: 'object',
        entries: [
          { key: 'choice', value: text('b') },
          { key: 'note', value: text('the second') },
        ],
      },
    },
    { kind: 'no-answer' },
    { kind: 'declined' },
  ])('gives the resume segment the decision as the owner resolved it: %j', async decision => {
    const built = await suspended()
    await answer(built, decision)
    expect(built.author.resumed.map(input => input.response)).toEqual([decision])
    expect((await built.harness.state('c1')).phase).toBe('settled')
    const read = await recovery(built.harness)
    expect(read.waits).toMatchObject([{ phase: 'closed', cause: 'continued' }])
  })

  it('opens the second wait of the resume segment under a new wait identity and resumes it in turn', async () => {
    const built = await suspended({
      resume: (_input, count) =>
        Promise.resolve(
          count === 1
            ? asking('{"asked":"which line?"}', 'which line?')
            : succeed({ kind: 'completed', value: 'done' }),
        ),
    })
    const { harness, bridge, author } = built
    await answer(built, { kind: 'answer', value: text('a.txt') })
    const second = `${FIRST}/resume/wait`
    // The resume segment suspended again: a new wait, registered under its own operation.
    expect((await harness.state('c1')).phase).toBe('suspended')
    expect(bridge.ensured.map(entry => entry.operation)).toEqual([
      `${FIRST}/ensure`,
      `${second}/ensure`,
    ])
    expect(bridge.ensured.map(entry => entry.wait)).toEqual([FIRST, second])
    const between = await recovery(harness)
    expect(between.waits).toMatchObject([
      { phase: 'closed', cause: 'continued', intent: { wait: FIRST } },
      { phase: 'open', intent: { wait: second } },
    ])
    // The second wait frees the slot again; the requeue gave it ordinal 2.
    expect(await harness.queue()).toEqual([{ call: 'c1', ordinal: '2', stage: 'parked' }])

    await answer(built, { kind: 'declined' }, second)
    expect((await harness.state('c1')).phase).toBe('settled')
    expect(author.resumed).toEqual([
      { state: '{"asked":"which file?"}', response: { kind: 'answer', value: text('a.txt') } },
      { state: '{"asked":"which line?"}', response: { kind: 'declined' } },
    ])
    expect(bridge.resolved).toEqual([FIRST, second])
    expect((await recovery(harness)).invocations.map(start => start.operation)).toEqual([
      'op-c1/start',
      `${FIRST}/resume`,
      `${second}/resume`,
    ])
  })
})

describe('the definition domain of acceptDecision (P06)', () => {
  it('does not take a decision that comes after the cancellation of the call', async () => {
    const built = await suspended()
    const { harness, bridge } = built
    bridge.decide(FIRST, { kind: 'answer', value: text('late') })
    await cancel(harness.commands)
    const commits = harness.memory.commits
    const accepted = await harness.commands.acceptDecision({
      ...ACCESS,
      operation: operationId(`${FIRST}/accept`),
      wait: FIRST,
      decision: evidence(`decision/${FIRST}`, 'test-decisions'),
    })
    expect(accepted).toEqual({
      failure: { kind: 'invalid', field: 'call', reason: 'phase:settled' },
    })
    // Nothing was written, and the decision was not consumed from its owner.
    expect(harness.memory.commits).toBe(commits)
    expect(bridge.resolved).toEqual([])
    expect((await recovery(harness)).waits).toMatchObject([{ phase: 'closed', cause: 'cancelled' }])
  })

  it('refuses the decision when the cancellation commits while the owner resolves it', async () => {
    const bridge = scriptedBridge('registers')
    const ledger: { commands: Built['harness']['commands'] | null } = { commands: null }
    const built = await suspended({
      decisions: {
        ...bridge,
        resolve: async input => {
          const resolved = await bridge.resolve(input)
          if (ledger.commands === null) throw new Error('the harness is not built')
          await cancel(ledger.commands)
          return resolved
        },
      },
    })
    ledger.commands = built.harness.commands
    bridge.decide(FIRST, { kind: 'answer', value: text('late') })
    const accepted = await built.harness.commands.acceptDecision({
      ...ACCESS,
      operation: operationId(`${FIRST}/accept`),
      wait: FIRST,
      decision: evidence(`decision/${FIRST}`, 'test-decisions'),
    })
    expect(accepted).toMatchObject({ failure: { kind: 'invalid', reason: 'phase:settled' } })
    const read = await recovery(built.harness)
    expect(read.waits).toMatchObject([{ phase: 'closed', cause: 'cancelled' }])
    // 只有叫停写下的释放待办，接受没有写 queue 待办。
    expect(read.tasks.filter(task => task.kind === 'queue').map(task => task.operation)).toEqual([
      'stop-c1',
    ])
  })

  it('answers a resend of the same acceptance with its receipt, and refuses a second acceptance of the wait', async () => {
    const built = await suspended()
    const { harness, bridge } = built
    bridge.decide(FIRST, { kind: 'no-answer' })
    const input = {
      ...ACCESS,
      operation: operationId(`${FIRST}/accept`),
      wait: FIRST,
      decision: evidence(`decision/${FIRST}`, 'test-decisions'),
    }
    const first = ok(await harness.commands.acceptDecision(input))
    expect(first).toMatchObject({ kind: 'ask', wait: FIRST, decision: input.decision })
    expect(ok(await harness.commands.acceptDecision(input))).toEqual(first)
    // The resend recalled the commit: the owner resolved the decision once.
    expect(bridge.resolved).toEqual([FIRST])
    const other = await harness.commands.acceptDecision({
      ...input,
      operation: operationId(`${FIRST}/accept-again`),
    })
    expect(other).toEqual({
      failure: { kind: 'invalid', field: 'wait', reason: 'phase:responding' },
    })
    const read = await recovery(harness)
    expect(read.waits).toMatchObject([
      {
        phase: 'responding',
        response: {
          operation: `${FIRST}/accept`,
          start: { operation: 'op-c1/start' },
          response: { kind: 'decision', value: { kind: 'no-answer' }, source: input.decision },
        },
      },
    ])
  })
})

describe('the queue entry of a call whose decision was accepted', () => {
  it('sends an entry that parked after the decision was accepted back to ready, then holds it', async () => {
    const stages: string[] = []
    const hook: { beforePark: (() => Promise<void>) | null } = { beforePark: null }
    const built = setup({
      store: memory => ({
        durability: memory.durability,
        scanPending: input => memory.scanPending(input),
        readRecord: memory.readRecord,
        due: memory.due,
        read: domain => memory.read(domain),
        commit: async input => {
          for (const write of input.writes)
            if (write.kind === 'put' && write.record.kind === 'queue-entry') {
              const { stage } = write.record.entry
              // The park read the call domain before the acceptance; the acceptance lands
              // between that read and this queue commit.
              if (stage === 'parked' && hook.beforePark !== null) {
                const before = hook.beforePark
                hook.beforePark = null
                await before()
              }
              stages.push(stage)
            }
          return memory.commit(input)
        },
      }),
    })
    const { harness, bridge, author } = built
    let accepted: unknown = null
    hook.beforePark = async () => {
      bridge.decide(FIRST, { kind: 'answer', value: text('a.txt') })
      accepted = await harness.commands.acceptDecision({
        ...ACCESS,
        operation: operationId(`${FIRST}/accept`),
        wait: FIRST,
        decision: evidence(`decision/${FIRST}`, 'test-decisions'),
      })
    }
    await admitCall(harness, 'c1')
    await harness.drive('c1')
    await settle(harness)
    expect(accepted).toMatchObject({ ok: { kind: 'ask', wait: FIRST } })
    // The entry parked although the decision was accepted; the resume requeued it at a new
    // ordinal and held it again, and the call ended.
    expect(stages).toEqual(['preparing', 'ready', 'held', 'parked', 'ready', 'held'])
    expect(author.resumed).toHaveLength(1)
    expect((await harness.state('c1')).phase).toBe('settled')
    expect(await harness.queue()).toEqual([])
  })

  it('resumes an accepted call on the free slot: a parked later call does not stand in its way', async () => {
    const built = await suspended()
    const { harness } = built
    // c2 takes the one slot of the tool while c1 is parked, and suspends in turn.
    await admitCall(harness, 'c2')
    await harness.drive('c2')
    await settle(harness)
    expect(await harness.queue()).toEqual([
      { call: 'c1', ordinal: '1', stage: 'parked' },
      { call: 'c2', ordinal: '2', stage: 'parked' },
    ])
    await answer(built, { kind: 'answer', value: text('a.txt') })
    expect((await harness.state('c1')).phase).toBe('settled')
    // c1 requeued at ordinal 3 and held the free slot; c2 still waits for its person.
    expect(await harness.queue()).toEqual([{ call: 'c2', ordinal: '2', stage: 'parked' }])
  })
})

/** A second runtime over the same records, after the first one stopped. */
function restarted(built: Built, environmentsPort: StartOptions['environmentsPort'] = releasing) {
  const second = startHarness({
    memory: built.harness.memory,
    authority: built.authority,
    bindingsPort: () => built.checkpoint.bindings,
    decisions: built.bridge,
    driverRetryDelayMs: 5,
    environmentsPort,
  })
  return second
}

/**
 * A provider that holds no environment for the preparations in `gone`: they were made by a process
 * that is gone, so both its answers for them are `lost`. Every other preparation is the base's.
 */
function losing(gone: readonly string[]) {
  return (base: Parameters<NonNullable<StartOptions['environmentsPort']>>[0]) => {
    const { prepare, inspectPreparation } = base
    const lost = () =>
      Promise.resolve(
        succeed({
          kind: 'lost' as const,
          evidence: evidence('environment-lost'),
          diagnostic: 'the process that held it is gone',
        }),
      )
    return Object.assign(releasing(base), {
      prepare: (input: Parameters<typeof prepare>[0]) =>
        gone.includes(input.preparation.operation) ? lost() : prepare(input),
      inspectPreparation: (input: Parameters<typeof inspectPreparation>[0]) =>
        gone.includes(input.preparation.operation) ? lost() : inspectPreparation(input),
    })
  }
}

describe('a resume segment whose environment is lost', () => {
  it('is planned again under the next resume preparation and resumes once', async () => {
    const built = await suspended({ environmentsPort: losing([`${FIRST}/resume/prepare`]) })
    await answer(built, { kind: 'answer', value: text('a.txt') })
    expect(built.author.resumed).toHaveLength(1)
    const after = await recovery(built.harness)
    expect(after.state.phase).toBe('settled')
    expect(after.preparations.map(item => [item.operation, item.purpose])).toEqual([
      ['op-c1/plan', 'initial'],
      [`${FIRST}/resume/prepare`, 'resume'],
      [`${FIRST}/resume/prepare/2`, 'resume'],
    ])
  })

  it('names the preparations of a later wait after that wait, and counts only its own lost ones', async () => {
    const second = `${FIRST}/resume/wait`
    const built = await suspended({
      environmentsPort: losing([`${second}/resume/prepare`, `${second}/resume/prepare/2`]),
      resume: (_input, count) =>
        Promise.resolve(
          count === 1
            ? asking('{"asked":"which line?"}', 'which line?')
            : succeed({ kind: 'completed', value: 'done' }),
        ),
    })
    await answer(built, { kind: 'answer', value: text('a.txt') })
    await answer(built, { kind: 'declined' }, second)
    expect(built.author.resumed).toHaveLength(2)
    const after = await recovery(built.harness)
    expect(after.state.phase).toBe('settled')
    expect(after.preparations.map(item => item.operation)).toEqual([
      'op-c1/plan',
      `${FIRST}/resume/prepare`,
      `${second}/resume/prepare`,
      `${second}/resume/prepare/2`,
      `${second}/resume/prepare/3`,
    ])
  })

  it('is planned again by a second runtime when the first prepared it and stopped before the resume', async () => {
    const built = await suspended()
    const { harness, bridge, author } = built
    bridge.decide(FIRST, { kind: 'answer', value: text('a.txt') })
    ok(
      await harness.commands.acceptDecision({
        ...ACCESS,
        operation: operationId(`${FIRST}/accept`),
        wait: FIRST,
        decision: evidence(`decision/${FIRST}`, 'test-decisions'),
      }),
    )
    // The first runtime prepared the resume segment's environment, then stopped.
    const accepted = await recovery(harness)
    const preparation = accepted.preparations.at(-1)
    if (preparation?.purpose !== 'resume' || accepted.execution === null)
      throw new Error('the acceptance planned no resume preparation')
    const write = { ...accepted.execution, principal: principalA }
    ok(
      await harness.commands.prepared({
        ...write,
        operation: operationId(`${preparation.operation}/prepared`),
        expected: accepted.state.revision,
        preparation,
        resources: evidence('resume-environment'),
      }),
    )
    const second = restarted(built, losing([preparation.operation]))
    ok(await second.recover({ principal: principalA, tenant: tenantA }))
    await settle(second)
    expect(author.resumed).toHaveLength(1)
    const after = await recovery(second)
    expect(after.state.phase).toBe('settled')
    expect(after.preparations.at(-1)).toMatchObject({
      operation: `${FIRST}/resume/prepare/2`,
      purpose: 'resume',
    })
  })
})

describe('the plan of a resume preparation (P03 planPreparation, purpose resume)', () => {
  it('takes only the next resume preparation of the accepted wait, and a resend recalls it', async () => {
    const built = await suspended()
    const { harness, bridge } = built
    bridge.decide(FIRST, { kind: 'answer', value: text('a.txt') })
    ok(
      await harness.commands.acceptDecision({
        ...ACCESS,
        operation: operationId(`${FIRST}/accept`),
        wait: FIRST,
        decision: evidence(`decision/${FIRST}`, 'test-decisions'),
      }),
    )
    const accepted = await recovery(harness)
    const bound = accepted.preparations.at(-1)
    if (bound === undefined || accepted.execution === null) throw new Error('no resume planned')
    const write = { ...accepted.execution, principal: principalA }
    const plan = (operation: string) =>
      harness.commands.planPreparation({
        ...write,
        operation: operationId(operation),
        expected: accepted.state.revision,
        request: accepted.request,
        purpose: 'resume',
        environmentAdoption: bound.adoption,
      })
    expect(await plan(`${FIRST}/resume/prepare/3`)).toEqual({
      failure: { kind: 'invalid', field: 'operation', reason: 'not-the-next-resume-preparation' },
    })
    const planned = ok(await plan(`${FIRST}/resume/prepare/2`))
    expect(planned).toMatchObject({ operation: `${FIRST}/resume/prepare/2`, purpose: 'resume' })
    expect(ok(await plan(`${FIRST}/resume/prepare/2`))).toEqual(planned)
    const after = await recovery(harness)
    expect(after.tasks.filter(task => task.kind === 'prepare')).toMatchObject([
      { preparation: { operation: `${FIRST}/resume/prepare/2` } },
    ])
  })
})

/** `c1` suspended and its decision accepted by the real command; nothing drives the resume. */
async function acceptedCall(options: Parameters<typeof setup>[0] = {}) {
  const built = await suspended(options)
  built.bridge.decide(FIRST, { kind: 'answer', value: text('a.txt') })
  ok(
    await built.harness.commands.acceptDecision({
      ...ACCESS,
      operation: operationId(`${FIRST}/accept`),
      wait: FIRST,
      decision: evidence(`decision/${FIRST}`, 'test-decisions'),
    }),
  )
  const accepted = await recovery(built.harness)
  const bound = accepted.preparations.at(-1)
  if (bound?.purpose !== 'resume' || accepted.execution === null)
    throw new Error('the acceptance planned no resume preparation')
  const write = { ...accepted.execution, principal: principalA }
  const plan = (operation: string, changes: Record<string, unknown> = {}) =>
    built.harness.commands.planPreparation({
      ...write,
      operation: operationId(operation),
      expected: accepted.state.revision,
      request: accepted.request,
      purpose: 'resume',
      environmentAdoption: bound.adoption,
      ...changes,
    })
  const confirm = async (
    preparation: typeof bound,
    operation = `${preparation.operation}/prepared`,
  ) =>
    built.harness.commands.prepared({
      ...write,
      operation: operationId(operation),
      expected: (await recovery(built.harness)).state.revision,
      preparation,
      resources: evidence('resume-environment'),
    })
  return { built, accepted, bound, write, plan, confirm }
}

const SECOND_PLAN = `${FIRST}/resume/prepare/2`

describe('what a resume plan refuses, and what it leaves', () => {
  it('refuses a plan for a call whose decision is not accepted: there is no resume segment to prepare', async () => {
    const built = await suspended()
    const before = await recovery(built.harness)
    const bound = before.preparations.at(-1)
    if (bound === undefined || before.execution === null) throw new Error('no preparation')
    const write = { ...before.execution, principal: principalA }
    expect(
      await built.harness.commands.planPreparation({
        ...write,
        operation: operationId(`${FIRST}/resume/prepare`),
        expected: before.state.revision,
        request: before.request,
        purpose: 'resume',
        environmentAdoption: bound.adoption,
      }),
    ).toEqual({ failure: { kind: 'invalid', field: 'call', reason: 'no-resume-planned' } })
    expect((await recovery(built.harness)).preparations).toEqual(before.preparations)
  })

  it('refuses another adoption than the one the call is bound to, and writes nothing', async () => {
    const { built, accepted, bound, plan } = await acceptedCall()
    expect(
      await plan(SECOND_PLAN, {
        environmentAdoption: { ...bound.adoption, revision: `${bound.adoption.revision}-other` },
      }),
    ).toEqual({
      failure: { kind: 'invalid', field: 'environmentAdoption', reason: 'not-the-bound-adoption' },
    })
    const after = await recovery(built.harness)
    expect(after.preparations).toEqual(accepted.preparations)
    expect(after.state.revision).toBe(accepted.state.revision)
  })

  it('refuses a plan on a revision that is no longer current', async () => {
    const { built, accepted, plan } = await acceptedCall()
    ok(await plan(SECOND_PLAN))
    // The first plan moved the call: a plan of the next one on the old revision is stale.
    expect(await plan(`${FIRST}/resume/prepare/3`)).toMatchObject({
      failure: { kind: 'stale-revision' },
    })
    expect((await recovery(built.harness)).preparations).toHaveLength(
      accepted.preparations.length + 1,
    )
  })

  it('refuses the same operation with another input, and keeps the first plan', async () => {
    const { built, bound, plan } = await acceptedCall()
    const planned = ok(await plan(SECOND_PLAN))
    expect(
      await plan(SECOND_PLAN, {
        environmentAdoption: { ...bound.adoption, revision: `${bound.adoption.revision}-other` },
      }),
    ).toMatchObject({ failure: { kind: 'conflict' } })
    expect((await recovery(built.harness)).preparations.at(-1)).toEqual(planned)
  })

  it('drops the environment of the lost preparation: the call cannot resume until the new one is confirmed', async () => {
    const { built, bound, plan, confirm } = await acceptedCall()
    const environment = async () => (await snapshotOfCall(built.harness)).call?.environment
    ok(await confirm(bound))
    expect(await environment()).toMatchObject({ preparation: bound.operation })
    const planned = ok(
      await plan(SECOND_PLAN, { expected: (await recovery(built.harness)).state.revision }),
    )
    expect(await environment()).toBeNull()
    expect((await recovery(built.harness)).state).toMatchObject({
      phase: 'suspended',
      relation: 'foreground',
    })
    // The older preparation is not the current one any more.
    expect(await confirm(bound, `${bound.operation}/prepared-again`)).toEqual({
      failure: { kind: 'invalid', field: 'preparation', reason: 'not-the-current-preparation' },
    })
    expect(await environment()).toBeNull()
    ok(await confirm(planned))
    expect(await environment()).toMatchObject({ preparation: SECOND_PLAN })
  })
})

describe('the confirmation of a resume environment (P03 prepared, purpose resume)', () => {
  it('recalls the same state when the same confirmation is sent again', async () => {
    const { built, bound, write } = await acceptedCall()
    const command = {
      ...write,
      operation: operationId(`${bound.operation}/prepared`),
      expected: (await recovery(built.harness)).state.revision,
      preparation: bound,
      resources: evidence('resume-environment'),
    }
    const first = ok(await built.harness.commands.prepared(command))
    expect(first).toMatchObject({ phase: 'suspended', relation: 'foreground' })
    expect(ok(await built.harness.commands.prepared(command))).toEqual(first)
    expect((await recovery(built.harness)).state).toEqual(first)
  })

  it('refuses a confirmation that comes after the call resumed and ended: a late one does not suspend it again', async () => {
    const { built, bound, confirm } = await acceptedCall()
    await built.harness.drive('c1')
    await settle(built.harness)
    const ended = await recovery(built.harness)
    expect(ended.state.phase).toBe('settled')
    expect(await confirm(bound, `${bound.operation}/prepared-late`)).toEqual({
      failure: { kind: 'invalid', field: 'call', reason: 'phase:settled' },
    })
    expect((await recovery(built.harness)).state).toEqual(ended.state)
  })
})

/** One run of the driver of `c1` in `harness`, and how it stopped. */
async function stopOf(harness: Built['harness']) {
  const call = callId('c1')
  // The executor of the host reads the stop of a run through `advance`; the port type names only `run`.
  const driver = harness.host.driver() as unknown as Readonly<{
    advance(
      step: Parameters<ReturnType<Built['harness']['host']['driver']>['run']>[0],
    ): Promise<DriverStop>
  }>
  return driver.advance({
    principal: principalA,
    tenant: tenantA,
    call,
    instance: await harness.host.instanceOf(call),
    signal: new AbortController().signal,
  })
}

type Environments = Parameters<NonNullable<StartOptions['environmentsPort']>>[0]

describe('a resume segment whose environment another runtime prepared', () => {
  /** The first runtime confirmed the resume preparation, then stopped. */
  async function preparedThenStopped() {
    const first = await acceptedCall()
    ok(await first.confirm(first.bound))
    return first
  }

  it('is not read back by the runtime that prepared it', async () => {
    const built = await suspended()
    await answer(built, { kind: 'answer', value: text('a.txt') })
    expect(built.author.resumed).toHaveLength(1)
    expect(built.harness.environments.inspected).toEqual([])
  })

  it('resumes in the environment the provider still holds: nothing is planned again', async () => {
    const { built, accepted } = await preparedThenStopped()
    const second = restarted(built)
    ok(await second.recover({ principal: principalA, tenant: tenantA }))
    await settle(second)
    expect(second.environments.inspected).toEqual(['c1'])
    expect(second.environments.prepared).toEqual([])
    expect(built.author.resumed).toHaveLength(1)
    const after = await recovery(second)
    expect(after.state.phase).toBe('settled')
    expect(after.preparations).toEqual(accepted.preparations)
  })

  it('reads the last preparation, not an earlier lost one, after the segment was planned again', async () => {
    const { built, bound, plan, confirm } = await preparedThenStopped()
    const planned = ok(
      await plan(SECOND_PLAN, { expected: (await recovery(built.harness)).state.revision }),
    )
    ok(await confirm(planned))
    const second = restarted(built, losing([bound.operation]))
    ok(await second.recover({ principal: principalA, tenant: tenantA }))
    await settle(second)
    expect(built.author.resumed).toHaveLength(1)
    const after = await recovery(second)
    expect(after.state.phase).toBe('settled')
    expect(after.preparations.map(item => item.operation)).toEqual([
      'op-c1/plan',
      bound.operation,
      SECOND_PLAN,
    ])
  })

  it('fails the run when the provider is another adapter than the call is bound to', async () => {
    const { built, accepted } = await preparedThenStopped()
    const second = restarted(built, base =>
      Object.assign(releasing(base), { adoption: { ...base.adoption, revision: 'another' } }),
    )
    expect(await stopOf(second)).toMatchObject({
      kind: 'failed',
      failure: { kind: 'unavailable' },
    })
    expect(second.environments.inspected).toEqual([])
    const after = await recovery(second)
    expect(after.state.phase).toBe('suspended')
    expect(after.preparations).toEqual(accepted.preparations)
    expect(built.author.resumed).toHaveLength(0)
  })

  it('fails the run when the provider cannot answer, and plans nothing', async () => {
    const { built, accepted } = await preparedThenStopped()
    const down = {
      failure: { kind: 'unavailable', dependency: 'test-environment', diagnostic: 'down' },
    } as const
    const second = restarted(built, (base: Environments) =>
      Object.assign(releasing(base), { inspectPreparation: () => Promise.resolve(down) }),
    )
    expect(await stopOf(second)).toEqual({ kind: 'failed', ...down })
    const after = await recovery(second)
    expect(after.state.phase).toBe('suspended')
    expect(after.preparations).toEqual(accepted.preparations)
    expect(built.author.resumed).toHaveLength(0)
  })

  it('fails the run when the provider answers the facts of another preparation', async () => {
    const { built, accepted } = await preparedThenStopped()
    const second = restarted(built, (base: Environments) => {
      const { inspectPreparation } = base
      return Object.assign(releasing(base), {
        inspectPreparation: async (input: Parameters<typeof inspectPreparation>[0]) => {
          const read = await inspectPreparation(input)
          if ('failure' in read || read.ok.kind !== 'prepared') return read
          const other = { ...input.preparation, operation: operationId('op-c1/plan') }
          return succeed({
            ...read.ok,
            environment: { ...read.ok.environment, preparation: other },
          })
        },
      })
    })
    expect(await stopOf(second)).toMatchObject({ kind: 'failed', failure: { kind: 'invalid' } })
    const after = await recovery(second)
    expect(after.state.phase).toBe('suspended')
    expect(after.preparations).toEqual(accepted.preparations)
    expect(built.author.resumed).toHaveLength(0)
  })
})

describe('a replay after a lost answer or a crash', () => {
  it('does not resume twice when the acceptance and the resume answers are lost', async () => {
    let lost = { accept: true, resume: true }
    const built = await suspended({
      commands: base => ({
        ...base,
        acceptDecision: async input => {
          const answered = await base.acceptDecision(input)
          if (!lost.accept || 'failure' in answered) return answered
          lost = { ...lost, accept: false }
          return { failure: { kind: 'commit-unknown', operation: input.operation } }
        },
        prepareResume: async input => {
          const answered = await base.prepareResume(input)
          if (!lost.resume || 'failure' in answered) return answered
          lost = { ...lost, resume: false }
          return { failure: { kind: 'commit-unknown', operation: input.operation } }
        },
      }),
    })
    await answer(built, { kind: 'answer', value: text('a.txt') })
    expect(lost).toEqual({ accept: false, resume: false })
    expect(built.author.resumed).toHaveLength(1)
    expect(built.checkpoint.segments).toEqual(['op-c1/start', `${FIRST}/resume`])
    expect(built.bridge.resolved).toEqual([FIRST])
    expect((await built.harness.state('c1')).phase).toBe('settled')
  })

  it('resumes once from a second runtime after a crash between the acceptance and the resume', async () => {
    const built = await suspended()
    const { harness, bridge, checkpoint, author } = built
    bridge.decide(FIRST, { kind: 'answer', value: text('a.txt') })
    // The first runtime accepted the decision and stopped before it took the slot again.
    ok(
      await harness.commands.acceptDecision({
        ...ACCESS,
        operation: operationId(`${FIRST}/accept`),
        wait: FIRST,
        decision: evidence(`decision/${FIRST}`, 'test-decisions'),
      }),
    )
    const second = restarted(built)
    // The second runtime finds c1 through its pending marker; nothing names the call to it.
    expect(ok(await second.recover({ principal: principalA, tenant: tenantA }))).toEqual({
      scheduled: '1',
    })
    await settle(second)
    await harness.drive('c1')
    await settle(harness)
    expect(author.resumed).toHaveLength(1)
    expect(checkpoint.segments).toEqual(['op-c1/start', `${FIRST}/resume`])
    expect((await second.state('c1')).phase).toBe('settled')
    // The checkpoint has one successor: a resume under another operation is refused.
    const state = await second.state('c1')
    const again = await second.commands.prepareResume({
      ...ACCESS,
      instance: (await recovery(second)).execution?.instance as never,
      generation: '1',
      operation: operationId(`${FIRST}/resume-again`),
      expected: state.revision,
      checkpoint: evidence('checkpoint/op-c1/start', 'test-host'),
    })
    expect(again).toMatchObject({ failure: { kind: 'invalid', reason: 'phase:settled' } })
  })

  it('resumes once from a second runtime when the decision arrives after the first runtime stopped', async () => {
    const built = await suspended()
    const { bridge, checkpoint, author } = built
    // The first runtime stops while the wait is open. The person answers afterwards: the decision
    // stays with the decision owner, and no wake-up reaches any runtime.
    bridge.decide(FIRST, { kind: 'answer', value: text('a.txt') })
    const second = restarted(built)
    await settle(second)
    expect((await second.state('c1')).phase).toBe('suspended')
    expect(ok(await second.recover({ principal: principalA, tenant: tenantA }))).toEqual({
      scheduled: '1',
    })
    await settle(second)
    expect(author.resumed).toEqual([
      { state: '{"asked":"which file?"}', response: { kind: 'answer', value: text('a.txt') } },
    ])
    expect(checkpoint.segments).toEqual(['op-c1/start', `${FIRST}/resume`])
    expect(bridge.resolved).toEqual([FIRST])
    expect((await second.state('c1')).phase).toBe('settled')
    // The settled call still owes the delivery of its result, so a later scan schedules it again;
    // that run does not resume the checkpoint a second time.
    expect(ok(await second.recover({ principal: principalA, tenant: tenantA }))).toEqual({
      scheduled: '1',
    })
    await settle(second)
    expect(author.resumed).toHaveLength(1)
    expect(checkpoint.segments).toEqual(['op-c1/start', `${FIRST}/resume`])
  })
})

/** 以真实的 `commands.control` 叫停 `c1`：调用收场，当前等待以 `cancelled` 关闭（Tool SPEC 第 32 条）。 */
async function cancel(commands: Built['harness']['commands']): Promise<void> {
  ok(
    await commands.control({
      ...ACCESS,
      operation: operationId('stop-c1'),
      intent: { kind: 'stop' },
    }),
  )
}
