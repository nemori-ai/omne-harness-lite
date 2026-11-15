import type { TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import type { SessionProtocol } from '@omne-harness/session-protocol'
import { userMessageId, userTextMessage } from './user-message.ts'
import {
  INITIAL_WORKSPACE,
  stepWorkspace,
  type Workspace,
  type WorkspaceEffect,
  type WorkspaceEvent,
} from './workspace.ts'

export type SessionDriverDeps = Readonly<{
  client: ClientOf<SessionProtocol>
  tenant: TenantId
  newId?: () => string
  schedule?: (run: () => void, delayMs: number) => () => void
}>

const HISTORY_PAGE_BYTES = '65536'

// The client throws only before anything is sent, so such a call provably did not leave: local unavailable.
function notSent<T>(call: () => Promise<T>): Promise<T | { readonly outcome: 'unavailable' }> {
  return Promise.resolve()
    .then(call)
    .catch(() => ({ outcome: 'unavailable' as const }))
}

type Peer = Readonly<{ client: ClientOf<SessionProtocol>; tenant: TenantId }>

type CallEffect = Exclude<
  WorkspaceEffect,
  { kind: 'observe' | 'stop-observing' | 'reconnect-later' }
>

type Calls = {
  readonly [K in CallEffect['kind']]: (
    effect: Extract<CallEffect, { kind: K }>,
    peer: Peer,
  ) => Promise<WorkspaceEvent>
}

function historyBody(
  tenant: TenantId,
  session: string,
  request: Extract<CallEffect, { kind: 'read-history' }>['request'],
) {
  return request.cursor === null
    ? {
        tenant,
        session,
        cursor: null,
        direction: 'backward' as const,
        pageBytes: HISTORY_PAGE_BYTES,
      }
    : { tenant, session, cursor: request.cursor }
}

const CALLS: Calls = {
  'list-sessions': ({ token, cursor }, { client, tenant }) =>
    notSent(() => client['list-sessions']({ tenant, cursor })).then(answer => ({
      kind: 'list-read',
      token,
      answer,
    })),
  'create-session': ({ createCallId }, { client }) =>
    notSent(() => client['create-session']({ createCallId, purpose: '' })).then(answer => ({
      kind: 'create-answered',
      createCallId,
      answer,
    })),
  'query-create-session': ({ createCallId }, { client, tenant }) =>
    notSent(() => client['query-create-session']({ tenant, createCallId })).then(answer => ({
      kind: 'create-confirmed',
      createCallId,
      answer,
    })),
  'send-input': ({ session, acceptId, inputId, text }, { client, tenant }) =>
    notSent(async () =>
      client['send-input']({
        tenant,
        session,
        acceptId,
        inputId,
        message: await userTextMessage(text, inputId),
      }),
    ).then(answer => ({ kind: 'send-answered', session, acceptId, answer })),
  'query-send-input': ({ session, acceptId }, { client, tenant }) =>
    notSent(() => client['query-send-input']({ tenant, session, acceptId })).then(answer => ({
      kind: 'send-confirmed',
      session,
      acceptId,
      answer,
    })),
  'cancel-run': ({ session, run, controlId }, { client, tenant }) =>
    notSent(() =>
      client['cancel-run']({ tenant, session, run, controlId, urgency: 'graceful' }),
    ).then(answer => ({ kind: 'cancel-answered', session, controlId, answer })),
  'read-history': ({ session, token, request }, { client, tenant }) =>
    notSent(() => client['read-history'](historyBody(tenant, session, request))).then(answer => ({
      kind: 'history-read',
      session,
      token,
      answer,
    })),
  'read-waiting': ({ session, token }, { client, tenant }) =>
    notSent(() => client['read-waiting']({ tenant, session })).then(answer => ({
      kind: 'waiting-read',
      session,
      token,
      answer,
    })),
  'retry-run': ({ session, run, controlId }, { client, tenant }) =>
    notSent(() => client['retry-run']({ tenant, session, run, controlId })).then(answer => ({
      kind: 'retry-answered',
      session,
      controlId,
      answer,
    })),
}

export class SessionDriver {
  #state: Workspace = INITIAL_WORKSPACE
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

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  getState = (): Workspace => this.#state

  loadList(): void {
    this.dispatch({ kind: 'list-load' })
  }

  loadMoreSessions(): void {
    this.dispatch({ kind: 'list-more' })
  }

  openSession(session: string): void {
    this.dispatch({ kind: 'open-session', session })
  }

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

  retry(): void {
    this.dispatch({ kind: 'retry', controlId: this.#deps.newId() })
  }

  dispose(): void {
    this.#disposed = true
    for (const controller of this.#observations.values()) controller.abort()
    this.#observations.clear()
    for (const cancel of this.#timers) cancel()
    this.#timers.clear()
    this.#listeners.clear()
  }

  dispatch(event: WorkspaceEvent): void {
    if (this.#disposed) return
    const next = stepWorkspace(this.#state, event)
    const changed = next.workspace !== this.#state
    this.#state = next.workspace
    for (const effect of next.effects) this.#run(effect)
    if (changed) for (const listener of this.#listeners) listener()
  }

  #run(effect: WorkspaceEffect): void {
    switch (effect.kind) {
      case 'observe':
        void this.#observe(effect.session, effect.generation)
        return
      case 'stop-observing':
        this.#observations.get(effect.generation)?.abort()
        this.#observations.delete(effect.generation)
        return
      case 'reconnect-later':
        this.#reconnectLater(effect)
        return
      default: {
        const call = CALLS[effect.kind] as (
          effect: CallEffect,
          peer: Peer,
        ) => Promise<WorkspaceEvent>
        void call(effect, this.#deps).then(event => this.dispatch(event))
      }
    }
  }

  #reconnectLater({
    session,
    generation,
    delayMs,
  }: Extract<WorkspaceEffect, { kind: 'reconnect-later' }>): void {
    const cancel = this.#deps.schedule(() => {
      this.#timers.delete(cancel)
      this.dispatch({ kind: 'reconnect-due', session, generation })
    }, delayMs)
    this.#timers.add(cancel)
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
      this.dispatch({ kind: 'observation-ended', session, generation, end: { kind: 'uncertain' } })
    } finally {
      if (this.#observations.get(generation) === controller) this.#observations.delete(generation)
    }
  }
}
