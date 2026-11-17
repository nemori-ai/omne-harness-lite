import { OrderedMap } from 'immutable'

// A Map whose copy is free: a fork shares every node with its origin, and a later write copies only its own path.
// Iteration keeps insertion order, as Map does.
export class SharedMap<K, V> implements Map<K, V> {
  #map: OrderedMap<K, V>

  constructor(entries?: Iterable<readonly [K, V]> | null) {
    this.#map = OrderedMap<K, V>().withMutations(map => {
      for (const [key, value] of entries ?? []) map.set(key, value)
    })
  }

  static #over<K, V>(map: OrderedMap<K, V>): SharedMap<K, V> {
    const shared = new SharedMap<K, V>()
    shared.#map = map
    return shared
  }

  fork(): SharedMap<K, V> {
    return SharedMap.#over(this.#map)
  }

  sharesWith(other: SharedMap<K, V>): boolean {
    return this.#map === other.#map
  }

  get size(): number {
    return this.#map.size
  }

  get(key: K): V | undefined {
    return this.#map.get(key)
  }

  has(key: K): boolean {
    return this.#map.has(key)
  }

  set(key: K, value: V): this {
    this.#map = this.#map.set(key, value)
    return this
  }

  delete(key: K): boolean {
    if (!this.#map.has(key)) return false
    this.#map = this.#map.delete(key)
    return true
  }

  clear(): void {
    this.#map = OrderedMap<K, V>()
  }

  forEach(callback: (value: V, key: K, map: Map<K, V>) => void, thisArg?: unknown): void {
    for (const [key, value] of this.#map.entries()) callback.call(thisArg, value, key, this)
  }

  *entries(): MapIterator<[K, V]> {
    for (const [key, value] of this.#map.entries()) yield [key, value]
  }

  *keys(): MapIterator<K> {
    yield* this.#map.keys()
  }

  *values(): MapIterator<V> {
    yield* this.#map.values()
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries()
  }

  get [Symbol.toStringTag](): string {
    return 'SharedMap'
  }
}

// A fork of a shared table; any other map is copied once, after which its forks are free.
export function forkOf<K, V>(map: ReadonlyMap<K, V>): SharedMap<K, V> {
  return map instanceof SharedMap ? (map as SharedMap<K, V>).fork() : new SharedMap(map)
}

// Generic walkers treat both kinds of table alike.
export const isTable = (value: unknown): value is ReadonlyMap<unknown, unknown> =>
  value instanceof Map || value instanceof SharedMap
