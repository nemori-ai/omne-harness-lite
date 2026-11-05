import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type {
  FixedToolRequest,
  Reply,
  ToolCatalog,
  ToolStartRecord,
} from '@omne-harness/tool-contract'
import {
  commandArguments,
  describeCommandArgumentsRejection,
  type CallAccess,
  type ToolBindings,
  type ToolExecutionFact,
  type ToolExecutionScope,
  type ToolExecutorBinding,
  type ToolStartAuthority,
} from '@omne-harness/tool-contract/provider'
import { readToolRegistration, type ToolOperationSlot } from '@omne-harness/tool-contract/binding'
import type { LocalToolBindingRegistry, ToolBindingSelection } from './bindings.ts'
import {
  createLiveAuthorExecution,
  localAuthorEvidence,
  type LocalAuthorExecution,
} from './live-author-execution.ts'

type Start = Extract<ToolStartRecord, { kind: 'start' }>
type StartInput<P, B extends ContentBlock, E> = Parameters<ToolExecutorBinding<P, B, E>['start']>[0]
type Final<B extends ContentBlock> = Extract<ToolExecutionFact<B>, { kind: 'final' }>
export type LocalToolBindingsInput<P, E, B extends ContentBlock> = Readonly<{
  registry: LocalToolBindingRegistry<P, E, B>
  catalog: Pick<ToolCatalog<P>, 'inspect'>
  authority: ToolStartAuthority<P>
  scope(
    input: CallAccess<P> &
      Readonly<{ start: Start; request: FixedToolRequest; execution: LocalAuthorExecution<B> }>,
  ): ToolExecutionScope
  settle(
    input: CallAccess<P> &
      Readonly<{
        start: Start
        request: FixedToolRequest
        operation: ToolOperationSlot
        arguments: unknown
        outcome:
          | Readonly<{ kind: 'returned'; value: unknown }>
          | Readonly<{ kind: 'failed'; reason: string }>
        execution: LocalAuthorExecution<B>
      }>,
  ): Reply<Final<B>>
}>

export function createLocalToolBindings<P, E, B extends ContentBlock>(
  dependencies: LocalToolBindingsInput<P, E, B>,
): ToolBindings<P, B, E> {
  type Bound = ToolBindingSelection<P, E, B> & {
    requestDigest: string
    accessKey: string
    binding: Extract<ToolExecutorBinding<P, B, E>, { kind: 'live-only' }>
  }
  type Attempt = {
    digest: string
    start: Start
    execution: LocalAuthorExecution<B>
    answer: ReturnType<ToolExecutorBinding<P, B, E>['start']>
  }
  const bindings = new Map<string, Bound>()
  const attempts = new Map<string, Attempt>()
  const callKey = (access: CallAccess<P>) => canonicalDigest([access.tenant, access.call])
  const startKey = (access: CallAccess<P>, start: ToolStartRecord) =>
    canonicalDigest([access.tenant, access.call, start.operation])
  const unavailable = (diagnostic: string) =>
    fail({ kind: 'unavailable' as const, dependency: 'toolBindings', diagnostic })

  const launch = async (
    input: StartInput<P, B, E>,
    environment: E,
    operation: ToolOperationSlot,
    execution: LocalAuthorExecution<B>,
  ): Promise<void> => {
    let parsed: unknown
    let outcome: Parameters<typeof dependencies.settle>[0]['outcome']
    let scope: ToolExecutionScope | undefined
    try {
      // The arguments of a multi-command tool are the whole call; its command codec parses the
      // parameters only (D-94). Arguments that the command does not take fail with the reason
      // and the guide of the command, so the next call can be right (D-104).
      const { request } = input
      const { definition } = request.availability
      const invalid = (reason: string) =>
        definition.kind === 'commands' && request.command !== null
          ? describeCommandArgumentsRejection(definition, request.command, reason)
          : reason
      const cut = commandArguments(definition, request.command, request.arguments)
      if ('failure' in cut) throw new Error(invalid(cut.failure.reason))
      const argumentsValue = operation.author.parameters.parse(cut.ok)
      if ('failure' in argumentsValue)
        throw new Error(
          argumentsValue.failure.kind === 'invalid'
            ? invalid(argumentsValue.failure.reason)
            : argumentsValue.failure.reason,
        )
      parsed = argumentsValue.ok
      scope = dependencies.scope({ ...input, execution })
      const value = await operation.author.executor.execute(parsed, environment, scope.context)
      const closed = await scope.finish('returned')
      if ('failure' in closed) throw new Error(closed.failure.reason)
      outcome = { kind: 'returned', value }
    } catch (error) {
      if (scope !== undefined) await scope.finish('failed')
      outcome = { kind: 'failed', reason: error instanceof Error ? error.message : 'author failed' }
    }
    const settled = await dependencies.settle({
      ...input,
      operation,
      arguments: parsed,
      outcome,
      execution,
    })
    if ('ok' in settled) execution.publish(settled.ok)
  }

  const makeBinding = (bound: Omit<Bound, 'binding'>): Bound['binding'] => {
    let assigned = false
    return {
      kind: 'live-only',
      start(input, environment) {
        const invalid = (field: string, reason: string) => {
          if (!assigned && callKey(input) === bound.accessKey) {
            bound.pin.release()
            assigned = true
          }
          return Promise.resolve(fail({ kind: 'invalid' as const, field, reason }))
        }
        if (canonicalDigest(input.request) !== bound.requestDigest)
          return invalid('request', 'resolved request mismatch')
        if (canonicalDigest(input.start.executor) !== canonicalDigest(bound.loaded.executor))
          return invalid('executor', 'original executor mismatch')
        if (
          canonicalDigest(input.tenant) !== canonicalDigest(input.start.execution.tenant) ||
          input.call !== input.start.execution.call ||
          input.permit.call !== input.call ||
          canonicalDigest(input.permit.tenant) !== canonicalDigest(input.tenant) ||
          canonicalDigest(input.permit.start) !== canonicalDigest(input.start)
        )
          return invalid('permit', 'start identity mismatch')
        const key = startKey(input, input.start)
        const digest = canonicalDigest([input.start, input.request])
        const old = attempts.get(key)
        if (old !== undefined)
          return old.digest === digest
            ? old.answer
            : Promise.resolve(fail({ kind: 'conflict', operation: input.start.operation }))
        const registration = readToolRegistration(bound.loaded.implementation)
        const operation =
          registration?.kind === 'function'
            ? input.request.command === null
              ? registration.operation
              : undefined
            : registration?.operations.find(([name]) => name === input.request.command)?.[1]
        if (operation === undefined) return invalid('command', 'original author has no operation')
        let pin = bound.pin
        if (assigned || callKey(input) !== bound.accessKey) {
          const retained = bound.repin(input, input.call)
          if ('failure' in retained)
            return Promise.resolve(unavailable(retained.failure.diagnostic))
          pin = retained.ok
        } else assigned = true
        const execution = createLiveAuthorExecution<B>({
          start: input.start,
          release: pin.release,
        })
        const answer = Promise.resolve().then(async () => {
          try {
            const consumed = await dependencies.authority.consume({
              ...input,
              executorReceipt: localAuthorEvidence(`start/${key}`, [input.start, input.request]),
            })
            if ('failure' in consumed) {
              if (['denied', 'invalid', 'conflict', 'unsupported'].includes(consumed.failure.kind))
                pin.release()
              return consumed
            }
            if (consumed.ok.kind !== 'started') {
              if (consumed.ok.kind !== 'unknown') pin.release()
              return consumed.ok.kind === 'unknown'
                ? fail({ kind: 'commit-unknown' as const, operation: input.start.operation })
                : fail({ kind: 'denied' as const, action: 'start-author' })
            }
            void launch(input, environment, operation, execution).catch(() => {
              execution.observationAvailable(false)
            })
            return succeed(execution.live)
          } catch {
            execution.observationAvailable(false)
            return fail({ kind: 'commit-unknown' as const, operation: input.start.operation })
          }
        })
        attempts.set(key, { digest, start: input.start, execution, answer })
        return answer
      },
      async inspectStart(input) {
        if (
          input.call !== input.start.execution.call ||
          canonicalDigest(input.tenant) !== canonicalDigest(input.start.execution.tenant)
        )
          return fail({ kind: 'denied', action: 'inspect-author-start' })
        const attempt = attempts.get(startKey(input, input.start))
        if (attempt === undefined)
          return succeed({ kind: 'unknown', diagnostic: 'no retained start record' })
        if (canonicalDigest(attempt.start) !== canonicalDigest(input.start))
          return fail({ kind: 'conflict', operation: input.start.operation })
        const answer = await attempt.answer
        return 'ok' in answer
          ? succeed(attempt.execution.inspect())
          : succeed({ kind: 'unknown', diagnostic: 'start has no confirmed executor receipt' })
      },
    }
  }
  return {
    inspect: input => dependencies.catalog.inspect(input),
    async resolve(input) {
      const key = callKey(input)
      const previous = bindings.get(key)
      if (previous !== undefined)
        return canonicalDigest(input.request) === previous.requestDigest
          ? succeed(previous.binding)
          : fail({ kind: 'invalid', field: 'request', reason: 'call already has a fixed request' })
      const selected = dependencies.registry.selectAndPin(input, input.request, input.call)
      if ('failure' in selected) return unavailable(selected.failure.diagnostic)
      const fixed = {
        ...selected.ok,
        requestDigest: canonicalDigest(input.request),
        accessKey: key,
      }
      const bound = { ...fixed, binding: makeBinding(fixed) }
      bindings.set(key, bound)
      return succeed(bound.binding)
    },
    async recover(input) {
      const bound = bindings.get(callKey(input))
      const attempt = attempts.get(startKey(input, input.start))
      if (bound === undefined || attempt === undefined)
        return unavailable('original author execution is absent')
      return succeed({
        acknowledge: attempt.execution.live.acknowledge,
        inspectStart: start => bound.binding.inspectStart({ ...input, start }),
        inspectSuspension: async () => unavailable('live-only author has no checkpoint'),
        stop: attempt.execution.live.stop,
        inspectControl: attempt.execution.live.inspectControl,
      })
    },
  }
}
