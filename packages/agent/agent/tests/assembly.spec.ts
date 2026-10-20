// The test assembly and the factory shell: all 17 dependencies are present, they are independent per
// call, and the shell turns them into `unavailable` without touching any of them (C1).
import { expect, it } from 'vitest'
import { createAgentRuntime, type AgentRuntimeOptions } from '@omne-harness/agent'
import { createTestAgentDependencies } from '@omne-harness/agent/testing'
import {
  adoption,
  evidence,
  failure,
  instance,
  load,
  ok,
  open,
  tenantA,
} from './journal-support.ts'

const options: AgentRuntimeOptions = {
  binding: {
    instance: instance(),
    tenant: tenantA,
    scope: evidence('scope'),
    definition: adoption('definition'),
  },
  configuration: {
    observerBufferBytes: 1024,
    reconciliationDelayMs: 0,
    reconciliationBatchLimit: 8,
    denialBackoffMs: 0,
    toolConcurrency: 1,
    jointCommits: [],
    loopGuardPolicy: adoption('loop-guard'),
  },
}

it('assembles all 17 dependencies with registration null', () => {
  const { dependencies, durability } = createTestAgentDependencies<string>()
  expect(durability).toBe('none')
  expect(Object.keys(dependencies).sort()).toEqual([
    'access',
    'admission',
    'adoptions',
    'cards',
    'clock',
    'conditions',
    'extensions',
    'handoff',
    'journal',
    'materials',
    'modelContext',
    'models',
    'reads',
    'registration',
    'requests',
    'selection',
    'tools',
  ])
  expect(dependencies.registration).toBeNull()
  for (const [key, value] of Object.entries(dependencies)) {
    if (key !== 'registration') expect(value, key).toBeTypeOf('object')
  }
})

it('gives the Journal options to the memory Journal and shares no state between two calls', async () => {
  const first = createTestAgentDependencies<string>({ journal: { participants: ['message'] } })
  const second = createTestAgentDependencies<string>()
  expect([...first.dependencies.journal.capabilities.participants]).toEqual(['message'])
  const opened = await open(first.dependencies.journal)
  ok(
    await first.dependencies.journal.load({
      principal: 'alice',
      tenant: tenantA,
      execution: opened.execution,
    }),
  )
  expect(
    failure(
      await second.dependencies.journal.load({
        principal: 'alice',
        tenant: tenantA,
        execution: opened.execution,
      }),
    ).kind,
  ).toBe('denied')
  expect((await load(first.dependencies.journal, opened.execution)).revision).toBe(
    opened.receipt.revision,
  )
})

it('C1: the factory shell given the test assembly returns unavailable and touches no dependency', async () => {
  const { dependencies, controls } = createTestAgentDependencies<string>()
  const created = await createAgentRuntime(dependencies, options)
  expect(failure(created)).toEqual({
    kind: 'unavailable',
    owner: '@omne-harness/agent',
    diagnostic: 'createAgentRuntime is not implemented yet',
  })
  expect(controls.access.check.calls).toEqual([])
  expect(controls.adoptions.resolve.calls).toEqual([])
  expect(controls.clock.pending()).toEqual([])
})
