export type Instance = Readonly<{ fiber: string; generation: number }>

export type Scope = readonly string[]

/** The scope of an asker that sees only what holds for the whole deployment. */
export const deployment: Scope = Object.freeze([])

export type Entry<I = unknown> = Readonly<{
  point: string
  key: string
  id: string
  scope: Scope
  rank: number
  digest: string
  item: I
  /** Entries of this key at a deeper scope are out wherever this one is seen. Absent: it can be overridden. */
  lock?: true
}>

export type Placed<I = unknown> = Entry<I> & Readonly<{ instance: Instance }>

export type Unread = Readonly<{ point: string; source: string; scope: Scope }>

export type Registry = Readonly<{
  serving: readonly Instance[]
  retiring: readonly Instance[]
  placed: readonly Placed[]
  unread: readonly Unread[]
}>

export type Standing = 'absent' | 'serving' | 'retiring'

export type Installed =
  | Readonly<{ kind: 'installed'; registry: Registry }>
  | Readonly<{
      kind: 'refused'
      reason: 'invalid' | 'retiring' | 'generation-serving'
      detail: string
    }>

const POINT_NAME = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/

export const isPointName = (text: string): boolean => POINT_NAME.test(text)

export const byText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0

export function byScope(left: Scope, right: Scope): number {
  if (left.length !== right.length) return left.length - right.length
  const at = left.findIndex((part, index) => part !== right[index])
  return at === -1 ? 0 : byText(left[at] as string, right[at] as string)
}

export const byInstance = (left: Instance, right: Instance): number =>
  byText(left.fiber, right.fiber) || left.generation - right.generation

/** The one order of a registry: it reads only what each entry carries, never when it arrived. */
const byPlaced = (left: Placed, right: Placed): number =>
  byText(left.point, right.point) ||
  byText(left.key, right.key) ||
  byScope(left.scope, right.scope) ||
  left.rank - right.rank ||
  byText(left.id, right.id) ||
  byText(left.digest, right.digest) ||
  byInstance(left.instance, right.instance)

const byUnread = (left: Unread, right: Unread): number =>
  byText(left.point, right.point) ||
  byText(left.source, right.source) ||
  byScope(left.scope, right.scope)

export const sameInstance = (left: Instance, right: Instance): boolean =>
  left.fiber === right.fiber && left.generation === right.generation

const among = (instances: readonly Instance[], instance: Instance): boolean =>
  instances.some(other => sameInstance(other, instance))

const without = (instances: readonly Instance[], instance: Instance): Instance[] =>
  instances.filter(other => !sameInstance(other, instance))

function registryOf(
  serving: readonly Instance[],
  retiring: readonly Instance[],
  placed: readonly Placed[],
  unread: readonly Unread[],
): Registry {
  return Object.freeze({
    serving: Object.freeze([...serving].sort(byInstance)),
    retiring: Object.freeze([...retiring].sort(byInstance)),
    placed: Object.freeze([...placed].sort(byPlaced)),
    unread,
  })
}

export const empty: Registry = registryOf([], [], [], Object.freeze([]))

export function standing(registry: Registry, instance: Instance): Standing {
  if (among(registry.serving, instance)) return 'serving'
  return among(registry.retiring, instance) ? 'retiring' : 'absent'
}

export function placedBy(registry: Registry, instance: Instance): readonly Placed[] {
  return registry.placed.filter(placed => sameInstance(placed.instance, instance))
}

function instanceProblem(instance: Instance): string | null {
  if (instance.fiber === '') return 'the fiber name is empty'
  if (!Number.isInteger(instance.generation) || instance.generation < 1)
    return 'the generation is not a positive integer'
  return null
}

function entryProblem(entry: Entry): string | null {
  if (!isPointName(entry.point)) return `"${entry.point}" is not a point name <host>.<name>`
  if (entry.scope.some(part => part === ''))
    return `an entry of ${entry.point} has an empty scope part`
  if (!Number.isFinite(entry.rank))
    return `an entry of ${entry.point} has a rank that is not finite`
  if (entry.digest === '') return `an entry of ${entry.point} has an empty digest`
  return null
}

const spotOf = (entry: Entry): string =>
  JSON.stringify([entry.point, entry.key, entry.id, entry.scope])

function firstProblem(instance: Instance, entries: readonly Entry[]): string | null {
  const spots = new Set<string>()
  for (const entry of entries) {
    const problem = entryProblem(entry)
    if (problem !== null) return problem
    const spot = spotOf(entry)
    if (spots.has(spot)) return `${entry.point} holds two entries of this instance at one spot`
    spots.add(spot)
  }
  return instanceProblem(instance)
}

const place = (instance: Instance, entry: Entry): Placed =>
  Object.freeze({
    point: entry.point,
    key: entry.key,
    id: entry.id,
    scope: Object.freeze([...entry.scope]),
    rank: entry.rank,
    digest: entry.digest,
    item: entry.item,
    ...(entry.lock === true && { lock: true as const }),
    instance,
  })

export function install(
  registry: Registry,
  instance: Instance,
  entries: readonly Entry[],
): Installed {
  const problem = firstProblem(instance, entries)
  if (problem !== null) return { kind: 'refused', reason: 'invalid', detail: problem }
  if (among(registry.retiring, instance))
    return { kind: 'refused', reason: 'retiring', detail: 'this instance is being withdrawn' }
  const other = registry.serving.find(
    held => held.fiber === instance.fiber && held.generation !== instance.generation,
  )
  if (other !== undefined)
    return {
      kind: 'refused',
      reason: 'generation-serving',
      detail: `generation ${other.generation} of ${instance.fiber} is serving`,
    }
  const tag = Object.freeze({ fiber: instance.fiber, generation: instance.generation })
  const kept = registry.placed.filter(placed => !sameInstance(placed.instance, instance))
  return {
    kind: 'installed',
    registry: registryOf(
      [...without(registry.serving, instance), tag],
      registry.retiring,
      [...kept, ...entries.map(entry => place(tag, entry))],
      registry.unread,
    ),
  }
}

export function retire(registry: Registry, instance: Instance): Registry {
  const held = registry.serving.find(other => sameInstance(other, instance))
  if (held === undefined) return registry
  return registryOf(
    without(registry.serving, instance),
    [...registry.retiring, held],
    registry.placed,
    registry.unread,
  )
}

export function remove(registry: Registry, instance: Instance): Registry {
  if (standing(registry, instance) === 'absent') return registry
  return registryOf(
    without(registry.serving, instance),
    without(registry.retiring, instance),
    registry.placed.filter(placed => !sameInstance(placed.instance, instance)),
    registry.unread,
  )
}

export function withUnread(registry: Registry, unread: readonly Unread[]): Registry {
  const kept = new Map<string, Unread>()
  for (const { point, source, scope } of unread)
    kept.set(
      JSON.stringify([point, source, scope]),
      Object.freeze({ point, source, scope: Object.freeze([...scope]) }),
    )
  const sorted = Object.freeze([...kept.values()].sort(byUnread))
  return registryOf(registry.serving, registry.retiring, registry.placed, sorted)
}
