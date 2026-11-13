// Runs the state machine against a `session/v1` client: holds the state, runs each effect, and
// turns each answer into the next event. It owns the observations it opens and the timers it sets,
// and releases them all on `dispose`. No React, no DOM: the view subscribes to it.
import type { TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { SessionProtocol } from '@omne-harness/session-protocol'
import { INITIAL, step, type Effect, type Event, type State } from './session-machine.ts'
import { userMessageId, userTextMessage } from './user-message.ts'

export type SessionDriverDeps = Readonly<{
  client: ClientOf<SessionProtocol>
  tenant: TenantId
  /** Fresh ids: input, acceptance, create call, control. Defaults to `crypto.randomUUID()`. */
  newId?: () => string
  /** Timer for reconnecting. Defaults to `setTimeout`. */
  schedule?: (run: () => void, delayMs: number) => () => void
}>

const HISTORY_PAGE_BYTES = '65536'

/**
 * The client throws only before anything is sent (a body the contract cannot write). Such a call
 * provably did not leave, which is what the local `unavailable` says.
 */
function notSent<T>(call: () => Promise<T>): Promise<T | { readonly outcome: 'unavailable' }> {
  return Promise.resolve()
    .then(call)
    .catch(() => ({ outcome: 'unavailable' as const }))
}

export class SessionDriver {
  #state: State = INITIAL
  readonly #listeners = new Set<() => void>()
  readonly #observations = new Map<number, AbortController>()
  readonly #timers = new Set<() => void>()
  readonly #deps: Required<SessionDriverDeps>
  #disposed = false

  constructor(deps: SessionDriverDeps) {
    this.#deps = {
      newId: () => crypto.randomUUID(),
      schedule: (run, delayMs) => {
        const timer = setTimeout(run, delayMs)
        return () => clearTimeout(timer)
      },
      ...deps,
    }
  }

  get state(): State {
    return this.#state
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  getState = (): State => this.#state

  createSession(): void {
    this.dispatch({ kind: 'create', createCallId: this.#deps.newId() })
  }

  confirmCreate(): void {
    this.dispatch({ kind: 'create-confirm' })
  }

  async send(text: string): Promise<void> {
    if (text.trim().length === 0) return
    const inputId = this.#deps.newId()
    const messageId = await userMessageId(inputId)
    this.dispatch({ kind: 'send', text, inputId, acceptId: this.#deps.newId(), messageId })
  }

  confirmSend(acceptId: string): void {
    this.dispatch({ kind: 'send-confirm', acceptId })
  }

  cancel(): void {
    this.dispatch({ kind: 'cancel', controlId: this.#deps.newId() })
  }

  dispose(): void {
    this.#disposed = true
    for (const controller of this.#observations.values()) controller.abort()
    this.#observations.clear()
    for (const cancel of this.#timers) cancel()
    this.#timers.clear()
    this.#listeners.clear()
  }

  dispatch(event: Event): void {
    if (this.#disposed) return
    const next = step(this.#state, event)
    const changed = next.state !== this.#state
    this.#state = next.state
    for (const effect of next.effects) this.#run(effect)
    if (changed) for (const listener of [...this.#listeners]) listener()
  }

  #run(effect: Effect): void {
    const { client, tenant } = this.#deps
    switch (effect.kind) {
      case 'create-session': {
        const { createCallId } = effect
        void notSent(() => client['create-session']({ createCallId, purpose: '' })).then(answer =>
          this.dispatch({ kind: 'create-answered', createCallId, answer }),
        )
        return
      }
      case 'query-create-session': {
        const { createCallId } = effect
        void notSent(() => client['query-create-session']({ tenant, createCallId })).then(answer =>
          this.dispatch({ kind: 'create-confirmed', createCallId, answer }),
        )
        return
      }
      case 'send-input': {
        const { session, acceptId, inputId, text } = effect
        void notSent(async () =>
          client['send-input']({
            tenant,
            session,
            acceptId,
            inputId,
            message: await userTextMessage(text, inputId),
          }),
        ).then(answer => this.dispatch({ kind: 'send-answered', session, acceptId, answer }))
        return
      }
      case 'query-send-input': {
        const { session, acceptId } = effect
        void notSent(() => client['query-send-input']({ tenant, session, acceptId })).then(answer =>
          this.dispatch({ kind: 'send-confirmed', session, acceptId, answer }),
        )
        return
      }
      case 'cancel-run': {
        const { session, run, controlId } = effect
        void notSent(() =>
          client['cancel-run']({ tenant, session, run, controlId, urgency: 'graceful' }),
        ).then(answer => this.dispatch({ kind: 'cancel-answered', session, controlId, answer }))
        return
      }
      case 'read-history': {
        const { session, token, request } = effect
        const body =
          request.cursor === null
            ? {
                tenant,
                session,
                cursor: null,
                direction: 'backward' as const,
                pageBytes: HISTORY_PAGE_BYTES,
              }
            : { tenant, session, cursor: request.cursor }
        void notSent(() => client['read-history'](body)).then(answer =>
          this.dispatch({ kind: 'history-read', session, token, answer }),
        )
        return
      }
      case 'observe':
        void this.#observe(effect.session, effect.generation)
        return
      case 'stop-observing':
        this.#observations.get(effect.generation)?.abort()
        this.#observations.delete(effect.generation)
        return
      case 'reconnect-later': {
        const { session, generation, delayMs } = effect
        const cancel = this.#deps.schedule(() => {
          this.#timers.delete(cancel)
          this.dispatch({ kind: 'reconnect-due', session, generation })
        }, delayMs)
        this.#timers.add(cancel)
        return
      }
    }
  }

  async #observe(session: string, generation: number): Promise<void> {
    const controller = new AbortController()
    this.#observations.set(generation, controller)
    const frames = this.#deps.client.observe['observe-session'](
      { tenant: this.#deps.tenant, session },
      { signal: controller.signal },
    )
    try {
      for (;;) {
        const next = await frames.next()
        if (next.done === true) {
          this.dispatch({ kind: 'observation-ended', session, generation, end: next.value })
          return
        }
        this.dispatch({ kind: 'frame', session, generation, frame: next.value })
      }
    } catch {
      // The transport threw instead of ending: nothing is known about the stream any more.
      this.dispatch({ kind: 'observation-ended', session, generation, end: { kind: 'uncertain' } })
    } finally {
      if (this.#observations.get(generation) === controller) this.#observations.delete(generation)
    }
  }
}
