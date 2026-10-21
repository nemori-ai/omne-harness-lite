import { describe, expect, it } from 'vitest'
import { agentEvaluator } from '@omne-harness/agent'
import { succeed } from '@omne-harness/operation-result'
import { createExecutionCoordinator } from '../src/loop/coordinator.ts'
import { acceptedInput, execution, ok, operation } from './journal-support.ts'
import { options } from './factory-support.ts'
import { alice, eventually, eventsOf, invoke, loopAssembly, shown } from './loop-support.ts'

describe('the coordinator result of an admission already advanced in the Journal', () => {
  it('NA-E0-2: found-existing ends coordination successfully without a second loop', async () => {
    let commits = 0
    const assembly = await loopAssembly([execution()], dependencies => ({
      ...dependencies,
      journal: {
        ...dependencies.journal,
        commit(input) {
          commits += 1
          return dependencies.journal.commit(input)
        },
      },
    }))
    assembly.release.open()
    await eventsOf(ok(await invoke(assembly)))
    await eventually(async () => (await shown(assembly)).kind === 'idle')
    const committed = commits
    let idle = 0
    const coordinator = createExecutionCoordinator({
      ports: assembly.dependencies,
      binding: options().binding,
      evaluator: agentEvaluator,
      access: alice,
      execution: execution(),
      operation: operation('invoke-exec-1'),
      initial: acceptedInput('input-exec-1', 'hello exec-1'),
      grant: null,
      idle() {
        idle += 1
      },
    })
    ok(await coordinator.accept())
    expect(await coordinator.runExecution()).toEqual(succeed(undefined))
    expect(idle).toBe(1)
    expect(commits).toBe(committed)
  })
})
