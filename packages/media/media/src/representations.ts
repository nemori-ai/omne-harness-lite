import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  ContentReference,
  EngineAccess,
  InvalidReference,
  MediaRow,
  Preprocess,
  PreprocessFailure,
  Representations,
} from '@omne-harness/media-contract'
import { createConversion, done, failed, type Todo } from './conversion.ts'
import { tenantText, type MediaDependencies } from './deps.ts'
import type { Objects } from './objects.ts'

type Flight = { readonly stop: AbortController; result: Promise<Preprocess>; waiters: number }

const REMEMBERED = 1024
/** Makes media ready for a model that cannot take them as they are. Only an outcome is kept. */
export function createRepresentations(deps: MediaDependencies, objects: Objects): Representations {
  const { index } = deps
  const flights = new Map<string, Flight>()
  const lastFailure = new Map<string, PreprocessFailure>()
  const watching = new Map<string, Set<() => void>>()
  const converting = createConversion(deps, objects)
  const changed = (row: MediaRow): void =>
    watching.get(`${row.tenant}\n${row.key}`)?.forEach(wake => wake())

  /** What is known without converting: an answer, or what there is to do. */
  async function located(
    tenant: EngineAccess['tenant'],
    ref: ContentReference,
  ): Promise<Outcome<Preprocess | Todo, InvalidReference>> {
    const row = await objects.resolve(tenantText(tenant), ref)
    if ('failure' in row)
      return row.failure.kind === 'invalid-reference'
        ? fail(row.failure)
        : succeed(failed('basis-unavailable'))
    const answer = await deps
      .definitions()
      ?.resolve({ tenant, mediaType: row.ok.mediaType })
      .catch(() => undefined)
    if (answer === undefined || 'failure' in answer) return succeed(failed('basis-unavailable'))
    if (answer.ok.kind === 'none') return succeed({ kind: 'not-needed' })
    const { definition } = answer.ok
    const kept = await index.readRepresentation({
      tenant: row.ok.tenant,
      key: row.ok.key,
      definition,
    })
    if ('failure' in kept) return succeed(failed('basis-unavailable'))
    if (kept.ok !== null) return succeed(done(kept.ok))
    const key = `${row.ok.tenant}\n${row.ok.key}\n${definition.name}@${definition.revision}`
    return succeed({ row: row.ok, resolved: answer.ok, key })
  }

  function start(access: EngineAccess, todo: Todo): Flight {
    const flight: Flight = {
      stop: new AbortController(),
      waiters: 0,
      result: Promise.resolve(failed('cancelled')),
    }
    flight.result = converting(access, todo, flight.stop.signal)
      .catch(() => failed('engine-error'))
      .then(answer => {
        flights.delete(todo.key)
        lastFailure.delete(todo.key)
        if (answer.kind === 'failed') lastFailure.set(todo.key, answer.reason)
        if (lastFailure.size > REMEMBERED)
          lastFailure.delete(lastFailure.keys().next().value as string)
        changed(todo.row)
        return answer
      })
    flights.set(todo.key, flight)
    changed(todo.row)
    return flight
  }

  /** Waits with the others for the one outcome; the conversion stops when the last one leaves. */
  async function joined(flight: Flight, signal: AbortSignal): Promise<Preprocess> {
    flight.waiters += 1
    const left = Promise.withResolvers<Preprocess>()
    const leave = (): void => left.resolve(failed('cancelled'))
    signal.addEventListener('abort', leave, { once: true })
    try {
      return await Promise.race([flight.result, left.promise])
    } finally {
      signal.removeEventListener('abort', leave)
      flight.waiters -= 1
      if (flight.waiters === 0) flight.stop.abort()
    }
  }

  async function read(
    input: Parameters<Representations['read']>[0],
  ): Promise<Outcome<Preprocess, InvalidReference>> {
    const found = await located(input.tenant, input.ref)
    if ('failure' in found || 'kind' in found.ok)
      return found as Outcome<Preprocess, InvalidReference>
    if (flights.has(found.ok.key)) return succeed({ kind: 'running' })
    const reason = lastFailure.get(found.ok.key)
    return succeed(reason === undefined ? { kind: 'not-started' } : failed(reason))
  }

  return {
    async ensure({ access, ref, signal }) {
      const found = await located(access.tenant, ref)
      if ('failure' in found || 'kind' in found.ok)
        return found as Outcome<Preprocess, InvalidReference>
      if (signal.aborted) return succeed(failed('cancelled'))
      const flight = flights.get(found.ok.key) ?? start(access, found.ok)
      return succeed(await joined(flight, signal))
    },
    read,
    async *watch({ tenant, ref, signal }) {
      const name = `${tenantText(tenant)}\n${ref.key}`
      let last = ''
      while (!signal.aborted) {
        const woken = Promise.withResolvers<void>()
        const wake = (): void => woken.resolve()
        const wakers = watching.get(name) ?? new Set()
        watching.set(name, wakers.add(wake))
        signal.addEventListener('abort', wake, { once: true })
        try {
          const now = await read({ tenant, ref })
          if ('failure' in now) return
          const text = JSON.stringify(now.ok)
          if (text !== last) yield now.ok
          last = text
          await woken.promise
        } finally {
          signal.removeEventListener('abort', wake)
          wakers.delete(wake)
          if (wakers.size === 0) watching.delete(name)
        }
      }
    },
  }
}
