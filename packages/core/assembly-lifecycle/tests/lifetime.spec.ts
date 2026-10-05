import { expect, test } from 'vitest'
import { createAssemblyLifetime, type AssemblyLifetime, type OwnedWork } from '../src/index.ts'

const emptyWork = (): OwnedWork => ({ ready: Promise.resolve(), close: async () => {} })

test('the immutable row set has one synchronous control owner', async () => {
  for (const ids of [[], [''], ['a', 'a']]) {
    expect(() => createAssemblyLifetime(ids, () => {})).toThrow()
  }
  const ids = ['dependency', 'consumer']
  const lifetime = createAssemblyLifetime(ids, () => {})
  ids.push('unexpected')
  expect(lifetime.ids).toEqual(['dependency', 'consumer'])
  expect(Object.isFrozen(lifetime.ids)).toBe(true)
  expect(() => lifetime.port('unexpected')).toThrow()
  expect(() => lifetime.port('consumer').register(emptyWork())).toThrow()
  expect(lifetime.isPristine()).toBe(true)
  expect([lifetime.tryClaim(), lifetime.tryClaim()]).toEqual([true, false])
  expect(lifetime.isPristine()).toBe(false)
  expect(lifetime.port('consumer')).toBe(lifetime.port('consumer'))
  await lifetime.close()
  expect(lifetime.tryClaim()).toBe(false)
})

test('stopping is synchronous and a reentrant failing notification cannot undo it', async () => {
  let lifetime: AssemblyLifetime
  let notices = 0
  let inner: Promise<unknown> | undefined
  lifetime = createAssemblyLifetime(['row'], () => {
    notices++
    expect(lifetime.isCurrent()).toBe(false)
    expect(lifetime.port('row').isCurrent()).toBe(false)
    inner = lifetime.close()
    throw new Error('private notification failure')
  })
  lifetime.tryClaim()
  lifetime.port('row').register(emptyWork())
  const closing = lifetime.close()
  expect(closing).toBe(lifetime.closed)
  expect(closing).toBe(inner)
  expect(lifetime.close()).toBe(closing)
  expect(await closing).toEqual({
    complete: false,
    assemblyErrors: ['assembly-stop-failed'],
    rows: [{ id: 'row', result: { kind: 'closed' } }],
  })
  expect(notices).toBe(1)
})

test('actual completion releases each dependency, with no synthetic timeout', async () => {
  const lifetime = createAssemblyLifetime(['first', 'last'], () => {})
  lifetime.tryClaim()
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const order: string[] = []
  const first = lifetime.port('first').register({
    ready: Promise.resolve(),
    async close() {
      order.push('first')
    },
  })
  const last = lifetime.port('last').register({
    ready: Promise.resolve(),
    async close() {
      order.push('last entered')
      entered.resolve()
      await release.promise
      order.push('last finished')
    },
  })
  let finished = false
  void lifetime.closed.then(() => {
    finished = true
  })
  await Promise.resolve()
  expect(finished).toBe(false)
  const closing = lifetime.close()
  await entered.promise
  expect(order).toEqual(['last entered'])
  expect(finished).toBe(false)
  release.resolve()
  const report = await closing
  expect(order).toEqual(['last entered', 'last finished', 'first'])
  expect(report.complete).toBe(true)
  expect(await first.closed).toEqual({ kind: 'closed' })
  expect(await last.closed).toEqual({ kind: 'closed' })
  expect(report.rows.map(row => row.id)).toEqual(['last', 'first'])
  expect(Object.isFrozen(report)).toBe(true)
  expect(Object.isFrozen(report.rows)).toBe(true)
})

test('pending setup retains partial resources and both failure classifications', async () => {
  const lifetime = createAssemblyLifetime(['before', 'partial', 'not-started'], () => {})
  lifetime.tryClaim()
  const ready = Promise.withResolvers<void>()
  const order: string[] = []
  lifetime.port('before').register({
    ready: Promise.resolve(),
    async close() {
      order.push('before')
      throw new Error('private first close')
    },
  })
  const receipt = lifetime.port('partial').register({
    ready: ready.promise,
    async close() {
      order.push('partial')
      throw new Error('private partial close')
    },
  })
  const closing = lifetime.close()
  await Promise.resolve()
  expect(order).toEqual([])
  ready.reject(new Error('private setup'))
  const report = await closing
  expect(report).toEqual({
    complete: false,
    assemblyErrors: [],
    rows: [
      { id: 'partial', result: { kind: 'failed', codes: ['setup', 'close'] } },
      { id: 'before', result: { kind: 'failed', codes: ['close'] } },
    ],
  })
  expect(await receipt.closed).toEqual(report.rows[0]?.result)
  expect(order).toEqual(['partial', 'before'])
  expect(JSON.stringify(report)).not.toContain('private')
})

test('ready rejection is observed and requests whole-generation cleanup', async () => {
  const lifetime = createAssemblyLifetime(['row'], () => {})
  lifetime.tryClaim()
  let closes = 0
  const receipt = lifetime.port('row').register({
    ready: Promise.reject(new Error('setup failed')),
    async close() {
      closes++
    },
  })
  expect(await receipt.closed).toEqual({ kind: 'failed', codes: ['setup'] })
  expect((await lifetime.closed).complete).toBe(false)
  expect(lifetime.isCurrent()).toBe(false)
  expect(closes).toBe(1)
})

test('duplicate registration rejects before any second resource ownership', async () => {
  const lifetime = createAssemblyLifetime(['row'], () => {})
  lifetime.tryClaim()
  let closes = 0
  const work: OwnedWork = {
    ready: Promise.resolve(),
    async close() {
      closes++
    },
  }
  lifetime.port('row').register(work)
  expect(() => lifetime.port('row').register(work)).toThrow()
  expect(lifetime.isCurrent()).toBe(false)
  await lifetime.closed
  expect(() => lifetime.port('row').register(work)).toThrow()
  expect(closes).toBe(1)
})
