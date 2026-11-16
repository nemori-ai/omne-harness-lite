import { AssertionError } from 'node:assert/strict'
import { expect, it } from 'vitest'
import { isNotApplicable, type ConformanceCase } from '@omne-harness/tool-cordis-contract/testing'

export type Verdicts = Readonly<{
  passed: readonly string[]
  failed: readonly string[]
  notApplicable: Readonly<Record<string, string>>
}>

type LateEnd = Readonly<{ failed: false } | { failed: true; error: unknown }>

const lateWork: Promise<LateEnd>[] = []

export function keep(work: PromiseLike<unknown>): void {
  lateWork.push(
    Promise.resolve(work).then(
      (): LateEnd => ({ failed: false }),
      (error: unknown): LateEnd => ({ failed: true, error }),
    ),
  )
}

export function later(count: number, work: () => unknown): void {
  keep(new Promise<void>(resolve => turns(count, resolve)).then(work))
}

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

export type Variant<F> = Readonly<{
  name: string
  fails: readonly string[]
  notApplicable?: Readonly<Record<string, string>>
  fixture: () => F
}>

export async function expectVariantVerdict<F>(
  cases: readonly ConformanceCase<F>[],
  variant: Variant<F>,
): Promise<void> {
  const verdict = await judge(cases, variant.fixture)
  expect([...verdict.failed].sort()).toEqual([...variant.fails].sort())
  expect(verdict.notApplicable).toEqual(variant.notApplicable ?? {})
}

export function expectWellFormed<F>(cases: readonly ConformanceCase<F>[]): void {
  expect(new Set(cases.map(item => item.name)).size).toBe(cases.length)
  for (const item of cases) expect(item.clause).toMatch(/^IC-\d+$/u)
}

export function expectEveryCaseIsCaught<F>(
  cases: readonly ConformanceCase<F>[],
  variants: readonly Variant<F>[],
): void {
  const caught = new Set(variants.flatMap(variant => variant.fails))
  expect(cases.map(item => item.name).filter(name => !caught.has(name))).toEqual([])
  const known = new Set(cases.map(item => item.name))
  expect([...caught].filter(name => !known.has(name))).toEqual([])
}

export function itFailsExactly<F>(
  cases: readonly ConformanceCase<F>[],
  variants: readonly Variant<F>[],
): void {
  for (const variant of variants)
    it(`fails exactly the listed cases under: ${variant.name}`, async () => {
      await expectVariantVerdict(cases, variant)
    })
}

export type LegalProvider<F> = Readonly<{
  name: string
  fixture: () => F
  notApplicable?: Readonly<Record<string, string>>
}>

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

export const turns = (count: number, then: () => void): void => {
  if (count === 0) then()
  else setImmediate(() => turns(count - 1, then))
}
