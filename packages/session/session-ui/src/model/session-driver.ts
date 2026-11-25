import type { SenderSeen } from './composer-assistant.ts'
import type { TenantId } from '@omne-harness/public-contract'
import type { ClientOf } from '@omne-harness/sdk/core'
import {
  userMessageId,
  userMessage,
  type UserAttachment,
  type SessionProtocol,
} from '@omne-harness/session-protocol'
import {
  INITIAL_WORKSPACE,
  stepWorkspace,
  type Workspace,
  type WorkspaceEffect,
  type WorkspaceEvent,
} from './workspace.ts'
import { BUSY, GONE, NO_WORDS, sayFate, type Said, type SayAnswer, type SayTarget } from './say.ts'
import {
  sayBlocked,
  type CreateChoice,
  type SayTo,
  type SendHow,
  type Urgency,
  type Words,
} from './session-machine.ts'

export type SessionDriverDeps = Readonly<{
  client: ClientOf<SessionProtocol>
  tenant: TenantId
  newId?: () => string
  schedule?: (run: () => void, delayMs: number) => () => void
}>

const HISTORY_PAGE_BYTES = '65536'

// The client throws only before anything is sent, so such a call provably did not leave: local unavailable.
export function notSent<T>(
  call: () => Promise<T>,
): Promise<T | { readonly outcome: 'unavailable' }> {
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
  'create-session': ({ createCallId, model, workspace }, { client }) =>
    notSent(() =>
      client['create-session']({
        createCallId,
        purpose: '',
        ...(model === undefined ? {} : { model }),
        ...(workspace === undefined ? {} : { workspace }),
      }),
    ).then(answer => ({
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
  'send-input': (
    { session, acceptId, inputId, text, attachments, seen, how },
    { client, tenant },
  ) =>
    notSent(async () => {
      const body = {
        tenant,
        session,
        acceptId,
        inputId,
        message: await userMessage({ inputId, text, attachments }),
        ...(seen === undefined ? {} : { seen }),
      }
      if (how === 'first') return client['interrupt-input'](body)
      return client['send-input'](how === 'after' ? { ...body, afterRun: 'yes' } : body)
    }).then(answer => ({ kind: 'send-answered', session, acceptId, answer })),
  'query-send-input': ({ session, acceptId }, { client, tenant }) =>
    notSent(() => client['query-send-input']({ tenant, session, acceptId })).then(answer => ({
      kind: 'send-confirmed',
      session,
      acceptId,
      answer,
    })),
  'cancel-run': ({ session, run, controlId, urgency }, { client, tenant }) =>
    notSent(() => client['cancel-run']({ tenant, session, run, controlId, urgency })).then(
      answer => ({ kind: 'cancel-answered', session, controlId, answer }),
    ),
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
  readonly #saying = new Set<() => void>()
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

  createSession(choice: CreateChoice = {}): void {
    const createCallId = this.#deps.newId()
    this.dispatch({ kind: 'create', createCallId, ...choice })
  }

  confirmCreate(): void {
    this.dispatch({ kind: 'create-confirm' })
  }

  async send(
    text: string,
    attachments: readonly UserAttachment[] = [],
    seen?: SenderSeen,
    how?: SendHow,
  ): Promise<void> {
    if (text.trim().length === 0 && attachments.length === 0) return
    const inputId = this.#deps.newId()
    const messageId = await userMessageId(inputId)
    const acceptId = this.#deps.newId()
    this.dispatch({
      kind: 'send',
      text,
      attachments,
      ...(seen === undefined ? {} : { seen }),
      ...(how === undefined ? {} : { how }),
      inputId,
      acceptId,
      messageId,
    })
  }

  /** Hands words, and what is attached to them, to a session in one step, and answers once with how they ended. */
  async say(
    target: SayTarget,
    text: string,
    attachments: readonly UserAttachment[] = [],
  ): Promise<SayAnswer> {
    if (text.trim().length === 0 && attachments.length === 0)
      return { kind: 'failed', reason: NO_WORDS }
    const inputId = this.#deps.newId()
    const messageId = await userMessageId(inputId)
    if (this.#disposed) return { kind: 'failed', reason: GONE }
    const to: SayTo =
      target.kind === 'new' ? { kind: 'new', createCallId: this.#deps.newId() } : target
    if (sayBlocked(this.#state.session, to)) return { kind: 'failed', reason: BUSY }
    const said: Said = { to, acceptId: this.#deps.newId(), messageId }
    const words: Words = { text, acceptId: said.acceptId, inputId, messageId }
    this.dispatch({
      kind: 'say',
      to,
      words: attachments.length === 0 ? words : { ...words, attachments },
    })
    return this.#fateOf(said)
  }

  #fateOf(said: Said): Promise<SayAnswer> {
    return new Promise(resolve => {
      const look = (): void => {
        const fate = this.#disposed
          ? { kind: 'unknown' as const }
          : sayFate(this.#state.session, said)
        if (fate === null) return
        this.#saying.delete(look)
        resolve(fate)
      }
      this.#saying.add(look)
      look()
    })
  }

  confirmSend(acceptId: string): void {
    this.dispatch({ kind: 'send-confirm', acceptId })
  }

  cancel(urgency: Urgency = 'graceful'): void {
    this.dispatch({ kind: 'cancel', controlId: this.#deps.newId(), urgency })
  }

  retry(): void {
    this.dispatch({ kind: 'retry', controlId: this.#deps.newId() })
  }

  dispose(): void {
    this.#disposed = true
    for (const look of Array.from(this.#saying)) look()
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
    if (!changed) return
    for (const listener of this.#listeners) listener()
    for (const look of Array.from(this.#saying)) look()
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
