import { afterEach, expect, it } from 'vitest'
import { standingReservationId } from '@omne-harness/identity'
import { standingCustodySchema } from '../src/standing-schema.ts'
import { command, binding, execution, openOperations, scope } from './operation-world.ts'
import type { AcceptOperation } from '../src/operation-schema.ts'

const worlds: Awaited<ReturnType<typeof openOperations>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})
async function open() {
  const w = await openOperations()
  worlds.push(w)
  await w.call({ kind: 'bootstrap', input: { scope, epoch: 'first', previousEpoch: null } })
  return w
}
async function plan(w: Awaited<ReturnType<typeof openOperations>>, input: AcceptOperation) {
  await w.call({ kind: 'accept', input })
  return standingCustodySchema.parse(
    await w.call({
      kind: 'standing-prepare',
      input: { operation: binding(input), destination: 'governance', required: [] },
    }),
  )
}
it('recovers the persisted request after database reopen and never revives a sealed original', async () => {
  let w = await open()
  const input = command(),
    custody = await plan(w, input)
  const reservation = { ...custody.request, id: custody.reservationId }
  worlds.splice(worlds.indexOf(w), 1)
  await w.close(false)
  w = await openOperations(w.root)
  worlds.push(w)
  expect(await w.call({ kind: 'standing-read', binding: binding(input) })).toEqual(custody)
  expect(
    await w.call({
      kind: 'standing-seal',
      reservation,
      route: { destination: 'governance', transactionDomain: input.transactionDomain },
    }),
  ).toMatchObject({ kind: 'terminal', outcome: 'aborted' })
  expect(
    await w.call({ kind: 'standing-held', binding: binding(input), reservation }),
  ).toMatchObject({ kind: 'held' })
  expect(
    await w.call({ kind: 'standing-apply', binding: binding(input), execution }),
  ).toMatchObject({ record: { state: 'aborted' } })
  expect(
    await w.call({
      kind: 'standing-settled',
      binding: binding(input),
      reservation,
      outcome: 'aborted',
    }),
  ).toMatchObject({ kind: 'settled' })
  worlds.splice(worlds.indexOf(w), 1)
  await w.close(false)
  w = await openOperations(w.root)
  worlds.push(w)
  expect(
    await w.call({ kind: 'standing-held', binding: binding(input), reservation }),
  ).toMatchObject({ kind: 'settled', outcome: 'aborted' })
})
it('separates command families, principals and full scopes despite equal caller operation ids', async () => {
  const w = await open(),
    first = command()
  const otherScope = { ...scope, logicalServiceId: 'second' }
  await w.call({
    kind: 'bootstrap',
    input: { scope: otherScope, epoch: 'first', previousEpoch: null },
  })
  const alternate = command()
  if (alternate.request.owner !== 'contribute') throw new Error('fixture command')
  alternate.request.command.scope = otherScope
  const withdrawal: AcceptOperation = {
    ...first,
    request: {
      owner: 'withdraw',
      command: {
        operationId: 'one',
        contribution: { scope, contributorId: 'example', generation: 'one', registrationId: 'one' },
      },
    },
  }
  const inputs = [first, alternate, withdrawal, { ...first, principalRef: 'bob' }]
  const ids = new Set<string>()
  for (const input of inputs) ids.add((await plan(w, input)).request.binding.operationId)
  expect(ids.size).toBe(inputs.length)
})
it('does not authorize a request that was never accepted or plan a new reservation after submission', async () => {
  const w = await open(),
    input = command()
  const planned = {
    kind: 'standing-prepare',
    input: { operation: binding(input), destination: 'governance', required: [] },
  }
  expect(await w.call(planned)).toEqual({ kind: 'absent' })
  await w.call({ kind: 'accept', input })
  await w.call({ kind: 'submit', binding: binding(input), execution })
  expect(await w.call(planned)).toEqual({ kind: 'conflict', reason: 'operation' })
  expect(await w.call({ kind: 'standing-read', binding: binding(input) })).toEqual({
    kind: 'unplanned',
  })
})
it('canonicalizes qualification sets while rejecting changed qualification meaning', async () => {
  const w = await open(),
    input = command()
  await w.call({ kind: 'accept', input })
  const required = [
    'organization-settings-manage',
    'organization-cost-ledger-read',
    'organization-settings-manage',
  ] as const
  const planned = { operation: binding(input), destination: 'governance', required }
  const custody = standingCustodySchema.parse(
    await w.call({ kind: 'standing-prepare', input: planned }),
  )
  expect(
    await w.call({
      kind: 'standing-prepare',
      input: { ...planned, required: [...required].reverse() },
    }),
  ).toEqual(custody)
  const reservation = {
    binding: custody.request.binding,
    required,
    id: standingReservationId(custody.request.binding, required),
  }
  expect(
    await w.call({ kind: 'standing-held', binding: binding(input), reservation }),
  ).toMatchObject({
    kind: 'held',
    reservation: { required: ['organization-cost-ledger-read', 'organization-settings-manage'] },
  })
  expect(
    await w.call({
      kind: 'standing-seal',
      reservation,
      route: { destination: 'governance', transactionDomain: input.transactionDomain },
    }),
  ).toMatchObject({ kind: 'terminal', outcome: 'aborted' })
})
