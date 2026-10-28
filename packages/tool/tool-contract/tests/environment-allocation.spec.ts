import { describe, expect, it } from 'vitest'
import {
  createMemoryToolEnvironment,
  memoryToolEnvironmentFixture,
  toolEnvironmentAllocationConformance,
  runConformanceCase,
  type MemoryEnvironment,
} from '@omne-harness/tool-contract/testing'

describe('allocation before first adoption conformance', () => {
  const fixture = () => {
    const environment = createMemoryToolEnvironment<string>()
    return { environment, access: memoryToolEnvironmentFixture().access, ...environment.controls }
  }
  for (const scenario of toolEnvironmentAllocationConformance<string, MemoryEnvironment>()) {
    it(scenario.name, async () => {
      expect(await runConformanceCase(scenario, fixture())).toMatchObject({ kind: 'passed' })
    })
  }
})

it('detects an inspector that adopts while returning the earlier allocated fact', async () => {
  const backing = createMemoryToolEnvironment<string>()
  const access = memoryToolEnvironmentFixture().access
  const scenario = toolEnvironmentAllocationConformance<string, MemoryEnvironment>()[0]
  if (scenario === undefined) throw new Error('missing inspection case')
  const environment = {
    ...backing,
    inspectPreparation: async (input: Parameters<typeof backing.inspectPreparation>[0]) => {
      const fact = await backing.inspectPreparation(input)
      await backing.prepare(input)
      return fact
    },
  }
  await expect(scenario.run({ environment, access, ...backing.controls })).rejects.toThrow()
})

it('detects lost-registration queries that reuse a cached allocation fact', async () => {
  const backing = createMemoryToolEnvironment<string>()
  const access = memoryToolEnvironmentFixture().access
  const scenario = toolEnvironmentAllocationConformance<string, MemoryEnvironment>()[2]
  if (scenario === undefined) throw new Error('missing lost-registration case')
  let stale: ReturnType<typeof backing.inspectPreparation> | undefined
  const environment = {
    ...backing,
    inspectPreparation: (input: Parameters<typeof backing.inspectPreparation>[0]) =>
      stale ?? backing.inspectPreparation(input),
  }
  await expect(
    scenario.run({
      environment,
      access,
      ...backing.controls,
      forgetRegistration: preparation => {
        stale = backing.inspectPreparation({ ...access, call: preparation.call, preparation })
        backing.controls.forgetRegistration(preparation)
      },
    }),
  ).rejects.toThrow()
})
