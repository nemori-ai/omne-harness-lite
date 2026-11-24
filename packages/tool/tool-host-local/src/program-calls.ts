import type { JsonValue } from '@omne-harness/json-text'
import { fail } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type {
  Access,
  FixedToolRequest,
  ProgramCallAnswer,
  ProgramCallFailure,
  ProgramCallFailureKind,
  ProgramFunction,
  ProgramTools,
  Reply,
  ToolFailure,
  ToolForwardIntent,
  ToolInvokeRequest,
} from '@omne-harness/tool-contract'
import {
  attachProgramTools,
  isProgramSettled,
  programFunctions,
  type PositionExclusion,
  type ProgramActionAdmission,
  type ProgramParent,
  type ProgramPosition,
  type ProgramTable,
  type ToolChildren,
  type ToolExecutionScope,
  type ToolProgramRuntime,
} from '@omne-harness/tool-contract/provider'
import type { ContentBlock } from '@omne-harness/content-block'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import type { LocalToolBindingRegistry } from './bindings.ts'
import { operationOf, readCallArguments } from './executor-binding.ts'
import type { LocalInvocationSource } from './invocation-source.ts'
import type { ProgramArrival } from './program-source.ts'

export type ArgumentsVerdict =
  | Readonly<{ kind: 'valid' }>
  | Readonly<{ kind: 'invalid'; reason: string }>
  | Readonly<{ kind: 'unavailable' }>

export type LocalProgramCallsInput<P> = Readonly<{
  source(): LocalInvocationSource<P>['programs'] | undefined
  runtime(): ToolProgramRuntime<P> | undefined
  children(): ToolChildren<P> | undefined
  admission(): ProgramActionAdmission<P> | undefined
  functions(parent: ProgramParent<P>): Reply<readonly ProgramFunction[]>
  /** Picks the target by name in the parent's view and makes its request; the position is added here. */
  prepareTarget(parent: ProgramParent<P>, intent: ToolForwardIntent): Reply<ToolInvokeRequest>
  checkArguments(access: Access<P>, request: FixedToolRequest): Promise<ArgumentsVerdict>
  retryMs: number
}>
export type LocalProgramCalls<P> = Readonly<{
  bind(parent: ProgramParent<P>, scope: ToolExecutionScope): ToolExecutionScope
}>

type Kind = ProgramCallFailureKind
const failed = (
  kind: Kind,
  effect: ProgramCallFailure['effect'],
  message: string,
): ProgramCallAnswer => ({ kind: 'failure', failure: { kind, effect, message } })
const absent = (name: string) =>
  failed('unavailable', 'none', `Program calls are unavailable: no ${name}.`)

const REFUSALS: Readonly<Partial<Record<ToolFailure['kind'], Kind>>> = {
  denied: 'denied',
  unsupported: 'unsupported',
  invalid: 'invalid',
  conflict: 'invalid',
  unavailable: 'unavailable',
  'commit-unknown': 'unknown',
}
const describe = (failure: ToolFailure): string => {
  if (failure.kind === 'unsupported') return failure.reason
  if (failure.kind === 'invalid') return `${failure.field}: ${failure.reason}`
  if (failure.kind === 'unavailable') return `${failure.dependency}: ${failure.diagnostic}`
  return failure.kind
}
const refusal = (failure: ToolFailure, fallback: Kind = 'unavailable'): ProgramCallAnswer => {
  const kind = REFUSALS[failure.kind] ?? fallback
  return failed(kind, kind === 'unknown' ? 'unknown' : 'none', describe(failure))
}

const EXCLUSIONS: Readonly<Record<PositionExclusion['kind'], Kind>> = {
  denied: 'denied',
  'not-accepted': 'unavailable',
  unavailable: 'unavailable',
}
const EFFECTS: Readonly<Record<ProgramArrival['effect']['kind'], ProgramCallFailure['effect']>> = {
  'not-started': 'none',
  'not-occurred': 'none',
  occurred: 'occurred',
  unknown: 'unknown',
}

/** What the program gets for a retained result: the value of a completed call, or a named failure. */
export function programAnswerOf(
  request: FixedToolRequest,
  arrival: ProgramArrival,
): ProgramCallAnswer {
  const { terminal } = arrival
  const effect = EFFECTS[arrival.effect.kind]
  if (terminal.kind === 'failed')
    return failed(
      terminal.cause === 'arguments' ? 'invalid' : 'failed',
      effect,
      terminal.diagnostic,
    )
  if (terminal.kind === 'unavailable') return failed('unavailable', effect, terminal.reason)
  if (terminal.kind === 'interrupted')
    return failed('interrupted', effect, `interrupted: ${terminal.cause.kind}`)
  if (terminal.kind === 'no-response') return failed('no-response', effect, terminal.reason)
  const declared = programFunctions(request.availability.definition).find(
    one => one.command === request.command,
  )
  if (declared === undefined || declared.returns.program.kind !== 'json')
    return { kind: 'value', value: null, external: false }
  if (arrival.data.kind !== 'json')
    return failed('failed', 'unknown', 'The call completed and gave a program no value.')
  return { kind: 'value', value: arrival.data.value, external: declared.external }
}

export function createLocalArgumentsCheck<P, E, B extends ContentBlock>(
  registry: () => LocalToolBindingRegistry<P, E, B> | undefined,
): LocalProgramCallsInput<P>['checkArguments'] {
  return async (access, request) => {
    const { availability } = request
    const loaded =
      availability.kind === 'available' ? registry()?.peek(access, availability) : undefined
    if (loaded === undefined || 'failure' in loaded) return { kind: 'unavailable' }
    const operation = operationOf(readToolRegistration(loaded.ok.implementation), request.command)
    if (operation === undefined) return { kind: 'unavailable' }
    const read = readCallArguments(request, operation)
    return 'failure' in read ? { kind: 'invalid', reason: read.failure.reason } : { kind: 'valid' }
  }
}

const targetOf = (entry: string): Pick<ToolForwardIntent, 'name' | 'command'> => {
  const dot = entry.indexOf('.')
  return dot < 0
    ? { name: entry, command: null }
    : { name: entry.slice(0, dot), command: entry.slice(dot + 1) }
}

type Running<P> = Readonly<{
  input: LocalProgramCallsInput<P>
  parent: ProgramParent<P>
  signal: AbortSignal
  pause(): Promise<void>
}>

/** TL-72: asks until the admission answers; a position it cannot answer for stays registered. */
async function admitted<P>(
  run: Running<P>,
  admission: ProgramActionAdmission<P>,
  ordinal: number,
  request: FixedToolRequest,
) {
  const { adoption, name } = request.availability.definition
  const { command } = request
  const target = { definition: adoption, name, command, arguments: request.arguments.effective }
  while (!run.signal.aborted) {
    const verdict = await admission
      .admit({ ...run.parent, ordinal, target }, run.signal)
      .catch(() => ({ kind: 'unanswerable' as const, diagnostic: 'threw' }))
    if (verdict.kind !== 'unanswerable') return verdict
    await run.pause()
  }
  return null
}

/** TL-65, TL-68: the fixed order of one position. Nothing is left behind before it is registered. */
async function place<P>(
  run: Running<P>,
  ordinal: number,
  entry: string,
  argumentsValue: JsonValue,
): Promise<ProgramCallAnswer> {
  const { input, parent } = run
  const source = input.source()
  const runtime = input.runtime()
  const children = input.children()
  const admission = input.admission()
  if (source === undefined) return absent('invocation source')
  if (runtime === undefined) return absent('tool runtime')
  if (children === undefined) return absent('position table')
  if (admission === undefined) return absent('admission of nested actions')
  if (argumentsValue.kind !== 'object')
    return failed('invalid', 'none', `${entry} takes one object of named arguments.`)
  const target = await input.prepareTarget(parent, {
    ...targetOf(entry),
    arguments: argumentsValue,
  })
  if ('failure' in target)
    return ['unavailable', 'commit-unknown'].includes(target.failure.kind)
      ? refusal(target.failure)
      : failed('unsupported', 'none', `${entry} is not a function this program can call.`)
  const placed = { ...parent, ordinal, target: target.ok }
  const prepared = await source.prepare(placed)
  if (prepared.kind === 'association-unknown') return absent('verified parent call')
  if (prepared.kind === 'rejected') return refusal(prepared.failure)
  const { request } = prepared
  const valid = await input.checkArguments(parent, request)
  if (valid.kind === 'unavailable') return absent('parser of the arguments')
  if (valid.kind === 'invalid') return failed('invalid', 'none', valid.reason)

  const at = { principal: parent.principal, tenant: parent.tenant, call: parent.call, ordinal }
  const { child, admission: operation, target: named } = prepared
  const registered = await children.register({ ...at, child, admission: operation, target: named })
  if ('failure' in registered) return refusal(registered.failure)
  let position: ProgramPosition = registered.ok
  if (position.state === 'registered') {
    const verdict = await admitted(run, admission, ordinal, request)
    if (verdict === null)
      return failed('interrupted', 'none', 'The program ended before this call was released.')
    if (verdict.kind === 'denied') {
      const exclusion = { kind: 'denied', reason: verdict.reason } as const
      const excluded = await children.exclude({ ...at, exclusion })
      return 'failure' in excluded
        ? refusal(excluded.failure)
        : failed('denied', 'none', verdict.reason)
    }
    const handed = await children.handOff(at)
    if ('failure' in handed) return refusal(handed.failure)
    position = handed.ok
  }
  if (position.state === 'excluded')
    return failed(EXCLUSIONS[position.exclusion.kind], 'none', position.exclusion.reason)

  const arrival = source.arrivals.wait(parent.tenant, prepared.consumer, run.signal)
  const outcome = await runtime.invoke(placed)
  if (outcome.kind !== 'accepted') {
    const reason = outcome.kind === 'rejected' ? describe(outcome.failure) : outcome.kind
    const excluded = await children.exclude({ ...at, exclusion: { kind: 'not-accepted', reason } })
    if ('ok' in excluded && excluded.ok.state === 'excluded')
      return outcome.kind === 'rejected'
        ? refusal(outcome.failure)
        : failed('unavailable', 'none', 'The call was not accepted.')
    if ('failure' in excluded && excluded.failure.kind !== 'invalid')
      return failed('unknown', 'unknown', 'Whether the call was accepted is not known.')
  }
  const arrived = await arrival
  return arrived === null
    ? failed('interrupted', 'unknown', 'The program ended before this call gave a result.')
    : programAnswerOf(request, arrived)
}

type Calls = Map<number, Readonly<{ digest: string; answer: Promise<ProgramCallAnswer> }>>

/** TL-67: closes registration, lets every position already made run on, and gives the table. */
async function settle<P>(run: Running<P>, calls: Calls): Reply<ProgramTable> {
  const children = run.input.children()
  const { principal, tenant, call } = run.parent
  const access = { principal, tenant, call }
  if (children === undefined) return fail(ended('The position table is absent.'))
  let table = await children.seal(access)
  while ('ok' in table && !isProgramSettled(table.ok) && !run.signal.aborted) {
    const before = calls.size
    await Promise.allSettled([...calls.values()].map(one => one.answer))
    table = await children.table(access)
    if ('failure' in table || calls.size !== before || isProgramSettled(table.ok)) continue
    const exclusion = { kind: 'unavailable', reason: 'The call was never released.' } as const
    for (const { ordinal, state } of table.ok.positions)
      if (state === 'registered') await children.exclude({ ...access, ordinal, exclusion })
    await run.pause()
  }
  return table
}

const ended = (diagnostic: string) =>
  ({ kind: 'unavailable', dependency: 'program-calls', diagnostic }) as const

function pauseOf(signal: AbortSignal, ms: number) {
  return () =>
    new Promise<void>(resolve => {
      const done = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', done)
        resolve()
      }
      const timer = setTimeout(done, ms)
      signal.addEventListener('abort', done, { once: true })
    })
}

export function createLocalProgramCalls<P>(input: LocalProgramCallsInput<P>): LocalProgramCalls<P> {
  if (!Number.isSafeInteger(input.retryMs) || input.retryMs <= 0)
    throw new TypeError('retryMs: range')
  return {
    bind(parent, scope) {
      const lifetime = new AbortController()
      const { signal } = lifetime
      const stop = () => lifetime.abort()
      scope.context.signal.addEventListener('abort', stop, { once: true })
      if (scope.context.signal.aborted) stop()
      const run: Running<P> = { input, parent, signal, pause: pauseOf(signal, input.retryMs) }
      const calls: Calls = new Map()
      const value: ProgramTools = {
        functions: () =>
          signal.aborted
            ? Promise.resolve(fail(ended('The program has ended.')))
            : input.functions(parent),
        call(asked) {
          const digest = canonicalDigest([asked.entry, asked.arguments])
          const known = calls.get(asked.ordinal)
          if (known !== undefined)
            return known.digest === digest
              ? known.answer
              : Promise.resolve(
                  failed('invalid', 'none', 'This position already made another call.'),
                )
          if (signal.aborted)
            return Promise.resolve(failed('interrupted', 'none', 'The program has ended.'))
          const answer = place(run, asked.ordinal, asked.entry, asked.arguments).catch(() =>
            failed('unknown', 'unknown', 'The call could not be followed to its end.'),
          )
          calls.set(asked.ordinal, { digest, answer })
          return answer
        },
        settle: () => settle(run, calls),
      }
      return attachProgramTools(scope, {
        value,
        close: async () => {
          stop()
          scope.context.signal.removeEventListener('abort', stop)
        },
      })
    },
  }
}
