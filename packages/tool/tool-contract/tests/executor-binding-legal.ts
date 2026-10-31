// The providers of the live-only executor binding suite that the contract allows, and the
// builders that the violating variants of the spec share with them. Each is built at the port
// boundary: it wraps the binding of a double, the executions that it hands out and the handles
// that it may change (`settle`, `completeStop`), and it never calls a control of a double to make
// the double behave.
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ControlProgress } from '@omne-harness/tool-contract'
import type {
  ControlDispatch,
  FactBatch,
  ToolLiveExecution,
  ToolStartLookup,
} from '@omne-harness/tool-contract/provider'
import {
  executorBindingAnswers,
  memoryToolExecutorBindingFixture,
  type ToolExecutorBindingFixture,
} from '@omne-harness/tool-contract/testing'
import { keep, turns } from './conformance-harness.ts'
import { createMask, maskedPort, progressOf, type Mask } from './generated-provider.ts'
import { evidence } from './tool-values.ts'

export type Environment = { readonly resource: string }
export type Fixture = ToolExecutorBindingFixture<string, Environment>
export type Binding = Fixture['binding']
export type Execution = ToolLiveExecution<ContentBlock>
export type Handles = Partial<
  Omit<Fixture, 'binding' | 'access' | 'environment' | 'request' | 'permit'>
>

/** A fixture whose binding is the double with `binding` laid over it and `handles` replaced. */
export function variant(
  build: (
    real: Binding,
    base: Fixture,
  ) => Readonly<{ binding?: Partial<Binding>; handles?: Handles }>,
): () => Fixture {
  return () => {
    const base = memoryToolExecutorBindingFixture()
    const laid = build(base.binding, base)
    return { ...base, ...laid.handles, binding: { ...base.binding, ...laid.binding } }
  }
}

/** Lays `over` on every execution that the binding hands out, from `start` and from `inspectStart`. */
export function overExecution(
  real: Binding,
  over: (execution: Execution) => Partial<Execution>,
  also: Partial<Binding> = {},
): Partial<Binding> {
  const wrap = (execution: Execution): Execution => ({ ...execution, ...over(execution) })
  return {
    start: async (input, environment) => {
      const answer = await real.start(input, environment)
      return 'failure' in answer ? answer : succeed(wrap(answer.ok))
    },
    inspectStart: async input => {
      const answer = await real.inspectStart(input)
      return 'failure' in answer || answer.ok.kind !== 'live'
        ? answer
        : succeed<ToolStartLookup<ContentBlock>>({
            kind: 'live',
            execution: wrap(answer.ok.execution),
          })
    },
    ...also,
  }
}

export const without = <T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> => {
  const { [key]: _removed, ...rest } = value
  return rest
}

const controlKey = (input: ControlDispatch): string =>
  JSON.stringify(['c', input.tenant, input.call, input.operation])
const startKey = (input: { tenant: unknown; call: string; start: { operation: string } }): string =>
  JSON.stringify(['s', input.tenant, input.call, input.start.operation])

/** The progress answer of a stop of kind `kind`; an accepted stop carries its evidence. */
const controlAnswer = (kind: string): unknown =>
  kind === 'accepted'
    ? succeed<ControlProgress>({ kind: 'accepted', evidence: evidence('masked-acceptance') })
    : progressOf(kind, 'the stop is on its way')

/** How a handle resolves relative to the lifting of its mask: with it, or `lag` turns after it. */
export type Landing = Readonly<{ lagTurns?: number }>

function lift(mask: Mask, landing: Landing): void {
  if (landing.lagTurns === undefined) mask.lift()
  else
    turns(landing.lagTurns, () => {
      mask.lift()
    })
}

/**
 * The generated provider of the table: the first answer of every method, for a new operation, is
 * progress of `kind`, and every read of it says so until the handle resolves (`settle` for
 * `inspectStart`, `completeStop` for a stop). With `lag`, the handle resolves before the mask is
 * lifted, which breaks the completion contract.
 */
export function generated(
  kind: string,
  options: Readonly<{
    settle?: boolean
    completeStop?: boolean
    settleLanding?: Landing
    stopLanding?: Landing
  }> = {},
): () => Fixture {
  return () => {
    const base = memoryToolExecutorBindingFixture()
    const startMask = createMask()
    const controlMask = createMask()
    const executions = (execution: Execution): Execution =>
      maskedPort(
        execution,
        executorBindingAnswers,
        {
          stop: { key: controlKey, creates: true, answer: controlAnswer },
          inspectControl: { key: controlKey, creates: false, answer: controlAnswer },
        },
        controlMask,
        kind,
      )
    const masked = maskedPort(
      base.binding,
      executorBindingAnswers,
      {
        inspectStart: {
          key: startKey,
          creates: true,
          answer: kindOf => progressOf(kindOf, 'the executor cannot tell yet'),
        },
      },
      startMask,
      kind,
    )
    const binding: Binding = {
      ...masked,
      start: async (input, environment) => {
        const answer = await base.binding.start(input, environment)
        return 'failure' in answer ? answer : succeed(executions(answer.ok))
      },
      inspectStart: async input => {
        const answer = await masked.inspectStart(input)
        return 'failure' in answer || answer.ok.kind !== 'live'
          ? answer
          : succeed<ToolStartLookup<ContentBlock>>({
              kind: 'live',
              execution: executions(answer.ok.execution),
            })
      },
    }
    const settle = async (): Promise<void> => {
      await base.settle?.()
      lift(startMask, options.settleLanding ?? {})
    }
    const completeStop = async (start: Parameters<NonNullable<Fixture['completeStop']>>[0]) => {
      await base.completeStop?.(start)
      lift(controlMask, options.stopLanding ?? {})
    }
    let offered: Fixture = { ...base, binding, settle, completeStop }
    if (options.settle === false) offered = without(offered, 'settle')
    if (options.completeStop === false) offered = without(offered, 'completeStop')
    return offered
  }
}

/** A stop answers `pending` first; a resend and an inspectControl read its progress. */
export function pendingFirstStop(): Fixture {
  const base = memoryToolExecutorBindingFixture()
  return {
    ...base,
    binding: {
      ...base.binding,
      start: async (input, environment) => {
        const answer = await base.binding.start(input, environment)
        if ('failure' in answer) return answer
        const execution = answer.ok
        const sent = new Set<string>()
        return succeed({
          ...execution,
          stop: async control => {
            if (!sent.has(control.operation)) {
              sent.add(control.operation)
              keep(execution.stop(control))
              return succeed<ControlProgress>({
                kind: 'pending',
                diagnostic: 'the stop is on its way',
              })
            }
            return execution.stop(control)
          },
        })
      },
    },
  }
}

/** P05 names the identity of an event and a batch apart: facts that are ready travel together. */
export const coalescingFacts = variant(real => ({
  binding: overExecution(real, execution => ({
    facts: input =>
      (async function* () {
        const iterator = execution.facts(input)[Symbol.asyncIterator]()
        const ready: FactBatch<ContentBlock>[] = []
        for (;;) {
          const next = await Promise.race([
            iterator.next(),
            new Promise<'idle'>(resolve => setTimeout(() => resolve('idle'), 20)),
          ])
          if (next === 'idle' || next.done === true) break
          ready.push(next.value)
        }
        const last = ready.at(-1)
        if (last !== undefined)
          yield {
            ...last,
            after: ready[0]?.after ?? null,
            events: ready.flatMap(batch => batch.events),
          }
        for (;;) {
          const next = await iterator.next()
          if (next.done === true) return
          yield next.value
        }
      })(),
  })),
}))

/** P07 lets a stop be answered `pending` first, also when the executor has already ended. */
export const endedStopPendingFirst = variant(real => ({
  binding: overExecution(real, execution => ({
    stop: async control => {
      const answer = await execution.stop(control)
      return 'failure' in answer || answer.ok.kind !== 'already-ended'
        ? answer
        : succeed<ControlProgress>({ kind: 'pending', diagnostic: 'on its way' })
    },
  })),
}))

/** The double with one tenant only: the cross-tenant cases have no second access. */
export const oneTenant = (): Fixture => without(memoryToolExecutorBindingFixture(), 'otherAccess')

/**
 * A binding that issues its own permits and judges the permit before the executor: a permit that
 * it never issued is denied, and a start that was made with one request and is asked again with
 * another is answered `invalid` before the executor sees it (P04: the binding judges the permit).
 */
export function permitFirst(): Fixture {
  const base = memoryToolExecutorBindingFixture()
  const issued = new Set<string>()
  /** The request of each start, as the first start of it gave it. */
  const requests = new Map<string, string>()
  return {
    ...base,
    permit: start => {
      const record = `permit-first/${issued.size + 1}`
      issued.add(record)
      return Promise.resolve({
        tenant: start.execution.tenant,
        call: start.execution.call,
        operation: start.operation,
        adoption: { owner: 'permit-first', name: 'permit', revision: '1', digest: 'sha256:pf' },
        inputDigest: 'sha256:the-request-of-the-start',
        start,
        guards: [],
        request: evidence(record),
      })
    },
    binding: {
      ...base.binding,
      start: async (input, environment) => {
        if (!issued.has(input.permit.request.record))
          return fail({ kind: 'denied', action: 'start' })
        const key = JSON.stringify([input.tenant, input.call, input.start.operation])
        const request = JSON.stringify(input.request)
        if ((requests.get(key) ?? request) !== request)
          return fail({
            kind: 'invalid',
            field: 'permit',
            reason: 'the start was given another request',
          })
        requests.set(key, request)
        return base.binding.start(input, environment)
      },
    },
  }
}
