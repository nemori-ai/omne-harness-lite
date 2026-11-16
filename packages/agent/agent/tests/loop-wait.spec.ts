import { describe, expect, it } from 'vitest'
import { reconciliationPacer } from '../src/loop/reconciliation.ts'
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
      pacer: reconciliationPacer([10_000]),
      signal: controller.signal,
    })
    if (conclusion === 'unknown') {
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(assembly.controls.clock.pending()).toHaveLength(1)
      controller.abort()
    }
    expect(ok(await waited)).toBe(conclusion === 'rejected' ? 'ready' : 'cancelled')
    assembly.release.open()
  })
})
