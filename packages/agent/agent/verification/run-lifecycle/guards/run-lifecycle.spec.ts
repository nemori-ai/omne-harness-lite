// Machine guards of the RunLifecycle model (verification/run-lifecycle/RunLifecycle.tla):
//   P2 the step limit: for every limit m and every script of t tool steps followed by a final
//      reply, the execution completes after t + 1 steps when t < m, and otherwise opens exactly m
//      steps and ends with a guard failure; it never opens more than m steps (R2-D221);
//   P3 a failure is visible: whichever node's commit the Journal refuses, the drive stops with
//      the slot failed and exactly one report naming that node, and a quiesce answers the
//      execution as remaining (R2-D282, R2-D285).
// The cases are enumerated. These guards live here until the loop tests are open again; they
// then move to tests/ (see README.md).
import { describe, expect, it } from 'vitest'
import type { AgentRunFailed } from '@omne-harness/agent'
import type { AgentEventBody, EventPage, Failure } from '@omne-harness/agent-contract'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  type ToolState,
} from '@omne-harness/tool-contract'
import { fail } from '@omne-harness/operation-result'
import { evidence, execution, ok, operation } from '../../../tests/journal-support.ts'
import { alice, eventually, invoke, loopAssembly, shown } from '../../../tests/loop-support.ts'
import {
  associatedTools,
  deliverModelReply,
  pushToolResult,
  textBlock,
  toolAssembly,
  toolCall,
  toolDelivery,
  toolReceiver,
} from '../../../tests/fixtures/tool-call.ts'

// ---------------------------------------------------------------------------------------------
// P2
// ---------------------------------------------------------------------------------------------

type Assembly = Awaited<ReturnType<typeof toolAssembly>>
const input = { ...alice, execution: execution() }

async function steps(assembly: Assembly): Promise<number> {
  const bodies: AgentEventBody[] = []
  let after: string | null = null
  for (;;) {
    const page: EventPage = ok(
      await assembly.dependencies.journal.output.read({ ...input, after, limit: 100 }),
    )
    if (page.kind !== 'page') throw new Error('event gap')
    bodies.push(...page.events.map(event => event.body))
    if (page.caughtUp || page.events.length === 0) break
    after = page.next
  }
  return bodies.filter(body => body.kind === 'input-taken').length
}

async function looping(maxRunSteps: number) {
  const assembly = await toolAssembly({ maxRunSteps })
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

async function ended(assembly: Assembly) {
  await eventually(
    async () => ok(await assembly.dependencies.journal.load(input)).state.kind === 'ended',
  )
  return ok(await assembly.dependencies.journal.load(input))
}

const P2_CASES = [1, 2, 3].flatMap(m => [0, 1, 2, 3].map(t => [m, t] as const))

describe('RunLifecycle guard P2: the step limit holds for every limit and script', () => {
  it.each(P2_CASES)('maxRunSteps %i, %i tool steps then a final reply', async (m, t) => {
    const assembly = await looping(m)
    const driven = Math.min(t, m)
    for (let k = 1; k <= driven; k += 1) {
      await deliverModelReply(assembly, [toolCall(`tool-call-${k}`, 'read_file')], `tools-${k}`)
      const [pending] = await associatedTools(assembly, 1)
      if (pending === undefined) throw new Error(`no associated Tool call at step ${k}`)
      ok(await pushToolResult(toolReceiver(assembly), toolDelivery(pending, { name: `r${k}` })))
    }
    if (t < m) await deliverModelReply(assembly, [textBlock('done', `blk_done_${t}`)], 'final')
    const read = await ended(assembly)
    if (t < m) {
      expect(read.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
      expect(await steps(assembly)).toBe(t + 1)
    } else {
      expect(read.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'fail' } })
      expect(read.settlement.candidate?.failure).toMatchObject({ kind: 'guard', level: 3 })
      expect(await steps(assembly)).toBe(m)
    }
    expect(await steps(assembly)).toBeLessThanOrEqual(m)
  })
})

// ---------------------------------------------------------------------------------------------
// P3
// ---------------------------------------------------------------------------------------------

const JOURNAL_DOWN: Failure = {
  kind: 'unavailable',
  owner: 'agentJournal',
  diagnostic: 'storage rejected the commit: command_limit',
}

/** The nodes whose commit the guard refuses; each is on the path of the default script. */
const NODES = ['I0', 'M0', 'I4', 'F1'] as const

describe('RunLifecycle guard P3: a refused commit stops the drive visibly, once', () => {
  it.each(NODES)('the Journal refuses the commit of %s', async node => {
    const reports: AgentRunFailed[] = []
    const assembly = await loopAssembly(
      [execution()],
      d => ({
        ...d,
        journal: {
          ...d.journal,
          commit: commit =>
            commit.operation.startsWith(`${node}/`)
              ? Promise.resolve(fail(JOURNAL_DOWN))
              : d.journal.commit(commit),
        },
      }),
      undefined,
      undefined,
      { failed: event => reports.push(event) },
    )
    assembly.release.open()
    const handle = ok(await invoke(assembly))
    await eventually(async () => reports.length > 0)
    for (let turn = 0; turn < 20; turn += 1) await new Promise(resolve => setTimeout(resolve, 0))
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({ kind: 'run-failed', node, failure: JOURNAL_DOWN })
    expect(await shown(assembly)).toMatchObject({ kind: 'occupied', execution: handle.execution })
    const answer = ok(
      await assembly.provider.control.quiesce({
        ...alice,
        operation: operation('quiesce-1'),
        reason: evidence('stop'),
      }),
    )
    expect(answer).toMatchObject({ kind: 'unresolved', remaining: [handle.execution] })
  })
})
