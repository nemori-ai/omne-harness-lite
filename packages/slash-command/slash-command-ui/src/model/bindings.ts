export type Changes = Readonly<Record<string, string | null>>

export type PreferencePort = Readonly<{
  read(
    name: string,
  ): Promise<
    | Readonly<{ kind: 'read'; value: string | null; revision: string }>
    | Readonly<{ kind: 'failed'; why: string }>
  >
  write(
    name: string,
    value: string,
    expected: string,
  ): Promise<
    | Readonly<{ kind: 'written'; revision: string }>
    | Readonly<{ kind: 'conflict'; revision: string }>
    | Readonly<{ kind: 'failed'; why: string }>
  >
}>

export type BindingCache = Readonly<{ read(): string | null; write(text: string): void }>

export type SaveState =
  | Readonly<{ kind: 'saved' }>
  | Readonly<{ kind: 'saving' }>
  | Readonly<{ kind: 'unsaved'; why: string }>

export const CHANGED_ELSEWHERE = '别处刚改过键位，这里已经换成那边的；要改请再改一次'

function parse(text: string | null): Changes {
  if (text === null) return {}
  try {
    const value: unknown = JSON.parse(text)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string | null] =>
          typeof entry[1] === 'string' || entry[1] === null,
      ),
    )
  } catch {
    return {}
  }
}

/** The account's changes to the keys: the cache shows first, the account is the authority, a write names what it read. */
export class KeyBindings {
  readonly #portOf: () => PreferencePort | undefined
  readonly #cache: BindingCache
  readonly #name: string
  readonly #listeners = new Set<() => void>()
  #changes: Changes
  #revision: string | null = null
  #state: SaveState = { kind: 'saved' }

  constructor(
    port: (() => PreferencePort | undefined) | PreferencePort | undefined,
    cache: BindingCache,
    name: string,
  ) {
    this.#portOf = typeof port === 'function' ? port : () => port
    this.#cache = cache
    this.#name = name
    this.#changes = parse(cache.read())
  }

  readonly changes = (): Changes => this.#changes

  readonly state = (): SaveState => this.#state

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => void this.#listeners.delete(listener)
  }

  async load(): Promise<void> {
    const port = this.#portOf()
    if (port === undefined) return
    const read = await port.read(this.#name)
    if (read.kind === 'failed') return void this.#tell({ kind: 'unsaved', why: read.why })
    this.#revision = read.revision
    this.#changes = parse(read.value)
    this.#cache.write(JSON.stringify(this.#changes))
    this.#tell(this.#state)
  }

  async change(next: Changes): Promise<SaveState> {
    this.#changes = next
    const port = this.#portOf()
    if (port === undefined) {
      this.#cache.write(JSON.stringify(next))
      return this.#tell({ kind: 'unsaved', why: '读不到账号，改动只存在这台机器上' })
    }
    this.#tell({ kind: 'saving' })
    if (this.#revision === null) {
      const read = await port.read(this.#name)
      if (read.kind === 'failed') return this.#tell({ kind: 'unsaved', why: read.why })
      this.#revision = read.revision
    }
    const text = JSON.stringify(next)
    const written = await port.write(this.#name, text, this.#revision ?? '0')
    if (written.kind === 'written') {
      this.#revision = written.revision
      this.#cache.write(text)
      return this.#tell({ kind: 'saved' })
    }
    if (written.kind === 'failed') return this.#tell({ kind: 'unsaved', why: written.why })
    await this.load()
    return this.#tell({ kind: 'unsaved', why: CHANGED_ELSEWHERE })
  }

  #tell(state: SaveState): SaveState {
    this.#state = state
    for (const listener of Array.from(this.#listeners)) listener()
    return state
  }
}
