import { Context } from '@deepseek-ai/cordis'
import { expect, test } from 'vitest'
import {
  createAssemblyLifetime,
  type AssemblyLifetimePort,
  type OwnedWork,
  type RetainedCloseControl,
} from '../src/index.ts'
import { AssemblyLifetimeService, startRetainedAssemblyWork } from '../src/cordis.ts'

class Port extends AssemblyLifetimeService {
  constructor(
    ctx: Context,
    private readonly port: AssemblyLifetimePort,
  ) {
    super(ctx)
  }
  isCurrent = () => this.port.isCurrent()
  register = (work: OwnedWork) => this.port.register(work)
  retainClose = (control: RetainedCloseControl) => this.port.retainClose(control)
}

test('the original row control survives actual Service withdrawal and retains lower dependencies', async () => {
  const ctx = new Context()
  const lifetime = createAssemblyLifetime(['dependency', 'resource'], () => {})
  lifetime.tryClaim()
  let lowerClosed = false
  lifetime.port('dependency').register({
    ready: Promise.resolve(),
    async close() {
      lowerClosed = true
    },
  })
  const row = lifetime.port('resource')
  let ready: Promise<void> | undefined
  const port = await ctx.plugin(inner => {
    new Port(inner, {
      ...row,
      register(work) {
        ready = work.ready
        return row.register(work)
      },
    })
  })
  let confirmed = false
  let calls = 0
  const caller = await ctx.plugin({
    inject: ['assemblyLifetime'],
    apply(inner) {
      startRetainedAssemblyWork(
        inner,
        async () => {
          expect(lifetime.closeControl('resource')).toBeDefined()
        },
        async () => {
          calls++
          if (!confirmed) throw new Error('Original resource remains owned')
        },
      )
    },
  })
  await ready
  const control = lifetime.closeControl('resource')!
  const withdrawal = Promise.resolve(port.dispose())
  try {
    expect(await control.closeAttempt()).toBe('retained')
    expect(lowerClosed).toBe(false)
    expect(calls).toBe(1)
    expect(lifetime.closeControl('resource')).toBe(control)
    confirmed = true
    expect(await control.retryClose()).toBe('closed')
    expect((await lifetime.closed).complete).toBe(true)
    await withdrawal
    expect(lowerClosed).toBe(true)
    expect(lifetime.closeControl('resource')).toBe(control)
    expect(calls).toBe(2)
  } finally {
    confirmed = true
    await control.retryClose()
    await lifetime.close()
    await withdrawal
    await caller.dispose()
  }
})

test('failed retention ends ready and closes the registered prefix without entering setup', async () => {
  const ctx = new Context()
  const lifetime = createAssemblyLifetime(['row'], () => {})
  lifetime.tryClaim()
  const row = lifetime.port('row')
  let ready: Promise<void> | undefined
  let setup = 0
  let closes = 0
  const failure = new Error('Host cannot retain control')
  const port = await ctx.plugin(inner => {
    new Port(inner, {
      ...row,
      register(work) {
        ready = work.ready
        return row.register(work)
      },
      retainClose() {
        throw failure
      },
    })
  })
  const caller = await ctx.plugin({
    inject: ['assemblyLifetime'],
    apply(inner) {
      startRetainedAssemblyWork(
        inner,
        async () => {
          setup++
        },
        async () => {
          closes++
        },
      )
    },
  })
  expect(await ready!.catch(error => error)).toBe(failure)
  expect((await lifetime.closed).rows).toEqual([
    { id: 'row', result: { kind: 'failed', codes: ['setup'] } },
  ])
  expect(setup).toBe(0)
  expect(closes).toBe(1)
  await caller.dispose()
  await port.dispose()
})
