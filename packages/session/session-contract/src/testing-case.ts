// Shared parts of the `./testing` entry: the case shape of a conformance suite and the helpers the
// suites share. A suite does not depend on a test framework: a case fails by throwing an
// `AssertionError` of `node:assert/strict`, and the consumer registers each case in its own
// framework. The shape follows `@omne-harness/tool-contract/testing`.
import assert from 'node:assert/strict'
import type { Outcome } from '@omne-harness/operation-result'
import type { SessionFailure } from './faces.ts'

/**
 * One check of one port. `clause` is the anchor of the SPEC section that decides the check, for
 * example `JC-01`. `run` takes a fixture that the consumer built for this case alone, and resolves
 * when the port behaved as the clause requires. It throws an `AssertionError` when it did not, and
 * `NotApplicable` when the fixture lacks a control handle that the case needs.
 */
export type ConformanceCase<F> = Readonly<{
  name: string
  clause: string
  run(fixture: F): Promise<void>
}>

/** The case needs a control handle that the fixture does not offer, so it checked nothing. */
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

/** Runs one case on one fixture. A failed assertion is thrown; only a missing handle is a verdict. */
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
  return { name, clause, run }
}

/** The handle of a fixture, or `NotApplicable` naming it. */
export function handle<T>(offered: T | undefined, name: string): T {
  if (offered === undefined) throw new NotApplicable(name)
  return offered
}

/** The value of a success. A failure is an assertion failure that names `what`. */
export function succeeded<T>(outcome: Outcome<T, SessionFailure>, what: string): T {
  if ('failure' in outcome)
    assert.fail(`${what}: expected success, got ${JSON.stringify(outcome.failure)}`)
  return outcome.ok
}

/** The failure of a refusal. A success is an assertion failure that names `what`. */
export function refused(outcome: Outcome<unknown, SessionFailure>, what: string): SessionFailure {
  if ('ok' in outcome) assert.fail(`${what}: expected a failure, got ${JSON.stringify(outcome.ok)}`)
  return outcome.failure
}

/** `value` narrowed to the branch `kind`, or an assertion failure that names `what`. */
export function expectKind<T extends { kind: string }, K extends T['kind']>(
  value: T,
  kind: K,
  what: string,
): Extract<T, { kind: K }> {
  if (value.kind !== kind) assert.fail(`${what}: expected ${kind}, got ${value.kind}`)
  return value as Extract<T, { kind: K }>
}

/** How an answer reads to a caller that learns only its kind: `ok`, or the kind of the failure. */
export function shapeOf(answer: Outcome<unknown, SessionFailure>): string {
  return 'ok' in answer ? 'ok' : answer.failure.kind
}

/**
 * The one way a cross-tenant case reads what another tenant learns (J40): the other tenant asks
 * once about the real session and once about a session that never existed. The two answers must
 * read alike, and neither may be a success.
 */
export function assertIndistinguishable(
  answers: Readonly<{ real: Outcome<unknown, SessionFailure>; ghost: Outcome<unknown, SessionFailure> }>,
  what: string,
): void {
  assert.equal(shapeOf(answers.real), shapeOf(answers.ghost), `${what}: the answer tells that the session exists`)
  assert.notEqual(shapeOf(answers.real), 'ok', `${what}: another tenant reads the session`)
  assert.deepEqual(answers.real, answers.ghost, `${what}: the answer differs for the real session`)
}
