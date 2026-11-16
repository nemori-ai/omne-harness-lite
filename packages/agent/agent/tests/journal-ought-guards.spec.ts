import { describe, expect, it } from 'vitest'
import { canonical } from '../src/canonical.ts'
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
  toolAssembly,
  toolCall,
  toolDelivery,
  toolReceiver,
} from './fixtures/tool-call.ts'

type Assembly = Awaited<ReturnType<typeof toolAssembly>>

const ROUNDS = 20
const EARLY = 5
const DIGIT_SLACK = 256

const input = { ...alice, execution: execution() }

async function looping() {
  const assembly = await toolAssembly({ maxRunSteps: ROUNDS + 5 })
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

async function toolStep(assembly: Assembly, k: number) {
  await deliverModelReply(assembly, [toolCall(`tool-call-${k}`, 'read_file')], `tools-${k}`)
  const [pending] = await associatedTools(assembly, 1)
  if (pending === undefined) throw new Error(`no associated Tool call at step ${k}`)
  ok(await pushToolResult(toolReceiver(assembly), toolDelivery(pending, { name: `r${k}` })))
  await eventually(async () => {
    const read = ok(await assembly.dependencies.journal.load(input))
    return (
      read.checkpoint.batch === null &&
      read.checkpoint.calls.some(call => call.kind === 'model') &&
      read.state.kind === 'waiting'
    )
  })
}

async function snapshotBytes(assembly: Assembly): Promise<number> {
  return Buffer.byteLength(JSON.stringify(ok(await assembly.dependencies.journal.load(input))))
}

describe('the action state keeps references only, over 20 tool steps', () => {
  it('the bytes load returns after a step do not grow with the number of steps', async () => {
    const assembly = await looping()
    const bytes: number[] = []
    for (let k = 1; k <= ROUNDS; k += 1) {
      await toolStep(assembly, k)
      bytes.push(await snapshotBytes(assembly))
    }
    const early = bytes[EARLY - 1]!
    const late = bytes[ROUNDS - 1]!
    expect(late - early, `snapshot bytes per step: ${bytes.join(', ')}`).toBeLessThanOrEqual(
      DIGIT_SLACK,
    )
  }, 120_000)

  it('every material the execution kept is referred to by a fact of the Journal', async () => {
    const assembly = await looping()
    for (let k = 1; k <= ROUNDS; k += 1) await toolStep(assembly, k)
    const journal = assembly.controls.journal
    const kept = journal.receiving.materialSources(alice, execution())
    const referenced = new Set(
      journal
        .referencedSources({ tenant: alice.tenant, execution: execution() })
        .map(source => canonical(source)),
    )
    const orphans = kept.filter(source => !referenced.has(canonical(source)))
    expect(kept.length).toBeGreaterThanOrEqual(ROUNDS * 3)
    expect(orphans).toEqual([])
  }, 120_000)
})
