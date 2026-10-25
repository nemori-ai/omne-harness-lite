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
  type StreamRef,
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

  /**
   * Hands on the frames of the handle's source. Before each frame, terminal ones included, the
   * caller's eligibility is checked again; a refusal or an unavailable source removes the
   * subscription (which discards its queue) and ends with `denied` or `unavailable` instead of the
   * frame. After abort no frame of the source is handed on. An exception of the source is not
   * caught: it stays a connection failure.
   */
  async function* relay(
    handle: ToolHandle<P>,
    ref: StreamRef,
    input: ObservationInput<P>,
    resolved: ResolvedAccess<P>,
  ): AsyncGenerator<Frame> {
    const { access, signal } = input
    const source = handle.observation.observe({ ref, access, signal })[Symbol.asyncIterator]()
    let open = true
    const close = async (): Promise<void> => {
      if (!open) return
      open = false
      await source.return?.()
    }
    try {
      for (;;) {
        const next = await source.next()
        if (next.done === true) {
          open = false
          return
        }
        const verdict = await unlessAborted(signal, () => eligibilityOf(directory, resolved))
        if (verdict === ABORTED || signal.aborted) {
          await close()
          yield ended('observer-closed')
          return
        }
        if (verdict !== 'eligible') {
          await close()
          yield ended(verdict)
          return
        }
        yield next.value
        if (isTerminal(next.value)) return
      }
    } finally {
      await close()
    }
  }

  /**
   * The failure order of the public contract, with Tool's situations in it: a malformed request,
   * an unminted or foreign tenant is `denied`; unreadable syntax, a wrong producer or a malformed
   * call is `stale-stream` (Tool checks eligibility per call, so a reference without a Tool call
   * ends before eligibility); an abort before or during routing is `observer-closed`; the
   * directory's refusal is `denied`, its absence or exception is `unavailable`; a reference whose
   * stream is not the current generation is `stale-stream` before any handle is contacted (SPEC
   * 「旧代次的终止帧」case 3).
   */
  async function* observe(request: ObservationInput<P>): AsyncGenerator<Frame> {
    const input = observationInput<P>(request)
    if (input === null) {
      yield ended('denied')
      return
    }
    const { access, signal } = input
    const judged = judgeStreamRef({ value: input.ref, tenant: access.tenant }, toolStreamCallCodec)
    if ('failure' in judged) {
      const kind = judged.failure.kind
      yield ended(
        kind === 'invalid-tenant' || kind === 'foreign-tenant' ? 'denied' : 'stale-stream',
      )
      return
    }
    const envelope = readStreamRef(judged.ok)
    const parts = resolveToolInvocationRef(envelope.call, access.tenant)
    if ('failure' in parts) {
      yield ended('stale-stream')
      return
    }
    const resolved: ResolvedAccess<P> = {
      principal: access.principal,
      tenant: access.tenant,
      call: parts.ok.call,
      admission: parts.ok.admission,
    }
    const route = await unlessAborted(signal, () => routeOf(directory, resolved))
    if (route === ABORTED) {
      yield ended('observer-closed')
      return
    }
    if ('failure' in route) {
      yield ended(route.failure.kind === 'denied' ? 'denied' : 'unavailable')
      return
    }
    const handle = route.ok
    if (handle === null || handle.stream !== envelope.stream) {
      yield ended('stale-stream')
      return
    }
    yield* relay(handle, judged.ok, input, resolved)
  }

  return Object.freeze({
    instances: Object.freeze<ToolStreamReferences<P>>({ current }),
    observation: Object.freeze<ToolStreamObservation<P>>({ observe }),
  })
}
