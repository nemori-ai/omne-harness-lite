import { capture, held } from './permission-capture-world.ts'
import { randomUUID } from 'node:crypto'
import { afterEach, expect, it } from 'vitest'
import { acceptSchema, type AcceptOperation } from '../src/operation-schema.ts'
import { sourceCustodySchema } from '../src/source-custody.ts'
import { recoveryPageSchema, RECOVERY_HANDLER } from '../src/recovery-read.ts'
import { scope, binding, openOperations } from './operation-world.ts'

it('accepts a permission capture while preserving the original action and exact source plan', () => {
  const request = capture()
  expect(acceptSchema.parse(request)).toEqual(request)
})

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
async function requested(w: Awaited<ReturnType<typeof openOperations>>, input = capture()) {
  await w.call({ kind: 'accept', input })
  const custody = sourceCustodySchema.parse(
    await w.call({ kind: 'source-read', binding: binding(input) }),
  )
  if (custody.kind !== 'requested') throw new Error('Expected the accepted source request')
  return custody.request
}
async function pending(w: Awaited<ReturnType<typeof openOperations>>) {
  const result = await w.storage.read({
    domain: w.domain,
    ...RECOVERY_HANDLER,
    requestKey: randomUUID(),
    input: { scope, after: null, limit: 64 },
  })
  if (result.kind !== 'read') throw new Error(JSON.stringify(result))
  return recoveryPageSchema.parse(result.output).items.map(item => item.key.operationId)
}

it('keeps the source obligation across reopen and abort until the exact source is settled', async () => {
  let w = await open()
  const input = capture(),
    operation = binding(input)
  const request = await requested(w, input)
  expect(request.destination).toMatchObject({
    ownerRef: 'governance',
    attemptId: 'permission-read-1',
    commandDigest: operation.requestDigest,
    identity: {
      principalRef: 'alice',
      operation: { protocol: 'governance-permission-capture/1', binding: operation },
    },
  })
  await w.call({ kind: 'seal', binding: operation })
  expect(await pending(w)).toEqual(['permission-read-1'])
  worlds.splice(worlds.indexOf(w), 1)
  await w.close(false)
  w = await openOperations(w.root)
  worlds.push(w)
  expect(await w.call({ kind: 'source-read', binding: operation })).toEqual({
    kind: 'requested',
    request,
  })
  const receipt = held(request)
  expect(await w.call({ kind: 'source-record', binding: operation, receipt })).toEqual(receipt)
  expect(await w.call({ kind: 'read', ref: operation.ref })).toMatchObject({
    record: { state: 'aborted' },
  })
  const terminal = {
    kind: 'settled',
    reservationId: receipt.reservationId,
    request,
    outcome: 'aborted',
  }
  expect(await w.call({ kind: 'source-record', binding: operation, receipt: terminal })).toEqual(
    terminal,
  )
  expect(await pending(w)).toEqual([])
  expect(await w.call({ kind: 'source-record', binding: operation, receipt })).toEqual(terminal)
})

it('rejects substituted routes, changed snapshots and settlement before the original terminal', async () => {
  const w = await open(),
    input = capture(),
    operation = binding(input)
  const request = await requested(w, input),
    receipt = held(request)
  const changed = held({
    ...request,
    destination: { ...request.destination, route: 'other-route' },
  })
  expect(
    await w.call({ kind: 'source-record', binding: operation, receipt: changed }),
  ).toMatchObject({ kind: 'conflict' })
  expect(
    await w.call({
      kind: 'source-record',
      binding: operation,
      receipt: {
        kind: 'settled',
        request,
        reservationId: receipt.reservationId,
        outcome: 'aborted',
      },
    }),
  ).toMatchObject({ kind: 'conflict' })
  expect(await w.call({ kind: 'source-record', binding: operation, receipt })).toEqual(receipt)
  if (receipt.kind !== 'held') throw new Error('Expected held fixture')
  expect(
    await w.call({
      kind: 'source-record',
      binding: operation,
      receipt: {
        ...receipt,
        snapshot: {
          ...receipt.snapshot,
          projection: { ...receipt.snapshot.projection, ownerRevision: 2 },
        },
      },
    }),
  ).toMatchObject({ kind: 'conflict' })
  expect(
    await w.call({ kind: 'source-read', binding: { ...operation, requestDigest: 'b'.repeat(64) } }),
  ).toMatchObject({ kind: 'conflict' })
})

it('settles a requested source after abort without requiring a held receipt to have arrived', async () => {
  const w = await open(),
    input = capture(),
    operation = binding(input)
  const request = await requested(w, input),
    receipt = held(request)
  await w.call({ kind: 'seal', binding: operation })
  const settled = {
    kind: 'settled',
    request,
    reservationId: receipt.reservationId,
    outcome: 'aborted',
  }
  expect(await w.call({ kind: 'source-record', binding: operation, receipt: settled })).toEqual(
    settled,
  )
  expect(await pending(w)).toEqual([])
})

it('separates fresh reads of the same action and does not invent custody for an explicit null plan', async () => {
  const w = await open(),
    input = capture()
  const first = await requested(w, input)
  const next = {
    ...input,
    request: {
      ...input.request,
      command: { ...input.request.command, operationId: 'permission-read-2' },
    },
  }
  const second = await requested(w, next)
  expect(first.destination.identity).not.toEqual(second.destination.identity)
  const absent: AcceptOperation = {
    ...input,
    request: {
      ...input.request,
      command: { ...input.request.command, operationId: 'permission-read-3', source: null },
    },
  }
  await w.call({ kind: 'accept', input: absent })
  expect(await w.call({ kind: 'source-read', binding: binding(absent) })).toEqual({
    kind: 'not-required',
  })
  expect(
    await w.call({ kind: 'source-record', binding: binding(absent), receipt: held(first) }),
  ).toMatchObject({ kind: 'conflict' })
  await w.call({ kind: 'seal', binding: binding(absent) })
  expect(await pending(w)).toEqual(['permission-read-1', 'permission-read-2'])
})
