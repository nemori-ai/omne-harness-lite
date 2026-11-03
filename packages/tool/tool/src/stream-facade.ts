// The ordinary observation face of the runtime on the public stream protocol (tool-contract SPEC
// 「公共流协议上的观察」): `instances.current` answers the public reference of the current
// publication generation, and `observation.observe` routes a reference to the handle of that
// generation. The facade holds no process data: the handle's observation source produces every
// frame after the route is established. The facade is the final integration output boundary, so
// before it hands on any frame it checks the caller's eligibility again at the same source as the
// route (the directory, for this call and this access).
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  encodeStreamRef,
  judgeStreamRef,
  readStreamRef,
  type StreamFrame,
} from '@omne-harness/stream-arrival'
import {
  encodeToolInvocationRef,
  resolveToolInvocationRef,
  type Access,
  type ToolFailure,
  type ToolState,
  type ToolStreamDelta,
  type ToolStreamEnd,
  type ToolStreamObservation,
  type ToolStreamReferences,
  type ToolStreamSnapshot,
} from '@omne-harness/tool-contract'
import {
  toolStreamCallCodec,
  type ToolDirectory,
  type ToolHandle,
} from '@omne-harness/tool-contract/provider'
import type { ToolReads } from '@omne-harness/tool-contract/provider'
import type { ContentBlock } from '@omne-harness/content-block'
import { invocationInput, type ResolvedAccess } from './invocation-access.ts'

const DIRECTORY = 'toolInstances'

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

type Frame = StreamFrame<ToolStreamSnapshot, ToolStreamDelta, ToolStreamEnd>
type Ended = Extract<Frame, { kind: 'ended'; reason: string }>['reason']

const ended = (reason: Exclude<Ended, 'producer-ended'>): Frame => ({ kind: 'ended', reason })

/** The current authoritative state of the call, or the failure of reading it. */
async function stateOf<P, B extends ContentBlock>(
  reads: ToolReads<P, B>,
  resolved: ResolvedAccess<P>,
): Promise<Outcome<ToolState, ToolFailure>> {
  const looked = await reads.lookup(resolved)
  if ('failure' in looked) return looked
  if (looked.ok.kind !== 'found')
    return fail({
      kind: 'invalid',
      field: 'reference',
      reason: 'the admission of the reference was not accepted; the call has no state',
    })
  return succeed(looked.ok.state)
}

/** The route of a call through the trusted directory, with its failure or exception kept apart. */
async function routeOf<P>(
  directory: ToolDirectory<P>,
  resolved: ResolvedAccess<P>,
): Promise<Outcome<ToolHandle<P> | null, ToolFailure>> {
  let route: Awaited<ReturnType<ToolDirectory<P>['connect']>>
  try {
    route = await directory.connect(resolved)
  } catch {
    return fail({
      kind: 'unavailable',
      dependency: DIRECTORY,
      diagnostic: `${DIRECTORY} threw an exception; its message is not reported`,
    })
  }
  if ('failure' in route) return route
  return succeed(route.ok.kind === 'live' ? route.ok.handle : null)
}

/**
 * The caller's current eligibility for the call, at the source of the route: the directory
 * refusing the access is `denied`; its absence, exception or `unsupported` is `unavailable`. Any
 * answer that is not a failure keeps the eligibility; whether the generation is still current is
 * the producer's to end (SPEC「旧代次的终止帧」cases 1 and 2), not the facade's.
 */
async function eligibilityOf<P>(
  directory: ToolDirectory<P>,
  resolved: ResolvedAccess<P>,
): Promise<'denied' | 'unavailable' | 'eligible'> {
  const route = await routeOf(directory, resolved)
  if (!('failure' in route)) return 'eligible'
  return route.failure.kind === 'denied' ? 'denied' : 'unavailable'
}

const ABORTED = Symbol('aborted')

/** Starts `work` and waits for it unless `signal` aborts first; an aborted signal starts nothing. */
async function unlessAborted<T>(
  signal: AbortSignal,
  work: () => Promise<T>,
): Promise<T | typeof ABORTED> {
  if (signal.aborted) return ABORTED
  let release = (): void => undefined
  const aborted = new Promise<typeof ABORTED>(resolve => {
    const onAbort = (): void => resolve(ABORTED)
    signal.addEventListener('abort', onAbort, { once: true })
    release = () => signal.removeEventListener('abort', onAbort)
  })
  try {
    return await Promise.race([work(), aborted])
  } finally {
    release()
  }
}

type ObservationInput<P> = Readonly<{ ref: unknown; access: Access<P>; signal: AbortSignal }>

/**
 * Reads the observation request as an untrusted value: a request, `access` or `signal` of the
 * wrong shape is null, which the facade ends with `denied` like every other access it cannot admit.
 * The tenant inside `access` is checked by the public reference judgment that follows.
 */
function observationInput<P>(request: unknown): ObservationInput<P> | null {
  if (!isObject(request)) return null
  const access = Reflect.get(request, 'access')
  const signal = Reflect.get(request, 'signal')
  if (!isObject(access) || !('principal' in access) || !(signal instanceof AbortSignal)) return null
  return { ref: Reflect.get(request, 'ref'), access: access as Access<P>, signal }
}

const isTerminal = (frame: Frame): boolean => frame.kind === 'ended' || frame.kind === 'gap'

export function createStreamFacade<P, B extends ContentBlock>(input: {
  directory: ToolDirectory<P>
  reads: ToolReads<P, B>
}): Readonly<{ instances: ToolStreamReferences<P>; observation: ToolStreamObservation<P> }> {
  const { directory, reads } = input

  const current: ToolStreamReferences<P>['current'] = async input => {
    // The boundary reads an untrusted value: a missing or non-object `access` is denied like
    // every other reference access, before any port is consulted.
    const access = isObject(input) ? Reflect.get(input, 'access') : undefined
    const resolved = invocationInput<P>(
      isObject(access) ? { ...access, reference: Reflect.get(input, 'reference') } : null,
      'connect',
    )
    if ('failure' in resolved) return resolved
    const route = await routeOf(directory, resolved.ok)
    if ('failure' in route) return route
    const state = await stateOf(reads, resolved.ok)
    if ('failure' in state) return state
    const handle = route.ok
    const confirmed = await routeOf(directory, resolved.ok)
    if ('failure' in confirmed) return confirmed
    const latest = confirmed.ok
    if (handle === null && latest !== null)
      return fail({
        kind: 'unavailable',
        dependency: DIRECTORY,
        diagnostic: 'The publication changed during the state read.',
      })
    if (
      handle !== null &&
      (latest === null ||
        latest.instance !== handle.instance ||
        latest.generation !== handle.generation ||
        latest.stream !== handle.stream)
    )
      return fail({ kind: 'stale-instance', instance: handle.instance })
    if (handle === null) return succeed({ state: state.ok, current: null })
    const call = encodeToolInvocationRef({
      tenant: resolved.ok.tenant,
      call: resolved.ok.call,
      admission: resolved.ok.admission,
    })
    const ref =
      'failure' in call
        ? call
        : encodeStreamRef(
            {
              tenant: resolved.ok.tenant,
              producer: 'tool',
              call: call.ok,
              stream: handle.stream,
            },
            toolStreamCallCodec,
          )
    if ('failure' in ref)
      return fail({
        kind: 'unavailable',
        dependency: DIRECTORY,
        diagnostic: 'the published stream identity does not encode as a public reference',
      })
    return succeed({
      state: state.ok,
      current: {
        ref: ref.ok,
        instance: handle.instance,
        generation: handle.generation,
        projection: 'tool-process-v1',
      },
    })
  }

  type Routed = Readonly<{
    input: ObservationInput<P>
    resolved: ResolvedAccess<P>
    source: AsyncIterator<Frame>
  }>

  const observe: ToolStreamObservation<P>['observe'] = request => ({
    [Symbol.asyncIterator]() {
      const controller = new AbortController()
      const returning = Promise.withResolvers<IteratorResult<Frame>>()
      let source: AsyncIterator<Frame> | null = null
      let sourceClosed = false
      let returned = false
      let finished = false
      let prepared: Promise<Outcome<Routed, Frame>> | null = null
      let tail: Promise<unknown> = Promise.resolve()

      const closeSource = async (): Promise<void> => {
        if (sourceClosed || source === null) return
        sourceClosed = true
        await source.return?.()
      }
      const detachSource = () => {
        void closeSource().catch(() =>
          process.emitWarning('Tool observation source cleanup failed; error text is withheld.', {
            code: 'TOOL_OBSERVATION_CLEANUP_FAILED',
          }),
        )
      }
      const end = async (frame: Frame): Promise<IteratorResult<Frame>> => {
        finished = true
        controller.abort()
        await closeSource()
        return returned ? { done: true, value: undefined } : { done: false, value: frame }
      }
      const prepare = async (): Promise<Outcome<Routed, Frame>> => {
        const checked = observationInput<P>(request)
        if (checked === null) return fail(ended('denied'))
        const input = { ...checked, signal: AbortSignal.any([checked.signal, controller.signal]) }
        const { access, signal } = input
        const judged = judgeStreamRef(
          { value: input.ref, tenant: access.tenant },
          toolStreamCallCodec,
        )
        if ('failure' in judged) {
          const { kind } = judged.failure
          return fail(
            ended(
              kind === 'invalid-tenant' || kind === 'foreign-tenant' ? 'denied' : 'stale-stream',
            ),
          )
        }
        const envelope = readStreamRef(judged.ok)
        const parts = resolveToolInvocationRef(envelope.call, access.tenant)
        if ('failure' in parts) return fail(ended('stale-stream'))
        const resolved: ResolvedAccess<P> = {
          ...access,
          call: parts.ok.call,
          admission: parts.ok.admission,
        }
        // The accepted Tool routing exception ends an initial abort without a directory lookup.
        const route = await unlessAborted(signal, () => routeOf(directory, resolved))
        if (route === ABORTED) return fail(ended('observer-closed'))
        if ('failure' in route)
          return fail(ended(route.failure.kind === 'denied' ? 'denied' : 'unavailable'))
        const handle = route.ok
        if (handle === null || handle.stream !== envelope.stream) return fail(ended('stale-stream'))
        if (signal.aborted || returned) return fail(ended('observer-closed'))
        source = handle.observation
          .observe({ ref: judged.ok, access, signal })
          [Symbol.asyncIterator]()
        return succeed({ input, resolved, source })
      }
      const read = async (): Promise<IteratorResult<Frame>> => {
        if (returned || finished) return { done: true, value: undefined }
        prepared ??= prepare()
        const ready = await prepared
        if (returned) return { done: true, value: undefined }
        if ('failure' in ready) return end(ready.failure)
        const { input, resolved, source } = ready.ok
        const next = await source.next()
        if (returned) return { done: true, value: undefined }
        if (next.done === true) {
          finished = true
          sourceClosed = true
          return { done: true, value: undefined }
        }
        // Every output, including an abort end, needs the current final-boundary permission.
        const verdict = await eligibilityOf(directory, resolved)
        if (returned) return { done: true, value: undefined }
        if (verdict !== 'eligible') return end(ended(verdict))
        if (
          next.value.kind === 'ended' &&
          (next.value.reason === 'denied' ||
            next.value.reason === 'unavailable' ||
            next.value.reason === 'stale-stream')
        )
          return end(next.value)
        if (input.signal.aborted) return end(ended('observer-closed'))
        if (isTerminal(next.value)) return end(next.value)
        return { done: false, value: next.value }
      }
      const iterator: AsyncIterableIterator<Frame> = {
        [Symbol.asyncIterator]() {
          return this
        },
        next() {
          const result = tail.then(() => Promise.race([read(), returning.promise]))
          tail = result.then(
            () => undefined,
            () => {
              finished = true
              controller.abort()
              detachSource()
            },
          )
          return result
        },
        async return() {
          if (!returned) {
            returned = true
            controller.abort()
            returning.resolve({ done: true, value: undefined })
            detachSource()
          }
          return { done: true, value: undefined }
        },
      }
      return iterator
    },
  })

  return Object.freeze({
    instances: Object.freeze<ToolStreamReferences<P>>({ current }),
    observation: Object.freeze<ToolStreamObservation<P>>({ observe }),
  })
}
