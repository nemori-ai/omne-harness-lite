// The G7 suite runs on the non-durable binding registry with every handle and on a registry
// without fiber controls; the dynamics skeleton names the ten RFC-0012 criteria and reports each
// as not applicable until 2.5 fills it.
import { describe, expect, it } from 'vitest'
import {
  TOOL_DYNAMICS_CRITERIA,
  runConformanceCase,
  runToolDynamicsSuite,
  toolBindingRegistryConformance,
  type ToolBindingRegistryFixture,
} from '@omne-harness/tool-cordis-contract/testing'
import { itPassesLegal, type LegalProvider } from './conformance-harness.ts'
import { WITHOUT_FIBER_CASES, memory, withoutFibers } from './binding-registry-legal.ts'

const cases = toolBindingRegistryConformance<string>()

const legal: readonly LegalProvider<ToolBindingRegistryFixture<string>>[] = [
  { name: 'the conforming in-memory registry', fixture: memory },
  {
    name: 'a registry without fiber controls',
    fixture: withoutFibers,
    notApplicable: WITHOUT_FIBER_CASES,
  },
]

describe('G7 binding registry suite', () => {
  it('is well formed: unique names and the G7 clause of the contract SPEC', () => {
    // The IC harness check expects an IC clause; this suite carries the SPEC gap decision G7.
    expect(new Set(cases.map(item => item.name)).size).toBe(cases.length)
    for (const item of cases) expect(item.clause).toBe('G7')
  })

  itPassesLegal(cases, legal)
})

describe('dynamics suite skeleton', () => {
  it('names the ten criteria in order and reports each as not applicable until 2.5', async () => {
    const suite = runToolDynamicsSuite()
    expect(suite.map(item => item.name)).toEqual(
      TOOL_DYNAMICS_CRITERIA.map((name, index) => `dynamics ${index + 1}: ${name}`),
    )
    for (const item of suite) {
      expect(item.clause).toBe('RFC-0012')
      expect(await runConformanceCase(item, {})).toEqual({
        kind: 'not-applicable',
        handle: 'generations',
      })
    }
  })
})
