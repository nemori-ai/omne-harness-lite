import { memberName, type PluginRefusal } from '@omne-harness/plugin-protocol'
import type { Rejection } from '@omne-harness/public-contract'
import type { Trouble } from '@omne-harness/shell-contract'

const KEPT = 20

const UNSAID: Rejection = { at: [], given: '', allows: 'the server did not say why' }

export type Clock = () => string

export const systemClock: Clock = () =>
  /* wall-clock: observation-time -- when a refusal was seen, told by the client's clock */ new Date().toISOString()

export type Refusals = Readonly<{
  note(plugin: string, target: string, rejection: Rejection): void
  of(plugin: string): readonly PluginRefusal[]
  clear(plugin: string): void
}>

/** The last refused calls of each plugin, newest last; telling one is told to `noted`. */
export function createRefusals(clock: Clock, noted: () => void): Refusals {
  const kept = new Map<string, PluginRefusal[]>()
  return {
    note(plugin, target, rejection) {
      const list = kept.get(plugin) ?? []
      list.push({ at: clock(), target, rejection })
      kept.set(plugin, list.slice(-KEPT))
      noted()
    },
    of: plugin => kept.get(plugin) ?? [],
    clear: plugin => void kept.delete(plugin),
  }
}

type Calls = Record<string, (...args: unknown[]) => unknown>

const isRequestError = (
  error: unknown,
): error is Error & { target: string; rejection: Rejection } =>
  error instanceof Error &&
  error.name === 'ClientRequestError' &&
  typeof Reflect.get(error, 'target') === 'string' &&
  typeof Reflect.get(error, 'rejection') === 'object'

/** The same client, which tells each call it could not send and each answer that the request was refused. */
export function recording(
  client: unknown,
  need: string,
  note: (target: string, rejection: Rejection) => void,
): unknown {
  const calls = client as Calls
  return new Proxy(calls, {
    get(target, name) {
      const call = Reflect.get(target, name) as unknown
      if (name === 'observe' || typeof name !== 'string' || typeof call !== 'function') return call
      return (...args: unknown[]) =>
        Promise.resolve(call(...args)).then(
          answer => {
            const told = answer as { outcome?: unknown; rejection?: Rejection } | undefined
            if (told?.outcome === 'protocol-rejected')
              note(`${need}/${name}`, told.rejection ?? UNSAID)
            return answer
          },
          (error: unknown) => {
            if (isRequestError(error)) note(error.target, error.rejection)
            throw error
          },
        )
    },
  })
}

/** What the host could not read in an item a plugin put, as that plugin's refused, from when it was first seen. */
export function troublesOf(
  troubles: readonly Trouble[],
  ownerOf: (trouble: Trouble) => string | undefined,
  seen: Map<string, string>,
  clock: Clock,
): ReadonlyMap<string, readonly PluginRefusal[]> {
  const now = new Map<string, string>()
  const owned = new Map<string, PluginRefusal[]>()
  for (const trouble of troubles) {
    const plugin = ownerOf(trouble)
    if (plugin === undefined) continue
    const key = JSON.stringify([plugin, trouble])
    const at = seen.get(key) ?? clock()
    now.set(key, at)
    const { point, key: pointKey, id, at: where, given, allows } = trouble
    const target = memberName({ point, key: pointKey, id: id === '' ? null : id })
    owned.set(plugin, [
      ...(owned.get(plugin) ?? []),
      { at, target, rejection: { at: where, given, allows } },
    ])
  }
  seen.clear()
  for (const [key, at] of now) seen.set(key, at)
  return owned
}
