// The case type that every conformance suite of the `./testing` entry returns, and the helpers the
// suites share. A suite does not depend on a test framework: a case fails by throwing an
// `AssertionError` of `node:assert/strict`, and the consumer registers each case in its own
// framework.
import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import type { Outcome } from '@omne-harness/operation-result'
import type { Access } from './identity.ts'
import type { ToolFailure } from './results.ts'

/**
 * One check of one port. `clause` is the anchor of the SPEC section that decides the check, for
 * example `P04`. `run` takes a fixture that the consumer built for this case alone, and resolves
 * when the port behaved as the clause requires. It throws an `AssertionError` when it did not, and
 * `NotApplicable` when the fixture lacks a control handle that the case needs.
 */
export type ConformanceCase<F> = Readonly<{
  name: string
  clause: string
  run(fixture: F): Promise<void>
}>

/**
 * The case needs a control handle that the fixture does not offer, so it checked nothing. It is
 * never a pass: a consumer counts it apart from the passed cases.
 */
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
 * Runs one case on one fixture. A failed assertion, or any other error, is thrown to the caller;
 * only a missing handle is reported as a verdict.
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
  return { name, clause, run }
}

/** The handle of a fixture, or `NotApplicable` naming it. */
export function handle<T>(offered: T | undefined, name: string): T {
  if (offered === undefined) throw new NotApplicable(name)
  return offered
}

/** The value of a success. A failure is an assertion failure that names `what`. */
export function succeeded<T>(outcome: Outcome<T, ToolFailure>, what: string): T {
  if ('failure' in outcome)
    assert.fail(`${what}: expected success, got ${JSON.stringify(outcome.failure)}`)
  return outcome.ok
}

/** The failure of a refusal. A success is an assertion failure that names `what`. */
export function refused(outcome: Outcome<unknown, ToolFailure>, what: string): ToolFailure {
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

/** An assertion failure unless the branch of `value` is one of `kinds`. */
export function expectOneOf(value: { kind: string }, kinds: readonly string[], what: string): void {
  assert.ok(
    kinds.includes(value.kind),
    `${what}: expected ${kinds.join(' or ')}, got ${value.kind}`,
  )
}

/** Waits for `work`, or fails when it takes longer than `milliseconds`. */
export async function within<T>(work: Promise<T>, milliseconds: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new assert.AssertionError({ message: `${what}: no answer within ${milliseconds} ms` }))
    }, milliseconds)
  })
  try {
    return await Promise.race([work, late])
  } finally {
    clearTimeout(timer)
  }
}

/** The part of a fixture that names two tenants: the own one, and optionally another. */
export interface TwoTenantFixture {
  readonly access: Access<unknown>
  readonly otherAccess?: Access<unknown>
}

/**
 * The access of the second tenant of a fixture, or `NotApplicable` naming `otherAccess`. The two
 * accesses must name different tenants, or the cross-tenant cases would prove nothing.
 */
export function otherAccessOf<F extends TwoTenantFixture>(fixture: F): F['access'] {
  const other = handle(fixture.otherAccess, 'otherAccess')
  assert.notDeepEqual(other.tenant, fixture.access.tenant, 'the fixture names one tenant twice')
  return other as F['access']
}

/** How an answer reads to a caller that learns only its kind: success, or the kind of the failure. */
function shapeOf(answer: Outcome<unknown, ToolFailure>): string {
  return 'ok' in answer ? 'ok' : answer.failure.kind
}

// ---------------------------------------------------------------------------------------------
// The answer model: how the answers of one operation of a port read
// ---------------------------------------------------------------------------------------------

/**
 * How the answers of one method of a port read, with the clause that fixes it. `progress` lists
 * the kinds that say the work is not finished (`pending`, `unknown`, `accepted`, ...); `lostReply`
 * lists the failure kinds that say the reply was lost and the operation must be asked again
 * (`commit-unknown`). Every other answer is final: it is the result of the operation, and a
 * resend or an inspection recalls it as it was. `ranks` orders the progress kinds that advance
 * (`pending` < `accepted`); a kind that is not listed has rank 0, and a lost reply always has
 * rank 0. `recalled` lists the progress kinds whose evidence a read recalls as it was (`accepted`
 * keeps its evidence until the executor ended). `K` is the union of the progress kinds: a row
 * typed with it can rank or recall only a kind that `progress` lists.
 */
export type AnswerRow<K extends string = string> = Readonly<{
  clause: string
  progress: readonly K[]
  lostReply?: readonly string[]
  ranks?: Readonly<Partial<Record<K, number>>>
  recalled?: readonly K[]
}>

/** The answer rows of a port, one per method that is asked about an operation. */
export type AnswerModel<Method extends string = string> = Readonly<Record<Method, AnswerRow>>

/**
 * The kind of an answer that is a value of a port, or an outcome that holds one; the empty text
 * when it has none (a failure, or a value without a text `kind`). No row lists the empty text.
 */
function kindOf(answer: unknown): string {
  if (typeof answer !== 'object' || answer === null) return ''
  const value: unknown = 'ok' in answer ? answer.ok : answer
  if (typeof value !== 'object' || value === null || !('kind' in value)) return ''
  return typeof value.kind === 'string' ? value.kind : ''
}

/** True when `answer` is a lost reply under `row`: a failure of one of its `lostReply` kinds. */
function isLostReply(answer: unknown, row: AnswerRow): boolean {
  if (typeof answer !== 'object' || answer === null || !('failure' in answer)) return false
  const failure: unknown = answer.failure
  if (typeof failure !== 'object' || failure === null || !('kind' in failure)) return false
  return typeof failure.kind === 'string' && (row.lostReply ?? []).includes(failure.kind)
}

/**
 * True when `answer` is not the final answer of its operation under `row`: a progress kind, or a
 * lost reply. An answer may be a value of the port or the outcome that holds it, and is read as
 * an untrusted value: anything else is not progress. A failure of any other kind is final (a
 * refusal answers once and is recalled).
 */
export function isProgress(answer: unknown, row: AnswerRow): boolean {
  return isLostReply(answer, row) || row.progress.includes(kindOf(answer))
}

/**
 * A completion handle of a fixture, named by the member of the fixture that offers it. `call` is
 * that member, bound to the fixture and to its arguments, or `undefined` when the fixture does
 * not offer it. Its completion contract: it resolves only after the deferred work has landed and
 * is visible to every read of the port.
 */
export type Completion = Readonly<{ name: string; call: (() => Promise<void>) | undefined }>

/**
 * The completion handle `name` of `fixture`, called with `args`. The name is the key that reads
 * the member, so the name that a verdict reports is the member that the fixture lacks.
 */
export function completionOf<K extends string, A extends unknown[] = []>(
  fixture: Readonly<Partial<Record<NoInfer<K>, (...args: A) => Promise<void>>>>,
  name: K,
  ...args: A
): Completion {
  const offered = fixture[name]
  return { name, call: offered === undefined ? undefined : () => offered.apply(fixture, args) }
}

/**
 * The call that drives a progress answer to its end, or `NotApplicable` naming the handle that
 * the fixture lacks. A read with no completion handle cannot drive progress: that is a failure.
 */
function completing(
  completion: Completion | undefined,
  answer: unknown,
  what: string,
): Readonly<{ name: string; call: () => Promise<void> }> {
  if (completion === undefined)
    assert.fail(
      `${what}: ${JSON.stringify(answer)} is not final, and no completion handle drives it`,
    )
  return { name: completion.name, call: handle(completion.call, completion.name) }
}

/**
 * The final answer of an operation, and the one way a case reads it the first time. The operation
 * is asked once. An answer that is progress (or a lost reply) is driven to its end with the
 * completion handle of the fixture: the operation is asked once more while it is still in progress
 * (a resend, or a read, that the provider answers by the rule of `resendRecalls`), the handle
 * resolves, and the operation is asked a last time. So the suite never polls: the last answer must
 * be final, and must be the one that the resend during progress already gave if that was final,
 * or the provider broke its contract. A fixture without the handle makes the case not applicable,
 * naming it, before anything is asked again. An answer that is final at once never needs the
 * handle, and a row without progress kinds and lost replies is read with no handle. `view` is what
 * the two comparisons of `resendRecalls` read of an answer, the answer itself when it is not given:
 * a port whose final answer may carry a part that is fresh on every read (the reconnect capability
 * of a `prepared` preparation) gives the view without that part. A view keeps the kind of the
 * answer. The answer that the read returns is the last answer itself, not its view.
 */
export async function finalAnswer<A>(
  read: Readonly<{
    ask: () => Promise<A>
    row: AnswerRow
    completion?: Completion
    view?: (answer: A) => unknown
    what: string
  }>,
): Promise<A> {
  const { ask, row, view = (answer: A): unknown => answer, what } = read
  const first = await ask()
  if (!isProgress(first, row)) return first
  const finish = completing(read.completion, first, what)
  const during = await ask()
  resendRecalls(
    row,
    { earlier: view(first), later: view(during) },
    `${what}: a resend during progress`,
  )
  await finish.call()
  const again = await ask()
  if (isProgress(again, row))
    assert.fail(`${what}: still ${JSON.stringify(again)} after ${finish.name} resolved`)
  resendRecalls(
    row,
    { earlier: view(during), later: view(again) },
    `${what}: the answer that landed`,
  )
  return again
}

/** The two answers of another tenant: for the record of a tenant, and for a record that never was. */
export type CrossTenantAnswers<A> = Readonly<{ real: A; ghost: A }>

/**
 * The shortest identifying text that a cross-tenant check also looks for inside a longer text. A
 * short value (a record named by a row number, such as "1") occurs by chance in the ordinary text
 * of a provider: in a revision, a count, an operation of the other tenant or a hexadecimal digest.
 * So a short value tells the record only as a whole text. A value of this length or longer (a
 * record name, a digest, the text of a tenant) does not occur by chance, so it tells the record
 * wherever it appears, in a diagnostic too.
 */
const IDENTIFYING_SUBSTRING_MIN = 8

/** An index key of an array or a typed array: a position, not a text of the answer. */
const POSITION = /^(?:0|[1-9]\d*)$/u

/** True when `key` is a text of the answer: any key, except a position of a `positional` object. */
const isText = (key: string | symbol, positional: boolean): boolean =>
  !positional || typeof key !== 'string' || !POSITION.test(key)

/**
 * The members of an object that a cross-tenant check reads: the keys and the values of its own
 * properties (a symbol key is read by its description), the keys and values of a `Map`, the
 * elements of a `Set`, and the `name`, `message` and `cause` of an `Error`. The index keys of an
 * array or of a typed array are positions and are not read as texts; their elements are.
 */
function membersOf(value: object): unknown[] {
  const members: unknown[] = []
  if (value instanceof Map) for (const entry of value) members.push(...entry)
  if (value instanceof Set) members.push(...value)
  // The `message` and `cause` of an `Error` are own properties; its `name` is often inherited.
  if (value instanceof Error) members.push(value.name)
  const positional = Array.isArray(value) || ArrayBuffer.isView(value)
  for (const key of Reflect.ownKeys(value)) {
    if (isText(key, positional)) members.push(key)
    members.push(Reflect.get(value, key))
  }
  return members
}

/**
 * The first finding of `visit` over every text and every object of `value`, at any depth, or
 * `undefined`. The members of an object are those of `membersOf`. An object is visited once, so a
 * cycle ends.
 */
function findPart<T>(
  value: unknown,
  visit: (part: string | object) => T | undefined,
  seen: Set<object>,
): T | undefined {
  if (typeof value === 'string') return visit(value)
  if (typeof value === 'symbol') return findPart(value.description, visit, seen)
  if (typeof value !== 'object' || value === null || seen.has(value)) return undefined
  seen.add(value)
  const found = visit(value)
  if (found !== undefined) return found
  for (const member of membersOf(value)) {
    const inner = findPart(member, visit, seen)
    if (inner !== undefined) return inner
  }
  return undefined
}

/**
 * What a cross-tenant check looks for. `texts` and `values` are the identifying texts and the
 * identifying structured values; a structured value that the other tenant sent itself is left
 * out. `echoes` are the texts that the other tenant sent, at any depth of what it sent.
 */
type Secrets = Readonly<{
  texts: readonly string[]
  values: readonly object[]
  echoes: readonly string[]
}>

function secretsOf(identifying: readonly unknown[], submitted: readonly unknown[]): Secrets {
  const echoes: string[] = []
  const sent: object[] = []
  findPart(
    submitted,
    part => {
      if (typeof part === 'string') echoes.push(part)
      else sent.push(part)
      return undefined
    },
    new Set(),
  )
  return {
    texts: identifying.filter((known): known is string => typeof known === 'string'),
    values: identifying.filter(
      (known): known is object =>
        typeof known === 'object' &&
        known !== null &&
        !sent.some(value => isDeepStrictEqual(value, known)),
    ),
    echoes,
  }
}

/**
 * Where `known` occurs in `text` as an identifying value: the whole text when `known` is shorter
 * than `IDENTIFYING_SUBSTRING_MIN`, and every place where it occurs when it is not. An empty value
 * occurs nowhere.
 */
function occurrences(text: string, known: string): number[] {
  if (known.length === 0) return []
  if (known.length < IDENTIFYING_SUBSTRING_MIN) return text === known ? [0] : []
  const found: number[] = []
  for (let at = text.indexOf(known); at !== -1; at = text.indexOf(known, at + 1)) found.push(at)
  return found
}

/**
 * True when the `length` characters of `text` at `at` lie inside one place where a text that the
 * other tenant sent occurs: the answer echoes what the other tenant sent there.
 */
function echoed(text: string, at: number, length: number, echoes: readonly string[]): boolean {
  return echoes.some(echo => {
    for (let start = Math.max(0, at + length - echo.length); start <= at; start += 1)
      if (text.startsWith(echo, start)) return true
    return false
  })
}

/** The identifying value that `part`, a text or an object of an answer, tells, or `undefined`. */
function toldBy(part: string | object, secrets: Secrets): string | object | undefined {
  if (typeof part !== 'string') return secrets.values.find(known => isDeepStrictEqual(part, known))
  return secrets.texts.find(known =>
    occurrences(part, known).some(at => !echoed(part, at, known.length, secrets.echoes)),
  )
}

/**
 * An assertion failure unless the two answers read alike (success or the same failure, the same
 * kind) and nothing of the answer about the real record tells one of its identifying values.
 */
function assertNothingTold(
  answers: CrossTenantAnswers<Outcome<unknown, ToolFailure>>,
  secrets: Secrets,
  what: string,
): void {
  const { real, ghost } = answers
  assert.equal(shapeOf(real), shapeOf(ghost), `${what}: the answer tells that the record exists`)
  assert.equal(kindOf(real), kindOf(ghost), `${what}: the answer tells that the record exists`)
  const told = findPart(real, part => toldBy(part, secrets), new Set())
  if (told !== undefined)
    assert.fail(`${what}: the answer carries ${JSON.stringify(told)} of the record`)
}

/**
 * The one way a cross-tenant case reads what another tenant learns. The other tenant asks once
 * about the record of the tenant (`real`) and once about a record that never existed (`ghost`).
 * The two answers must read alike: success or the same failure, and the same kind. The answer
 * about the real record must not tell one of `identifying`, the values that identify that record:
 * texts (its receipt, its operation, the texts of the tenant, the digest of its evidence) and
 * structured values (the `TenantId` of the tenant). `submitted` holds what the other tenant sent
 * itself (its access, its operation, the evidence or permit that it passed): an answer may echo
 * it. Every text and every object of the answer is read, keys included (see `membersOf`). A text
 * that the other tenant sent is an echo wherever it occurs, and an identifying text that occurs
 * only inside an echo tells nothing. Otherwise a text equal to an identifying text tells it, and
 * an identifying text of `IDENTIFYING_SUBSTRING_MIN` characters or more tells it wherever it
 * occurs inside a longer text. An object deeply equal to an identifying structured value tells
 * it, unless the other tenant sent that value. When the first answer is progress (or a lost
 * reply) under `row`, it may still turn into anything, so the completion handle of the fixture is
 * called, both are asked once more, and the two answers that come after the handle are checked
 * the same way. They need not be final: on a read whose progress kind is also the lasting answer
 * for a record never seen (`unknown` of `inspectOperation`), a read by another tenant may stay
 * there. A fixture without the handle makes the case not applicable, naming it. The answers that
 * the case keeps checking are the last two.
 */
export async function crossTenantAnswers<A extends Outcome<unknown, ToolFailure>>(
  read: Readonly<{
    ask: Readonly<{ real: () => Promise<A>; ghost: () => Promise<A> }>
    row: AnswerRow
    completion?: Completion
    identifying: readonly unknown[]
    submitted: readonly unknown[]
    what: string
  }>,
): Promise<CrossTenantAnswers<A>> {
  const { ask, row, what } = read
  const secrets = secretsOf(read.identifying, read.submitted)
  const first = { real: await ask.real(), ghost: await ask.ghost() }
  assertNothingTold(first, secrets, `${what}: the first answer`)
  // The two answers read alike, so the first one tells whether both are still in progress.
  if (!isProgress(first.real, row)) return first
  const finish = completing(read.completion, first.real, what)
  await finish.call()
  const landed = { real: await ask.real(), ghost: await ask.ghost() }
  assertNothingTold(landed, secrets, `${what}: the answer after ${finish.name}`)
  return landed
}

/** The rank of an answer in the course of its operation: progress by `ranks`, a final above all. */
function rankOf(answer: unknown, row: AnswerRow): number {
  if (!isProgress(answer, row)) return Number.POSITIVE_INFINITY
  return row.ranks?.[kindOf(answer)] ?? 0
}

/**
 * The one rule for a read that comes after another read of the same operation (a resend, an
 * inspection, the answer that lands): the course never moves backwards, and what was answered for
 * good is recalled as it was. A final answer is recalled byte for byte; progress may advance
 * (`pending` to `accepted` to a final) but never goes back; a progress kind that the row lists as
 * recalled keeps its evidence while the operation stays at that rank.
 */
export function resendRecalls(
  row: AnswerRow,
  reads: Readonly<{ earlier: unknown; later: unknown }>,
  what: string,
): void {
  const { earlier, later } = reads
  if (!isProgress(earlier, row)) {
    assert.deepEqual(later, earlier, `${what}: an answer that was final is not recalled as it was`)
    return
  }
  assert.ok(
    rankOf(later, row) >= rankOf(earlier, row),
    `${what}: the operation went back from ${JSON.stringify(earlier)} to ${JSON.stringify(later)}`,
  )
  const kind = kindOf(earlier)
  if ((row.recalled ?? []).includes(kind) && kindOf(later) === kind)
    assert.deepEqual(later, earlier, `${what}: the ${kind} answer changed its evidence`)
}
