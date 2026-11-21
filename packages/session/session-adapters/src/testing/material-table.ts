import { createHash } from 'node:crypto'
import type { AgentExecutionId, MaterialReaders } from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import type { Material } from '@omne-harness/agent-contract'
import { SharedMap } from '../journal/shared-map.ts'
import { canonical } from './canonical.ts'

export type Stored = {
  tenant: string
  execution: AgentExecutionId
  value: Material<ContentBlock>
  readers?: MaterialReaders
}

const keyOf = (tenant: string, execution: AgentExecutionId, content: string) =>
  JSON.stringify([tenant, execution, createHash('sha256').update(content).digest('hex')])

const contentKey = (stored: Stored): string | null =>
  stored.readers === 'until-release'
    ? null
    : keyOf(stored.tenant, stored.execution, canonical(stored.value))

// The materials kept in a session, by source. One with the same tenant, execution and content is found by its
// content, without reading every material kept so far. Forks share everything, as SharedMap does.
export class MaterialTable implements Map<string, Stored> {
  #stored: SharedMap<string, Stored>
  #byContent: SharedMap<string, readonly string[]>

  constructor() {
    this.#stored = new SharedMap()
    this.#byContent = new SharedMap()
  }

  fork(): MaterialTable {
    const fork = new MaterialTable()
    fork.#stored = this.#stored.fork()
    fork.#byContent = this.#byContent.fork()
    return fork
  }

  sameContent(tenant: string, execution: AgentExecutionId, content: string): string | undefined {
    return this.#byContent.get(keyOf(tenant, execution, content))?.[0]
  }

  #unindex(key: string): void {
    const old = this.#stored.get(key)
    if (old === undefined) return
    const at = contentKey(old)
    if (at === null) return
    const rest = (this.#byContent.get(at) ?? []).filter(item => item !== key)
    if (rest.length === 0) this.#byContent.delete(at)
    else this.#byContent.set(at, rest)
  }

  get size(): number {
    return this.#stored.size
  }

  get(key: string): Stored | undefined {
    return this.#stored.get(key)
  }

  has(key: string): boolean {
    return this.#stored.has(key)
  }

  set(key: string, stored: Stored): this {
    const at = contentKey(stored)
    const old = this.#stored.get(key)
    const same = old !== undefined && contentKey(old) === at
    if (!same) {
      this.#unindex(key)
      if (at !== null) this.#byContent.set(at, [...(this.#byContent.get(at) ?? []), key])
    }
    this.#stored.set(key, stored)
    return this
  }

  delete(key: string): boolean {
    this.#unindex(key)
    return this.#stored.delete(key)
  }

  clear(): void {
    this.#stored = new SharedMap()
    this.#byContent = new SharedMap()
  }

  forEach(
    callback: (value: Stored, key: string, map: Map<string, Stored>) => void,
    thisArg?: unknown,
  ): void {
    for (const [key, value] of this.#stored) callback.call(thisArg, value, key, this)
  }

  entries(): MapIterator<[string, Stored]> {
    return this.#stored.entries()
  }

  keys(): MapIterator<string> {
    return this.#stored.keys()
  }

  values(): MapIterator<Stored> {
    return this.#stored.values()
  }

  [Symbol.iterator](): MapIterator<[string, Stored]> {
    return this.entries()
  }

  get [Symbol.toStringTag](): string {
    return 'MaterialTable'
  }
}
