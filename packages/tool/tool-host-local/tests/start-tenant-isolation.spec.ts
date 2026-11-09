import type { ToolLedgerStore } from '@omne-harness/tool'
import { createMemoryToolLedgerStore } from '@omne-harness/tool/testing'
import { expect, it } from 'vitest'
import {
  callAccess,
  callId,
  coordinator,
  evidence,
  operationId,
  permission,
  principalB,
  request,
  startOf,
  tenantA,
  tenantB,
} from './coordinator-values.ts'

function barrier() {
  let open = () => {}
  const wait = new Promise<void>(resolve => {
    open = resolve
  })
  return { wait, open }
}

it('lets tenant B commit while A is blocked in its read, and decides A by commit order', async () => {
  const memory = createMemoryToolLedgerStore()
  const entered = barrier()
  const resume = barrier()
  let block = false
  const store: ToolLedgerStore = {
    durability: 'none',
    readRecord: (domain, key) => memory.readRecord(domain, key),
    read: async domain => {
      if (block && domain.tenant.account.text === tenantA.account.text) {
        block = false
        entered.open()
        await resume.wait
      }
      return memory.read(domain)
    },
    commit: input => memory.commit(input),
  }
  const authority = coordinator(store)
  const prepared = await authority.prepare({
    ...callAccess('a'),
    start: startOf('a'),
    request: request(),
  })
  if ('failure' in prepared) throw new Error('fixture prepare failed')
  block = true
  const invalidated = authority.invalidate({
    ...callAccess('a'),
    operation: operationId('invalidate-a'),
    guard: { ...permission, revision: '0', evidence: evidence('g'), scope: { kind: 'resource' } },
  })
  await entered.wait
  const consumed = authority.consume({
    ...callAccess('a'),
    permit: prepared.ok,
    executorReceipt: evidence('a'),
  })
  try {
    expect(
      await authority.prepare({
        principal: principalB,
        tenant: tenantB,
        call: callId('b'),
        start: startOf('b', tenantB),
        request: request(),
      }),
    ).toHaveProperty('ok')
  } finally {
    resume.open()
  }
  // The invalidation was suspended before its read, so the acceptance committed first and the
  // invalidation landed after it; the accepted start stays in flight (P04: only an invalidation
  // that holds first forbids the start).
  expect(await invalidated).toHaveProperty('ok')
  expect(await consumed).toMatchObject({ ok: { kind: 'started' } })
  expect(await authority.inspect({ ...callAccess('a'), start: startOf('a') })).toMatchObject({
    ok: { kind: 'started' },
  })
})

it('an earlier completed tail does not remove its blocked successor from the queue of its domain', async () => {
  const memory = createMemoryToolLedgerStore()
  const first = barrier()
  const second = barrier()
  const firstEntered = barrier()
  const secondEntered = barrier()
  let reads = 0
  const store: ToolLedgerStore = {
    durability: 'none',
    readRecord: (domain, key) => memory.readRecord(domain, key),
    read: async domain => {
      reads += 1
      if (reads === 1) {
        firstEntered.open()
        await first.wait
      } else if (reads === 3) {
        secondEntered.open()
        await second.wait
      }
      return memory.read(domain)
    },
    commit: input => memory.commit(input),
  }
  const authority = coordinator(store)
  // The queue is per written domain: three prepares of one call share the call's domain. Each
  // prepare reads that domain and then the guard domain, two reads per turn.
  const prepare = () =>
    authority.prepare({ ...callAccess('one'), start: startOf('one'), request: request() })
  const one = prepare()
  await firstEntered.wait
  const two = prepare()
  first.open()
  expect(await one).toHaveProperty('ok')
  await secondEntered.wait
  const three = prepare()
  // Flush qualification and queue microtasks without allowing the blocked store to return.
  await new Promise<void>(resolve => setImmediate(resolve))
  expect(reads).toBe(3)
  second.open()
  expect(await two).toHaveProperty('ok')
  expect(await three).toHaveProperty('ok')
  expect(reads).toBe(6)
})
