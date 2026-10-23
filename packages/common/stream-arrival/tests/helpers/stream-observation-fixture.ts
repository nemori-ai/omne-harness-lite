import { tenantCodec, type Access, type TenantId } from '@omne-harness/legal-identity'
import {
  compareStreamPositions,
  judgeStreamCursor,
  judgeStreamRef,
  parseStreamEnvelope,
  readStreamCursor,
  type StreamCallCodec,
  type StreamCursor,
  type StreamFrame,
  type StreamObserver,
  type StreamRef,
} from '@omne-harness/stream-arrival'
import { copyObservationValue, observationBytes } from './stream-observation-values.ts'

export type StreamLimits = Readonly<{
  snapshotBytes: number
  deltaBytes: number
  producerEndBytes: number
  queueFrames: number
  queueBytes: number
  residenceMs: number
  observersPerTenant: number
  totalMemoryBytes: number
}>
export type StreamResources = Readonly<{
  subscriptions: number
  queuedFrames: number
  queuedBytes: number
  scheduledDeadlines: number
}>
type AccessDecision = 'allow' | 'deny' | 'unavailable'
type FixtureEvent = Readonly<{ sequence: number; action: string; key: string | null }>
type SourceEnd<E> =
  | Readonly<{ reason: 'source-closed' }>
  | Readonly<{ reason: 'producer-ended'; value: E }>
export type StreamFixture<P, S, D, E> = Readonly<{
  observer: StreamObserver<P, S, D, E>
  confirm(input: Readonly<{ snapshot: S; cursor: StreamCursor }>): void
  commit(input: Readonly<{ snapshot: S; delta: D; cursor: StreamCursor }>): void
  setAccess(access: Access<P>, decision: AccessDecision): void
  setSource(state: 'available' | 'unavailable'): void
  retire(): void
  end(value: SourceEnd<E>): void
  sourceGap(): void
  pauseBeforeSnapshot(): void
  reachedSnapshot(): Promise<void>
  resumeSnapshot(): void
  advanceTime(milliseconds: number): void
  resources(): StreamResources
  events(): readonly FixtureEvent[]
}>
type Terminal<E> = Extract<StreamFrame<never, never, E>, { kind: 'gap' | 'ended' }>
type Body<S, D> = Extract<StreamFrame<S, D>, { kind: 'snapshot' | 'delta' }>
type Observation<P, S, D, E> = {
  request: Parameters<StreamObserver<P, S, D, E>['observe']>[0]
  status: 'new' | 'waiting' | 'open' | 'terminal' | 'closed'
  queue: { frame: Body<S, D>; bytes: number; at: number }[]
  lastDelivered: StreamCursor | null
  terminal: Terminal<E> | null
  pending: ((result: IteratorResult<StreamFrame<S, D, E>>) => void)[]
  onAbort: () => void
}

export function createStreamFixture<P, S, D, E = never>(
  input: Readonly<{
    tenant: TenantId
    ref: StreamRef
    codec: StreamCallCodec
    limits: StreamLimits
  }>,
): StreamFixture<P, S, D, E> {
  for (const value of Object.values(input.limits)) {
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new TypeError('Limits must be positive safe integers')
  }
  const limits = { ...input.limits }
  const tenant = tenantCodec.encode(input.tenant)
  if (!tenant.ok) throw new TypeError('Fixture tenant must be minted')
  const tenantText = tenant.value
  const reference = judgeStreamRef({ value: input.ref, tenant: input.tenant }, input.codec)
  if ('failure' in reference || reference.ok !== input.ref)
    throw new TypeError('Fixture reference must be canonical')
  const observations = new Set<Observation<P, S, D, E>>()
  const grants: { tenant: string; principal: P; decision: AccessDecision }[] = []
  const events: FixtureEvent[] = []
  let confirmed: Readonly<{ snapshot: S; cursor: StreamCursor }> | null = null
  let source: 'available' | 'unavailable' = 'available'
  let retired = false
  let sourceEnd: SourceEnd<E> | null = null
  let time = 0
  let barrier: {
    reached: Promise<void>
    resolve: () => void
    observation: Observation<P, S, D, E> | null
  } | null = null

  function record(action: string): void {
    events.push(Object.freeze({ sequence: events.length + 1, action, key: input.ref }))
  }

  function resources(): StreamResources {
    let subscriptions = 0
    let queuedFrames = 0
    let queuedBytes = 0
    for (const observation of observations) {
      if (observation.status === 'open') subscriptions++
      queuedFrames += observation.queue.length
      for (const item of observation.queue) queuedBytes += item.bytes
    }
    return { subscriptions, queuedFrames, queuedBytes, scheduledDeadlines: queuedFrames }
  }

  function qualify(request: Observation<P, S, D, E>['request']): Terminal<E> | null {
    const encoded = tenantCodec.encode(request.access.tenant)
    if (!encoded.ok || encoded.value !== tenantText) return { kind: 'ended', reason: 'denied' }
    if ('failure' in parseStreamEnvelope(request.ref))
      return { kind: 'ended', reason: 'stale-stream' }
    const decision =
      grants.find(
        grant =>
          grant.tenant === encoded.value && Object.is(grant.principal, request.access.principal),
      )?.decision ?? 'deny'
    if (decision !== 'allow')
      return { kind: 'ended', reason: decision === 'deny' ? 'denied' : 'unavailable' }
    record('target-read')
    const resolved = judgeStreamRef(
      { value: request.ref, tenant: request.access.tenant },
      input.codec,
    )
    if ('failure' in resolved) {
      return {
        kind: 'ended',
        reason:
          resolved.failure.kind === 'foreign-tenant' || resolved.failure.kind === 'invalid-tenant'
            ? 'denied'
            : 'stale-stream',
      }
    }
    if (retired || resolved.ok !== input.ref) return { kind: 'ended', reason: 'stale-stream' }
    if (source === 'unavailable') return { kind: 'ended', reason: 'unavailable' }
    return null
  }

  function detach(observation: Observation<P, S, D, E>): void {
    if (observation.status === 'open') record('unsubscribe')
    observation.queue = []
  }

  function terminate(observation: Observation<P, S, D, E>, terminal: Terminal<E>): void {
    if (observation.status === 'closed' || observation.status === 'terminal') return
    detach(observation)
    observation.status = 'terminal'
    observation.terminal = copyObservationValue(terminal)
  }

  function close(observation: Observation<P, S, D, E>): void {
    detach(observation)
    observation.status = 'closed'
    observation.terminal = null
    observation.request.signal.removeEventListener('abort', observation.onAbort)
    observations.delete(observation)
    for (const resolve of observation.pending.splice(0)) resolve({ done: true, value: undefined })
  }

  function bufferGap(observation: Observation<P, S, D, E>): void {
    terminate(observation, { kind: 'gap', reason: 'buffer', after: observation.lastDelivered })
  }

  function enqueue(observation: Observation<P, S, D, E>, frame: Body<S, D>): void {
    const bytes = observationBytes(frame)
    const queuedBytes = observation.queue.reduce((sum, item) => sum + item.bytes, 0)
    const singleLimit = frame.kind === 'snapshot' ? limits.snapshotBytes : limits.deltaBytes
    if (bytes > singleLimit) {
      if (frame.kind === 'snapshot') terminate(observation, { kind: 'ended', reason: 'capacity' })
      else bufferGap(observation)
      return
    }
    if (resources().queuedBytes + bytes > limits.totalMemoryBytes) {
      if (frame.kind === 'snapshot') terminate(observation, { kind: 'ended', reason: 'capacity' })
      else bufferGap(observation)
      return
    }
    if (
      observation.queue.length + 1 > limits.queueFrames ||
      queuedBytes + bytes > limits.queueBytes
    ) {
      bufferGap(observation)
      return
    }
    observation.queue.push({ frame: copyObservationValue(frame), bytes, at: time })
  }

  function flush(observation: Observation<P, S, D, E>): void {
    while (observation.pending.length > 0 && observation.status !== 'closed') {
      const failure = qualify(observation.request)
      if (failure !== null) {
        detach(observation)
        observation.status = 'terminal'
        observation.terminal = failure
      }
      if (observation.status === 'terminal') {
        const terminal = observation.terminal
        if (terminal === null) throw new Error('Missing terminal')
        const resolve = observation.pending.shift()
        resolve?.({ done: false, value: copyObservationValue(terminal) })
        close(observation)
        return
      }
      if (observation.status !== 'open') return
      const first = observation.queue[0]
      if (first === undefined) return
      if (time - first.at >= limits.residenceMs) {
        bufferGap(observation)
        continue
      }
      if (first.frame.kind === 'delta' && first.frame.from !== observation.lastDelivered) {
        throw new Error('Noncontiguous fixture delta')
      }
      observation.queue.shift()
      observation.lastDelivered = first.frame.cursor
      const resolve = observation.pending.shift()
      resolve?.({ done: false, value: copyObservationValue(first.frame) })
    }
  }

  function begin(observation: Observation<P, S, D, E>): void {
    if (observation.status === 'closed' || observation.status === 'terminal') return
    const failure = qualify(observation.request)
    if (failure !== null) terminate(observation, failure)
    else if (sourceEnd !== null) terminateFromSource(observation, sourceEnd)
    else if (confirmed === null) terminate(observation, { kind: 'ended', reason: 'unavailable' })
    else if (resources().subscriptions >= limits.observersPerTenant)
      terminate(observation, { kind: 'ended', reason: 'capacity' })
    else {
      // Capture and register in one synchronous turn. No externally controlled gap exists here.
      const snapshot = confirmed
      enqueue(observation, { kind: 'snapshot', cursor: snapshot.cursor, value: snapshot.snapshot })
      if (observation.terminal === null) {
        observation.status = 'open'
        record('subscribe')
      }
    }
    flush(observation)
  }

  function terminateFromSource(observation: Observation<P, S, D, E>, end: SourceEnd<E>): void {
    const frame: Terminal<E> = { kind: 'ended', ...end }
    terminate(
      observation,
      end.reason === 'producer-ended' && observationBytes(frame) > limits.producerEndBytes
        ? { kind: 'ended', reason: 'capacity' }
        : frame,
    )
  }

  const observer: StreamObserver<P, S, D, E> = {
    observe(request) {
      return {
        [Symbol.asyncIterator]() {
          const observation: Observation<P, S, D, E> = {
            request: { ...request, access: { ...request.access } },
            status: 'new',
            queue: [],
            lastDelivered: null,
            terminal: null,
            pending: [],
            onAbort() {
              if (observation.status === 'closed') return
              detach(observation)
              observation.status = 'terminal'
              observation.terminal = { kind: 'ended', reason: 'observer-closed' }
              flush(observation)
            },
          }
          return {
            next() {
              if (observation.status === 'closed')
                return Promise.resolve({ done: true, value: undefined } as const)
              return new Promise<IteratorResult<StreamFrame<S, D, E>>>((resolve, reject) => {
                observation.pending.push(resolve)
                try {
                  if (observation.status === 'new') {
                    observations.add(observation)
                    observation.request.signal.addEventListener('abort', observation.onAbort, {
                      once: true,
                    })
                    if (observation.request.signal.aborted) observation.onAbort()
                    else if (barrier !== null && barrier.observation === null) {
                      observation.status = 'waiting'
                      barrier.observation = observation
                      barrier.resolve()
                    } else begin(observation)
                  }
                  flush(observation)
                } catch (error) {
                  observation.pending.pop()
                  close(observation)
                  reject(error)
                }
              })
            },
            return() {
              close(observation)
              return Promise.resolve({ done: true, value: undefined } as const)
            },
          }
        },
      }
    },
  }

  function checkCursor(cursor: StreamCursor): void {
    const result = judgeStreamCursor({ value: cursor, ref: input.ref })
    if ('failure' in result || result.ok !== cursor)
      throw new TypeError('Cursor must belong to original reference')
    if (
      confirmed !== null &&
      compareStreamPositions(
        readStreamCursor(confirmed.cursor).position,
        readStreamCursor(cursor).position,
      ) >= 0
    )
      throw new TypeError('Confirmed cursor must strictly advance')
    if (retired || sourceEnd !== null) throw new TypeError('Source is already terminal')
  }

  function refresh(): void {
    for (const observation of observations) {
      const failure = qualify(observation.request)
      if (failure !== null && observation.status !== 'closed') {
        detach(observation)
        observation.status = 'terminal'
        observation.terminal = failure
      }
      flush(observation)
    }
  }

  return {
    observer,
    confirm(value) {
      if (confirmed !== null) throw new TypeError('Use commit after the initial confirmation')
      checkCursor(value.cursor)
      confirmed = copyObservationValue(value)
    },
    commit(value) {
      if (confirmed === null) throw new TypeError('Confirm a snapshot before committing')
      checkCursor(value.cursor)
      const previous = confirmed.cursor
      confirmed = copyObservationValue({ snapshot: value.snapshot, cursor: value.cursor })
      for (const observation of observations) {
        if (observation.status !== 'open') continue
        enqueue(observation, {
          kind: 'delta',
          from: previous,
          cursor: value.cursor,
          value: value.delta,
        })
        flush(observation)
      }
    },
    setAccess(access, decision) {
      const encoded = tenantCodec.encode(access.tenant)
      if (!encoded.ok) throw new TypeError('Access tenant must be minted')
      const grant = grants.find(
        item => item.tenant === encoded.value && Object.is(item.principal, access.principal),
      )
      if (grant === undefined)
        grants.push({ tenant: encoded.value, principal: access.principal, decision })
      else grant.decision = decision
      refresh()
    },
    setSource(value) {
      source = value
      refresh()
    },
    retire() {
      retired = true
      refresh()
    },
    end(value) {
      if (sourceEnd !== null) return
      sourceEnd = copyObservationValue(value)
      for (const observation of observations) {
        terminateFromSource(observation, sourceEnd)
        flush(observation)
      }
    },
    sourceGap() {
      for (const observation of observations) {
        terminate(observation, {
          kind: 'gap',
          after: observation.lastDelivered,
          reason: 'source-history',
        })
        flush(observation)
      }
    },
    pauseBeforeSnapshot() {
      if (barrier !== null) throw new TypeError('Snapshot barrier already exists')
      const deferred = Promise.withResolvers<void>()
      barrier = { reached: deferred.promise, resolve: deferred.resolve, observation: null }
    },
    reachedSnapshot() {
      if (barrier === null) throw new TypeError('No snapshot barrier')
      return barrier.reached
    },
    resumeSnapshot() {
      if (barrier?.observation === null || barrier === null)
        throw new TypeError('Snapshot barrier has not been reached')
      const observation = barrier.observation
      barrier = null
      begin(observation)
    },
    advanceTime(milliseconds) {
      if (
        !Number.isSafeInteger(milliseconds) ||
        milliseconds < 0 ||
        !Number.isSafeInteger(time + milliseconds)
      )
        throw new TypeError('Clock increment must be a nonnegative safe integer')
      time += milliseconds
      for (const observation of observations) {
        if (observation.queue.some(item => time - item.at >= limits.residenceMs))
          bufferGap(observation)
        flush(observation)
      }
    },
    resources,
    events: () => [...events],
  }
}
