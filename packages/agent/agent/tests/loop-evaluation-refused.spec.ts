import { describe, expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import { agentEvaluator } from '@omne-harness/agent'
import { createExecutionCoordinator } from '../src/loop/coordinator.ts'
import { options } from './factory-support.ts'
import { acceptedInput, execution, ok, operation } from './journal-support.ts'
import { alice, loopAssembly, type LoopAssembly } from './loop-support.ts'

function coordinator(assembly: LoopAssembly) {
  return createExecutionCoordinator({
    ports: assembly.dependencies,
    binding: options().binding,
    compactionProvider: options().configuration.compactionProvider,
    evaluator: agentEvaluator,
    access: alice,
    execution: execution(),
    operation: operation('invoke-exec-1'),
    initial: [acceptedInput('input-exec-1', 'hello exec-1')],
    grant: null,
    idle: () => {},
  })
}

// The Journal answers "changed" to the commit after the evaluation: its revision moved under the step.
async function refusedOnce() {
  const commits: string[] = []
  let refused = false
  const assembly = await loopAssembly([execution()], d => ({
    ...d,
    journal: {
      ...d.journal,
      async commit(input) {
        commits.push(String(input.operation))
        if (!refused && String(input.operation).startsWith('I8/commit@')) {
          refused = true
          return fail({ kind: 'changed' })
        }
        return d.journal.commit(input)
      },
    },
  }))
  const c = coordinator(assembly)
  ok(await c.accept())
  assembly.release.open()
  const ran = await c.runExecution()
  const kept = ok(await assembly.controls.journal.port.load({ ...alice, execution: execution() }))
  return { ran, kept, evaluated: commits.filter(name => name.startsWith('I8/commit@')).length }
}

describe('the commit after the evaluation is answered changed', () => {
  it('reads again and evaluates again: the Run goes on to its end', async () => {
    const { ran, kept, evaluated } = await refusedOnce()
    expect(ran).not.toHaveProperty('failure')
    expect(kept.state.kind).toBe('ended')
    expect(evaluated).toBe(2)
  })
})
