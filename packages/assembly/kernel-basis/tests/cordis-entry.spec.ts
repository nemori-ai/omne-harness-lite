import { Context, ValidationError } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'
import { definePlugin, resolveOptional } from '@omne-harness/kernel-basis/cordis'

type CordisFiberState = typeof import('@deepseek-ai/cordis').FiberState

const PENDING = 0 satisfies CordisFiberState['PENDING']
const ACTIVE = 2 satisfies CordisFiberState['ACTIVE']
const FAILED = 3 satisfies CordisFiberState['FAILED']

type ClockConfig = { timeoutMs: number }

const clockSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'example',
    validate: (_value: unknown) => ({ value: { timeoutMs: 0 } }),
  },
}

function applyClock(_ctx: Context, config: ClockConfig) {
  void config.timeoutMs
}

function schemaReturning(value: ClockConfig) {
  return {
    '~standard': {
      version: 1 as const,
      vendor: 'example',
      validate: (_value: unknown) => ({ value }),
    },
  }
}

it('drops provide and intercept and keeps the caller fields', () => {
  const drafted = {
    name: 'example',
    Config: clockSchema,
    inject: ['clock'] as const,
    apply: applyClock,
    provide: 'clock',
    intercept: { clock: true },
  }

  const defined = definePlugin(drafted)

  expect(defined).not.toBe(drafted)
  expect(Object.keys(defined).sort()).toEqual(['Config', 'apply', 'inject', 'name'])
  expect('provide' in defined).toBe(false)
  expect('intercept' in defined).toBe(false)
  expect(defined.name).toBe('example')
  expect(defined.Config).toBe(clockSchema)
  expect(defined.apply).toBe(applyClock)
  expect(defined.inject).toBe(drafted.inject)

  const bareInput = {
    name: 'bare',
    Config: clockSchema,
    apply: applyClock,
  }
  const bare = definePlugin(bareInput)
  expect(bare).not.toBe(bareInput)
  expect(Object.keys(bare).sort()).toEqual(['Config', 'apply', 'name'])
  expect('inject' in bare).toBe(false)
})

it('passes the schema value to apply', async () => {
  let seen: number | undefined
  const plugin = definePlugin({
    name: 'clock',
    Config: {
      '~standard': {
        version: 1 as const,
        vendor: 'example',
        validate: (_value: unknown) => ({ value: { timeoutMs: 5 } }),
      },
    },
    apply(_ctx, config) {
      seen = config.timeoutMs
    },
  })

  const root = new Context()
  const fiber = await root.plugin(plugin, { timeoutMs: 1 })
  expect(seen).toBe(5)
  await fiber.dispose()
})

it('rejects invalid config before apply and settles the fiber as failed', async () => {
  let applied = false
  const plugin = definePlugin({
    name: 'clock',
    Config: {
      '~standard': {
        version: 1 as const,
        vendor: 'example',
        validate: (_value: unknown) => ({ issues: [{ message: 'bad' }] }),
      },
    },
    apply() {
      applied = true
    },
  })

  const root = new Context()
  const started = root.plugin(plugin, { timeoutMs: 1 })
  let thrown: unknown
  try {
    await started
  } catch (error) {
    thrown = error
  }

  expect(applied).toBe(false)
  expect(thrown).toBeInstanceOf(ValidationError)
  expect(started.state).toBe(FAILED)
  await started.dispose()
})

it('leaves a missing required inject pending and does not run apply', async () => {
  let applied = false
  const plugin = definePlugin({
    name: 'clock',
    Config: schemaReturning({ timeoutMs: 1 }),
    inject: ['clock'],
    apply() {
      applied = true
    },
  })

  const root = new Context()
  const fiber = await root.plugin(plugin, { timeoutMs: 1 })
  expect(applied).toBe(false)
  expect(fiber.state).toBe(PENDING)
  expect(fiber.state).not.toBe(FAILED)
  await fiber.dispose()
})

it('reads an optional service and stays loaded when the name is absent', async () => {
  const provided = { n: 1 }
  let present: { n: number } | undefined
  let absent: { n: number } | undefined
  let readerRan = false

  const provider = definePlugin({
    name: 'provider',
    Config: schemaReturning({ timeoutMs: 1 }),
    apply(ctx) {
      ctx.provide('present', provided)
    },
  })
  const reader = definePlugin({
    name: 'reader',
    Config: schemaReturning({ timeoutMs: 1 }),
    apply(ctx) {
      readerRan = true
      present = resolveOptional<{ n: number }>(ctx, 'present')
      absent = resolveOptional<{ n: number }>(ctx, 'absent')
    },
  })

  const root = new Context()
  const providerFiber = await root.plugin(provider, { timeoutMs: 1 })
  const readerFiber = await root.plugin(reader, { timeoutMs: 1 })
  expect(readerRan).toBe(true)
  expect(present).toBe(provided)
  expect(absent).toBe(undefined)
  expect(readerFiber.state).toBe(ACTIVE)
  await readerFiber.dispose()
  await providerFiber.dispose()
})

it('rejects async config validation before apply', async () => {
  let applied = false
  const plugin = definePlugin({
    name: 'clock',
    Config: {
      '~standard': {
        version: 1 as const,
        vendor: 'example',
        validate: (_value: unknown) => Promise.resolve({ value: { timeoutMs: 1 } }),
      },
    },
    apply() {
      applied = true
    },
  })

  const root = new Context()
  const started = root.plugin(plugin, { timeoutMs: 1 })
  let thrown: unknown
  try {
    await started
  } catch (error) {
    thrown = error
  }

  expect(applied).toBe(false)
  expect(thrown).toMatchObject({
    name: 'TypeError',
    message: 'Async config validation is not supported',
  })
  await started.dispose()
})

it('lets a later effect finish while an earlier effect is still disposing', async () => {
  let releaseEarlier!: () => void
  const earlier = new Promise<void>(resolve => {
    releaseEarlier = resolve
  })
  let earlierSettled = false
  void earlier.then(() => {
    earlierSettled = true
  })
  let laterFinished = false
  let markLater!: () => void
  const laterDone = new Promise<void>(resolve => {
    markLater = resolve
  })

  const plugin = definePlugin({
    name: 'parallel-effects',
    Config: schemaReturning({ timeoutMs: 1 }),
    apply(ctx) {
      ctx.effect(() => () => earlier)
      ctx.effect(() => () => {
        laterFinished = true
        markLater()
      })
    },
  })

  const root = new Context()
  const fiber = await root.plugin(plugin, { timeoutMs: 1 })
  const disposing = fiber.dispose()
  const timer = setTimeout(() => {
    markLater()
  }, 50)
  try {
    await laterDone
    expect(laterFinished).toBe(true)
    expect(earlierSettled).toBe(false)
    releaseEarlier()
    await disposing
  } finally {
    clearTimeout(timer)
    releaseEarlier()
  }
})

it('runs disposers inside one effect in reverse registration order', async () => {
  const events: string[] = []
  let releaseSecond!: () => void
  const secondGate = new Promise<void>(resolve => {
    releaseSecond = resolve
  })
  let markSecondStarted!: () => void
  const secondStarted = new Promise<void>(resolve => {
    markSecondStarted = resolve
  })

  const plugin = definePlugin({
    name: 'reverse-disposers',
    Config: schemaReturning({ timeoutMs: 1 }),
    apply(ctx) {
      ctx.effect(() => [
        () => {
          events.push('first-start')
          events.push('first-end')
        },
        () => {
          events.push('second-start')
          markSecondStarted()
          return secondGate.then(() => {
            events.push('second-end')
          })
        },
      ])
    },
  })

  const root = new Context()
  const fiber = await root.plugin(plugin, { timeoutMs: 1 })
  const disposing = fiber.dispose()
  const timer = setTimeout(() => {
    markSecondStarted()
  }, 50)
  try {
    await secondStarted
    expect(events).toEqual(['second-start'])
    releaseSecond()
    await disposing
    expect(events).toEqual(['second-start', 'second-end', 'first-start', 'first-end'])
  } finally {
    clearTimeout(timer)
    releaseSecond()
  }
})
