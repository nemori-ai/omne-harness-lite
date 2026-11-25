import { expect, it } from 'vitest'
import {
  programConformanceNames,
  programFacilityConformance,
  runConformanceCase,
} from '@omne-harness/execution-environment-contract/testing'
import { createProgramProvider } from '@omne-harness/execution-environment-program'
import { leased, request } from './support.ts'

const cases = programFacilityConformance({
  async subject() {
    const provider = createProgramProvider()
    const { facility } = await leased(provider)
    return {
      facility,
      request,
      async dispose() {
        expect(await provider.retire()).toEqual({ kind: 'drained' })
      },
    }
  },
})

it('covers every case of the suite', () => {
  expect(cases.map(test => test.name)).toEqual([...programConformanceNames])
})

for (const test of cases)
  it(`${test.name} holds on the restricted execution domain`, { timeout: 30_000 }, async () => {
    expect(await runConformanceCase(test)).toEqual({ name: test.name, status: 'pass' })
  })
