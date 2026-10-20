// The test assembly and the factory: all 17 dependencies are present, they are independent per call,
// and the factory turns them into an idle provider without touching any of them (C1).
import { expect, it } from 'vitest'
import { createAgentRuntime } from '@omne-harness/agent'
import { createTestAgentDependencies } from '@omne-harness/agent/testing'
import { options, take, watched } from './factory-support.ts'
import { execution, failure, instance, load, ok, open, tenantA } from './journal-support.ts'

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

it('C1: the factory given the test assembly returns an idle provider and calls no dependency', async () => {
  const { dependencies, calls } = watched(createTestAgentDependencies<string>().dependencies)
  expect(Object.keys(dependencies)).toHaveLength(17)
  const provider = ok(await createAgentRuntime(dependencies, options()))
  expect(calls).toEqual([])
  expect(provider.runtime.instance).toBe(instance())

  const controller = new AbortController()
  const [first] = await take(
    provider.observation.observe({
      principal: 'alice',
      tenant: tenantA,
      signal: controller.signal,
    }),
    1,
  )
  controller.abort()
  expect(first).toEqual({ kind: 'state', value: { kind: 'idle', instance: instance() } })
  expect(calls).toEqual(['access.check'])

  // The recorder itself works: a call through a wrapped journal is logged.
  await dependencies.journal.load({ principal: 'alice', tenant: tenantA, execution: execution() })
  expect(calls).toEqual(['access.check', 'journal.load'])
})
