import type { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import {
  startTestAssembly,
  TestAssemblyDisposeFailed,
  TestAssemblyStartFailed,
} from '@omne-harness/kernel-basis/testing'

it('disposes in reverse start order when a later plugin starts an earlier one', async () => {
  const events: string[] = []
  const assembly = await startTestAssembly([
    {
      name: 'consumer',
      inject: ['svc'],
      apply(ctx) {
        events.push('start-consumer')
        ctx.effect(() => () => {
          events.push('stop-consumer')
        })
      },
    },
    {
      name: 'provider',
      apply(ctx) {
        events.push('start-provider')
        ctx.provide('svc', 1)
        ctx.effect(() => () => {
          events.push('stop-provider')
        })
      },
    },
  ])

  await assembly.dispose()
  expect(events).toEqual(['start-provider', 'start-consumer', 'stop-consumer', 'stop-provider'])
})

it('waits for an async apply that starts after a later plugin provides its dependency', async () => {
  const events: string[] = []
  const assembly = await startTestAssembly([
    {
      name: 'consumer',
      inject: ['svc'],
      apply(ctx) {
        events.push('start-consumer')
        return new Promise<void>((resolve) => {
          setTimeout(resolve, 10)
        }).then(() => {
          ctx.effect(() => () => {
            events.push('stop-consumer')
          })
          events.push('consumer-done')
        })
      },
    },
    {
      name: 'provider',
      apply(ctx) {
        events.push('start-provider')
        ctx.provide('svc', 1)
        ctx.effect(() => () => {
          events.push('stop-provider')
        })
      },
    },
  ])

  expect(events).toEqual(['start-provider', 'start-consumer', 'consumer-done'])
  await assembly.dispose()
  expect(events).toEqual([
    'start-provider',
    'start-consumer',
    'consumer-done',
    'stop-consumer',
    'stop-provider',
  ])
})

it('preserves the error thrown by an async apply', async () => {
  const original = new Error('async-boom')
  const thrown = await startTestAssembly([
    {
      name: 'consumer',
      inject: ['svc'],
      apply() {
        return new Promise<void>((resolve) => {
          setTimeout(resolve, 10)
        }).then(() => {
          throw original
        })
      },
    },
    {
      name: 'provider',
      apply(ctx) {
        ctx.provide('svc', 1)
      },
    },
  ]).catch((error: unknown) => error)

  expect(thrown).toBe(original)
})

it('disposes an already started plugin when a later registration throws', async () => {
  const events: string[] = []
  const original = new Error('registration-failed')
  let observer: Context | undefined
  const thrown = await startTestAssembly([
    {
      name: 'observer',
      apply(ctx) {
        observer = ctx
        ctx.effect(() => () => {
          events.push('observer-stop')
        })
        ctx.on('internal/plugin', () => {
          throw original
        })
      },
    },
    { name: 'second', apply() {} },
  ]).catch((error: unknown) => error)

  expect(thrown).toBe(original)
  expect(events).toEqual(['observer-stop'])
  expect(observer).toBeDefined()
})

it('rejects undefined thrown by plugin registration and disposes the started plugin', async () => {
  const events: string[] = []
  let observer: Context | undefined
  const outcome = await startTestAssembly([
    {
      name: 'observer',
      apply(ctx) {
        observer = ctx
        ctx.effect(() => () => {
          events.push('observer-stop')
        })
        ctx.on('internal/plugin', () => {
          throw undefined
        })
      },
    },
    {
      name: 'second',
      apply() {
        events.push('second')
      },
    },
  ]).then(
    () => ({ rejected: false as const }),
    (error: unknown) => ({ rejected: true as const, error }),
  )

  expect(outcome).toEqual({ rejected: true, error: undefined })
  expect(events).toEqual(['observer-stop'])
  expect(observer).toBeDefined()
})

it('collects a dispose rejection when registration throws undefined', async () => {
  const thrown = await startTestAssembly([
    {
      name: 'observer',
      apply(ctx) {
        const fiber = ctx.fiber as { dispose: () => Promise<void> }
        const original = fiber.dispose
        fiber.dispose = async () => {
          await original.call(fiber)
          throw new Error('dispose-boom')
        }
        ctx.on('internal/plugin', () => {
          throw undefined
        })
      },
    },
    { name: 'second', apply() {} },
  ]).then(
    () => 'resolved',
    (error: unknown) => error,
  )

  expect(thrown).toBeInstanceOf(TestAssemblyStartFailed)
  if (!(thrown instanceof TestAssemblyStartFailed)) return
  expect(thrown.startError).toBeUndefined()
  expect(thrown.disposeErrors).toEqual([expect.objectContaining({ message: 'dispose-boom' })])
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
      {
        name: 'after',
        apply() {
          order.push('after')
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
        const fiber = ctx.fiber as { dispose: () => Promise<void> }
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
          const fiber = ctx.fiber as { dispose: () => Promise<void> }
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
