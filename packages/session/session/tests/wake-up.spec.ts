// Machine guard of the WakeUp model (session-contract verification/models/wake-up/WakeUp.tla),
// property S5 for a trigger that arrives while S1 is already judging the session: S1 runs again,
// so the input accepted during the first read still opens the Run. The model's negative control
// "no-again" drops such a trigger and the input waits forever (without a scan).
// The periodic scan that finds a session by its pending inputs is guarded by the startup scan
// case of advance.spec.ts.
import { afterEach, expect, it, vi } from 'vitest'
import type { SessionTransactionPort, WorkSnapshot } from '@omne-harness/session-contract'
import { operationId, ordinaryInput, succeeded } from '@omne-harness/session-contract/testing'
import { memoryBackend } from './fixtures/backends.ts'
import { harness, TENANT_A, type Harness } from './fixtures/harness.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

const read = async (h: Harness): Promise<WorkSnapshot> =>
  succeeded(await h.backend.transactions.readWork(h.access()), 'read')

/** A promise with its resolver. */
function gate() {
  let open: () => void = () => {}
  const promise = new Promise<void>(resolve => {
    open = resolve
  })
  return { promise, open }
}

it('a trigger during an in-flight judgment runs S1 again, and the input accepted meanwhile opens the Run', async () => {
  const h = await harness({ backend: memoryBackend, advance: true })
  open.push(h)
  await h.create()

  // The first read of S1 is held after it has read the session without any input.
  const held = gate()
  const reading = gate()
  let first = true
  const bind = h.dependencies.transactions.bind.bind(h.dependencies.transactions)
  h.dependencies.transactions.bind = checked => {
    const view = bind(checked)
    const readWork: SessionTransactionPort<string>['readWork'] = async input => {
      const answer = await view.readWork(input)
      if (first) {
        first = false
        reading.open()
        await held.promise
      }
      return answer
    }
    return { ...view, readWork }
  }

  const notice = async () => {
    const now = await read(h)
    h.instance.committed({
      tenant: TENANT_A,
      session: h.access().session,
      revision: now.revision,
      source: now.source,
      kinds: ['intake.routed'],
    })
  }
  // Wake S1 while nothing is pending; it reads and is held.
  await notice()
  await reading.promise
  // Meanwhile an input is accepted through the public port and its notice arrives.
  succeeded(
    await h.backend.transactions.commit({
      access: h.access(),
      command: {
        kind: 'accept',
        input: {
          tenant: h.access().tenant,
          session: h.access().session,
          operation: operationId('accept-input-1'),
          value: ordinaryInput('input-1'),
        },
      },
      guards: [],
    }),
    'accept input-1',
  )
  await notice()
  // The held read answers the old snapshot: nothing to start. Only the second run of S1 sees it.
  held.open()
  await vi.waitFor(async () => {
    expect((await read(h)).handed).toEqual(['input-1'])
  })
})
