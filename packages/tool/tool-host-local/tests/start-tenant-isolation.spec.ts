import type { ContentBlock } from '@omne-harness/content-block'
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

it('lets tenant B commit while A is blocked in its read and keeps A consume behind invalidation', async () => {
  const memory = createMemoryToolLedgerStore<ContentBlock>()
  const entered = barrier()
  const resume = barrier()
  let block = false
  const store: ToolLedgerStore<ContentBlock> = {
    durability: 'none',
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
  expect(await invalidated).toHaveProperty('ok')
  expect(await consumed).toMatchObject({ ok: { kind: 'rejected' } })
})

it('an earlier completed tail does not remove its blocked successor from the tenant queue', async () => {
  const memory = createMemoryToolLedgerStore<ContentBlock>()
  const first = barrier()
  const second = barrier()
  const firstEntered = barrier()
  const secondEntered = barrier()
  let reads = 0
  const store: ToolLedgerStore<ContentBlock> = {
    durability: 'none',
    read: async domain => {
      reads += 1
      if (reads === 1) {
        firstEntered.open()
        await first.wait
      } else if (reads === 2) {
        secondEntered.open()
        await second.wait
      }
      return memory.read(domain)
    },
    commit: input => memory.commit(input),
  }
  const authority = coordinator(store)
  const prepare = (call: string) =>
    authority.prepare({ ...callAccess(call), start: startOf(call), request: request() })
  const one = prepare('one')
  await firstEntered.wait
  const two = prepare('two')
  first.open()
  expect(await one).toHaveProperty('ok')
  await secondEntered.wait
  const three = prepare('three')
  // Flush qualification and queue microtasks without allowing the blocked store to return.
  await new Promise<void>(resolve => setImmediate(resolve))
  expect(reads).toBe(2)
  second.open()
  expect(await two).toHaveProperty('ok')
  expect(await three).toHaveProperty('ok')
  expect(reads).toBe(3)
})
