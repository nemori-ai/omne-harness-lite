import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { AgentRunFailed } from '@omne-harness/agent'
import type { Failure } from '@omne-harness/agent-contract'
import { fail } from '@omne-harness/operation-result'
import { alice, eventsOf, eventually, invoke, loopAssembly, shown } from './loop-support.ts'
import { evidence, execution, instance, ok, operation } from './journal-support.ts'

const REFUSED: Failure = { kind: 'invalid', field: 'storage', reason: 'command_limit' }

type Fate = 'completes' | 'halts'

/**
 * D-31: a drive that halts gives the slot back. Whatever the order of executions that complete and
 * executions whose closing commits the Journal refuses, the runtime takes every next one, shows
 * idle between them, reports each halt once, and drains at the end.
 */
describe('the slot of a runtime is never pinned by a halted drive', () => {
  it('takes every next execution after any sequence of completions and halts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom<Fate>('completes', 'halts'), { minLength: 1, maxLength: 5 }),
        async fates => {
          const names = fates.map((_, at) => `exec-${String(at + 1)}`)
          const fateOf = new Map(names.map((name, at) => [String(execution(name)), fates[at]]))
          const halts = (id: unknown) => fateOf.get(String(id)) === 'halts'
          const reports: AgentRunFailed[] = []
          const assembly = await loopAssembly(
            names.map(name => execution(name)),
            d => ({
              ...d,
              journal: {
                ...d.journal,
                commit: input =>
                  halts(input.execution) && input.operation.startsWith('I0/')
                    ? Promise.resolve(fail(REFUSED))
                    : d.journal.commit(input),
                tryFinish: input =>
                  halts(input.execution)
                    ? Promise.resolve(fail(REFUSED))
                    : d.journal.tryFinish(input),
              },
            }),
            undefined,
            undefined,
            { failed: event => reports.push(event) },
          )
          assembly.release.open()
          for (const [at, name] of names.entries()) {
            const handle = ok(await invoke(assembly, name))
            if (fates[at] === 'halts')
              await eventually(async () =>
                reports.some(event => event.execution === handle.execution),
              )
            else await eventsOf(handle)
            await eventually(async () => (await shown(assembly)).kind === 'idle')
            expect(await shown(assembly)).toEqual({ kind: 'idle', instance: instance() })
          }
          const halted = names.filter((_, at) => fates[at] === 'halts')
          expect(reports.map(event => String(event.execution)).sort()).toEqual(
            halted.map(name => String(execution(name))).sort(),
          )
          const drained = ok(
            await assembly.provider.control.quiesce({
              ...alice,
              operation: operation('quiesce-end'),
              reason: evidence('stop'),
            }),
          )
          expect(drained).toMatchObject({ kind: 'drained', remaining: [] })
        },
      ),
      { numRuns: 40 },
    )
  }, 120_000)
})
