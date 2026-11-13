import { describe, expect, it } from 'vitest'
import { agentEvaluator, type AgentDependencies } from '@omne-harness/agent'
import type { PendingCall, StepId } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import {
  decodeDispatchId,
  decodeResultVersion,
  resolveModelInvocationRef,
  type ModelFaultCause,
  type ResultPart,
  type Termination,
} from '@omne-harness/model-contract'
import { parseRetryPolicy, type RetryPolicy } from '@omne-harness/retry'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  type ToolState,
} from '@omne-harness/tool-contract'
import {
  createExecutionCoordinator,
  createResumedCoordinator,
  type ExecutionEntry,
} from '../src/loop/coordinator.ts'
import { options } from './factory-support.ts'
import {
  acceptedInput,
  evidence,
  execution,
  loadWithEntries,
  ok,
  operation,
  type Principal,
} from './journal-support.ts'
import { alice, eventually, invoke, loopAssembly, type LoopAssembly } from './loop-support.ts'
import {
  associatedTools,
  deliverModelReply,
  deliverToolSuggestion,
  pushToolResult,
  textBlock,
  toolAssembly,
  toolDelivery,
  toolReceiver,
} from './fixtures/tool-call.ts'

type Dependencies = AgentDependencies<Principal, ContentBlock>
type Settle = Readonly<{ termination: Termination; parts: readonly ResultPart[] }>
type Retrying = Parameters<NonNullable<ExecutionEntry<Principal>['modelRetrying']>>

const START = '1970-01-01T00:00:00Z'
const policy = (change: Partial<RetryPolicy> = {}) =>
  parseRetryPolicy({
    maxAttempts: 3,
    maxElapsedMs: 10_000,
    delaysMs: [1000, 2000],
    jitter: 0.5,
    ...change,
  })

const half: ResultPart = { kind: 'partial', content: 'text', value: 'half a reply', trims: [] }
const lost = (
  cause: ModelFaultCause = 'stream-lost',
  parts: readonly ResultPart[] = [half],
): Settle => ({
  termination: {
    kind: 'failed',
    fault: { cause, diagnostic: 'response-body-lost', upstreamStatus: null },
  } as Termination,
  parts,
})
const reply: Settle = {
  termination: { kind: 'completed', reason: 'stop' },
  parts: [
    {
      kind: 'sealed',
      trims: [],
      block: {
        kind: 'text',
        id: acceptedInput('reply').content.blocks[0].id,
        visibility: { toHuman: true, toModel: true },
        text: 'the whole reply',
      },
    },
  ],
}
const truncated: Settle = {
  termination: { kind: 'completed', reason: 'limit' },
  parts: [...reply.parts, half],
}

type Scripted = Readonly<{
  assembly: LoopAssembly
  calls: string[]
  retrying: Retrying[]
  coordinator(): ReturnType<typeof createExecutionCoordinator>
  rebuild(): Promise<ReturnType<typeof createResumedCoordinator>>
}>

async function scripted(
  script: readonly Settle[],
  retry: RetryPolicy | null = policy(),
  wrap: (d: Dependencies) => Dependencies = d => d,
): Promise<Scripted> {
  const calls: string[] = []
  const retrying: Retrying[] = []
  const assembly: LoopAssembly = await loopAssembly([execution()], d =>
    wrap({
      ...d,
      models: {
        ...d.models,
        calls: {
          ...d.models.calls,
          async admit(input) {
            const admitted = await d.models.calls.admit(input)
            if ('ok' in admitted) {
              const settle = script[calls.length]
              calls.push(input.call)
              if (settle === undefined)
                throw new Error(`no scripted result for call ${calls.length}`)
              assembly.controls.models.settle({
                tenant: input.tenant,
                call: input.call,
                version: ok(decodeResultVersion(`mrver_${calls.length}`)),
                termination: settle.termination,
                parts: settle.parts,
                source: evidence(`settled-${calls.length}`),
                pageSize: 4,
                pageTargetBytes: 65536,
              })
              await assembly.controls.pusher?.settled({ tenant: input.tenant, call: input.call })
            }
            return admitted
          },
        },
      },
    }),
  )
  const entry = {
    ports: assembly.dependencies,
    binding: options().binding,
    evaluator: agentEvaluator,
    access: alice,
    execution: execution(),
    idle() {},
    ...(retry === null ? {} : { modelRetry: { policy: retry, random: () => 0 } }),
    modelRetrying: (...event: Retrying) => retrying.push(event),
  }
  const coordinator = () =>
    createExecutionCoordinator({
      ...entry,
      operation: operation('invoke-exec-1'),
      initial: acceptedInput('input-exec-1', 'hello exec-1'),
      grant: null,
    })
  let rebuilds = 0
  const rebuild = async () => {
    rebuilds += 1
    const authority = (await load(assembly)).executionAttachment
    if (authority === null) throw new Error('an open execution without an attachment')
    const recovery = ok(
      await assembly.dependencies.journal.detach({
        ...alice,
        execution: execution(),
        operation: operation(`lost-${rebuilds}`),
        authority,
        reason: evidence('lost'),
      }),
    )
    const resumed = createResumedCoordinator(entry)
    ok(await resumed.resume({ operation: operation(`resume-${rebuilds}`), recovery, grant: null }))
    return resumed
  }
  return { assembly, calls, retrying, coordinator, rebuild }
}

async function load(assembly: LoopAssembly) {
  return await loadWithEntries(assembly.controls.journal.provider, {
    ...alice,
    execution: execution(),
  })
}

async function messageRoles(assembly: LoopAssembly) {
  const page = ok(
    await assembly.dependencies.journal.output.read({
      ...alice,
      execution: execution(),
      after: null,
      limit: 100,
    }),
  )
  if (page.kind !== 'page') throw new Error('a gap in a new execution')
  return page.events.flatMap(event =>
    event.body.kind === 'message' ? [event.body.message.role] : [],
  )
}

function replyHandoffs(assembly: LoopAssembly) {
  return assembly.controls.handoff.prepare.calls.filter(
    call => call.request.kind === 'execution' && call.request.source.kind === 'model-reply',
  )
}

async function causeRecord(assembly: LoopAssembly) {
  const { state } = await load(assembly)
  if (state.kind !== 'ended' || state.conclusion.kind !== 'fail')
    throw new Error(`the execution did not fail: ${JSON.stringify(state)}`)
  return state.conclusion.cause.record
}

const at = (seconds: number) => new Date(Date.parse(START) + seconds * 1000).toISOString()

describe('a transient failure of the main call within the budget', () => {
  it('goes to I8 on the retry edge and saves the retry state, without a candidate or a message', async () => {
    const run = await scripted([lost(), reply])
    const c = run.coordinator()
    ok(await c.accept())
    ok(await c.runExecution())
    const saved = await load(run.assembly)
    expect(saved.checkpoint).toMatchObject({
      position: 'I8',
      calls: [],
      modelRetry: { failures: 1, since: START, notBefore: at(1) },
    })
    expect(saved.state).toEqual({
      kind: 'waiting',
      waits: [{ kind: 'dependency', owner: 'modelRetry', position: 'I8' }],
    })
    expect(saved.settlement.candidate).toBeNull()
    expect(await messageRoles(run.assembly)).toEqual([])
    expect(replyHandoffs(run.assembly)).toEqual([])
    expect(run.retrying).toEqual([
      [
        'step-1' as StepId,
        {
          attempt: 2,
          fault: { cause: 'stream-lost', diagnostic: 'response-body-lost', upstreamStatus: null },
          notBefore: at(1),
        },
      ],
    ])
  })

  it('a failure before any content is retried the same way', async () => {
    const run = await scripted([lost('upstream-unavailable', []), reply])
    const c = run.coordinator()
    ok(await c.accept())
    ok(await c.runExecution())
    expect((await load(run.assembly)).checkpoint.modelRetry).toMatchObject({ failures: 1 })
  })

  it('before notBefore the loop waits and sends no new call', async () => {
    const run = await scripted([lost(), reply])
    const c = run.coordinator()
    ok(await c.accept())
    ok(await c.runExecution())
    run.assembly.controls.clock.advanceTo(at(0.5))
    ok(await c.runExecution())
    expect(run.calls).toHaveLength(1)
    expect((await load(run.assembly)).checkpoint.position).toBe('I8')
  })

  it('at notBefore a new step sends a new main call; the taken input stays in the history', async () => {
    const run = await scripted([lost(), reply])
    const c = run.coordinator()
    ok(await c.accept())
    ok(await c.runExecution())
    run.assembly.controls.clock.advanceTo(at(1))
    ok(await c.runExecution())
    expect(run.calls).toHaveLength(2)
    expect(run.calls[1]).not.toBe(run.calls[0])
    const prepared = run.assembly.controls.requests.prepare.calls
    expect(prepared.map(call => call.inputs.ordered)).toEqual([
      ['input-exec-1'],
      ['input-exec-1'],
      [],
      [],
    ])
    const saved = await load(run.assembly)
    expect(saved.checkpoint.step).toBe('step-2')
    expect(
      saved.handoffs
        .filter(record => record.handoff.kind === 'input')
        .map(record => [record.history.kind, record.retirement]),
    ).toEqual([['committed', null]])
  })

  it('a retry that succeeds admits the reply, clears the retry state and completes', async () => {
    const run = await scripted([lost(), reply])
    const c = run.coordinator()
    ok(await c.accept())
    ok(await c.runExecution())
    run.assembly.controls.clock.advanceTo(at(1))
    ok(await c.runExecution())
    const saved = await load(run.assembly)
    expect(saved.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    expect(saved.checkpoint.modelRetry).toBeNull()
    expect(await messageRoles(run.assembly)).toEqual(['assistant'])
    expect(replyHandoffs(run.assembly)).toHaveLength(1)
  })
})

describe('a failure that is not retried fails the run with its cause', () => {
  it('runs out of attempts', async () => {
    const run = await scripted([lost(), lost(), lost(), reply], policy({ maxAttempts: 3 }))
    const c = run.coordinator()
    ok(await c.accept())
    ok(await c.runExecution())
    run.assembly.controls.clock.advanceTo(at(1))
    ok(await c.runExecution())
    expect((await load(run.assembly)).checkpoint.modelRetry).toMatchObject({ failures: 2 })
    run.assembly.controls.clock.advanceTo(at(3))
    ok(await c.runExecution())
    expect(run.calls).toHaveLength(3)
    expect(await causeRecord(run.assembly)).toBe(
      `${execution()}/step-3/model-failed/stream-lost/response-body-lost`,
    )
    expect(await messageRoles(run.assembly)).toEqual([])
  })

  it('runs out of time', async () => {
    const run = await scripted(
      [lost(), lost(), reply],
      policy({ maxAttempts: 9, maxElapsedMs: 1500, delaysMs: [1000] }),
    )
    const c = run.coordinator()
    ok(await c.accept())
    ok(await c.runExecution())
    run.assembly.controls.clock.advanceTo(at(1))
    ok(await c.runExecution())
    expect(run.calls).toHaveLength(2)
    expect(await causeRecord(run.assembly)).toBe(
      `${execution()}/step-2/model-failed/stream-lost/response-body-lost`,
    )
  })

  it('a permanent failure is not retried', async () => {
    const run = await scripted([lost('credential', []), reply])
    const c = run.coordinator()
    ok(await c.accept())
    ok(await c.runExecution())
    expect(run.calls).toHaveLength(1)
    expect(run.retrying).toEqual([])
    expect(await causeRecord(run.assembly)).toBe(
      `${execution()}/step-1/model-failed/credential/response-body-lost`,
    )
  })

  it('a completed reply that was cut short fails as model-truncated and enters no history', async () => {
    const run = await scripted([truncated, reply])
    const c = run.coordinator()
    ok(await c.accept())
    ok(await c.runExecution())
    expect(run.calls).toHaveLength(1)
    expect(await causeRecord(run.assembly)).toBe(`${execution()}/step-1/model-truncated`)
    expect(await messageRoles(run.assembly)).toEqual([])
  })

  it('without a retry policy a transient failure fails at once', async () => {
    const run = await scripted([lost(), reply], null)
    const c = run.coordinator()
    ok(await c.accept())
    ok(await c.runExecution())
    expect(run.calls).toHaveLength(1)
    expect(await causeRecord(run.assembly)).toBe(
      `${execution()}/step-1/model-failed/stream-lost/response-body-lost`,
    )
  })
})

describe('the retry state lives in the checkpoint', () => {
  it('a coordinator rebuilt during the wait still waits until notBefore', async () => {
    const run = await scripted([lost(), reply])
    const original = run.coordinator()
    ok(await original.accept())
    ok(await original.runExecution())
    run.assembly.controls.clock.advanceTo(at(0.5))
    ok(await (await run.rebuild()).runExecution())
    expect(run.calls).toHaveLength(1)
    expect((await load(run.assembly)).checkpoint).toMatchObject({
      position: 'I8',
      modelRetry: { failures: 1, notBefore: at(1) },
    })
    run.assembly.controls.clock.advanceTo(at(1))
    ok(await (await run.rebuild()).runExecution())
    expect(run.calls).toHaveLength(2)
    expect((await load(run.assembly)).state).toMatchObject({
      kind: 'ended',
      conclusion: { kind: 'complete' },
    })
  })

  it('a coordinator rebuilt from the log counts on from the saved failures', async () => {
    const run = await scripted([lost(), lost(), reply])
    const original = run.coordinator()
    ok(await original.accept())
    ok(await original.runExecution())
    run.assembly.controls.clock.advanceTo(at(1))
    ok(await (await run.rebuild()).runExecution())
    expect(run.calls).toHaveLength(2)
    expect((await load(run.assembly)).checkpoint.modelRetry).toEqual({
      failures: 2,
      since: START,
      notBefore: at(3),
    })
  })
})

describe('a retry after a tool round asks the model again and nothing else', () => {
  async function failOpenModelCall(assembly: Awaited<ReturnType<typeof toolAssembly>>) {
    let pending: PendingCall | undefined
    await eventually(async () => {
      const read = ok(
        await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
      )
      pending = read.checkpoint.calls.find(call => call.kind === 'model')
      if (pending?.kind !== 'model') return false
      const found = ok(
        await assembly.dependencies.models.calls.inspect({
          ...alice,
          reference: pending.reference,
        }),
      )
      return found.kind === 'found' && found.state.phase !== 'settled'
    })
    if (pending?.kind !== 'model') throw new Error('model call not saved')
    const { call } = ok(resolveModelInvocationRef(pending.reference, alice.tenant))
    assembly.controls.models.start({
      ...alice,
      call,
      dispatch: ok(decodeDispatchId('mdisp_lost')),
      firstContent: 'observed',
    })
    const failed = lost()
    assembly.controls.models.settle({
      ...alice,
      call,
      version: ok(decodeResultVersion('mrver_lost')),
      termination: failed.termination,
      parts: failed.parts,
      source: evidence('model-lost'),
      pageSize: 4,
      pageTargetBytes: 65536,
    })
    await assembly.controls.pusher?.settled({ ...alice, call })
  }

  it('sends the tool call once and the main call once more', async () => {
    const assembly = await toolAssembly({
      modelRetry: policy({ delaysMs: [500], jitter: 0 }),
    })
    let accepted = 0
    assembly.controls.tools.invoke.always(async () => {
      accepted += 1
      return {
        kind: 'accepted',
        reference: ok(
          encodeToolInvocationRef({
            tenant: alice.tenant,
            call: ok(decodeToolCallId(`tcall_${accepted}`)),
            admission: ok(decodeToolOperationId(`top_${accepted}`)),
          }),
        ),
        state: {} as ToolState,
        recovered: false,
      }
    })
    ok(await invoke(assembly))
    await deliverToolSuggestion(assembly)
    const [tool] = await associatedTools(assembly, 1)
    if (tool === undefined) throw new Error('no associated Tool call')
    expect(
      await pushToolResult(
        toolReceiver(assembly),
        toolDelivery(tool, { name: 'one', content: [textBlock('file', 'blk_result_one')] }),
      ),
    ).toHaveProperty('ok')
    await failOpenModelCall(assembly)
    await eventually(
      async () =>
        ok(await assembly.dependencies.journal.load({ ...alice, execution: execution() })).state
          .kind === 'waiting' && assembly.controls.clock.pending().length > 0,
    )
    const retrying = ok(
      await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
    ).checkpoint
    expect(retrying).toMatchObject({ step: 'step-2', modelRetry: { failures: 1 } })
    const due = assembly.controls.clock.pending()[0]
    if (due === undefined) throw new Error('no check time')
    assembly.controls.clock.advanceTo(due)
    await deliverModelReply(assembly, [textBlock('done', 'blk_done')], 'done')
    await eventually(
      async () =>
        ok(await assembly.dependencies.journal.load({ ...alice, execution: execution() })).state
          .kind === 'ended',
    )
    const ended = ok(await assembly.dependencies.journal.load({ ...alice, execution: execution() }))
    expect(ended.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    expect(ended.checkpoint).toMatchObject({ step: 'step-3', modelRetry: null })
    expect(assembly.controls.tools.invoke.calls).toHaveLength(1)
    expect(accepted).toBe(1)
  })
})
