import { defaultBackoff } from '@omne-harness/client-assembly'
import type { CanvasBody, CanvasKindBody, CanvasProtocol } from '@omne-harness/canvas-protocol'
import type { TenantId } from '@omne-harness/public-contract'
import type { ObservationEnd } from '@omne-harness/sdk/core'
import { touched, UNKNOWN_TEXT, whyNot, type Command } from './commands.ts'
import {
  MAIN_CANVAS,
  READING,
  readKinds,
  readLook,
  type CanvasClient,
  type Reading,
} from './reading.ts'

export type Schedule = (delayMs: number, run: () => void) => () => void

/** Whether the canvas follows the server: watching, waiting to reconnect, or refused. */
export type Live = 'off' | 'on' | 'retrying' | 'denied'

export type CanvasState = Readonly<{
  look: Reading<CanvasBody>
  kinds: Reading<readonly CanvasKindBody[]>
  /** What a command is still about, by entry key: drawn as not settled. */
  pending: ReadonlySet<string>
  notice: string | undefined
  live: Live
}>

type ChangesEnd = ObservationEnd<CanvasProtocol['observations']['observe-changes']>

const timeout: Schedule = (delayMs, run) => {
  const handle = setTimeout(run, delayMs)
  return () => clearTimeout(handle)
}

const deniedEnd = (end: ChangesEnd): boolean =>
  (end.kind === 'ended' && end.reason === 'denied') ||
  (end.kind === 'refused' && end.outcome === 'denied')

const INITIAL: CanvasState = {
  look: READING,
  kinds: READING,
  pending: new Set(),
  notice: undefined,
  live: 'off',
}

/** The canvas of one tenant as last read; a command's entries stay not settled until the read after it lands. */
export class CanvasDriver {
  #state: CanvasState = INITIAL
  readonly #listeners = new Set<() => void>()
  readonly #client: CanvasClient
  readonly #tenant: TenantId
  readonly #schedule: Schedule
  readonly #pending = new Map<string, number>()
  #asked = 0
  #applied = 0
  #generation = 0
  #attempt = 0
  #observation: AbortController | undefined
  #cancelRetry: (() => void) | undefined
  #disposed = false

  constructor(deps: Readonly<{ client: CanvasClient; tenant: TenantId; schedule?: Schedule }>) {
    this.#client = deps.client
    this.#tenant = deps.tenant
    this.#schedule = deps.schedule ?? timeout
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  getState = (): CanvasState => this.#state

  start(): void {
    if (this.#state.live !== 'off' || this.#disposed) return
    this.#set({ live: 'on' })
    void this.reread()
    this.rereadKinds()
    void this.#observe(++this.#generation)
  }

  /** A read answered after a later one was asked is not drawn over the later one. */
  async reread(): Promise<void> {
    const round = ++this.#asked
    const look = await readLook(this.#client, this.#tenant)
    if (this.#disposed || round <= this.#applied) return
    this.#applied = round
    this.#set({ look })
  }

  rereadKinds(): void {
    void readKinds(this.#client, this.#tenant).then(kinds => {
      if (!this.#disposed) this.#set({ kinds })
    })
  }

  /** Sends one command. Whatever it answers, the canvas is read again and drawn as read. */
  async send(command: Command): Promise<void> {
    if (this.#disposed) return
    const keys = touched(command)
    this.#hold(keys, 1)
    this.#set({ notice: undefined })
    let notice: string | undefined
    try {
      const body = { ...command.body, tenant: this.#tenant, canvas: MAIN_CANVAS }
      notice = whyNot(await this.#call(command.op, body))
    } catch {
      notice = UNKNOWN_TEXT
    }
    await this.reread()
    this.#hold(keys, -1)
    this.#set(notice === undefined ? {} : { notice })
  }

  dismiss(): void {
    this.#set({ notice: undefined })
  }

  dispose(): void {
    this.#disposed = true
    this.#observation?.abort()
    this.#cancelRetry?.()
  }

  #call(op: Command['op'], body: object): Promise<Readonly<{ outcome: string; body?: unknown }>> {
    const call = this.#client[op] as (body: object) => Promise<{ outcome: string; body?: unknown }>
    return call(body)
  }

  #hold(keys: readonly string[], by: 1 | -1): void {
    for (const key of keys) {
      const count = (this.#pending.get(key) ?? 0) + by
      if (count > 0) this.#pending.set(key, count)
      else this.#pending.delete(key)
    }
    this.#set({ pending: new Set(this.#pending.keys()) })
  }

  #set(change: Partial<CanvasState>): void {
    if (this.#disposed) return
    this.#state = { ...this.#state, ...change }
    for (const listener of Array.from(this.#listeners)) listener()
  }

  async #observe(generation: number): Promise<void> {
    const controller = new AbortController()
    this.#observation = controller
    try {
      const frames = this.#client.observe['observe-changes'](
        { tenant: this.#tenant },
        { signal: controller.signal },
      )
      for (;;) {
        const next = await frames.next()
        if (next.done === true) return this.#ended(generation, deniedEnd(next.value))
        if (generation !== this.#generation) return
        this.#attempt = 0
        if (this.#state.live !== 'on') this.#set({ live: 'on' })
        void this.reread()
      }
    } catch {
      this.#ended(generation, false)
    }
  }

  #ended(generation: number, denied: boolean): void {
    if (this.#disposed || generation !== this.#generation) return
    if (denied) {
      this.#set({ live: 'denied', look: { kind: 'unreadable', reason: 'denied' } })
      return
    }
    this.#attempt += 1
    this.#set({ live: 'retrying' })
    this.#cancelRetry = this.#schedule(defaultBackoff.delayMs(this.#attempt - 1), () => {
      if (!this.#disposed) void this.#observe(++this.#generation)
    })
  }
}
