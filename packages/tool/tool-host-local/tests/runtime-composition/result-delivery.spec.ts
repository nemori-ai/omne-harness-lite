import { expect, it } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolDelivery } from '@omne-harness/tool-contract'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'
import { evidence } from '../coordinator-values.ts'
import { accepted, fixture, unbox } from './fixture.ts'

it(
  'delivers an offloaded result with its committed body identity and retention',
  { timeout: 15_000 },
  async () => {
    const world = await fixture(async () => 'offloaded-output '.repeat(5000))
    try {
      const reference = accepted(await world.api.invoke(world.invocation('offloaded-delivery')))
      await world.settled(reference)
      await expect.poll(() => world.deliveries.length, { timeout: 1000 }).toBe(1)
      expect(world.deliveries[0]).toMatchObject({
        kind: 'result',
        value: {
          original: {
            kind: 'offloaded',
            bodyId: expect.any(String),
            retention: { activatedAt: expect.any(String), expiresAt: expect.any(String) },
          },
        },
      })
    } finally {
      await world.close()
    }
  },
)

it('retains the planned final in author recovery, with its first screen and no body bytes', async () => {
  const world = await fixture()
  try {
    const reference = accepted(await world.api.invoke(world.invocation('sealed-final')))
    const delivered = await world.settled(reference)
    expect(delivered.terminal.kind).toBe('completed')
    const recovered = await world.authorLookup(reference)
    expect(recovered.kind).toBe('settled')
    if (recovered.kind !== 'settled') throw new Error('Missing author final')
    expect(recovered.fact).not.toHaveProperty('envelope')
    expect(recovered.fact).toMatchObject({
      kind: 'final',
      terminal: { kind: 'completed' },
      result: { original: { kind: 'none' } },
    })
    await expect
      .poll(async () => {
        const found = unbox(await world.api.queries.lookup(world.query(reference)))
        return found.kind === 'found' ? found.state.delivery?.kind : found.kind
      })
      .toBe('released')
    expect(world.launches()).toBe(1)
  } finally {
    await world.close()
  }
})

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
