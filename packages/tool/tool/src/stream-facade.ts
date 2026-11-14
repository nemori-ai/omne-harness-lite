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

async function eligibilityOf<P>(
  directory: ToolDirectory<P>,
  resolved: ResolvedAccess<P>,
): Promise<'denied' | 'unavailable' | 'eligible'> {
  const route = await routeOf(directory, resolved)
  if (!('failure' in route)) return 'eligible'
  return route.failure.kind === 'denied' ? 'denied' : 'unavailable'
}

const ABORTED = Symbol('aborted')

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
          return fail(ended(kind === 'invalid-tenant' ? 'denied' : 'stale-stream'))
        }
        const envelope = readStreamRef(judged.ok)
        const parts = resolveToolInvocationRef(envelope.call, access.tenant)
        if ('failure' in parts) return fail(ended('stale-stream'))
        const resolved: ResolvedAccess<P> = {
          ...access,
          call: parts.ok.call,
          admission: parts.ok.admission,
        }
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
