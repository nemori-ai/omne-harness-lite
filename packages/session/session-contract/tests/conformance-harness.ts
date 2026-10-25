// The self-proof harness of the conformance suite. It runs every case of a suite on a fresh
// fixture and sorts the outcome: passed, not applicable, failed by an assertion. Any other error is
// rethrown, because a violating variant must be caught by an assertion, not by a crash. The shape
// follows the harness of tool-contract.
import { AssertionError } from 'node:assert/strict'
import { expect, it } from 'vitest'
import { isNotApplicable, type ConformanceCase } from '@omne-harness/session-contract/testing'

export type Verdicts = Readonly<{
  passed: readonly string[]
  failed: readonly string[]
  notApplicable: Readonly<Record<string, string>>
}>

export async function judge<F>(
  cases: readonly ConformanceCase<F>[],
  fixture: () => F | Promise<F>,
): Promise<Verdicts> {
  const passed: string[] = []
  const failed: string[] = []
  const notApplicable: Record<string, string> = {}
  for (const conformance of cases) {
    try {
      await conformance.run(await fixture())
      passed.push(conformance.name)
    } catch (error) {
      if (isNotApplicable(error)) notApplicable[conformance.name] = error.handle
      else if (error instanceof AssertionError) failed.push(conformance.name)
      else throw new Error(`case "${conformance.name}" crashed instead of failing`, { cause: error })
    }
  }
  return { passed, failed, notApplicable }
}

/** A case table entry: the variant, and the names of the cases that it must make fail. */
export type Variant<F> = Readonly<{
  name: string
  fails: readonly string[]
  notApplicable?: Readonly<Record<string, string>>
  fixture: () => F
}>

/** Every case name of a suite is unique and names a clause. */
export function expectWellFormed<F>(cases: readonly ConformanceCase<F>[]): void {
  expect(new Set(cases.map(item => item.name)).size).toBe(cases.length)
  for (const item of cases) expect(item.clause.length).toBeGreaterThan(0)
}

/** Every case fails under at least one variant, so none of them is a check that cannot fail. */
export function expectEveryCaseIsCaught<F>(
  cases: readonly ConformanceCase<F>[],
  variants: readonly Variant<F>[],
): void {
  const caught = new Set(variants.flatMap(variant => variant.fails))
  expect(cases.map(item => item.name).filter(name => !caught.has(name))).toEqual([])
  const known = new Set(cases.map(item => item.name))
  expect([...caught].filter(name => !known.has(name))).toEqual([])
}

/** One test per variant: the verdict of the variant is exactly its table entry. */
export function itFailsExactly<F>(
  cases: readonly ConformanceCase<F>[],
  variants: readonly Variant<F>[],
): void {
  for (const variant of variants)
    it(`fails exactly the listed cases under: ${variant.name}`, async () => {
      const verdict = await judge(cases, variant.fixture)
      expect([...verdict.failed].sort()).toEqual([...variant.fails].sort())
      expect(verdict.notApplicable).toEqual(variant.notApplicable ?? {})
    })
}

export type LegalProvider<F> = Readonly<{
  name: string
  fixture: () => F
  notApplicable?: Readonly<Record<string, string>>
}>

/** One test per legal provider: no case fails, and the not applicable set is exactly the listed one. */
export function itPassesLegal<F>(
  cases: readonly ConformanceCase<F>[],
  providers: readonly LegalProvider<F>[],
): void {
  for (const provider of providers)
    it(`passes on a provider that the contract allows: ${provider.name}`, async () => {
      const verdict = await judge(cases, provider.fixture)
      expect(verdict.failed).toEqual([])
      expect(verdict.notApplicable).toEqual(provider.notApplicable ?? {})
      expect(verdict.passed.length + Object.keys(verdict.notApplicable).length).toBe(cases.length)
    })
}
