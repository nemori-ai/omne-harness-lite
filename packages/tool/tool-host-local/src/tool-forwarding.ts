import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import {
  encodeToolInvocationRef,
  type Access,
  type Reply,
  type ToolCatalog,
  type ToolConsumerProfile,
  type ToolFixedReadArguments,
  type ToolForwardIntent,
  type ToolInvocationRef,
  type ToolInvokeOutcome,
  type ToolInvokeRequest,
  type ToolResult,
  type ToolResultVersion,
  type ToolRuntime,
  type ToolsCapability,
  type ToolsExecuteAnswer,
} from '@omne-harness/tool-contract'
import {
  attachToolsCapability,
  type ToolExecutionScope,
  type ToolForwardParent,
  type ToolForwardRuntime,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import { invocationSourceIdentities } from './invocation-source.ts'
import { forwardIntentOf, forwardingIntentDigest } from './invocation-forwarding.ts'
import { createLocalTextResults } from './text-results.ts'

type MessageResult = ToolResult<ToolMessageContentBlock>
type ResultReader<P> = Readonly<{
  present(
    input: Access<P> & Readonly<{ reference: ToolInvocationRef; result: ToolResultVersion }>,
  ): Promise<MessageResult>
  read(input: Access<P> & Readonly<{ arguments: ToolFixedReadArguments }>): Promise<MessageResult>
}>
export type LocalToolForwardingInput<P> = Readonly<{
  runtime():
    | Readonly<{ queries: Pick<ToolRuntime<P, ToolMessageContentBlock>['queries'], 'lookup'> }>
    | undefined
  forwarding(): ToolForwardRuntime<P> | undefined
  catalog(): ToolCatalog<P> | undefined
  consumer(parent: ToolForwardParent<P>): Reply<ToolConsumerProfile>
  prepareTarget(parent: ToolForwardParent<P>, intent: ToolForwardIntent): Reply<ToolInvokeRequest>
  reader(): ResultReader<P> | undefined
  attemptMs: number
}>
export type LocalToolForwarding<P> = Readonly<{
  bind(parent: ToolForwardParent<P>, scope: ToolExecutionScope): ToolExecutionScope
  close(): Promise<Readonly<{ pending: 0; unknown: number }>>
}>
const unavailable = (dependency: string) => ({
  kind: 'unavailable' as const,
  dependency,
  diagnostic: 'The Tools capability or its current provider is unavailable.',
})
const statusResult = (value: unknown): MessageResult => {
  const result = createLocalTextResults().text(JSON.stringify(value))
  if ('failure' in result) throw new Error('Cannot render Tools capability status')
  return result.ok
}

/** A provider owns late source/admission promises. Finishing an author stops only its wait. */
export function createLocalToolForwarding<P>(
  input: LocalToolForwardingInput<P>,
): LocalToolForwarding<P> {
  if (!Number.isSafeInteger(input.attemptMs) || input.attemptMs <= 0)
    throw new TypeError('attemptMs: range')
  let closed = false
  const unresolved = new Set<ToolInvocationRef>()
  const pending = new Set<Promise<unknown>>()
  const scopes = new Set<() => void>()
  let closing: ReturnType<LocalToolForwarding<P>['close']> | undefined
  const track = <T>(promise: Promise<T>, reference: ToolInvocationRef): Promise<T> => {
    pending.add(promise)
    void promise.then(
      () => pending.delete(promise),
      () => {
        pending.delete(promise)
        unresolved.add(reference)
      },
    )
    return promise
  }
  return {
    bind(parent, scope) {
      const admission = invocationSourceIdentities(parent.tenant, parent.request.consumer).admission
      const encoded = encodeToolInvocationRef({
        tenant: parent.tenant,
        call: parent.call,
        admission,
      })
      if ('failure' in encoded) throw new TypeError('Invalid parent invocation identity')
      const reference = encoded.ok
      const lifetime = new AbortController()
      const stop = () => {
        lifetime.abort()
        scopes.delete(stop)
        scope.context.signal.removeEventListener('abort', stop)
      }
      scopes.add(stop)
      scope.context.signal.addEventListener('abort', stop, { once: true })
      if (closed || scope.context.signal.aborted) stop()
      const live = () => !closed && !lifetime.signal.aborted
      const rejected = (): ToolsExecuteAnswer => ({
        kind: 'rejected',
        failure: unavailable('tools-capability'),
      })
      const bounded = <T>(work: Promise<T>, fallback: () => T): Promise<T> =>
        new Promise((resolve, reject) => {
          const finish = () => {
            clearTimeout(timer)
            lifetime.signal.removeEventListener('abort', aborted)
          }
          const aborted = () => {
            finish()
            resolve(fallback())
          }
          const timer = setTimeout(aborted, Math.min(input.attemptMs, 2_147_483_647))
          lifetime.signal.addEventListener('abort', aborted, { once: true })
          void work.then(
            value => {
              finish()
              resolve(value)
            },
            error => {
              finish()
              reject(error)
            },
          )
          if (lifetime.signal.aborted) aborted()
        })
      const present = async (
        target: ToolInvocationRef,
        reason: 'waiting' | 'background' | 'commit-unknown',
        recoveryParent = reference,
      ): Promise<ToolsExecuteAnswer> => {
        const runtime = input.runtime()
        if (runtime === undefined)
          return { kind: 'pending', reference: target, parent: recoveryParent, reason }
        const current = await runtime.queries.lookup({
          principal: parent.principal,
          tenant: parent.tenant,
          reference: target,
        })
        if ('failure' in current)
          return current.failure.kind === 'commit-unknown'
            ? {
                kind: 'pending',
                reference: target,
                parent: recoveryParent,
                reason: 'commit-unknown',
              }
            : { kind: 'rejected', failure: current.failure }
        if (current.ok.kind === 'found' && current.ok.state.phase === 'settled') {
          const reader = input.reader()
          if (reader === undefined)
            return { kind: 'rejected', failure: unavailable('tool-result-reader') }
          const result = current.ok.state.result
          return {
            kind: 'completed',
            reference: target,
            result,
            value: await reader.present({
              principal: parent.principal,
              tenant: parent.tenant,
              reference: target,
              result,
            }),
          }
        }
        return {
          kind: 'pending',
          reference: target,
          parent: recoveryParent,
          reason:
            current.ok.kind !== 'found'
              ? 'commit-unknown'
              : current.ok.kind === 'found' && current.ok.state.foreground?.kind === 'background'
                ? 'background'
                : reason,
        }
      }
      const answer = (
        outcome: ToolInvokeOutcome,
        recoveryParent = reference,
      ): Promise<ToolsExecuteAnswer> => {
        if (outcome.kind === 'rejected') return Promise.resolve(outcome)
        if (outcome.kind === 'association-unknown') {
          unresolved.add(recoveryParent)
          return Promise.resolve({ kind: 'association-unknown', parent: recoveryParent })
        }
        if (outcome.kind === 'commit-unknown') unresolved.add(recoveryParent)
        else unresolved.delete(recoveryParent)
        return present(
          outcome.reference,
          outcome.kind === 'commit-unknown' ? 'commit-unknown' : 'waiting',
          recoveryParent,
        )
      }
      const access = { principal: parent.principal, tenant: parent.tenant }
      const value: ToolsCapability = {
        async search(argumentsValue) {
          if (!live()) return fail(unavailable('tools-capability'))
          const catalog = input.catalog(),
            consumer = await input.consumer(parent)
          if (!live()) return fail(unavailable('tools-capability'))
          if ('failure' in consumer) return consumer
          if (catalog === undefined) return fail(unavailable('toolCatalog'))
          const result = await catalog.search({
            ...access,
            ...argumentsValue,
            consumer: consumer.ok,
            invocation: parent.request.invocation.kind,
          })
          return live() ? result : fail(unavailable('tools-capability'))
        },
        async inspect(argumentsValue) {
          if (!live()) return fail(unavailable('tools-capability'))
          const catalog = input.catalog(),
            consumer = await input.consumer(parent)
          if (!live()) return fail(unavailable('tools-capability'))
          if ('failure' in consumer) return consumer
          if (catalog === undefined) return fail(unavailable('toolCatalog'))
          const request = { ...access, ...argumentsValue, consumer: consumer.ok }
          const availability = await catalog.inspect(request)
          if ('failure' in availability) return availability
          const known = availability.ok
          if (known.kind === 'known-unavailable')
            return live()
              ? succeed({ ...known, usage: null })
              : fail(unavailable('tools-capability'))
          const usage =
            known.definition.kind === 'commands' && argumentsValue.command === null
              ? succeed(null)
              : await catalog.usage({ ...request, adoption: known.definition.adoption })
          if ('failure' in usage) return usage
          const current = await catalog.inspect(request)
          if (!live()) return fail(unavailable('tools-capability'))
          if ('failure' in current) return current
          if (canonicalDigest(current.ok) !== canonicalDigest(known))
            return fail(unavailable('toolCatalog'))
          return succeed({ ...known, usage: usage.ok })
        },
        async execute(intent) {
          if (!live()) return rejected()
          const originalIntent = forwardIntentOf(parent.request)
          if (
            originalIntent === null ||
            forwardingIntentDigest(intent) !== forwardingIntentDigest(originalIntent)
          )
            return { kind: 'rejected', failure: { kind: 'denied', action: 'admit' } }
          let progress: ToolsExecuteAnswer = { kind: 'association-unknown', parent: reference }
          const work = track(
            (async (): Promise<ToolsExecuteAnswer> => {
              const forward = input.forwarding()
              if (forward === undefined)
                return { kind: 'rejected', failure: unavailable('tool-forwarding') }
              const resumed = await forward.resume({ ...access, reference })
              let outcome = resumed
              if (resumed.kind === 'association-unknown') {
                if (!live()) return progress
                const target = await input.prepareTarget(parent, intent)
                if (!live()) return progress
                if ('failure' in target)
                  return target.failure.kind === 'commit-unknown'
                    ? progress
                    : { kind: 'rejected', failure: target.failure }
                outcome = await forward.invoke({ ...parent, intent, target: target.ok })
              }
              if (outcome.kind === 'accepted' || outcome.kind === 'commit-unknown')
                progress = {
                  kind: 'pending',
                  reference: outcome.reference,
                  parent: reference,
                  reason: outcome.kind === 'commit-unknown' ? 'commit-unknown' : 'waiting',
                }
              return answer(outcome)
            })(),
            reference,
          )
          return bounded(work, () => progress)
        },
        async readResult(argumentsValue) {
          if (!live()) return statusResult(rejected())
          if (argumentsValue.kind === 'result' || argumentsValue.kind === 'attachment') {
            const reader = input.reader()
            return reader === undefined
              ? statusResult(unavailable('tool-result-reader'))
              : reader.read({ ...access, arguments: argumentsValue })
          }
          if (argumentsValue.kind !== 'invocation' && argumentsValue.kind !== 'forwarding')
            return statusResult(unavailable('tools-reference'))
          const fallback: ToolsExecuteAnswer =
            argumentsValue.kind === 'invocation'
              ? {
                  kind: 'pending',
                  reference: argumentsValue.reference,
                  parent: reference,
                  reason: 'waiting',
                }
              : { kind: 'association-unknown', parent: argumentsValue.reference }
          const work = track(
            (async () => {
              if (argumentsValue.kind === 'forwarding') {
                const forward = input.forwarding()
                return forward === undefined
                  ? rejected()
                  : answer(
                      await forward.resume({ ...access, reference: argumentsValue.reference }),
                      argumentsValue.reference,
                    )
              }
              return present(argumentsValue.reference, 'waiting')
            })(),
            argumentsValue.reference,
          )
          const result = await bounded(work, () => fallback)
          if (result.kind === 'completed') return result.value
          if (argumentsValue.kind === 'invocation' && result.kind === 'pending')
            return statusResult({
              kind: result.kind,
              reference: result.reference,
              reason: result.reason,
            })
          return statusResult(result)
        },
      }
      return attachToolsCapability(scope, {
        value,
        close: async () => {
          stop()
        },
      })
    },
    close() {
      if (closing !== undefined) return closing
      closed = true
      for (const stop of scopes) stop()
      closing = (async () => {
        await Promise.allSettled(pending)
        return { pending: 0 as const, unknown: unresolved.size }
      })()
      return closing
    },
  }
}
