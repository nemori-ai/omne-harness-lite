import { describe, expect, it } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import { controlAssembly } from './fixtures/control-assembly.ts'
import { deliverToolSuggestion } from './fixtures/tool-call.ts'
import { evidence, loadWithEntries, ok, operation } from './journal-support.ts'
import { alice, eventually, invoke } from './loop-support.ts'

// A live execution with a Model call out is cancelled: its finish cannot be judged allowed until the call comes back.
async function cancelledWhileOut(changedAt: number | null = null) {
  let asked = 0
  const assembly = await controlAssembly({}, d => ({
    ...d,
    journal: {
      ...d.journal,
      tryFinish(input) {
        asked += 1
        return asked === changedAt
          ? Promise.resolve(succeed({ kind: 'changed' as const, revision: input.expected }))
          : d.journal.tryFinish(input)
      },
    },
  }))
  const handle = ok(await invoke(assembly))
  const input = { ...alice, execution: handle.execution }
  const load = () => loadWithEntries(assembly.dependencies, input)
  await eventually(async () => {
    const snapshot = await load()
    return (
      snapshot.state.kind === 'waiting' && snapshot.checkpoint.calls.some(c => c.kind === 'model')
    )
  })
  ok(
    await handle.control.control({
      ...input,
      operation: operation('cancel-issued'),
      command: { kind: 'cancel', reason: evidence('cancel-issued') },
    }),
  )
  const read = async () => {
    const snapshot = await load()
    return {
      state: snapshot.state.kind,
      revision: snapshot.revision,
      judgments: snapshot.settlement.judgments.length,
    }
  }
  // The state once the execution has asked to finish `times` times; the clock is moved to its check time while it waits.
  const asking = async (times: number) => {
    await eventually(async () => {
      if (asked >= times) return true
      const due = assembly.controls.clock.pending()[0]
      if (due !== undefined) ok(assembly.controls.clock.advanceTo(due))
      return false
    })
    return read()
  }
  return { assembly, asking, read }
}

describe('a cancelled execution whose finish stays refused', () => {
  it('writes nothing more once it has judged what its own obligations added, and ends when the call is back', async () => {
    const { assembly, asking, read } = await cancelledWhileOut()
    const first = await asking(1)
    expect(first.state).toBe('settling')
    const second = await asking(2)
    expect(second.judgments).toBe(first.judgments + 1)
    expect([await asking(3), await asking(4), await asking(5)]).toEqual([second, second, second])
    await deliverToolSuggestion(assembly)
    await eventually(async () => (await read()).state === 'ended')
  })

  it('judges again at once after a finish that answers its basis changed, once more for the obligations issued again, then is quiet', async () => {
    const { asking } = await cancelledWhileOut(3)
    const second = await asking(2)
    const fourth = await asking(4)
    expect(fourth.judgments).toBe(second.judgments + 1)
    const fifth = await asking(5)
    expect(fifth.judgments).toBe(second.judgments + 2)
    expect([await asking(6), await asking(7)]).toEqual([fifth, fifth])
  })
})
