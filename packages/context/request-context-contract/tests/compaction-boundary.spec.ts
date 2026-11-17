import { expect, it } from 'vitest'
import * as contract from '@omne-harness/request-context-contract'
import { createAssemblyFixture } from '@omne-harness/request-context-contract/testing'

it('offers request assembly and resume without exposing provider execution steps', () => {
  const fixture = createAssemblyFixture()
  expect(Object.keys(fixture.operations()).sort()).toEqual(['assemble', 'resume'])
  for (const name of ['decodePlanId', 'planProgressSchema', 'compactionPlanSchema'])
    expect(contract).not.toHaveProperty(name)
})

it('refuses algorithm controls in the request compaction trigger configuration', () => {
  const trigger = { triggerPercent: '80', headroomTokens: null }
  expect(contract.compactionPolicySchema['~standard'].validate(trigger)).toHaveProperty(
    'value',
    trigger,
  )
  expect(
    contract.compactionPolicySchema['~standard'].validate({ ...trigger, stepBound: '3' }),
  ).toHaveProperty('issues')
})
