import assert from 'node:assert/strict'
export type ConformanceCase = Readonly<{ name: string; run(): Promise<void> }>
export class NotApplicable extends Error {}
export type CaseVerdict = Readonly<{
  name: string
  status: 'pass' | 'not-applicable'
  reason?: string
}>
export async function runConformanceCase(test: ConformanceCase): Promise<CaseVerdict> {
  try {
    await test.run()
    return { name: test.name, status: 'pass' }
  } catch (error) {
    if (error instanceof NotApplicable)
      return { name: test.name, status: 'not-applicable', reason: error.message }
    throw error
  }
}
export async function bounded<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(new assert.AssertionError({ message: 'conformance operation did not settle' })),
          ms,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
