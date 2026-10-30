// The wait for an execution change (W0) against the four query conclusions of SPEC
// "查询的四种结论与持久拒绝": an operation found rejected is settled, so the wait is ready at once;
// an unknown one keeps waiting until the clock or an abort.
import { describe, expect, it } from 'vitest'
import { waitForExecutionChange } from '../src/loop/wait.ts'
import { access, evidence, load, ok, open, operation } from './journal-support.ts'
import { loopAssembly } from './loop-support.ts'

describe('W0 and the query conclusions', () => {
  it.each(['rejected', 'unknown'] as const)('an operation found %s', async conclusion => {
    const assembly = await loopAssembly([], d => ({
      ...d,
      journal: {
        ...d.journal,
        query: async input =>
          conclusion === 'rejected'
            ? {
                ok: {
                  kind: 'rejected',
                  failure: { kind: 'conflict', operation: input.operation },
                  audit: evidence('audit'),
                  revision: '1' as never,
                },
              }
            : { ok: { kind: 'unknown' } },
      },
    }))
    // Opened directly: no driver advances the execution behind the wait.
    const opened = await open(assembly.dependencies.journal)
    const snapshot = await load(assembly.dependencies.journal, opened.execution)
    const controller = new AbortController()
    const waited = waitForExecutionChange({
      ports: assembly.dependencies,
      access,
      execution: opened.execution,
      expected: snapshot.revision,
      operations: [operation('settled-elsewhere')],
      waits: [],
      position: 'W0',
      reconciliationDelayMs: 10_000,
      signal: controller.signal,
    })
    if (conclusion === 'unknown') {
      // The wait is held: it is neither ready nor cancelled until the abort.
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(assembly.controls.clock.pending()).toHaveLength(1)
      controller.abort()
    }
    expect(ok(await waited)).toBe(conclusion === 'rejected' ? 'ready' : 'cancelled')
    assembly.release.open()
  })
})
