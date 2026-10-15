import type { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import {
  startTestAssembly,
  TestAssemblyDisposeFailed,
  TestAssemblyStartFailed,
} from '@omne-harness/kernel-basis/testing'

it('runs an earlier plugin after a later plugin provides its inject', async () => {
  let seen = false
  const assembly = await startTestAssembly([
    {
      name: 'consumer',
      inject: ['clock'],
      apply(ctx: Context) {
        seen = ctx.get('clock') === 'ticking'
      },
    },
    {
      name: 'clock',
      apply(ctx) {
        ctx.provide('clock', 'ticking')
      },
    },
  ])

  expect(seen).toBe(true)
  await assembly.dispose()
})

it('fails startup when a required service is never provided and does not return an assembly', async () => {
  let ran = false
  await expect(
    startTestAssembly([
      {
        name: 'needs-missing',
        inject: ['missing'],
        apply() {
          ran = true
        },
      },
    ]),
  ).rejects.toThrow('Test plugin "needs-missing" did not run apply')
  expect(ran).toBe(false)
})

it('disposes started fibers in reverse order when apply throws', async () => {
  const order: string[] = []
  await expect(
    startTestAssembly([
      {
        name: 'first',
        apply(ctx) {
          ctx.effect(() => () => {
            order.push('first')
          })
        },
      },
      {
        name: 'boom',
        apply() {
          throw new Error('boom')
        },
      },
    ]),
  ).rejects.toThrow('boom')
  expect(order).toEqual(['first'])
})

it('disposes fibers in reverse start order and does not close a caller-owned flag', async () => {
  const order: string[] = []
  const caller = { closed: false }
  const assembly = await startTestAssembly([
    {
      name: 'first',
      apply(ctx) {
        ctx.effect(() => () => {
          order.push('first')
        })
      },
    },
    {
      name: 'second',
      apply(ctx) {
        ctx.provide('caller', caller)
        ctx.effect(() => () => {
          order.push('second')
        })
      },
    },
  ])

  expect(assembly.context.get('caller')).toBe(caller)
  await assembly.dispose()
  expect(order).toEqual(['second', 'first'])
  expect(caller.closed).toBe(false)
})

it('keeps disposing after one fiber dispose rejects', async () => {
  const order: string[] = []
  const assembly = await startTestAssembly([
    {
      name: 'first',
      apply(ctx) {
        ctx.effect(() => () => {
          order.push('first')
        })
      },
    },
    {
      name: 'second',
      apply(ctx) {
        const fiber = ctx.fiber as unknown as { dispose: () => Promise<void> }
        const original = fiber.dispose
        fiber.dispose = async () => {
          await original.call(fiber)
          throw new Error('second-dispose')
        }
        ctx.effect(() => () => {
          order.push('second')
        })
      },
    },
  ])

  await expect(assembly.dispose()).rejects.toBeInstanceOf(TestAssemblyDisposeFailed)
  expect(order).toEqual(['second', 'first'])
})

it('collects a dispose rejection when startup fails', async () => {
  await expect(
    startTestAssembly([
      {
        name: 'first',
        apply(ctx) {
          const fiber = ctx.fiber as unknown as { dispose: () => Promise<void> }
          const original = fiber.dispose
          fiber.dispose = async () => {
            await original.call(fiber)
            throw new Error('dispose-boom')
          }
        },
      },
      {
        name: 'boom',
        apply() {
          throw new Error('start-boom')
        },
      },
    ]),
  ).rejects.toMatchObject({
    name: 'TestAssemblyStartFailed',
    startError: expect.objectContaining({ message: 'start-boom' }) as unknown,
    disposeErrors: [expect.objectContaining({ message: 'dispose-boom' })],
  } satisfies Partial<TestAssemblyStartFailed>)
})
