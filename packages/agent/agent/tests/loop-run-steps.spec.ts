// The step limit of one execution (R2-D221, the M2 fallback for the loop judgment of wave 3): a
// scripted Model calls the same tool at every step. Within the limit the execution ends as the
// Model decides; after the last allowed step the next step is not opened and the execution fails
// with a `guard` candidate. A configuration without `maxRunSteps` gets DEFAULT_MAX_RUN_STEPS.
import { describe, expect, it } from 'vitest'
import { DEFAULT_MAX_RUN_STEPS } from '@omne-harness/agent'
import type { AgentEventBody, EventPage, ExecutionSnapshot } from '@omne-harness/agent-contract'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  type ToolState,
} from '@omne-harness/tool-contract'
import { execution, ok } from './journal-support.ts'
import { alice, eventually, invoke } from './loop-support.ts'
import {
  associatedTools,
  deliverModelReply,
  pushToolResult,
  textBlock,
  toolAssembly,
  toolCall,
  toolDelivery,
  toolReceiver,
} from './fixtures/tool-call.ts'

type Assembly = Awaited<ReturnType<typeof toolAssembly>>

const input = { ...alice, execution: execution() }

async function snapshot(assembly: Assembly): Promise<ExecutionSnapshot> {
  return ok(await assembly.dependencies.journal.load(input))
}

async function events(assembly: Assembly): Promise<readonly AgentEventBody[]> {
  const bodies: AgentEventBody[] = []
  let after: string | null = null
  for (;;) {
    const page: EventPage = ok(
      await assembly.dependencies.journal.output.read({ ...input, after, limit: 100 }),
    )
    if (page.kind !== 'page') throw new Error('event gap')
    bodies.push(...page.events.map(event => event.body))
    if (page.caughtUp || page.events.length === 0) return bodies
    after = page.next
  }
}

/** The steps the execution opened: one input-taken event each (node table I0). */
async function steps(assembly: Assembly): Promise<number> {
  return (await events(assembly)).filter(body => body.kind === 'input-taken').length
}

/** An assembly whose Tool runtime accepts every invoke as a new call. */
async function looping(configuration: { maxRunSteps?: number } = {}) {
  const assembly = await toolAssembly(configuration)
  let count = 0
  assembly.controls.tools.invoke.always(async () => {
    count += 1
    const reference = ok(
      encodeToolInvocationRef({
        tenant: alice.tenant,
        call: ok(decodeToolCallId(`tcall_call-${count}`)),
        admission: ok(decodeToolOperationId(`top_call-${count}`)),
      }),
    )
    return { kind: 'accepted', reference, state: {} as ToolState, recovered: false }
  })
  ok(await invoke(assembly))
  return assembly
}

/** Step `k`: the Model calls the same tool once more, and the tool result comes back. */
async function toolStep(assembly: Assembly, k: number) {
  await deliverModelReply(assembly, [toolCall(`tool-call-${k}`, 'read_file')], `tools-${k}`)
  const [pending] = await associatedTools(assembly, 1)
  if (pending === undefined) throw new Error(`no associated Tool call at step ${k}`)
  ok(await pushToolResult(toolReceiver(assembly), toolDelivery(pending, { name: `r${k}` })))
}

/** Drives `count` tool steps, then waits for the execution to end or for the next Model call. */
async function toolSteps(assembly: Assembly, count: number) {
  for (let k = 1; k <= count; k += 1) await toolStep(assembly, k)
  await eventually(async () => {
    const read = await snapshot(assembly)
    return read.state.kind === 'ended' || read.checkpoint.calls.some(call => call.kind === 'model')
  })
}

async function ended(assembly: Assembly): Promise<ExecutionSnapshot> {
  await eventually(async () => (await snapshot(assembly)).state.kind === 'ended')
  return snapshot(assembly)
}

/** A Model call is open: the execution went on to another step. */
async function openModelCall(assembly: Assembly): Promise<boolean> {
  const read = await snapshot(assembly)
  return read.state.kind !== 'ended' && read.checkpoint.calls.some(call => call.kind === 'model')
}

/** The Model gives a final reply without tool calls at step `k`. */
async function finalReply(assembly: Assembly, k: number) {
  await deliverModelReply(assembly, [textBlock('done', `blk_done_${k}`)], `final-${k}`)
}

function expectStepLimitFailure(read: ExecutionSnapshot, maxRunSteps: number) {
  expect(read.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'fail' } })
  expect(read.settlement.candidate?.conclusion.kind).toBe('fail')
  expect(read.settlement.candidate?.failure).toMatchObject({
    kind: 'guard',
    level: 3,
    basis: { record: `${execution()}/step-${maxRunSteps}/max-run-steps` },
  })
}

describe('the step limit of one execution (R2-D221)', () => {
  it('ends normally when the Model stops calling tools within the limit', async () => {
    const assembly = await looping({ maxRunSteps: 3 })
    await toolSteps(assembly, 2)
    await finalReply(assembly, 3)
    const read = await ended(assembly)
    expect(read.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
    expect(read.settlement.candidate?.failure ?? null).toBeNull()
    expect(await steps(assembly)).toBe(3)
  })

  it('negative control: the same script fails when the limit is below its steps', async () => {
    const assembly = await looping({ maxRunSteps: 2 })
    await toolSteps(assembly, 2)
    const read = await ended(assembly)
    expectStepLimitFailure(read, 2)
    expect(await steps(assembly)).toBe(2)
  })

  it('stops a Model that never stops calling tools at the limit, with a guard failure', async () => {
    const assembly = await looping({ maxRunSteps: 2 })
    await toolSteps(assembly, 2)
    const read = await ended(assembly)
    expectStepLimitFailure(read, 2)
    // The step after the last allowed one is never opened: no third Model request.
    expect(await steps(assembly)).toBe(2)
    expect(read.checkpoint.calls.some(call => call.kind === 'model')).toBe(false)
  })

  it('negative control: a higher limit opens the third step for the same script', async () => {
    const assembly = await looping({ maxRunSteps: 3 })
    await toolSteps(assembly, 2)
    await eventually(() => openModelCall(assembly))
    expect(await steps(assembly)).toBe(3)
    expect((await snapshot(assembly)).state.kind).not.toBe('ended')
  })

  it(`uses the default limit of ${DEFAULT_MAX_RUN_STEPS} when the configuration gives none`, async () => {
    expect(DEFAULT_MAX_RUN_STEPS).toBe(50)
    const assembly = await looping()
    await toolSteps(assembly, DEFAULT_MAX_RUN_STEPS)
    const read = await ended(assembly)
    expectStepLimitFailure(read, DEFAULT_MAX_RUN_STEPS)
    expect(await steps(assembly)).toBe(DEFAULT_MAX_RUN_STEPS)
  }, 60_000)

  it('negative control: without the limit configured, step 49 still opens step 50', async () => {
    const assembly = await looping()
    await toolSteps(assembly, DEFAULT_MAX_RUN_STEPS - 1)
    await eventually(() => openModelCall(assembly))
    expect(await steps(assembly)).toBe(DEFAULT_MAX_RUN_STEPS)
  }, 60_000)
})
