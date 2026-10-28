import { callId, fixedRequest, preparationRecord, releaseRecord } from '../src/testing-values.ts'
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
  const names = [
    'allocation inspection preserves the original fact without adopting',
    'concurrent original adoption issues one lease for one allocation',
    'lost local registration cannot adopt the original allocation',
    'failed original adoption remains failed with cleanup outstanding',
  ]
  for (const name of names) {
    it(name, async () => {
      const cases = toolEnvironmentAllocationConformance<string, MemoryEnvironment>()
      expect(cases.map(test => test.name)).toEqual(names)
      expect(cases.map(test => test.clause)).toEqual(names.map(() => 'P03'))
      const scenario = cases.find(test => test.name === name)
      if (!scenario) throw new Error('missing allocation case')
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

it('detects duplicate leases during concurrent original adoption', async () => {
  const backing = createMemoryToolEnvironment<string>()
  const access = memoryToolEnvironmentFixture().access
  const scenario = toolEnvironmentAllocationConformance<string, MemoryEnvironment>()[1]
  if (!scenario) throw new Error('missing concurrency case')
  let leases = 0
  const environment = {
    ...backing,
    prepare: async (input: Parameters<typeof backing.prepare>[0]) => {
      const result = await backing.prepare(input)
      if ('ok' in result && result.ok.kind === 'prepared') leases += 1
      return result
    },
  }
  await expect(
    scenario.run({ environment, access, ...backing.controls, leases: () => leases }),
  ).rejects.toThrow()
})

it('detects an adoption failure that abandons cleanup', async () => {
  const backing = createMemoryToolEnvironment<string>()
  const scenario = toolEnvironmentAllocationConformance<string, MemoryEnvironment>()[3]
  if (!scenario) throw new Error('missing rejected-adoption case')
  await expect(
    scenario.run({
      environment: backing,
      access: memoryToolEnvironmentFixture().access,
      ...backing.controls,
      outstanding: () => 0,
    }),
  ).rejects.toThrow()
})

it('release before first adoption permanently removes the allocation and cannot issue a lease', async () => {
  const environment = createMemoryToolEnvironment<string>()
  const access = memoryToolEnvironmentFixture().access
  const preparation = preparationRecord(
    access,
    callId('release-before-adopt'),
    'prepare',
    fixedRequest(),
  )
  const input = { ...access, call: preparation.call, preparation }
  environment.controls.allocateBeforeAdoption()
  await environment.prepare(input)
  const allocation = await environment.inspectPreparation(input)
  if ('failure' in allocation || allocation.ok.kind !== 'allocated')
    throw new Error('missing allocation')
  const release = releaseRecord(preparation, 'release', allocation.ok.evidence)
  expect(await environment.release({ ...access, call: preparation.call, release })).toHaveProperty(
    'ok.kind',
    'released',
  )
  const rejected = await environment.inspectPreparation(input)
  expect(rejected).toHaveProperty('ok.kind', 'rejected')
  expect(await environment.prepare(input)).toEqual(rejected)
  expect(environment.controls.outstanding()).toBe(0)
  expect(environment.controls.allocations()).toBe(1)
  expect(environment.controls.leases()).toBe(0)
})

it('settling a held preparation issues exactly one lease and does not affect a different original operation', async () => {
  const environment = createMemoryToolEnvironment<string>()
  const access = memoryToolEnvironmentFixture().access
  const preparation = preparationRecord(access, callId('held'), 'prepare', fixedRequest())
  const other = preparationRecord(access, callId('absent'), 'absent-prepare', fixedRequest())
  environment.controls.failAdoption(other, 'not present')
  expect(
    await environment.inspectPreparation({ ...access, call: other.call, preparation: other }),
  ).toHaveProperty('ok.kind', 'unknown')
  environment.controls.hold()
  const input = { ...access, call: preparation.call, preparation }
  expect(await environment.prepare(input)).toHaveProperty('ok.kind', 'pending')
  await environment.controls.settle()
  await environment.controls.settle()
  expect(await environment.inspectPreparation(input)).toHaveProperty('ok.kind', 'prepared')
  expect(environment.controls.leases()).toBe(1)
  expect(environment.controls.allocations()).toBe(1)
})
