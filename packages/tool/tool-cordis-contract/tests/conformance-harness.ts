// The self-proof harness of the registration suite. It runs every case of a suite on a fresh
// fixture and sorts the outcome: passed, not applicable, failed by an assertion. Any other error is
// rethrown, because a violating variant must be caught by an assertion, not by a crash. The tool
// contract package keeps a copy for its own suites, because tests cannot import across packages.
import { AssertionError } from 'node:assert/strict'
import { expect, it } from 'vitest'
import { isNotApplicable, type ConformanceCase } from '@omne-harness/tool-cordis-contract/testing'

export type Verdicts = Readonly<{
  passed: readonly string[]
  failed: readonly string[]
  notApplicable: Readonly<Record<string, string>>
}>

/** How a piece of late work ended: it is kept as a value, so it never rejects unhandled. */
type LateEnd = Readonly<{ failed: false } | { failed: true; error: unknown }>

/** The late work that the fixtures of the running case started and do not await. */
const lateWork: Promise<LateEnd>[] = []

/**
 * Keeps `work`, which a fixture started and does not await (a landing that comes later, a handle
 * that resolves early): the case that is running awaits it when it ends, so the work never
 * outlives the case, and a rejection of it fails the case as an assertion.
 */
export function keep(work: PromiseLike<unknown>): void {
  lateWork.push(
    Promise.resolve(work).then(
      (): LateEnd => ({ failed: false }),
      (error: unknown): LateEnd => ({ failed: true, error }),
    ),
  )
}

/** Runs `work` after `count` turns of the event loop, and keeps it (see `keep`). */
export function later(count: number, work: () => unknown): void {
  keep(new Promise<void>(resolve => turns(count, resolve)).then(work))
}

/** Awaits all late work, the work that it starts included; an assertion failure if any rejected. */
async function lateFailure(): Promise<AssertionError | undefined> {
  let failure: AssertionError | undefined
  while (lateWork.length > 0)
    for (const end of await Promise.all(lateWork.splice(0)))
      if (end.failed)
        failure ??= new AssertionError({
          message: `late work of the fixture rejected: ${String(end.error)}`,
        })
  return failure
}

type CaseEnd = Readonly<{ thrown: false } | { thrown: true; error: unknown }>

/**
 * Runs one case, then awaits the late work that it left. A rejected late work fails a case that
 * did not already fail by an assertion.
 */
async function endOf(run: () => Promise<void>): Promise<CaseEnd> {
  let end: CaseEnd = { thrown: false }
  try {
    await run()
  } catch (error) {
    end = { thrown: true, error }
  }
  const late = await lateFailure()
  if (late === undefined || (end.thrown && end.error instanceof AssertionError)) return end
  return { thrown: true, error: late }
}

export async function judge<F>(
  cases: readonly ConformanceCase<F>[],
  fixture: () => F | Promise<F>,
): Promise<Verdicts> {
  const passed: string[] = []
  const failed: string[] = []
  const notApplicable: Record<string, string> = {}
  for (const conformance of cases) {
    const end = await endOf(async () => conformance.run(await fixture()))
    if (!end.thrown) passed.push(conformance.name)
    else if (isNotApplicable(end.error)) notApplicable[conformance.name] = end.error.handle
    else if (end.error instanceof AssertionError) failed.push(conformance.name)
    else
      throw new Error(`case "${conformance.name}" crashed instead of failing`, { cause: end.error })
  }
  return { passed, failed, notApplicable }
}

/**
 * A case table entry: the variant, the names of the cases that it must make fail, and the cases
 * that it must leave not applicable with the handle each one names (none unless listed).
 */
export type Variant<F> = Readonly<{
  name: string
  fails: readonly string[]
  notApplicable?: Readonly<Record<string, string>>
  fixture: () => F
}>

/** The verdict of a variant is exactly its table entry: the listed failures, the listed gaps. */
export async function expectVariantVerdict<F>(
  cases: readonly ConformanceCase<F>[],
  variant: Variant<F>,
): Promise<void> {
  const verdict = await judge(cases, variant.fixture)
  expect([...verdict.failed].sort()).toEqual([...variant.fails].sort())
  expect(verdict.notApplicable).toEqual(variant.notApplicable ?? {})
}

/** Every case name of a suite is unique and names a clause of the SPEC or of the Cordis page. */
export function expectWellFormed<F>(cases: readonly ConformanceCase<F>[]): void {
  expect(new Set(cases.map(item => item.name)).size).toBe(cases.length)
  for (const item of cases) expect(item.clause).toMatch(/^IC-\d+$/u)
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

/**
 * One test per variant, titled with the whole name of the variant: the verdict of the variant is
 * exactly its table entry (the title is also how a mutation run names the variant).
 */
export function itFailsExactly<F>(
  cases: readonly ConformanceCase<F>[],
  variants: readonly Variant<F>[],
): void {
  for (const variant of variants)
    it(`fails exactly the listed cases under: ${variant.name}`, async () => {
      await expectVariantVerdict(cases, variant)
    })
}

/**
 * A provider that the contract allows, with the cases that it leaves not applicable (none unless
 * listed). `fixture` builds it at the port boundary: it wraps the service of a double and the
 * handles that it may change, and does not reach the controls of the double.
 */
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

/** Calls `then` after `count` turns of the event loop: the delay of a handle that resolves too early. */
export const turns = (count: number, then: () => void): void => {
  if (count === 0) then()
  else setImmediate(() => turns(count - 1, then))
}
