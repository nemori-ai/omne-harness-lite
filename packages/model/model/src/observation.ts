import { compareRevisions } from '@omne-harness/model-contract'
import type {
  CallAccess,
  CallState,
  ModelClock,
  ModelDirectory,
  ModelHandle,
  ModelInstanceId,
  Observation,
  Snapshot,
} from '@omne-harness/model-contract'

type End = Extract<Observation, { kind: 'ended' }>['reason']
type Watcher = { lag: number; wake: () => void; end: (reason: End) => void }

/** One confirmed view per instance; notifications carry versions, never copied snapshots. */
export function createObservation<P>(input: {
  access: CallAccess<P>
  instance: ModelInstanceId
  directory: ModelDirectory<P>
  clock: ModelClock
  bufferBytes: number
  checkIntervalMs: number
  initial: Snapshot | null
}) {
  let view = input.initial && structuredClone(input.initial)
  let version = 0
  let contentEpoch = 0
  let confirming = false
  const watchers = new Set<Watcher>()
  function publish(snapshot: Snapshot) {
    view = structuredClone(snapshot)
    version += 1
    for (const watcher of watchers) {
      // Logical notification accounting: 64 bytes registration, 32 per unseen version.
      watcher.lag += 32
      if (watcher.lag > input.bufferBytes) watcher.end('unavailable')
      else watcher.wake()
    }
  }
  const handle: ModelHandle<P> = {
    instance: input.instance,
    observe(original) {
      const { principal, tenant, signal } = original
      const access = { principal, tenant, signal }
      return {
        [Symbol.asyncIterator]() {
          let seen = -1
          let ending: End | null = null
          let done = false
          let wake = () => {}
          let closed!: () => void
          const closure = new Promise<null>(resolve => {
            closed = () => resolve(null)
          })
          const watcher: Watcher = {
            lag: 0,
            wake: () => wake(),
            end(reason) {
              if (ending || done) return
              ending = reason
              watchers.delete(watcher)
              access.signal.removeEventListener('abort', abort)
              closed()
              wake()
            },
          }
          const abort = () => watcher.end('observer-closed')
          access.signal.addEventListener('abort', abort, { once: true })
          if (access.signal.aborted) abort()
          else if (watchers.size >= Math.floor(input.bufferBytes / 64)) watcher.end('unavailable')
          else watchers.add(watcher)
          function finish(): IteratorResult<Observation> {
            if (done) return { done: true, value: undefined }
            done = true
            watchers.delete(watcher)
            access.signal.removeEventListener('abort', abort)
            return { done: false, value: { kind: 'ended', reason: ending ?? 'unavailable' } }
          }
          async function next(): Promise<IteratorResult<Observation>> {
            if (done) return { done: true, value: undefined }
            while (!ending) {
              const route = await Promise.race([
                input.directory.connect({
                  principal: access.principal,
                  tenant: access.tenant,
                  call: input.access.call,
                }),
                closure,
              ]).catch(() => null)
              if (ending) break
              if (!route || 'failure' in route) {
                watcher.end(
                  route && 'failure' in route && route.failure.kind === 'denied'
                    ? 'denied'
                    : 'unavailable',
                )
                break
              }
              if (route.ok.kind !== 'live') {
                watcher.end('unavailable')
                break
              }
              if (route.ok.handle !== handle || route.ok.handle.instance !== handle.instance) {
                watcher.end('stale-instance')
                break
              }
              // No await between the observer's current authorization and selecting the view.
              if (!view) {
                watcher.end('unavailable')
                break
              }
              if (seen !== version) {
                const first = seen < 0
                seen = version
                watcher.lag = 0
                return {
                  done: false,
                  value: { kind: first ? 'snapshot' : 'changed', value: structuredClone(view) },
                }
              }
              const timer = new AbortController()
              const notified = new Promise<void>(resolve => {
                wake = resolve
              })
              try {
                await Promise.race([
                  notified,
                  input.clock.waitUntil(
                    new Date(Date.parse(input.clock.now()) + input.checkIntervalMs).toISOString(),
                    timer.signal,
                  ),
                ])
              } catch {
                watcher.end('unavailable')
              } finally {
                timer.abort()
                wake = () => {}
              }
            }
            return finish()
          }
          let busy = false
          return {
            next() {
              if (busy) {
                watcher.end('unavailable')
                return Promise.resolve(finish())
              }
              busy = true
              return next().finally(() => {
                busy = false
              })
            },
            async return() {
              watcher.end('observer-closed')
              done = true
              return { done: true as const, value: undefined }
            },
          }
        },
      }
    },
  }
  return {
    handle,
    publish,
    beginContent() {
      contentEpoch += 1
      confirming = true
    },
    confirm(snapshot: Snapshot) {
      publish(snapshot)
      confirming = false
    },
    rejectContent() {
      confirming = false
    },
    epoch: () => contentEpoch,
    refresh(state: CallState, epoch: number) {
      if (
        !confirming &&
        contentEpoch === epoch &&
        view &&
        compareRevisions(state.revision, view.state.revision) > 0
      )
        publish({ ...view, state })
    },
  }
}
