// The G7 suite runs on the non-durable binding registry with every handle and on a registry
// without fiber controls; every case fails under a violating variant that breaks the rule of that
// case (flawed-bindings.ts, one flaw at a time); the dynamics skeleton names the ten RFC-0012
// criteria and reports each as not applicable until 2.5 fills it.
import { describe, expect, it } from 'vitest'
import {
  TOOL_DYNAMICS_CRITERIA,
  runConformanceCase,
  runToolDynamicsSuite,
  toolBindingRegistryConformance,
  type ToolBindingRegistryFixture,
} from '@omne-harness/tool-cordis-contract/testing'
import {
  expectEveryCaseIsCaught,
  itFailsExactly,
  itPassesLegal,
  judge,
  type LegalProvider,
  type Variant,
} from './conformance-harness.ts'
import { WITHOUT_FIBER_CASES, memory, withoutFibers } from './binding-registry-legal.ts'
import { flawedBindingFixture, type Flaws } from './flawed-bindings.ts'

const cases = toolBindingRegistryConformance<string>()

const legal: readonly LegalProvider<ToolBindingRegistryFixture<string>>[] = [
  { name: 'the conforming in-memory registry', fixture: memory },
  {
    name: 'a registry without fiber controls',
    fixture: withoutFibers,
    notApplicable: WITHOUT_FIBER_CASES,
  },
]

const NAMES = {
  answers: 'register answers the key, a token and an ordinal, and the entry is live',
  recognised: 'the same fiber registering the same key with the same digest is recognised',
  conflict: 'another digest or another fiber on a held key is a conflict and the original stands',
  successor:
    'a successor registers once the original released, with a new token and a later ordinal',
  lateRelease: 'a late release of the original removes nothing and leaves the successor',
  race: 'two fibers racing for one key: the first in the ordering domain wins, the other conflicts',
  fiberEnd: 'the end of a fiber withdraws its contribution once',
  twoKeys: 'two keys of one capability are separate contributions',
  refused: 'a refused origin registers nothing, and the failure keeps its kind',
  mismatch: 'a loaded registration whose key is not the verified key is invalid',
  draining:
    'close marks draining, reopen clears it, drain reports pins, and the contribution stays',
  scope: 'a tenant scope sees official and own-layer entries, not the entries of another tenant',
} as const

const variant = (name: string, flaws: Flaws, fails: readonly string[]): Variant<Fixture> => ({
  name,
  fails,
  fixture: () => flawedBindingFixture(flaws),
})
type Fixture = ToolBindingRegistryFixture<string>

/** One flaw each; the listed cases are exactly the ones that the flaw breaks. */
const variants: readonly Variant<Fixture>[] = [
  variant('empty tokens', { emptyToken: true }, [NAMES.answers, NAMES.successor, NAMES.twoKeys]),
  variant('ordinals that reset', { ordinalResets: true }, [
    NAMES.answers,
    NAMES.conflict,
    NAMES.successor,
    NAMES.lateRelease,
    NAMES.fiberEnd,
  ]),
  variant('same fiber and digest not recognised', { recogniseNothing: true }, [NAMES.recognised]),
  variant('a conflict overwrites the holder', { overwriteOnConflict: true }, [
    NAMES.conflict,
    NAMES.race,
  ]),
  variant('release removes by key, not by token', { releaseByKey: true }, [
    NAMES.lateRelease,
    NAMES.fiberEnd,
  ]),
  variant('the end of the fiber withdraws nothing', { fiberEndKeepsEntry: true }, [NAMES.fiberEnd]),
  variant('the key ignores the asset version', { keyIgnoresAsset: true }, [
    NAMES.twoKeys,
    NAMES.scope,
  ]),
  variant('a refused origin reported as unavailable', { refusalAsUnavailable: true }, [
    NAMES.refused,
  ]),
  variant('a key mismatch reported as denied', { mismatchAsDenied: true }, [NAMES.mismatch]),
  variant('close releases instead of draining', { closeReleases: true }, [NAMES.draining]),
  variant('a tenant scope sees every entry', { snapshotIgnoresScope: true }, [NAMES.scope]),
]

describe('G7 binding registry suite', () => {
  it('is well formed: unique names and the G7 clause of the contract SPEC', () => {
    // The IC harness check expects an IC clause; this suite carries the SPEC gap decision G7.
    expect(new Set(cases.map(item => item.name)).size).toBe(cases.length)
    for (const item of cases) expect(item.clause).toBe('G7')
    expect(cases.map(item => item.name)).toEqual(Object.values(NAMES))
  })

  itPassesLegal(cases, legal)

  it('passes on the flawed registry with no flaw set, so that the variants stay one flaw away', async () => {
    const verdict = await judge(cases, () => flawedBindingFixture())
    expect(verdict.failed).toEqual([])
    expect(verdict.notApplicable).toEqual({})
  })

  itFailsExactly(cases, variants)

  it('has a violating variant that makes each case fail', () => {
    expectEveryCaseIsCaught(cases, variants)
  })
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
