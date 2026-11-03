// The case type that every conformance suite of `./testing` returns. A suite does not depend on a
// test framework: a case fails by throwing an `AssertionError` of `node:assert/strict`, and the
// consumer registers each case in its own framework. The shape follows the tool contract.

/**
 * One check of one port. `clause` names the SPEC requirement that decides the check. `run` takes a
 * fixture that the consumer built for this case alone, and resolves when the port behaved as the
 * clause requires. It throws an `AssertionError` when it did not, and `NotApplicable` when the
 * fixture lacks something that the case needs.
 */
export type ConformanceCase<F> = Readonly<{
  name: string
  clause: string
  run(fixture: F): Promise<void>
}>

/** The case checked nothing, because the fixture lacks `handle`. It is never a pass. */
export class NotApplicable extends Error {
  readonly handle: string
  constructor(handle: string) {
    super(`not applicable: the fixture offers no ${handle}`)
    this.name = 'NotApplicable'
    this.handle = handle
  }
}

export function isNotApplicable(error: unknown): error is NotApplicable {
  return error instanceof NotApplicable
}

export type CaseVerdict =
  | Readonly<{ kind: 'passed' }>
  | Readonly<{ kind: 'not-applicable'; handle: string }>

/**
 * Runs one case on one fixture. A failed assertion, or any other error, is thrown to the caller.
 * Only a missing handle comes back as a verdict.
 */
export async function runConformanceCase<F>(
  conformance: ConformanceCase<F>,
  fixture: F,
): Promise<CaseVerdict> {
  try {
    await conformance.run(fixture)
  } catch (error) {
    if (isNotApplicable(error)) return { kind: 'not-applicable', handle: error.handle }
    throw error
  }
  return { kind: 'passed' }
}

export function conformanceCase<F>(
  clause: string,
  name: string,
  run: (fixture: F) => Promise<void>,
): ConformanceCase<F> {
  return Object.freeze({ name, clause, run })
}

/** The handle of a fixture, or `NotApplicable` naming it. */
export function handle<T>(offered: T | undefined, name: string): T {
  if (offered === undefined) throw new NotApplicable(name)
  return offered
}
