import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createToolBodyScope } from '@omne-harness/tool'
import { admitCall, auditQueues, startHarness } from './start-values.ts'
import {
  callId,
  configuration,
  evidence,
  ok,
  principalA,
  tenantA,
  testSettlementPorts,
} from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

async function fixture(localLimits = configuration()) {
  const h = startHarness()
  await admitCall(h, 'body-scope')
  await h.drive('body-scope')
  const access = { principal: principalA, tenant: tenantA, call: callId('body-scope') }
  const recovery = ok(await h.commands.loadRecovery(access))
  const definition = recovery.request.availability.definition
  if (
    recovery.start === null ||
    definition.kind !== 'function' ||
    definition.returns.body.kind !== 'text'
  )
    throw new Error('text start required')
  const signal = new AbortController()
  const binding = { ...access, start: recovery.start, source: evidence('body-scope') }
  const scope = createToolBodyScope({
    binding,
    writes: h.ledger.bodyWrites,
    signal: signal.signal,
    limits: localLimits,
  })
  return {
    h,
    scope,
    signal,
    binding,
    representation: definition.returns.body,
    store: testSettlementPorts(h.memory).materials.store,
  }
}

it('waits for unawaited ordered writes before returning and closes new admission synchronously', async () => {
  const f = await fixture()
  ok(await f.scope.writer.begin('answer', f.representation))
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const write = f.store.write.bind(f.store)
  vi.spyOn(f.store, 'write').mockImplementationOnce(async input => {
    entered.resolve()
    await release.promise
    return write(input)
  })
  const append = f.scope.writer.append('answer', '1', {
    kind: 'text',
    block: 'one',
    text: '正文🙂',
    end: true,
  })
  const seal = f.scope.writer.seal('answer', '1')
  const closing = f.scope.finish('returned')
  let closed = false
  void closing.then(() => {
    closed = true
  })
  try {
    await entered.promise
    expect(closed).toBe(false)
    expect(await f.scope.writer.begin('late', f.representation)).toHaveProperty(
      'failure.kind',
      'closed',
    )
    expect(f.scope.finish('returned')).toBe(closing)
  } finally {
    release.resolve()
  }
  ok(await append)
  const body = ok(await seal)
  expect(body.bodyBytes).toBe('10')
  expect(await closing).toEqual({ ok: undefined })
  expect(ok(await f.scope.writer.inspect('answer'))).toEqual({ kind: 'sealed', body })
})

it('hands failed execution to the durable close fence while material IO is still pending', async () => {
  const f = await fixture()
  ok(await f.scope.writer.begin('answer', f.representation))
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const write = f.store.write.bind(f.store)
  vi.spyOn(f.store, 'write').mockImplementationOnce(async input => {
    entered.resolve()
    await release.promise
    return write(input)
  })
  const append = f.scope.writer.append('answer', '1', {
    kind: 'text',
    block: 'one',
    text: 'pending',
    end: true,
  })
  const queued = f.scope.writer.seal('answer', '1')
  await entered.promise
  const close = vi.spyOn(f.h.ledger.bodyWrites, 'close')
  try {
    const closing = f.scope.finish('failed')
    expect(close).toHaveBeenCalledOnce()
    expect(await closing).toEqual({ ok: undefined })
    expect(f.scope.handoffConfirmed).toBe(true)
    expect(await append).toHaveProperty('failure.kind', 'unknown')
    expect(await queued).toHaveProperty('failure.kind', 'closed')
    expect(ok(await f.h.ledger.bodyWrites.inspect({ ...f.binding, key: 'answer' }))).toMatchObject({
      kind: 'open',
      nextSequence: '2',
      confirmedThrough: '0',
    })
  } finally {
    release.resolve()
    await append
    await queued
  }
})

it('cancels a return barrier through durable handoff without waiting for material IO', async () => {
  const f = await fixture()
  ok(await f.scope.writer.begin('answer', f.representation))
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const write = f.store.write.bind(f.store)
  vi.spyOn(f.store, 'write').mockImplementationOnce(async input => {
    entered.resolve()
    await release.promise
    return write(input)
  })
  const append = f.scope.writer.append('answer', '1', {
    kind: 'text',
    block: 'one',
    text: 'pending',
    end: true,
  })
  await entered.promise
  const close = vi.spyOn(f.h.ledger.bodyWrites, 'close')
  const closing = f.scope.finish('returned')
  f.signal.abort()
  try {
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce(), { timeout: 100 })
    expect(await closing).toHaveProperty('failure.kind', 'cancelled')
    expect(await append).toHaveProperty('failure.kind', 'unknown')
    expect(await f.scope.writer.begin('late', f.representation)).toHaveProperty(
      'failure.kind',
      'cancelled',
    )
  } finally {
    release.resolve()
    await append
    await closing
  }
})

it('keeps an active write owned locally when durable close is unknown', async () => {
  const f = await fixture()
  ok(await f.scope.writer.begin('answer', f.representation))
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const write = f.store.write.bind(f.store)
  vi.spyOn(f.store, 'write').mockImplementationOnce(async input => {
    entered.resolve()
    await release.promise
    return write(input)
  })
  const append = f.scope.writer.append('answer', '1', {
    kind: 'text',
    block: 'one',
    text: 'kept',
    end: true,
  })
  let completed = false
  void append.then(() => {
    completed = true
  })
  await entered.promise
  vi.spyOn(f.h.ledger.bodyWrites, 'close').mockImplementationOnce(async input => ({
    failure: { kind: 'unknown', operation: input.operation, reason: 'close reply lost' },
  }))
  try {
    expect(await f.scope.finish('failed')).toHaveProperty('failure.kind', 'unknown')
    expect(f.scope.handoffConfirmed).toBe(false)
    expect(completed).toBe(false)
    expect(await f.scope.writer.begin('late', f.representation)).toHaveProperty(
      'failure.kind',
      'closed',
    )
  } finally {
    release.resolve()
  }
  ok(await append)
  expect(ok(await f.scope.writer.inspect('answer'))).toMatchObject({
    kind: 'open',
    confirmedThrough: '1',
  })
})

it('refuses a normal return with an unsealed writer', async () => {
  const f = await fixture()
  ok(await f.scope.writer.begin('answer', f.representation))
  expect(await f.scope.finish('returned')).toHaveProperty('failure.kind', 'invalid')
  expect(f.scope.handoffConfirmed).toBe(true)
  expect(await f.scope.finish('failed')).toHaveProperty('failure.kind', 'conflict')
})

it('closes an unused writer locally without requiring custody access', async () => {
  const f = await fixture()
  const close = vi
    .spyOn(f.h.ledger.bodyWrites, 'close')
    .mockImplementation(async () => ({ failure: { kind: 'denied', action: 'write' } }))
  ok(await f.scope.finish('returned'))
  expect(close).not.toHaveBeenCalled()
  expect(f.scope.handoffConfirmed).toBe(true)
  expect(await f.scope.writer.begin('late', f.representation)).toHaveProperty(
    'failure.kind',
    'closed',
  )
})

it('preserves cancellation when it arrives while durable close is confirming', async () => {
  const f = await fixture()
  ok(await f.scope.writer.begin('answer', f.representation))
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const close = f.h.ledger.bodyWrites.close.bind(f.h.ledger.bodyWrites)
  vi.spyOn(f.h.ledger.bodyWrites, 'close').mockImplementationOnce(async input => {
    entered.resolve()
    await release.promise
    return close(input)
  })
  const closing = f.scope.finish('returned')
  await entered.promise
  f.signal.abort()
  release.resolve()
  expect(await closing).toHaveProperty('failure.kind', 'cancelled')
  expect(f.scope.handoffConfirmed).toBe(true)
})

it('bounds the local queue, copies frames, and releases capacity without consuming a rejected sequence', async () => {
  const f = await fixture({ ...configuration(), authorBufferItems: 1 })
  ok(await f.scope.writer.begin('answer', f.representation))
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const write = f.store.write.bind(f.store)
  vi.spyOn(f.store, 'write').mockImplementationOnce(async input => {
    entered.resolve()
    await release.promise
    return write(input)
  })
  const frame = { kind: 'text' as const, block: 'one', text: '原文', end: false }
  const first = f.scope.writer.append('answer', '1', frame)
  frame.text = 'mutated input'
  try {
    await entered.promise
    expect(
      await f.scope.writer.append('answer', '2', {
        kind: 'text',
        block: 'one',
        text: '!',
        end: true,
      }),
    ).toHaveProperty('failure.kind', 'capacity')
  } finally {
    release.resolve()
  }
  ok(await first)
  expect(
    ok(
      await f.scope.writer.append('answer', '2', {
        kind: 'text',
        block: 'one',
        text: '!',
        end: true,
      }),
    ).nextSequence,
  ).toBe('3')
  expect(ok(await f.scope.writer.seal('answer', '2')).bodyBytes).toBe('7')
  ok(await f.scope.finish('returned'))
})
