import { expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolDelivery } from '@omne-harness/tool-contract'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'
import { evidence } from '../coordinator-values.ts'
import { accepted, fixture, unbox } from './fixture.ts'

it('C04 retries the same payload and only releases after saved matches its original key and owner', async () => {
  const payloads: ToolDelivery<ToolMessageContentBlock>[] = []
  let save = false
  const world = await fixture(undefined, {
    push: async ({ delivery }) => {
      payloads.push(structuredClone(delivery))
      return save
        ? succeed({
            key: delivery.key,
            evidence: { ...evidence('saved'), owner: delivery.consumer.owner },
          })
        : fail({ kind: 'outcome-unknown' })
    },
  })
  try {
    const reference = accepted(await world.api.invoke(world.invocation('delivery')))
    await world.settled(reference)
    await expect.poll(() => payloads.length).toBeGreaterThan(1)
    expect(payloads[1]).toEqual(payloads[0])
    const pending = unbox(await world.api.queries.lookup(world.query(reference)))
    expect(pending).toMatchObject({ kind: 'found', state: { delivery: { kind: 'pending' } } })
    save = true
    await expect
      .poll(async () => {
        const read = unbox(await world.api.queries.lookup(world.query(reference)))
        return read.kind === 'found' ? read.state.delivery?.kind : null
      })
      .toBe('released')
    expect(world.launches()).toBe(1)
  } finally {
    await world.close()
  }
})

it('a slow receiver does not stop another call from executing or settling', async () => {
  const world = await fixture(undefined, {
    push: ({ signal }) =>
      new Promise(resolve =>
        signal.addEventListener('abort', () => resolve(fail({ kind: 'outcome-unknown' })), {
          once: true,
        }),
      ),
  })
  try {
    const a = accepted(await world.api.invoke(world.invocation('slow')))
    await world.settled(a)
    const b = accepted(await world.api.invoke(world.invocation('other')))
    expect((await world.settled(b)).terminal.kind).toBe('completed')
    expect(world.launches()).toBe(2)
  } finally {
    await world.close()
  }
})
