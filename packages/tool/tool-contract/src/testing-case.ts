import assert from 'node:assert/strict'
import { isDeepStrictEqual } from 'node:util'
import type { Outcome } from '@omne-harness/operation-result'
import type { Access } from './identity.ts'
import type { ToolFailure } from './results.ts'

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

export function succeeded<T>(outcome: Outcome<T, ToolFailure>, what: string): T {
  if ('failure' in outcome)
    assert.fail(`${what}: expected success, got ${JSON.stringify(outcome.failure)}`)
  return outcome.ok
}

export function refused(outcome: Outcome<unknown, ToolFailure>, what: string): ToolFailure {
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

export function expectOneOf(value: { kind: string }, kinds: readonly string[], what: string): void {
  assert.ok(
    kinds.includes(value.kind),
    `${what}: expected ${kinds.join(' or ')}, got ${value.kind}`,
  )
}

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

export interface TwoTenantFixture {
  readonly access: Access<unknown>
  readonly otherAccess?: Access<unknown>
}

export function otherAccessOf<F extends TwoTenantFixture>(fixture: F): F['access'] {
  const other = handle(fixture.otherAccess, 'otherAccess')
  assert.notDeepEqual(other.tenant, fixture.access.tenant, 'the fixture names one tenant twice')
  return other as F['access']
}

function shapeOf(answer: Outcome<unknown, ToolFailure>): string {
  return 'ok' in answer ? 'ok' : answer.failure.kind
}

export type AnswerRow<K extends string = string> = Readonly<{
  clause: string
  progress: readonly K[]
  lostReply?: readonly string[]
  ranks?: Readonly<Partial<Record<K, number>>>
  recalled?: readonly K[]
}>

export type AnswerModel<Method extends string = string> = Readonly<Record<Method, AnswerRow>>

function kindOf(answer: unknown): string {
  if (typeof answer !== 'object' || answer === null) return ''
  const value: unknown = 'ok' in answer ? answer.ok : answer
  if (typeof value !== 'object' || value === null || !('kind' in value)) return ''
  return typeof value.kind === 'string' ? value.kind : ''
}

function isLostReply(answer: unknown, row: AnswerRow): boolean {
  if (typeof answer !== 'object' || answer === null || !('failure' in answer)) return false
  const failure: unknown = answer.failure
  if (typeof failure !== 'object' || failure === null || !('kind' in failure)) return false
  return typeof failure.kind === 'string' && (row.lostReply ?? []).includes(failure.kind)
}

export function isProgress(answer: unknown, row: AnswerRow): boolean {
  return isLostReply(answer, row) || row.progress.includes(kindOf(answer))
}

export type Completion = Readonly<{ name: string; call: (() => Promise<void>) | undefined }>

export function completionOf<K extends string, A extends unknown[] = []>(
  fixture: Readonly<Partial<Record<NoInfer<K>, (...args: A) => Promise<void>>>>,
  name: K,
  ...args: A
): Completion {
  const offered = fixture[name]
  return { name, call: offered === undefined ? undefined : () => offered.apply(fixture, args) }
}

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

export type CrossTenantAnswers<A> = Readonly<{ real: A; ghost: A }>

const IDENTIFYING_SUBSTRING_MIN = 8

const POSITION = /^(?:0|[1-9]\d*)$/u

const isText = (key: string | symbol, positional: boolean): boolean =>
  !positional || typeof key !== 'string' || !POSITION.test(key)

function membersOf(value: object): unknown[] {
  const members: unknown[] = []
  if (value instanceof Map) for (const entry of value) members.push(...entry)
  if (value instanceof Set) members.push(...value)
  if (value instanceof Error) members.push(value.name)
  const positional = Array.isArray(value) || ArrayBuffer.isView(value)
  for (const key of Reflect.ownKeys(value)) {
    if (isText(key, positional)) members.push(key)
    members.push(Reflect.get(value, key))
  }
  return members
}

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

function occurrences(text: string, known: string): number[] {
  if (known.length === 0) return []
  if (known.length < IDENTIFYING_SUBSTRING_MIN) return text === known ? [0] : []
  const found: number[] = []
  for (let at = text.indexOf(known); at !== -1; at = text.indexOf(known, at + 1)) found.push(at)
  return found
}

function echoed(text: string, at: number, length: number, echoes: readonly string[]): boolean {
  return echoes.some(echo => {
    for (let start = Math.max(0, at + length - echo.length); start <= at; start += 1)
      if (text.startsWith(echo, start)) return true
    return false
  })
}

function toldBy(part: string | object, secrets: Secrets): string | object | undefined {
  if (typeof part !== 'string') return secrets.values.find(known => isDeepStrictEqual(part, known))
  return secrets.texts.find(known =>
    occurrences(part, known).some(at => !echoed(part, at, known.length, secrets.echoes)),
  )
}

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
  if (!isProgress(first.real, row)) return first
  const finish = completing(read.completion, first.real, what)
  await finish.call()
  const landed = { real: await ask.real(), ghost: await ask.ghost() }
  assertNothingTold(landed, secrets, `${what}: the answer after ${finish.name}`)
  return landed
}

function rankOf(answer: unknown, row: AnswerRow): number {
  if (!isProgress(answer, row)) return Number.POSITIVE_INFINITY
  return row.ranks?.[kindOf(answer)] ?? 0
}

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
