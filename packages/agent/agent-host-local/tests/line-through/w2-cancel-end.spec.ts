// @module-tag slow
import { afterEach, describe, expect, it } from 'vitest'
import { operationId } from '@omne-harness/session-contract/testing'
import { intakeAccess, ok } from './world.ts'
import { replyText, openW2World, type W2World } from './w2-world.ts'

const worlds: W2World[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})

const gate = () => Promise.withResolvers<void>()

async function openHeld(holds: readonly Promise<void>[]): Promise<W2World> {
  const w = await openW2World({
    reception: 'routed',
    model: a => {
      const hold = holds[a.index]
      if (hold === undefined) throw new Error(`no gate for the Model call ${String(a.index)}`)
      return {
        parts: [replyText(`r${a.index}`, 'arrives after the Run was cancelled')],
        reason: 'stop',
        hold,
      }
    },
  })
  worlds.push(w)
  return w
}

// The execution of the Run a control cancelled, once the model call it waited for is let go.
async function endOf(w: W2World, release: () => void, control: () => Promise<unknown>) {
  const execution = await w.execution()
  await control()
  release()
  const state = async () => ok(await w.journal().load({ ...w.agentAccess, execution })).state
  await w.until(async () => (await state()).kind === 'ended').catch(() => undefined)
  return state()
}

const CANCELLED = { kind: 'ended', conclusion: { kind: 'cancelled' } }

describe('the execution of a Run that Session cancelled ends cancelled', () => {
  it('each Run cancelled by cancel-run ends, the second one of a session like the first', async () => {
    const gates = [gate(), gate()]
    const w = await openHeld(gates.map(item => item.promise))
    await w.createSession('cancel-twice')
    for (const [n, held] of gates.entries()) {
      await w.accept(`in-${String(n)}`, 'hello')
      await w.until(() => w.modelCalls.length === n + 1)
      const { run } = ok(await w.transactions.readWork(intakeAccess))
      if (run.kind !== 'active') throw new Error(`the Run is ${run.kind}`)
      const ended = await endOf(w, held.resolve, async () =>
        ok(
          await w.intake.work.cancelRun({
            ...intakeAccess,
            operation: operationId(`cancel-${String(n)}`),
            run: run.run,
            urgency: 'graceful',
          }),
        ),
      )
      expect(ended, `Run ${String(n + 1)}`).toMatchObject(CANCELLED)
    }
  })

  it('the Run an archive cancels ends too', async () => {
    const held = gate()
    const w = await openHeld([held.promise])
    await w.createSession('archive-active')
    await w.accept('in', 'hello')
    await w.until(() => w.modelCalls.length === 1)
    const ended = await endOf(w, held.resolve, async () =>
      ok(
        await w.intake.work.control({
          ...intakeAccess,
          operation: operationId('archive'),
          intent: { kind: 'archive' },
        }),
      ),
    )
    expect(ended).toMatchObject(CANCELLED)
  })
})
