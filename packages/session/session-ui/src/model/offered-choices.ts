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

/** A source of choices; one that can say its lists changed is read again when it does. */
export type ChoiceSource<C, W = string> = Readonly<{
  list(where: W): Promise<Listing<C>>
  changed?(listener: () => void): () => void
}>

/** The lists one handed-over source gives, per place asked for; a source taken away lists nothing. */
export class OfferedChoices<C, W = string> {
  private readonly lists = new Cells<Exclude<ChoicesView<C>, { kind: 'absent' }>>(UNREAD)
  private readonly places = new Map<string, W>()
  private readonly keyOf: (where: W) => string
  private source: ChoiceSource<C, W> | null = null

  constructor(keyOf: (where: W) => string = String) {
    this.keyOf = keyOf
  }

  choices(where: W): ChoicesView<C> {
    return this.source === null ? ABSENT : this.lists.read(this.keyOf(where))
  }

  subscribe(where: W, listener: () => void): () => void {
    const key = this.keyOf(where)
    this.places.set(key, where)
    return this.lists.subscribe(key, listener)
  }

  async load(where: W): Promise<void> {
    const key = this.keyOf(where)
    this.places.set(key, where)
    const source = this.source
    if (source === null) return
    const listing = await source
      .list(where)
      .catch((): Listing<C> => ({ kind: 'unavailable', reason: '没有送达' }))
    if (this.source === source) this.lists.show(key, listing)
  }

  attach(source: ChoiceSource<C, W>): () => void {
    this.replace(source)
    const stop = source.changed?.(() => {
      for (const where of this.places.values()) void this.load(where)
    })
    return () => {
      stop?.()
      if (this.source === source) this.replace(null)
    }
  }

  // What an earlier source listed is not shown as the list of the next one.
  private replace(source: ChoiceSource<C, W> | null): void {
    this.source = source
    for (const [key, where] of this.places) {
      this.lists.show(key, UNREAD)
      void this.load(where)
    }
  }
}
