export type Listing<C> =
  | Readonly<{ kind: 'listed'; choices: readonly C[] }>
  | Readonly<{ kind: 'unavailable'; reason: string }>

/** What a tenant can pick: `absent` while nobody lists anything. */
export type ChoicesView<C> =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'unread' }>
  | Listing<C>

const UNREAD = { kind: 'unread' } as const
const ABSENT = { kind: 'absent' } as const

export class Cells<V> {
  private readonly entries = new Map<string, { value: V; listeners: Set<() => void> }>()
  private readonly initial: V

  constructor(initial: V) {
    this.initial = initial
  }

  read(key: string): V {
    return this.entries.get(key)?.value ?? this.initial
  }

  subscribe(key: string, listener: () => void): () => void {
    const entry = this.entryOf(key)
    entry.listeners.add(listener)
    return () => entry.listeners.delete(listener)
  }

  show(key: string, value: V): void {
    const entry = this.entryOf(key)
    entry.value = value
    for (const listener of entry.listeners) listener()
  }

  keys(): readonly string[] {
    return [...this.entries.keys()]
  }

  private entryOf(key: string) {
    const entry = this.entries.get(key) ?? { value: this.initial, listeners: new Set() }
    this.entries.set(key, entry)
    return entry
  }
}

/** The lists one handed-over source gives, per tenant; a source taken away lists nothing. */
export class OfferedChoices<C> {
  private readonly lists = new Cells<Exclude<ChoicesView<C>, { kind: 'absent' }>>(UNREAD)
  private source: { list(tenant: string): Promise<Listing<C>> } | null = null

  choices(tenant: string): ChoicesView<C> {
    return this.source === null ? ABSENT : this.lists.read(tenant)
  }

  subscribe(tenant: string, listener: () => void): () => void {
    return this.lists.subscribe(tenant, listener)
  }

  async load(tenant: string): Promise<void> {
    const source = this.source
    if (source === null) return
    const listing = await source
      .list(tenant)
      .catch((): Listing<C> => ({ kind: 'unavailable', reason: '没有送达' }))
    if (this.source === source) this.lists.show(tenant, listing)
  }

  attach(source: { list(tenant: string): Promise<Listing<C>> }): () => void {
    this.replace(source)
    return () => {
      if (this.source === source) this.replace(null)
    }
  }

  // What an earlier source listed is not shown as the list of the next one.
  private replace(source: { list(tenant: string): Promise<Listing<C>> } | null): void {
    this.source = source
    for (const tenant of this.lists.keys()) {
      this.lists.show(tenant, UNREAD)
      void this.load(tenant)
    }
  }
}
