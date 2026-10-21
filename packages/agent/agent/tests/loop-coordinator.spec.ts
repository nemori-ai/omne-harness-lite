import { describe, expect, it } from 'vitest'
import { agentEvaluator } from '@omne-harness/agent'
import { succeed } from '@omne-harness/operation-result'
import { createExecutionCoordinator } from '../src/loop/coordinator.ts'
import { acceptedInput, execution, failure, ok, operation } from './journal-support.ts'
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

describe('the coordinator result when a node throws', () => {
  it('a thrown evaluator value returns the stopped node and a defect failure', async () => {
    const assembly = await loopAssembly([execution()])
    const coordinator = createExecutionCoordinator({
      ports: assembly.dependencies,
      binding: options().binding,
      evaluator: {
        ...agentEvaluator,
        next() {
          throw Object.create(null)
        },
      },
      access: alice,
      execution: execution(),
      operation: operation('invoke-exec-1'),
      initial: acceptedInput('input-exec-1', 'hello exec-1'),
      grant: null,
      idle: () => {},
    })
    ok(await coordinator.accept())
    expect(failure(await coordinator.runExecution())).toMatchObject({
      node: 'E4',
      failure: { kind: 'unavailable', owner: '@omne-harness/agent#defect' },
    })
    const snapshot = ok(
      await assembly.dependencies.journal.load({ ...alice, execution: execution() }),
    )
    expect(snapshot.checkpoint.position).toBe('E4')
    expect(snapshot.state.kind).not.toBe('ended')
  })
})
