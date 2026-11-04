// R2-D292, R2-D294: the checkpoint keeps only facts that cannot be computed again. Its serialized
// bytes at the same node do not grow with the rounds of an execution, even when the request of
// each round grows with the history, as a real one does. A Model calls the same tool at every
// step; the scripted preparation puts one more history message into each round's request.
import { describe, expect, it } from 'vitest'
import { agentEvaluator } from '@omne-harness/agent'
import type { AgentCheckpoint, JournalCommit } from '@omne-harness/agent-contract'
import { succeed } from '@omne-harness/operation-result'
import {
  decodeToolCallId,
  decodeToolOperationId,
  encodeToolInvocationRef,
  type ToolState,
} from '@omne-harness/tool-contract'
import { readyPreparation } from '@omne-harness/agent/testing'
import { message, ok, type Principal } from './journal-support.ts'
import { alice, commitNodeOf, eventually, invoke } from './loop-support.ts'
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

const ROUNDS = 20
/** The history text one round adds to the request: far more than any digit of a step or revision. */
const ROUND_TEXT = 'x'.repeat(200)

/** The serialized checkpoint bytes of the M0 commit of each step, by step ordinal. */
async function measured(): Promise<Map<number, number>> {
  const bytes = new Map<number, number>()
  const assembly: Assembly = await toolAssembly({ maxRunSteps: ROUNDS + 1 })
  const commit = assembly.dependencies.journal.commit
  assembly.dependencies.journal.commit = (input: JournalCommit<Principal>) => {
    if (commitNodeOf(input.operation) === 'M0') {
      const step = Number(/^step-(\d+)$/u.exec(input.checkpoint.step)?.[1])
      bytes.set(step, sizeOf(input.checkpoint))
    }
    return commit(input)
  }
  // The request of step k carries k history messages, as a request over a growing history does.
  assembly.controls.requests.prepare.always(input => {
    const { request, capacity, ...common } = readyPreparation(input)
    const step = Number(/^step-(\d+)\//u.exec(input.action)?.[1] ?? 0)
    const messages = Array.from({ length: step }, (_, k) => message(`${ROUND_TEXT}${k}`))
    const grown = { ...request, messages }
    if (input.previous !== null)
      return succeed({ ...common, kind: 'ready', request: grown, capacity })
    const { system, tools, toolChoice, parameters, representation, source } = grown
    return succeed({
      ...common,
      kind: 'assembled',
      input: { system, messages, tools, toolChoice, parameters, representation, source },
    })
  })
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
  for (let k = 1; k <= ROUNDS; k += 1) {
    await deliverModelReply(assembly, [toolCall(`tool-call-${k}`, 'read_file')], `tools-${k}`)
    const [pending] = await associatedTools(assembly, 1)
    if (pending === undefined) throw new Error(`no associated Tool call at step ${k}`)
    ok(await pushToolResult(toolReceiver(assembly), toolDelivery(pending, { name: `r${k}` })))
  }
  await eventually(async () => bytes.has(ROUNDS + 1))
  await deliverModelReply(assembly, [textBlock('done', 'blk_done')], 'final')
  return bytes
}

/** The bytes of the checkpoint as the evaluator encodes it for the Journal. */
function sizeOf(checkpoint: AgentCheckpoint): number {
  return Buffer.byteLength(JSON.stringify(agentEvaluator.encode(checkpoint).value))
}

describe('R2-D292: the checkpoint does not grow with the rounds', () => {
  it(`the M0 checkpoint of round ${ROUNDS} is no larger than that of round 5 beyond the digits of its counters`, async () => {
    const bytes = await measured()
    const early = bytes.get(5)
    const late = bytes.get(ROUNDS)
    if (early === undefined || late === undefined) throw new Error('rounds not measured')
    // Step ordinals and revisions gain a digit or two; one round of history is 200 bytes.
    expect(late - early).toBeLessThanOrEqual(64)
    // Every later round stays within the same bound of round 5.
    for (let k = 6; k <= ROUNDS; k += 1)
      expect((bytes.get(k) ?? 0) - early, `round ${k}`).toBeLessThanOrEqual(64)
  }, 120_000)
})
