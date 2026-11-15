import assert from 'node:assert/strict'
import type { Outcome } from '@omne-harness/operation-result'
import type { SessionFailure } from './faces.ts'

export type ConformanceCase<F> = Readonly<{
  name: string
  clause: string
  run(fixture: F): Promise<void>
}>

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

export function handle<T>(offered: T | undefined, name: string): T {
  if (offered === undefined) throw new NotApplicable(name)
  return offered
}

export function succeeded<T>(outcome: Outcome<T, SessionFailure>, what: string): T {
  if ('failure' in outcome)
    assert.fail(`${what}: expected success, got ${JSON.stringify(outcome.failure)}`)
  return outcome.ok
}

export function refused(outcome: Outcome<unknown, SessionFailure>, what: string): SessionFailure {
  if ('ok' in outcome) assert.fail(`${what}: expected a failure, got ${JSON.stringify(outcome.ok)}`)
  return outcome.failure
}

export function expectKind<T extends { kind: string }, K extends T['kind']>(
  value: T,
  kind: K,
  what: string,
): Extract<T, { kind: K }> {
  if (value.kind !== kind) assert.fail(`${what}: expected ${kind}, got ${value.kind}`)
  return value as Extract<T, { kind: K }>
}

export function shapeOf(answer: Outcome<unknown, SessionFailure>): string {
  return 'ok' in answer ? 'ok' : answer.failure.kind
}

export function assertIndistinguishable(
  answers: Readonly<{
    real: Outcome<unknown, SessionFailure>
    ghost: Outcome<unknown, SessionFailure>
  }>,
  what: string,
): void {
  assert.equal(
    shapeOf(answers.real),
    shapeOf(answers.ghost),
    `${what}: the answer tells that the session exists`,
  )
  assert.notEqual(shapeOf(answers.real), 'ok', `${what}: another tenant reads the session`)
  assert.deepEqual(answers.real, answers.ghost, `${what}: the answer differs for the real session`)
}
