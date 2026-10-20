// The test assembly and the factory shell: all 17 dependencies are present, they are independent per
// call, and the shell turns them into `unavailable` without touching any of them (C1).
import { expect, it } from 'vitest'
import { createAgentRuntime, type AgentRuntimeOptions } from '@omne-harness/agent'
import { createTestAgentDependencies } from '@omne-harness/agent/testing'
import {
  adoption,
  evidence,
  execution,
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

/**
 * Wraps a dependency so that every method call anywhere inside it is logged by its path. A frozen
 * member is returned as it is, because a proxy may not change what a frozen property reads.
 */
function recorded<T extends object>(target: T, path: string, calls: string[]): T {
  return new Proxy(target, {
    get(object, property, receiver) {
      const value: unknown = Reflect.get(object, property, receiver)
      const name = `${path}.${String(property)}`
      const own = Object.getOwnPropertyDescriptor(object, property)
      if (own !== undefined && !own.configurable && own.writable === false) return value
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          calls.push(name)
          return Reflect.apply(value, object, args)
        }
      }
      if (typeof value === 'object' && value !== null) return recorded(value, name, calls)
      return value
    },
  })
}

it('C1: the factory shell given the test assembly returns unavailable and calls no dependency', async () => {
  const { dependencies } = createTestAgentDependencies<string>()
  const calls: string[] = []
  // Each value keeps its shape behind the proxy, so the record keeps the type of `dependencies`.
  const watched = Object.fromEntries(
    Object.entries(dependencies).map(([key, value]) => [
      key,
      typeof value === 'object' && value !== null ? recorded(value, key, calls) : value,
    ]),
  ) as typeof dependencies
  expect(Object.keys(watched)).toHaveLength(17)
  const created = await createAgentRuntime(watched, options)
  expect(failure(created)).toEqual({
    kind: 'unavailable',
    owner: '@omne-harness/agent',
    diagnostic: 'createAgentRuntime is not implemented yet',
  })
  expect(calls).toEqual([])

  // The recorder itself works: a call through a wrapped journal is logged.
  await watched.journal.load({ principal: 'alice', tenant: tenantA, execution: execution() })
  expect(calls).toEqual(['journal.load'])
})
