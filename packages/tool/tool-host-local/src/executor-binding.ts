import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type {
  Adoption,
  DurableEvidence,
  FixedToolRequest,
  Reply,
  ResponseRecord,
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
type Resume = Extract<ToolStartRecord, { kind: 'resume' }>
/** The input of a start or a resume: the call, its start record, the permit and the request. */
type StartInput<P, B extends ContentBlock, E> = Omit<
  Parameters<ToolExecutorBinding<P, B, E>['start']>[0],
  'start'
> &
  Readonly<{ start: Start }>
type Segment = Outcome<AuthorSegment<Uint8Array, unknown>, ToolPrimitiveFailure>
type Final<B extends ContentBlock> = Extract<ToolExecutionFact<B>, { kind: 'final' }>
export type LocalToolBindingsInput<P, E, B extends ContentBlock> = Readonly<{
  registry: LocalToolBindingRegistry<P, E, B>
  catalog: Pick<ToolCatalog<P>, 'inspect'>
  authority: ToolStartAuthority<P>
  scope(
    input: CallAccess<P> &
      Readonly<{ start: Start; request: FixedToolRequest; execution: LocalAuthorExecution<B> }>,
  ): ToolExecutionScope
  /**
   * Attaches a capability to the scope of a first start. A resume is not given one: a segment's
   * context carries `emit` and `signal` only.
   */
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
        execution: LocalAuthorExecution<B>
      }>,
  ): Reply<Final<B>>
  /**
   * Keeps what a suspended segment needs to resume (P06, P07): the encoded state in the author's
   * codec and the request of its Ask wait, each under an operation of its own start. It answers
   * their custody evidence only after both are kept. Without it a checkpointed author is not
   * bound: its calls answer `unavailable`.
   */
  checkpoint?(
    input: CallAccess<P> &
      Readonly<{
        start: Start
        request: FixedToolRequest
        state: Uint8Array
        codec: Adoption
        wait: AuthorWait
        execution: LocalAuthorExecution<B>
      }>,
  ): Reply<Readonly<{ payload: DurableEvidence; request: DurableEvidence }>>
  /**
   * The input of a resume segment (P06, P07): the encoded state of the checkpoint the resume names,
   * as `checkpoint` kept it, and the ResponseRecord that the call's ledger committed for the wait
   * that resumes there. Without it a resume answers `unavailable` and no segment runs.
   */
  resumption?(
    input: CallAccess<P> & Readonly<{ start: Resume; request: FixedToolRequest }>,
  ): Reply<Readonly<{ checkpoint: Uint8Array; response: ResponseRecord }>>
}>

/** The end of a segment that suspended: its checkpoint parts and the wait it published. */
type SuspendedSegment = Readonly<{
  payload: DurableEvidence
  closedResult: string
  boundary: DurableEvidence
  exclusion: DurableEvidence
  intent: WaitIntent
}>

/** A segment entry that never runs: an attempt that `begin` recalls does not enter again. */
function never(): Promise<Segment> {
  return Promise.reject(new Error('a recalled attempt does not enter its segment again'))
}

/** The operation of a call's request in the author's registration, or undefined. */
function operationOf(
  registration: ReturnType<typeof readToolRegistration>,
  command: string | null,
): ToolOperationSlot | undefined {
  if (registration?.kind === 'function')
    return command === null ? registration.operation : undefined
  return registration?.operations.find(([name]) => name === command)?.[1]
}

/**
 * The arguments of the call as the operation's codec reads them (D-94: a multi-command tool's
 * codec reads the parameters of its command). It throws the reason and the command guide (D-104).
 */
function argumentsOf<P, B extends ContentBlock, E>(
  input: StartInput<P, B, E>,
  operation: ToolOperationSlot,
): unknown {
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

/** Whether the segment's wait is one of the Ask contracts that the author declared (P12). */
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
): ToolBindings<P, B, E> {
  type Bound = ToolBindingSelection<P, E, B> & {
    requestDigest: string
    accessKey: string
    operation: ToolOperationSlot | undefined
    binding: ToolExecutorBinding<P, B, E>
  }
  type Attempt = {
    digest: string
    start: Start
    execution: LocalAuthorExecution<B>
    answer: ReturnType<ToolExecutorBinding<P, B, E>['start']>
    /** How a segment ended: null while it runs or for a live coroutine. */
    segment: SuspendedSegment | Readonly<{ kind: 'completed' }> | null
    /** The responses this segment consumed: the response of the wait a resume continues. */
    consumed: readonly ToolOperationId[]
  }
  const bindings = new Map<string, Bound>()
  const attempts = new Map<string, Attempt>()
  type Place = Pick<CallAccess<P>, 'tenant' | 'call'>
  const callKey = (access: Place) => canonicalDigest([access.tenant, access.call])
  const startKey = (access: Place, start: ToolStartRecord) =>
    canonicalDigest([access.tenant, access.call, start.operation])
  const unavailable = (diagnostic: string) =>
    fail({ kind: 'unavailable' as const, dependency: 'toolBindings', diagnostic })

  /** The scope with the assembly's capability, for a first start only. */
  const withCapability = (input: StartInput<P, B, E>, scope: ToolExecutionScope) => {
    const { start } = input
    return start.kind === 'start'
      ? (dependencies.capability?.({ ...input, start }, scope) ?? scope)
      : scope
  }

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
      parsed = argumentsOf(input, operation)
      scope = dependencies.scope({ ...input, execution })
      scope = withCapability(input, scope)
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

  /**
   * Keeps the state and the request of a suspended segment, then publishes its Ask wait as the last
   * fact of the stream (P06, P07). A wait the author did not declare, or a state over the declared
   * size, is a failure of the author, settled like any other.
   */
  const suspendSegment = async (
    input: StartInput<P, B, E>,
    operation: ToolOperationSlot,
    execution: LocalAuthorExecution<B>,
    attempt: Attempt,
    suspended: Extract<AuthorSegment<Uint8Array, unknown>, { kind: 'suspended' }>,
  ): Promise<string | null> => {
    const segments = operation.segments
    if (segments === null || dependencies.checkpoint === undefined)
      return 'the author runs in segments without checkpoint custody'
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
    const kept = await dependencies.checkpoint({
      ...input,
      state,
      codec: segments.checkpoint.codec,
      wait,
      execution,
    })
    // Without kept state the segment cannot resume, so it does not suspend: it fails instead.
    if ('failure' in kept) return `the segment state was not kept: ${kept.failure.kind}`
    const key = startKey(input, input.start)
    const { contract } = wait
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
    const intent: WaitIntent = {
      kind: 'ask',
      // A start runs one segment, and a segment ends at one wait, so the start names the wait.
      wait: waitId.ok,
      resume: kept.ok.payload,
      request: kept.ok.request,
      schemas: { ...schemas, source: localAuthorEvidence(`wait-schemas/${key}`, schemas) },
    }
    attempt.segment = {
      payload: kept.ok.payload,
      closedResult,
      intent,
      boundary: localAuthorEvidence(`segment-boundary/${key}`, [input.start, intent]),
      exclusion: localAuthorEvidence(`segment-returned/${key}`, [input.start, kept.ok.payload]),
    }
    execution.publish({ kind: 'wait', value: intent })
    return null
  }

  /**
   * Runs one segment of a checkpointed author with a context of `emit` and `signal` only: `enter`
   * starts the initial or the resume segment. A completed segment settles like a live return; a
   * suspended one ends at its wait; a failed or throwing one settles as a failure of the author.
   */
  const launchSegment = async (
    input: StartInput<P, B, E>,
    environment: E,
    operation: ToolOperationSlot,
    execution: LocalAuthorExecution<B>,
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
      const closed = await scope.finish('returned')
      if ('failure' in closed) throw new Error(closed.failure.reason)
      if ('failure' in segment) throw new Error(segment.failure.reason)
      if (segment.ok.kind === 'suspended') {
        const refused = await suspendSegment(input, operation, execution, attempt, segment.ok)
        if (refused === null) return
        throw new Error(refused)
      }
      attempt.segment = { kind: 'completed' }
      outcome = { kind: 'returned', value: segment.ok.value }
    } catch (error) {
      if (scope !== undefined) await scope.finish('failed')
      attempt.segment = { kind: 'completed' }
      outcome = {
        kind: 'failed',
        reason: error instanceof Error ? error.message : 'author failed',
      }
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

  /** What the binding proves about the suspension of a segment it ran (P07 suspend). */
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
    /**
     * Checks the input, recalls an attempt of the same start, takes the pin, consumes the permit
     * and runs the author once: a live coroutine, or the segment that `enter` starts. A start and a
     * resume of the same call are attempts of their own, each under its own start record.
     */
    const begin = (
      input: StartInput<P, B, E>,
      environment: E,
      enter: Enter,
      consumedResponses: readonly ToolOperationId[],
    ): ReturnType<ToolExecutorBinding<P, B, E>['start']> => {
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
      const operation = bound.operation
      if (operation === undefined) return invalid('command', 'original author has no operation')
      let pin = bound.pin
      if (assigned || callKey(input) !== bound.accessKey) {
        const retained = bound.repin(input, input.call)
        if ('failure' in retained) return Promise.resolve(unavailable(retained.failure.diagnostic))
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
          const launched =
            operation.segments === null
              ? launch(input, environment, operation, execution)
              : launchSegment(input, environment, operation, execution, attempt, enter)
          void launched.catch(() => {
            execution.observationAvailable(false)
          })
          return succeed(execution.live)
        } catch {
          execution.observationAvailable(false)
          return fail({ kind: 'commit-unknown' as const, operation: input.start.operation })
        }
      })
      const attempt: Attempt = {
        digest,
        start: input.start,
        execution,
        answer,
        segment: null,
        consumed: consumedResponses,
      }
      attempts.set(key, attempt)
      return answer
    }
    const live: Extract<ToolExecutorBinding<P, B, E>, { kind: 'live-only' }> = {
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
      // The segment has returned before its suspension is asked: proving it stops nothing.
      suspend: prove,
      inspectSuspension: prove,
      resume: async (input, environment) => {
        const recalled = attempts.get(startKey(input, input.start))
        if (recalled !== undefined) return begin(input, environment, () => never(), [])
        // The input is read before the permit is consumed: without it no segment runs.
        const read =
          dependencies.resumption === undefined
            ? unavailable('the resume input of a checkpointed author is not assembled')
            : await dependencies.resumption(input)
        if ('failure' in read) return read
        const { checkpoint, response } = read.ok
        if (
          response.response.kind !== 'decision' ||
          response.call !== input.call ||
          canonicalDigest(response.tenant) !== canonicalDigest(input.tenant)
        )
          return fail({ kind: 'invalid', field: 'response', reason: 'not-a-decision-of-this-call' })
        const decision = authorDecision(response.response.value)
        const key = startKey(input, input.start)
        return begin(
          input,
          environment,
          (segments, _parsed, context) => {
            // The author's continuation is released here, so the real resume point is fixed here.
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
      // A start of a command the author does not have fails at the start (it releases the pin
      // there); only a checkpointed author without custody is refused here.
      if (operation?.segments != null && dependencies.checkpoint === undefined) {
        selected.ok.pin.release()
        return unavailable('a checkpointed author needs checkpoint custody, which is not assembled')
      }
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
