import { expect, it } from 'vitest'
import { agentEvaluator } from '@omne-harness/agent'
import { createExecutionCoordinator } from '../src/loop/coordinator.ts'
import { options } from './factory-support.ts'
import { acceptedInput, execution, ok, operation } from './journal-support.ts'
import { alice, loopAssembly } from './loop-support.ts'

it.each(['known', 'applied', 'dropped'] as const)(
  'hands model processing to the log once after a %s outcome, before advancing',
  async outcome => {
    let injected = false
    const assembly = await loopAssembly(
      [execution()],
      ports => ({
        ...ports,
        journal: {
          ...ports.journal,
          commit(input) {
            if (!injected && outcome !== 'known' && input.caller.kind === 'processed') {
              injected = true
              assembly.controls.journal.failNext('commit', { kind: 'commit-unknown', outcome })
            }
            return ports.journal.commit(input)
          },
        },
      }),
      undefined,
      { jointCommits: ['processed'] },
    )
    const coordinator = createExecutionCoordinator({
      ports: assembly.dependencies,
      binding: options().binding,
      compactionProvider: options().configuration.compactionProvider,
      jointCommits: ['processed'],
      evaluator: agentEvaluator,
      access: alice,
      execution: execution(),
      operation: operation('invoke-exec-1'),
      initial: acceptedInput('input-exec-1', 'hello'),
      grant: null,
      idle() {},
    })
    assembly.release.open()
    ok(await coordinator.accept())
    const result = await coordinator.runExecution()
    if (outcome !== 'known') {
      expect(result).toHaveProperty('failure.failure.kind', 'commit-unknown')
      ok(await coordinator.runExecution())
    } else ok(result)
    expect(assembly.controls.journal.joint()).toMatchObject([
      {
        caller: { kind: 'processed', result: { producer: { kind: 'model' } } },
      },
    ])
    expect(assembly.controls.pusher?.acknowledgements()).toHaveLength(1)
    const saved = ok(await assembly.dependencies.journal.load({ ...alice, execution: execution() }))
    expect(saved.state.kind).toBe('ended')
  },
)
