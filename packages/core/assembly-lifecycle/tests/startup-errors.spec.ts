import { Context } from '@deepseek-ai/cordis'
import { expect, test } from 'vitest'
import {
  AssemblyWorkStopped,
  createAssemblyLifetime,
  type OwnedWork,
  type RetainedCloseControl,
} from '../src/index.ts'
import { AssemblyLifetimeService, startAssemblyWork } from '../src/cordis.ts'

test.each(['cancel', 'participant-failure'] as const)(
  'stopping during setup preserves the distinct %s result and actual close',
  async mode => {
    const lifetime = createAssemblyLifetime(['row'], () => {})
    lifetime.tryClaim()
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const original = new Error('controlled setup defect')
    let ready: Promise<void> | undefined
    let closes = 0
    let setupEnded = false
    const ctx = new Context()
    class Port extends AssemblyLifetimeService {
      isCurrent = () => lifetime.isCurrent()
      retainClose = (control: RetainedCloseControl) => lifetime.port('row').retainClose(control)
      register = (work: OwnedWork) => {
        ready = work.ready
        return lifetime.port('row').register(work)
      }
    }
    const port = await ctx.plugin(inner => {
      new Port(inner)
    })
    const fiber = await ctx.plugin({
      inject: ['assemblyLifetime'],
      apply(inner) {
        startAssemblyWork(
          inner,
          async () => {
            entered.resolve()
            await release.promise
            setupEnded = true
            if (mode === 'participant-failure') throw original
          },
          async () => {
            expect(setupEnded).toBe(true)
            closes++
          },
        )
      },
    })
    try {
      await entered.promise
      const error = ready!.catch(failure => failure)
      const closed = lifetime.close()
      await new Promise<void>(resolve => setImmediate(resolve))
      expect(closes).toBe(0)
      release.resolve()
      if (mode === 'cancel') expect(await error).toBeInstanceOf(AssemblyWorkStopped)
      else expect(await error).toBe(original)
      expect((await closed).rows).toEqual([
        { id: 'row', result: { kind: 'failed', codes: ['setup'] } },
      ])
      expect(closes).toBe(1)
    } finally {
      release.resolve()
      await lifetime.close()
      await fiber.dispose()
      await port.dispose()
    }
  },
)
