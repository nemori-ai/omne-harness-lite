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
export type Execution = ToolLiveExecution
export type Handles = Partial<
  Omit<Fixture, 'binding' | 'access' | 'environment' | 'request' | 'permit'>
>

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
        : succeed<ToolStartLookup>({
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

const controlAnswer = (kind: string): unknown =>
  kind === 'accepted'
    ? succeed<ControlProgress>({ kind: 'accepted', evidence: evidence('masked-acceptance') })
    : progressOf(kind, 'the stop is on its way')

export type Landing = Readonly<{ lagTurns?: number }>

function lift(mask: Mask, landing: Landing): void {
  if (landing.lagTurns === undefined) mask.lift()
  else
    turns(landing.lagTurns, () => {
      mask.lift()
    })
}

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
          : succeed<ToolStartLookup>({
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

export const coalescingFacts = variant(real => ({
  binding: overExecution(real, execution => ({
    facts: input =>
      (async function* () {
        const iterator = execution.facts(input)[Symbol.asyncIterator]()
        const ready: FactBatch[] = []
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

export const oneTenant = (): Fixture => without(memoryToolExecutorBindingFixture(), 'otherAccess')

export function permitFirst(): Fixture {
  const base = memoryToolExecutorBindingFixture()
  const issued = new Set<string>()
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
