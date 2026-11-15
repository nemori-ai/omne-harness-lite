import { afterEach, expect, it } from 'vitest'
import { readSettingsSource } from '../src/index.ts'
import { openSourceServiceWorld, source } from './source-service-world.ts'
import { sourceRequest } from './source-retention-world.ts'

const close: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const fn of close.splice(0).reverse()) await fn()
})

async function world() {
  const w = await openSourceServiceWorld({
    async seal(request) {
      return { kind: 'terminal', request, outcome: 'aborted' }
    },
  })
  close.push(() => w.close())
  return w
}

it('reads the current source before and after a committed change, without a reservation', async () => {
  const w = await world()
  expect(await readSettingsSource(w.storage, source)).toMatchObject({
    kind: 'captured',
    snapshot: { source, presence: 'absent', state: { revision: 0 } },
  })
  expect(await w.set()).toMatchObject({ kind: 'committed', revision: 1 })
  const read = await readSettingsSource(w.storage, source)
  expect(read).toMatchObject({
    kind: 'captured',
    snapshot: { source, presence: 'present', state: { revision: 1 } },
  })
  expect(await w.set(false, 1, 'set-again')).toMatchObject({ kind: 'committed', revision: 2 })
})

it('gives the same snapshot that a reservation captures', async () => {
  const w = await world()
  await w.set()
  const read = await readSettingsSource(w.storage, source)
  const request = { ...sourceRequest(), source }
  const held = await w.sources.service.reserve(request.destination.identity.principalRef, request)
  if (read.kind !== 'captured' || held.kind !== 'held') throw new Error('fixture')
  expect(read.snapshot).toEqual(held.snapshot)
  await w.sources.service.settle(request)
})

it('answers forbidden for a target that the domain does not hold, and unsupported for a governed target', async () => {
  const w = await world()
  expect(
    await readSettingsSource(w.storage, {
      ...source,
      target: { ...source.target, targetRef: 'missing-target' },
    }),
  ).toEqual({ kind: 'unavailable', reason: 'forbidden' })
  expect(
    await readSettingsSource(w.storage, {
      ...source,
      target: { ...source.target, policyId: 'asset' },
    }),
  ).toEqual({ kind: 'unavailable', reason: 'unsupported' })
})

it('answers unreadable when the storage gives no answer or a malformed one', async () => {
  const unavailable = {
    read: async () =>
      ({ kind: 'unavailable', requestKey: 'k', reason: 'closing', diagnostic: {} }) as never,
  }
  expect(await readSettingsSource(unavailable, source)).toEqual({ kind: 'unreadable' })
  const malformed = {
    read: async () => ({ kind: 'read', requestKey: 'k', output: { kind: 'captured' } }) as never,
  }
  expect(await readSettingsSource(malformed, source)).toEqual({ kind: 'unreadable' })
})
