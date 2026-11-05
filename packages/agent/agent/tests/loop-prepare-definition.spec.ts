// I1 hands the request preparation the definition this execution runs under (R2-D124): the
// `definition` of the instance binding goes into every `prepare` call, so that the preparation can
// read the `instructions` of that definition as the first sections of the system prompt. Without
// it the preparation has no definition to read and the prompt carries no definition sections.
import { describe, expect, it } from 'vitest'
import { agentEvaluator } from '@omne-harness/agent'
import { createExecutionCoordinator } from '../src/loop/coordinator.ts'
import { options } from './factory-support.ts'
import { acceptedInput, execution, ok, operation } from './journal-support.ts'
import { alice, loopAssembly } from './loop-support.ts'

describe('I1 names the adopted definition to the request preparation', () => {
  it('every prepare call carries the definition of the instance binding', async () => {
    const assembly = await loopAssembly([execution()])
    const binding = options().binding
    const current = createExecutionCoordinator({
      ports: assembly.dependencies,
      binding,
      evaluator: agentEvaluator,
      access: alice,
      execution: execution(),
      operation: operation('invoke-exec-1'),
      initial: acceptedInput('input-exec-1', 'hello exec-1'),
      grant: null,
      idle() {},
    })
    ok(await current.accept())
    await current.runExecution()
    const calls = assembly.controls.requests.prepare.calls
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) expect(call.definition).toEqual(binding.definition)
  })
})
