import { expect, it } from 'vitest'
import {
  RUNTIME_CONTEXT_OBLIGATIONS,
  runConformanceCase,
  runtimeContextConformance,
} from '@omne-harness/runtime-context-contract/testing'
import type { RuntimeContextPorts } from '@omne-harness/runtime-context-contract/testing'
import type { RuntimeContextOperations } from '@omne-harness/runtime-context-contract'
import { createRuntimeContext } from '@omne-harness/runtime-context'
import { tenantA, tenantB } from './support.js'

// The whole contract suite runs against the mechanism itself, not the contract's memory double.
const closers = new WeakMap<object, () => Promise<void>>()
const fixture = {
  tenant: tenantA,
  otherTenant: tenantB,
  principal: 'suite',
  retention: 64,
  replayCapacity: 8,
  subject: async (
    ports: RuntimeContextPorts<string>,
  ): Promise<RuntimeContextOperations<string>> => {
    const mechanism = createRuntimeContext<string>({
      trust: ports,
      config: { retention: 64, replayCapacity: 8 },
    })
    closers.set(mechanism, () => mechanism.close())
    return mechanism
  },
  close: async (subject: object) => {
    await closers.get(subject)?.()
  },
}

const cases = runtimeContextConformance<string>()

it('runs every contract obligation', () => {
  expect(cases.map(c => c.name)).toEqual([...RUNTIME_CONTEXT_OBLIGATIONS])
})

for (const c of cases)
  it(c.name, async () => {
    expect(await runConformanceCase(c, fixture)).toEqual({ kind: 'passed' })
  })
