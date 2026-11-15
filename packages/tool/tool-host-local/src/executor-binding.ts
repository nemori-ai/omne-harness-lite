import type { ContentBlock } from '@omne-harness/content-block'
import { judgeJsonValue, writeJsonText } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type {
  DurableEvidence,
  FixedToolRequest,
  Reply,
  ToolCatalog,
  ToolOperationId,
  ToolStartRecord,
  WaitIntent,
} from '@omne-harness/tool-contract'
import type { Outcome } from '@omne-harness/operation-result'
import {
  authorDecision,
  CLOSED_RESULT_MAX_BYTES,
  commandArguments,
  describeCommandArgumentsRejection,
  type AuthorWait,
  type AuthorSegment,
  type CallAccess,
  type ToolPrimitiveFailure,
  type SuspensionProgress,
  type SuspensionRecord,
  type ToolBindings,
  type ToolExecutionFact,
  type ToolExecutionScope,
  type ToolExecutorBinding,
  type ToolSegmentContext,
  type ToolStartAuthority,
} from '@omne-harness/tool-contract/provider'
import { readToolRegistration, type ToolOperationSlot } from '@omne-harness/tool-contract/binding'
import type { LocalToolBindingRegistry, ToolBindingSelection } from './bindings.ts'
import {
  createLiveAuthorExecution,
  localAuthorEvidence,
  type LocalAuthorExecution,
} from './live-author-execution.ts'
import { segmentWait } from './segment-operations.ts'

type Start = ToolStartRecord
type StartInput<P, E> = Omit<Parameters<ToolExecutorBinding<P, E>['start']>[0], 'start'> &
  Readonly<{ start: Start }>
type Segment = Outcome<AuthorSegment<Uint8Array, unknown>, ToolPrimitiveFailure>
type Final = Extract<ToolExecutionFact, { kind: 'final' }>

function closeScope(
  scope: ToolExecutionScope,
  exit: Parameters<ToolExecutionScope['finish']>[0],
): ReturnType<ToolExecutionScope['finish']> {
  const unknown = () =>
    fail({
      kind: 'unknown' as const,
      operation: 'scope.finish',
      reason: 'The execution scope did not confirm its closing responsibility.',
    })
  try {
    return scope.finish(exit).catch(unknown)
  } catch {
    return Promise.resolve(unknown())
  }
}

export type LocalToolBindingsInput<P, E, B extends ContentBlock> = Readonly<{
  registry: LocalToolBindingRegistry<P, E, B>
  catalog: Pick<ToolCatalog<P>, 'inspect'>
  authority: ToolStartAuthority<P>
  scope(
    input: CallAccess<P> &
      Readonly<{ start: Start; request: FixedToolRequest; execution: LocalAuthorExecution }>,
  ): ToolExecutionScope
  capability?(
    input: CallAccess<P> &
      Readonly<{ start: Extract<ToolStartRecord, { kind: 'start' }>; request: FixedToolRequest }>,
    scope: ToolExecutionScope,
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
        closing: ReturnType<ToolExecutionScope['finish']>
        execution: LocalAuthorExecution
      }>,
  ): Reply<Final>
}>

type SuspendedSegment = Readonly<{
  payload: DurableEvidence
  state: string
  closedResult: string
  boundary: DurableEvidence
  exclusion: DurableEvidence
  intent: WaitIntent
}>

function operationOf(
  registration: ReturnType<typeof readToolRegistration>,
  command: string | null,
): ToolOperationSlot | undefined {
  if (registration?.kind === 'function')
    return command === null ? registration.operation : undefined
  return registration?.operations.find(([name]) => name === command)?.[1]
}

function argumentsOf<P, E>(input: StartInput<P, E>, operation: ToolOperationSlot): unknown {
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
  return argumentsValue.ok
}

function declaredWait(operation: ToolOperationSlot, wait: AuthorWait): boolean {
  return (
    wait.kind === 'ask' &&
    operation.author.waits.some(
      declared =>
        declared.kind === 'ask' &&
        canonicalDigest(declared.adoption) === canonicalDigest(wait.contract.adoption),
    )
  )
}

export function createLocalToolBindings<P, E, B extends ContentBlock>(
  dependencies: LocalToolBindingsInput<P, E, B>,
): ToolBindings<P, E> {
  type Bound = ToolBindingSelection<P, E, B> & {
    requestDigest: string
    accessKey: string
    operation: ToolOperationSlot | undefined
    binding: ToolExecutorBinding<P, E>
  }
  type Attempt = {
    digest: string
    start: Start
    execution: LocalAuthorExecution
    answer: ReturnType<ToolExecutorBinding<P, E>['start']>
    answered: boolean
    entered: boolean
    enter(): void
    pin: Pin | null
    segment: SuspendedSegment | Readonly<{ kind: 'completed' }> | null
    consumed: readonly ToolOperationId[]
  }
  type Pin = Bound['pin']
  const bindings = new Map<string, Bound>()
  const attempts = new Map<string, Attempt>()
  const replays = (attempt: Attempt) => attempt.entered || !attempt.answered
  const releasePin = (attempt: Attempt) => {
    attempt.pin?.release()
    attempt.pin = null
  }
  type Started = ReturnType<ToolExecutorBinding<P, E>['start']>
  type Lookup = ReturnType<ToolExecutorBinding<P, E>['inspectStart']>
  const DEFINITE = new Set(['denied', 'invalid', 'conflict', 'unsupported'])

  const consumeFor = async (input: StartInput<P, E>, key: string, attempt: Attempt): Started => {
    const operation = input.start.operation
    try {
      const consumed = await dependencies.authority.consume({
        ...input,
        executorReceipt: localAuthorEvidence(`start/${key}`, [input.start, input.request]),
      })
      if ('failure' in consumed) {
        if (DEFINITE.has(consumed.failure.kind)) releasePin(attempt)
        return consumed
      }
      if (consumed.ok.kind === 'started') {
        attempt.enter()
        return succeed(attempt.execution.live)
      }
      if (consumed.ok.kind === 'unknown') return fail({ kind: 'commit-unknown', operation })
      releasePin(attempt)
      return fail({ kind: 'denied', action: 'start-author' })
    } catch {
      return fail({ kind: 'commit-unknown', operation })
    } finally {
      attempt.answered = true
    }
  }

  const askFence = async (
    input: CallAccess<P> & Readonly<{ start: Start }>,
    attempt: Attempt | undefined,
  ): Lookup => {
    const decided = await dependencies.authority.inspect({
      principal: input.principal,
      tenant: input.tenant,
      call: input.call,
      start: input.start,
    })
    if ('failure' in decided) return decided
    const progress = decided.ok
    if (progress.kind === 'not-started' || progress.kind === 'rejected')
      return succeed({ kind: 'not-started', exclusion: progress.exclusion })
    if (progress.kind === 'unknown')
      return succeed({ kind: 'unknown', diagnostic: progress.diagnostic })
    if (attempt === undefined)
      return succeed({
        kind: 'unknown',
        diagnostic: 'the fence accepted the start, and this process holds no attempt of it',
      })
    attempt.enter()
    return succeed(attempt.execution.inspect())
  }
  type Place = Pick<CallAccess<P>, 'tenant' | 'call'>
  const callKey = (access: Place) => canonicalDigest([access.tenant, access.call])
  const startKey = (access: Place, start: ToolStartRecord) =>
    canonicalDigest([access.tenant, access.call, start.operation])
  const unavailable = (diagnostic: string) =>
    fail({ kind: 'unavailable' as const, dependency: 'toolBindings', diagnostic })

  const withCapability = (input: StartInput<P, E>, scope: ToolExecutionScope) => {
    const { start } = input
    return start.kind === 'start'
      ? (dependencies.capability?.({ ...input, start }, scope) ?? scope)
      : scope
  }

  const launch = async (
    input: StartInput<P, E>,
    environment: E,
    operation: ToolOperationSlot,
    execution: LocalAuthorExecution,
  ): Promise<void> => {
    let parsed: unknown
    let outcome: Parameters<typeof dependencies.settle>[0]['outcome']
    let scope: ToolExecutionScope | undefined
    let closing: ReturnType<ToolExecutionScope['finish']> = Promise.resolve(succeed(undefined))
    try {
      parsed = argumentsOf(input, operation)
      scope = dependencies.scope({ ...input, execution })
      scope = withCapability(input, scope)
      const value = await operation.author.executor.execute(parsed, environment, scope.context)
      outcome = { kind: 'returned', value }
      closing = closeScope(scope, 'returned')
    } catch (error) {
      outcome = { kind: 'failed', reason: error instanceof Error ? error.message : 'author failed' }
      if (scope !== undefined) closing = closeScope(scope, 'failed')
    }
    const settled = await dependencies.settle({
      ...input,
      operation,
      arguments: parsed,
      outcome,
      closing,
      execution,
    })
    if ('ok' in settled) execution.publish(settled.ok)
  }

  const suspendSegment = (
    input: StartInput<P, E>,
    operation: ToolOperationSlot,
    execution: LocalAuthorExecution,
    attempt: Attempt,
    suspended: Extract<AuthorSegment<Uint8Array, unknown>, { kind: 'suspended' }>,
  ): string | null => {
    const segments = operation.segments
    if (segments === null) return 'the author does not run in segments'
    const { state, wait, closedResult } = suspended
    if (!declaredWait(operation, wait)) return 'the segment waits for an Ask it did not declare'
    if (
      typeof closedResult !== 'string' ||
      closedResult.length === 0 ||
      new TextEncoder().encode(closedResult).byteLength > CLOSED_RESULT_MAX_BYTES
    )
      return 'the segment gives no result for a closed wait within the bound'
    if (!(state instanceof Uint8Array) || state.byteLength > segments.checkpoint.maxBytes)
      return 'the segment state exceeds the declared checkpoint size'
    const { contract } = wait
    const judged = judgeJsonValue(wait.request)
    if (!('ok' in judged)) return 'the request of the segment wait is no JSON value'
    const request = writeJsonText(judged.ok)
    if (Buffer.byteLength(request) > contract.request.maxBytes)
      return 'the request of the segment wait exceeds the declared size'
    const key = startKey(input, input.start)
    const schemas = {
      contract: contract.adoption,
      request: contract.request.identity,
      response: contract.response.identity,
      requestMaxBytes: contract.request.maxBytes,
      responseMaxBytes: contract.response.maxBytes,
      expiry: 'forbidden' as const,
    }
    const waitId = segmentWait(input.start.operation)
    if ('failure' in waitId) return 'the start cannot name the wait of its segment'
    const kept = Buffer.from(state).toString('base64')
    const payload = localAuthorEvidence(`checkpoint-state/${key}`, kept)
    const intent: WaitIntent = {
      kind: 'ask',
      wait: waitId.ok,
      resume: payload,
      request: localAuthorEvidence(`wait-request/${key}`, request),
      schemas: { ...schemas, source: localAuthorEvidence(`wait-schemas/${key}`, schemas) },
    }
    attempt.segment = {
      payload,
      state: kept,
      closedResult,
      intent,
      boundary: localAuthorEvidence(`segment-boundary/${key}`, [input.start, intent]),
      exclusion: localAuthorEvidence(`segment-returned/${key}`, [input.start, payload]),
    }
    execution.publish({ kind: 'wait', value: intent, request })
    return null
  }

  const launchSegment = async (
    input: StartInput<P, E>,
    environment: E,
    operation: ToolOperationSlot,
    execution: LocalAuthorExecution,
    attempt: Attempt,
    enter: (
      segments: NonNullable<ToolOperationSlot['segments']>,
      parsed: unknown,
      context: ToolSegmentContext,
    ) => Promise<Segment>,
  ): Promise<void> => {
    let parsed: unknown
    let outcome: Parameters<typeof dependencies.settle>[0]['outcome']
    let scope: ToolExecutionScope | undefined
    let closing: ReturnType<ToolExecutionScope['finish']> | null = null
    try {
      const segments = operation.segments
      if (segments === null) throw new Error('the author does not run in segments')
      parsed = argumentsOf(input, operation)
      scope = dependencies.scope({ ...input, execution })
      scope = withCapability(input, scope)
      const { context: full } = scope
      const context: ToolSegmentContext = {
        emit: update => full.emit(update),
        signal: full.signal,
      }
      const segment = await enter(segments, parsed, context)
      closing = closeScope(scope, 'failure' in segment ? 'failed' : 'returned')
      if ('failure' in segment) throw new Error(segment.failure.reason)
      if (segment.ok.kind === 'suspended') {
        // A segment suspends only after its scope confirmed that nothing of it still runs.
        const closed = await closing
        if ('failure' in closed) throw new Error(closed.failure.reason)
        const refused = suspendSegment(input, operation, execution, attempt, segment.ok)
        if (refused === null) return
        throw new Error(refused)
      }
      outcome = { kind: 'returned', value: segment.ok.value }
    } catch (error) {
      if (scope !== undefined) closing ??= closeScope(scope, 'failed')
      outcome = {
        kind: 'failed',
        reason: error instanceof Error ? error.message : 'author failed',
      }
    }
    attempt.segment = { kind: 'completed' }
    const settled = await dependencies.settle({
      ...input,
      operation,
      arguments: parsed,
      outcome,
      closing: closing ?? Promise.resolve(succeed(undefined)),
      execution,
    })
    if ('ok' in settled) execution.publish(settled.ok)
  }

  const suspensionOf = (
    bound: Omit<Bound, 'binding'>,
    suspension: SuspensionRecord,
  ): SuspensionProgress | 'denied' => {
    const access = { tenant: suspension.tenant, call: suspension.call }
    if (
      suspension.call !== suspension.start.execution.call ||
      canonicalDigest(suspension.tenant) !== canonicalDigest(suspension.start.execution.tenant) ||
      callKey(access) !== bound.accessKey
    )
      return 'denied'
    const attempt = attempts.get(startKey(access, suspension.start))
    if (
      attempt === undefined ||
      canonicalDigest(attempt.start) !== canonicalDigest(suspension.start)
    )
      return { kind: 'unknown', diagnostic: 'no retained segment of this start' }
    if (
      canonicalDigest(suspension.schema) !==
      canonicalDigest(bound.operation?.segments?.checkpoint.codec)
    )
      return { kind: 'rejected', diagnostic: 'the suspension names another checkpoint schema' }
    const ended = attempt.segment
    if (ended === null) return { kind: 'unknown', diagnostic: 'the segment has not returned' }
    if (!('intent' in ended))
      return {
        kind: 'not-suspended',
        evidence: localAuthorEvidence(
          `segment-completed/${startKey(access, suspension.start)}`,
          suspension.start,
        ),
      }
    return {
      kind: 'suspended',
      state: ended.state,
      checkpoint: {
        schema: suspension.schema,
        payload: ended.payload,
        closedResult: ended.closedResult,
        start: attempt.start,
        consumedResponses: attempt.consumed,
        effectBoundary: ended.boundary,
        exclusion: ended.exclusion,
      },
    }
  }

  const makeBinding = (bound: Omit<Bound, 'binding'>): Bound['binding'] => {
    let assigned = false
    type Enter = Parameters<typeof launchSegment>[5]
    const takePin = (input: StartInput<P, E>, old: Attempt | undefined) => {
      if (old?.pin != null) {
        const kept = old.pin
        old.pin = null
        return succeed(kept)
      }
      if (assigned || callKey(input) !== bound.accessKey) {
        const retained = bound.repin(input, input.call)
        return 'failure' in retained
          ? unavailable(retained.failure.diagnostic)
          : succeed(retained.ok)
      }
      assigned = true
      return succeed(bound.pin)
    }
    const begin = (
      input: StartInput<P, E>,
      environment: E,
      enter: Enter,
      consumedResponses: readonly ToolOperationId[],
    ): ReturnType<ToolExecutorBinding<P, E>['start']> => {
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
      if (old !== undefined) {
        if (old.digest !== digest)
          return Promise.resolve(fail({ kind: 'conflict', operation: input.start.operation }))
        if (replays(old)) return old.answer
      }
      const operation = bound.operation
      if (operation === undefined) return invalid('command', 'original author has no operation')
      const taken = takePin(input, old)
      if ('failure' in taken) return Promise.resolve(taken)
      const pin = taken.ok
      const execution = createLiveAuthorExecution({
        start: input.start,
        release: pin.release,
      })
      const answer = Promise.resolve().then(() => consumeFor(input, key, attempt))
      const attempt: Attempt = {
        digest,
        start: input.start,
        execution,
        answer,
        answered: false,
        entered: false,
        pin,
        enter: () => {
          if (attempt.entered) return
          attempt.entered = true
          attempt.pin = null
          attempt.answer = Promise.resolve(succeed(execution.live))
          const launched =
            operation.segments === null
              ? launch(input, environment, operation, execution)
              : launchSegment(input, environment, operation, execution, attempt, enter)
          void launched.catch(() => undefined)
        },
        segment: null,
        consumed: consumedResponses,
      }
      attempts.set(key, attempt)
      return answer
    }
    const live: Extract<ToolExecutorBinding<P, E>, { kind: 'live-only' }> = {
      kind: 'live-only',
      start: (input, environment) =>
        begin(
          input,
          environment,
          (segments, parsed, context) => segments.initial(parsed, environment, context),
          [],
        ),
      async inspectStart(input) {
        if (
          input.call !== input.start.execution.call ||
          canonicalDigest(input.tenant) !== canonicalDigest(input.start.execution.tenant)
        )
          return fail({ kind: 'denied', action: 'inspect-author-start' })
        const key = startKey(input, input.start)
        const known = attempts.get(key)
        if (known !== undefined && canonicalDigest(known.start) !== canonicalDigest(input.start))
          return fail({ kind: 'conflict', operation: input.start.operation })
        if (known !== undefined && !known.answered) await known.answer
        const attempt = attempts.get(key)
        return attempt?.entered === true
          ? succeed(attempt.execution.inspect())
          : askFence(input, attempt)
      },
    }
    const segments = bound.operation?.segments ?? null
    if (segments === null) return live
    const prove = (suspension: SuspensionRecord) => {
      const progress = suspensionOf(bound, suspension)
      return Promise.resolve(
        progress === 'denied'
          ? fail({ kind: 'denied' as const, action: 'suspend-author' })
          : succeed(progress),
      )
    }
    return {
      ...live,
      kind: 'checkpointed',
      checkpointSchema: segments.checkpoint.codec,
      suspend: prove,
      inspectSuspension: prove,
      resume: ({ state, response, ...input }, environment) => {
        if (
          response.response.kind !== 'decision' ||
          response.call !== input.call ||
          canonicalDigest(response.tenant) !== canonicalDigest(input.tenant)
        )
          return Promise.resolve(
            fail({ kind: 'invalid', field: 'response', reason: 'not-a-decision-of-this-call' }),
          )
        const decision = authorDecision(response.response.value)
        const checkpoint = new Uint8Array(Buffer.from(state, 'base64'))
        const key = startKey(input, input.start)
        return begin(
          input,
          environment,
          (segments, _parsed, context) => {
            const execution = attempts.get(key)?.execution
            execution?.publish({
              kind: 'continued',
              wait: response.wait,
              response: response.operation,
              timing: localAuthorEvidence(`segment-continued/${key}`, [
                input.start,
                response.operation,
              ]),
            })
            return segments.resume({ checkpoint, response: decision }, environment, context)
          },
          [response.operation],
        )
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
      const operation = operationOf(
        readToolRegistration(selected.ok.loaded.implementation),
        input.request.command,
      )
      const fixed = {
        ...selected.ok,
        requestDigest: canonicalDigest(input.request),
        accessKey: key,
        operation,
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
        inspectSuspension: async suspension => {
          if (bound.binding.kind !== 'checkpointed')
            return unavailable('live-only author has no checkpoint')
          return bound.binding.inspectSuspension(suspension)
        },
        stop: attempt.execution.live.stop,
        inspectControl: attempt.execution.live.inspectControl,
      })
    },
  }
}
