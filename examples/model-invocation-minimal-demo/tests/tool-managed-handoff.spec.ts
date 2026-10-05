import type { Context } from '@deepseek-ai/cordis'
import { expect, test } from 'vitest'
import {
  createAssemblyLifetime,
  type AssemblyLifetimePort,
  type OwnedWork,
  type RetainedCloseControl,
} from '@omne-harness-lite/assembly-lifecycle'
import { AssemblyLifetimeService } from '@omne-harness-lite/assembly-lifecycle/cordis'
import { ToolRuntimeStartupService } from '@omne-harness-lite/tool-execution-runtime/cordis'
import { managedToolExecutionLocal } from '@omne-harness-lite/tool-execution-local/cordis'
import { actionIntegrationFixture } from './tool-action-integration-fixture.ts'

class Row extends AssemblyLifetimeService {
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

class Startup extends ToolRuntimeStartupService {
  constructor(
    ctx: Context,
    readonly recoveryAccess: ToolRuntimeStartupService['recoveryAccess'],
    readonly retainClose: ToolRuntimeStartupService['retainClose'],
  ) {
    super(ctx)
  }
}

for (const failHandoff of [false, true]) {
  test(
    `actual managed tool hands the same control to its row before startup${failHandoff ? ' rejects it' : ''}`,
    { timeout: 120_000 },
    async () => {
      const fixture = await actionIntegrationFixture({
        executor: async () => 'unused',
        installRuntime: false,
      })
      const lifetime = createAssemblyLifetime(['runtime'], () => {})
      lifetime.tryClaim()
      const original = lifetime.port('runtime'),
        sequence: { owner: string; control: RetainedCloseControl }[] = [],
        failure = new Error('Controlled startup handoff failure'),
        registered = Promise.withResolvers<OwnedWork>()
      const ctx = fixture.current.assembly.ctx.isolate('assemblyLifetime')
      const inputs = await ctx.plugin(inner => {
        new Row(inner, {
          ...original,
          register(work) {
            const registration = original.register(work)
            registered.resolve(work)
            return registration
          },
          retainClose(control) {
            sequence.push({ owner: 'row', control })
            original.retainClose(control)
          },
        })
        new Startup(
          inner,
          () => fixture.current.owner.recovery,
          control => {
            sequence.push({ owner: 'startup', control })
            expect(lifetime.closeControl('runtime')).toBe(control)
            if (failHandoff) throw failure
          },
        )
      })
      const runtime = await ctx.plugin(managedToolExecutionLocal, {
        resultStorage: 'integration-results',
        frameQueueBytes: 1048576,
        tailRetry: { attempts: 3, minDelayMs: 0, maxDelayMs: 0 },
      })
      try {
        const work = await registered.promise
        if (failHandoff) expect(await work.ready.catch(error => error)).toBe(failure)
        else await work.ready
        expect(sequence.map(entry => entry.owner)).toEqual(['row', 'startup'])
        const control = lifetime.closeControl('runtime')!
        expect(sequence[0]!.control).toBe(control)
        expect(sequence[1]!.control).toBe(control)
        const closing = lifetime.close()
        expect(await control.closeAttempt()).toBe('closed')
        const report = await closing
        expect(report.rows).toEqual([
          {
            id: 'runtime',
            result: failHandoff ? { kind: 'failed', codes: ['setup'] } : { kind: 'closed' },
          },
        ])
        expect(lifetime.closeControl('runtime')).toBe(control)
      } finally {
        await lifetime.close()
        await runtime.dispose()
        await inputs.dispose()
        // Real persistence and borrowed owner must drain after the original instance closes.
        await fixture.close()
      }
    },
  )
}
