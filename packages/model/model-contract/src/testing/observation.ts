import type { Access, ModelInstanceId } from '../root.ts'
import type { ModelHandle, Observation } from '../index.ts'
import {
  isRevoked,
  scopeOf,
  snapshotOf,
  type CallRecord,
  type Core,
  type ObservationEnd,
  type Subscription,
} from './core.ts'

/** Resolves when the call changes, the script ends the stream, or the signal aborts. */
function untilWoken<P>(subscription: Subscription<P>, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const done = () => {
      signal.removeEventListener('abort', done)
      subscription.wake = null
      resolve()
    }
    subscription.wake = done
    signal.addEventListener('abort', done)
  })
}

function ended(reason: Extract<Observation, { kind: 'ended' }>['reason']): Observation {
  return { kind: 'ended', reason }
}

/** Why a handle of `instance` can no longer observe the call, or null while it still can. */
function routeEnd<P>(record: CallRecord<P>, instance: ModelInstanceId): ObservationEnd | null {
  if (record.instance === null) return 'unavailable'
  return record.instance === instance ? null : 'stale-instance'
}

async function* observe<P>(
  core: Core<P>,
  record: CallRecord<P>,
  instance: ModelInstanceId,
  input: Access<P> & Readonly<{ signal: AbortSignal }>,
): AsyncGenerator<Observation> {
  if (
    scopeOf(input.tenant) !== record.scope ||
    isRevoked(core, record.scope, record.call, input.principal, 'observe')
  ) {
    yield ended('denied')
    return
  }
  const gone = routeEnd(record, instance)
  if (gone !== null) {
    yield ended(gone)
    return
  }
  const subscription: Subscription<P> = { principal: input.principal, ended: null, wake: null }
  record.observers.add(subscription)
  try {
    let delivered = record.revision
    yield { kind: 'snapshot', value: snapshotOf(record) }
    for (;;) {
      const reason = subscription.ended ?? (input.signal.aborted ? 'observer-closed' : null)
      if (reason !== null) {
        // Leave before the ending is handed out, so a consumer that stops reading at it holds nothing.
        record.observers.delete(subscription)
        yield ended(reason)
        return
      }
      if (delivered !== record.revision) {
        delivered = record.revision
        yield { kind: 'changed', value: snapshotOf(record) }
        continue
      }
      await untilWoken(subscription, input.signal)
    }
  } finally {
    record.observers.delete(subscription)
  }
}

/** The handle of one instance of a call; asking again gives the same handle. */
export function handleFor<P>(
  core: Core<P>,
  record: CallRecord<P>,
  instance: ModelInstanceId,
): ModelHandle<P> {
  const known = record.handles.get(instance)
  if (known !== undefined) return known
  const handle: ModelHandle<P> = {
    instance,
    observe: input => observe(core, record, instance, input),
  }
  record.handles.set(instance, handle)
  return handle
}

/** Ends every open observation that `matches`, with the reason given. */
export function endObservations<P>(
  record: CallRecord<P>,
  reason: ObservationEnd,
  matches: (subscription: Subscription<P>) => boolean = () => true,
): void {
  for (const subscription of record.observers)
    if (matches(subscription)) {
      subscription.ended = reason
      subscription.wake?.()
    }
}
