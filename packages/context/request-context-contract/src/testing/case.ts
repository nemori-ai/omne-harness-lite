export type ConformanceCase<F> = Readonly<{
  name: string
  clause: string
  run(fixture: F): Promise<void>
}>
export class NotApplicable extends Error {
  readonly handle: string
  constructor(handle: string) {
    super(`Fixture does not provide ${handle}`)
    this.name = 'NotApplicable'
    this.handle = handle
  }
}
export type CaseVerdict =
  | Readonly<{ kind: 'passed' }>
  | Readonly<{ kind: 'not-applicable'; handle: string }>
export async function runConformanceCase<F>(
  test: ConformanceCase<F>,
  fixture: F,
): Promise<CaseVerdict> {
  try {
    await test.run(fixture)
    return { kind: 'passed' }
  } catch (error) {
    if (error instanceof NotApplicable) return { kind: 'not-applicable', handle: error.handle }
    throw error
  }
}
