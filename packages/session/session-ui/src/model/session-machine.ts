// The session interface as a pure state machine: `step(state, event)` gives the next state and the
// effects the driver runs against the protocol client. Every cell of the totalized table in
// SPEC.md「全化表」is one branch here; the tests are named after the rows.
import type { ClientOf, ObservationEnd as ClientObservationEnd } from '@omne-harness/sdk/core'
import type { ObserveSessionFrame, SessionProtocol } from '@omne-harness/session-protocol'
import {
  applyDelta,
  applySnapshot,
  EMPTY_CONTENT,
  mergeHistory,
  reachesKnown,
  readThroughTo,
  settleLive,
  type Content,
} from './content.ts'
import { compareDecimal, isRecord, textOf } from './plain.ts'

type Client = ClientOf<SessionProtocol>
type Answer<K extends Exclude<keyof Client, 'observe'>> = Awaited<ReturnType<Client[K]>>
export type CreateAnswer = Answer<'create-session'>
export type CreateQueryAnswer = Answer<'query-create-session'>
export type SendAnswer = Answer<'send-input'>
export type SendQueryAnswer = Answer<'query-send-input'>
export type HistoryAnswer = Answer<'read-history'>
export type CancelAnswer = Answer<'cancel-run'>
export type ObservationEnd = ClientObservationEnd<
  SessionProtocol['observations']['observe-session']
>

/** A sentence for a person, and which of the three kinds of trouble it is. */
export type Notice = Readonly<{ kind: 'refused' | 'unavailable' | 'unknown'; text: string }>

export type InputStatus =
  | 'sending'
  | 'accepted'
  | 'confirming'
  | 'unknown'
  | 'not-committed'
  | 'refused'
export type PendingInput = Readonly<{
  acceptId: string
  inputId: string
  messageId: string
  text: string
  status: InputStatus
  notice: Notice | null
}>

export type Run =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'running'; run: string }>
  | Readonly<{ kind: 'cancelling'; run: string; controlId: string; unknown: boolean }>

export type Observation =
  | Readonly<{ kind: 'connecting'; generation: number }>
  | Readonly<{ kind: 'live'; generation: number }>
  | Readonly<{ kind: 'reconnecting'; generation: number; attempt: number }>

export type History = Readonly<{
  /** The read in flight, by token; null when none is. */
  reading: number | null
  /** The last token issued: a new read takes the next one, so a stale answer never matches. */
  issued: number
  /** A newer revision arrived while reading: read again when this one is done. */
  again: boolean
  failure: Notice | null
}>

export type Open = Readonly<{
  kind: 'open'
  session: string
  run: Run
  observation: Observation
  history: History
  /** The highest revision a state frame has reported. */
  revision: string | null
  content: Content
  inputs: readonly PendingInput[]
  notice: Notice | null
}>

export type State =
  | Readonly<{ kind: 'none'; notice: Notice | null }>
  | Readonly<{
      kind: 'creating'
      createCallId: string
      confirm: 'no' | 'asking' | 'unknown'
      notice: Notice | null
    }>
  | Open
  | Readonly<{ kind: 'unavailable'; session: string; notice: Notice; content: Content }>

export type Event =
  | Readonly<{ kind: 'create'; createCallId: string }>
  | Readonly<{ kind: 'create-answered'; createCallId: string; answer: CreateAnswer }>
  | Readonly<{ kind: 'create-confirm' }>
  | Readonly<{ kind: 'create-confirmed'; createCallId: string; answer: CreateQueryAnswer }>
  | Readonly<{ kind: 'send'; text: string; acceptId: string; inputId: string; messageId: string }>
  | Readonly<{ kind: 'send-answered'; session: string; acceptId: string; answer: SendAnswer }>
  | Readonly<{ kind: 'send-confirm'; acceptId: string }>
  | Readonly<{ kind: 'send-confirmed'; session: string; acceptId: string; answer: SendQueryAnswer }>
  | Readonly<{ kind: 'cancel'; controlId: string }>
  | Readonly<{ kind: 'cancel-answered'; session: string; controlId: string; answer: CancelAnswer }>
  | Readonly<{ kind: 'frame'; session: string; generation: number; frame: ObserveSessionFrame }>
  | Readonly<{
      kind: 'observation-ended'
      session: string
      generation: number
      end: ObservationEnd
    }>
  | Readonly<{ kind: 'reconnect-due'; session: string; generation: number }>
  | Readonly<{ kind: 'history-read'; session: string; token: number; answer: HistoryAnswer }>
  | Readonly<{ kind: 'open-session'; session: string }>

export type HistoryRequest = Readonly<{ cursor: null }> | Readonly<{ cursor: string }>

export type Effect =
  | Readonly<{ kind: 'create-session'; createCallId: string }>
  | Readonly<{ kind: 'query-create-session'; createCallId: string }>
  | Readonly<{
      kind: 'send-input'
      session: string
      acceptId: string
      inputId: string
      text: string
    }>
  | Readonly<{ kind: 'query-send-input'; session: string; acceptId: string }>
  | Readonly<{ kind: 'cancel-run'; session: string; run: string; controlId: string }>
  | Readonly<{ kind: 'observe'; session: string; generation: number }>
  | Readonly<{ kind: 'stop-observing'; generation: number }>
  | Readonly<{ kind: 'reconnect-later'; session: string; generation: number; delayMs: number }>
  | Readonly<{ kind: 'read-history'; session: string; token: number; request: HistoryRequest }>

export type Step = Readonly<{ state: State; effects: readonly Effect[] }>

export const INITIAL: State = { kind: 'none', notice: null }

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 15_000

export function reconnectDelay(attempt: number): number {
  return Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.max(0, attempt - 1))
}

const same = (state: State): Step => ({ state, effects: [] })

// The sentences people read. One place, so every refusal reads the same wherever it shows.
const SENTENCES: Readonly<Record<string, string>> = {
  limited: '超过了服务端的限额。',
  invalid: '服务端认为这个请求的内容不合规定。',
  conflict: '和服务端已有的记录冲突。',
  archived: '这个会话已归档，不能再发消息。',
  frozen: '这个会话已冻结，暂时不能发消息。',
  denied: '没有权限，或登录已失效。',
  'not-found': '服务端找不到这一轮。',
  'protocol-rejected': '服务端不认这个请求的格式。',
  'basis-unavailable': '服务端暂时不能处理，稍后再试。',
  'stage-not-provided': '这个部署没有提供这个操作。',
  'uniform-auth-failure': '登录没有通过。',
}

function refused(outcome: string, prefix: string): Notice {
  return { kind: 'refused', text: `${prefix}${SENTENCES[outcome] ?? `服务端答复「${outcome}」。`}` }
}

const NOT_SENT = (what: string): Notice => ({
  kind: 'unavailable',
  text: `连不上服务，${what}没有发出去。`,
})
const UNKNOWN = (what: string): Notice => ({
  kind: 'unknown',
  text: `${what}的结果未知，正在确认。`,
})
const STILL_UNKNOWN = (what: string): Notice => ({
  kind: 'unknown',
  text: `${what}的结果仍然未知。可以再确认一次。`,
})

function opened(session: string): Step {
  const state: Open = {
    kind: 'open',
    session,
    run: { kind: 'idle' },
    observation: { kind: 'connecting', generation: 1 },
    history: { reading: 1, issued: 1, again: false, failure: null },
    revision: null,
    content: EMPTY_CONTENT,
    inputs: [],
    notice: null,
  }
  return {
    state,
    effects: [
      { kind: 'observe', session, generation: 1 },
      { kind: 'read-history', session, token: 1, request: { cursor: null } },
    ],
  }
}

/** Leaving an open session: its observation stops; answers still on their way are dropped. */
function leave(state: State): Effect[] {
  return state.kind === 'open'
    ? [{ kind: 'stop-observing', generation: state.observation.generation }]
    : []
}

export function step(state: State, event: Event): Step {
  switch (event.kind) {
    case 'create':
      return onCreate(state, event.createCallId)
    case 'create-answered':
      return onCreateAnswered(state, event)
    case 'create-confirm':
      return onCreateConfirm(state)
    case 'create-confirmed':
      return onCreateConfirmed(state, event)
    case 'send':
      return onSend(state, event)
    case 'send-answered':
      return onSendAnswered(state, event)
    case 'send-confirmed':
      return onSendConfirmed(state, event)
    case 'send-confirm':
      return onSendConfirm(state, event.acceptId)
    case 'cancel':
      return onCancel(state, event.controlId)
    case 'cancel-answered':
      return onCancelAnswered(state, event)
    case 'frame':
      return onFrame(state, event)
    case 'observation-ended':
      return onObservationEnded(state, event)
    case 'reconnect-due':
      return onReconnectDue(state, event)
    case 'history-read':
      return onHistoryRead(state, event)
    case 'open-session':
      return onOpenSession(state, event.session)
  }
}

/**
 * A create or its confirmation is on its way: opening a session waits for the answer (R30). A create
 * still unknown has nothing on its way, so leaving it drops no answer and claims nothing.
 */
export function createInFlight(state: State): boolean {
  return state.kind === 'creating' && state.confirm !== 'unknown'
}

/** The same way in as after a create succeeds. */
function onOpenSession(state: State, session: string): Step {
  if (createInFlight(state)) return same(state)
  if (state.kind === 'open' && state.session === session) return same(state)
  const next = opened(session)
  return { state: next.state, effects: [...leave(state), ...next.effects] }
}

function onCreate(state: State, createCallId: string): Step {
  if (state.kind === 'creating') return same(state)
  return {
    state: { kind: 'creating', createCallId, confirm: 'no', notice: null },
    effects: [...leave(state), { kind: 'create-session', createCallId }],
  }
}

function onCreateAnswered(state: State, event: Extract<Event, { kind: 'create-answered' }>): Step {
  if (
    state.kind !== 'creating' ||
    state.createCallId !== event.createCallId ||
    state.confirm !== 'no'
  )
    return same(state)
  const answer = event.answer
  switch (answer.outcome) {
    case 'succeeded':
      return opened(answer.body.session)
    case 'unknown':
    case 'uncertain':
      return askCreate(state)
    case 'unavailable':
      return same({ kind: 'none', notice: NOT_SENT('建会话的请求') })
    default:
      return same({ kind: 'none', notice: refused(answer.outcome, '没有建成会话：') })
  }
}

type Creating = Extract<State, { kind: 'creating' }>

/** Confirm by the same create call id; the create itself is never sent again. */
function askCreate(state: Creating): Step {
  return {
    state: { ...state, confirm: 'asking', notice: UNKNOWN('建会话') },
    effects: [{ kind: 'query-create-session', createCallId: state.createCallId }],
  }
}

function onCreateConfirm(state: State): Step {
  return state.kind === 'creating' && state.confirm === 'unknown' ? askCreate(state) : same(state)
}

function onCreateConfirmed(
  state: State,
  event: Extract<Event, { kind: 'create-confirmed' }>,
): Step {
  if (
    state.kind !== 'creating' ||
    state.createCallId !== event.createCallId ||
    state.confirm !== 'asking'
  )
    return same(state)
  return event.answer.outcome === 'succeeded'
    ? opened(event.answer.body.session)
    : same({ ...state, confirm: 'unknown', notice: STILL_UNKNOWN('建会话') })
}

function onSend(state: State, event: Extract<Event, { kind: 'send' }>): Step {
  if (state.kind !== 'open' || event.text.trim().length === 0) return same(state)
  const input: PendingInput = {
    acceptId: event.acceptId,
    inputId: event.inputId,
    messageId: event.messageId,
    text: event.text,
    status: 'sending',
    notice: null,
  }
  return {
    state: { ...state, inputs: [...state.inputs, input] },
    effects: [
      {
        kind: 'send-input',
        session: state.session,
        acceptId: event.acceptId,
        inputId: event.inputId,
        text: event.text,
      },
    ],
  }
}

function updateInput(
  state: Open,
  acceptId: string,
  change: Pick<PendingInput, 'status' | 'notice'>,
): Open {
  return {
    ...state,
    inputs: state.inputs.map(input =>
      input.acceptId === acceptId ? { ...input, ...change } : input,
    ),
  }
}

/** The open session holding this input in this status, or null: any other answer is stale. */
function holding(
  state: State,
  session: string | null,
  acceptId: string,
  status: InputStatus,
): Open | null {
  if (state.kind !== 'open' || (session !== null && state.session !== session)) return null
  const input = state.inputs.find(held => held.acceptId === acceptId)
  return input?.status === status ? state : null
}

/** Confirm by the same acceptance id; the input itself is never sent again. */
function askSend(state: Open, acceptId: string): Step {
  return {
    state: updateInput(state, acceptId, { status: 'confirming', notice: UNKNOWN('发送') }),
    effects: [{ kind: 'query-send-input', session: state.session, acceptId }],
  }
}

function onSendAnswered(state: State, event: Extract<Event, { kind: 'send-answered' }>): Step {
  const open = holding(state, event.session, event.acceptId, 'sending')
  if (open === null) return same(state)
  const outcome = event.answer.outcome
  switch (outcome) {
    case 'succeeded':
      return same(updateInput(open, event.acceptId, { status: 'accepted', notice: null }))
    case 'unknown':
    case 'uncertain':
      return askSend(open, event.acceptId)
    case 'unavailable':
      return same(
        updateInput(open, event.acceptId, { status: 'refused', notice: NOT_SENT('这条消息') }),
      )
    default:
      return same(
        updateInput(open, event.acceptId, {
          status: 'refused',
          notice: refused(outcome, '没有发出：'),
        }),
      )
  }
}

function onSendConfirmed(state: State, event: Extract<Event, { kind: 'send-confirmed' }>): Step {
  const open = holding(state, event.session, event.acceptId, 'confirming')
  if (open === null) return same(state)
  switch (event.answer.outcome) {
    case 'succeeded':
      return same(updateInput(open, event.acceptId, { status: 'accepted', notice: null }))
    case 'not-committed':
      return same(
        updateInput(open, event.acceptId, {
          status: 'not-committed',
          notice: { kind: 'refused', text: '已确认：这条消息没有被受理。可以重新发送。' },
        }),
      )
    default:
      return same(
        updateInput(open, event.acceptId, { status: 'unknown', notice: STILL_UNKNOWN('发送') }),
      )
  }
}

function onSendConfirm(state: State, acceptId: string): Step {
  const open = holding(state, null, acceptId, 'unknown')
  return open === null ? same(state) : askSend(open, acceptId)
}

function onCancel(state: State, controlId: string): Step {
  if (state.kind !== 'open') return same(state)
  const run = state.run
  if (run.kind === 'idle') return same(state)
  if (run.kind === 'cancelling' && !run.unknown) return same(state)
  // An unknown cancel is asked again under the same control id: the same operation, not a new one.
  const control = run.kind === 'cancelling' ? run.controlId : controlId
  return {
    state: {
      ...state,
      run: { kind: 'cancelling', run: run.run, controlId: control, unknown: false },
      notice: null,
    },
    effects: [{ kind: 'cancel-run', session: state.session, run: run.run, controlId: control }],
  }
}

function onCancelAnswered(state: State, event: Extract<Event, { kind: 'cancel-answered' }>): Step {
  if (state.kind !== 'open' || state.session !== event.session) return same(state)
  const run = state.run
  if (run.kind !== 'cancelling' || run.controlId !== event.controlId || run.unknown)
    return same(state)
  const answer = event.answer
  switch (answer.outcome) {
    case 'succeeded':
      // `requested`: the run ends later and a state frame says so. `ended`: it already ended.
      return answer.body.kind === 'ended' ? same({ ...state, run: { kind: 'idle' } }) : same(state)
    case 'unknown':
    case 'uncertain':
      return same({
        ...state,
        run: { ...run, unknown: true },
        notice: {
          kind: 'unknown',
          text: '取消的结果未知。可以再点一次「停止」确认，用的是同一次取消。',
        },
      })
    case 'unavailable':
      return same({ ...state, run: { kind: 'running', run: run.run }, notice: NOT_SENT('取消') })
    default:
      return same({
        ...state,
        run: { kind: 'running', run: run.run },
        notice: refused(answer.outcome, '没有取消：'),
      })
  }
}

function startHistoryRead(state: Open): Step {
  if (state.history.reading !== null)
    return same({ ...state, history: { ...state.history, again: true } })
  const token = state.history.issued + 1
  return {
    state: { ...state, history: { ...state.history, reading: token, issued: token, again: false } },
    effects: [{ kind: 'read-history', session: state.session, token, request: { cursor: null } }],
  }
}

function behind(state: Open, revision: string): boolean {
  return (
    state.content.readThrough === null || compareDecimal(state.content.readThrough, revision) < 0
  )
}

function onFrame(state: State, event: Extract<Event, { kind: 'frame' }>): Step {
  if (state.kind !== 'open' || state.session !== event.session) return same(state)
  if (state.observation.generation !== event.generation) return same(state)
  const live: Open =
    state.observation.kind === 'live'
      ? state
      : { ...state, observation: { kind: 'live', generation: event.generation } }
  const frame = event.frame
  switch (frame.kind) {
    case 'state': {
      const run = runAfter(live.run, frame.run)
      const revision =
        live.revision === null || compareDecimal(live.revision, frame.revision) < 0
          ? frame.revision
          : live.revision
      const content = run.kind === 'idle' ? settleLive(live.content, revision) : live.content
      const next: Open = { ...live, run, revision, content }
      return behind(next, revision) ? startHistoryRead(next) : same(next)
    }
    case 'snapshot': {
      const applied = applySnapshot(live.content, frame.value, live.revision ?? '0')
      return applied.kind === 'applied'
        ? same({ ...live, content: applied.content })
        : same({ ...live, notice: UNREADABLE })
    }
    case 'delta': {
      const applied = applyDelta(live.content, frame.value)
      if (applied.kind === 'applied') return same({ ...live, content: applied.content })
      if (applied.kind === 'unreadable') return same({ ...live, notice: UNREADABLE })
      // The base is not what is held: do not apply; observe again for a fresh snapshot.
      return reobserve(live, 0)
    }
    case 'gap':
      return same({
        ...live,
        content: { ...live.content, liveStatus: { kind: 'gap', reason: frame.reason } },
      })
    case 'refreshing':
      // The observation has no reply stream to forward and looked again. With no run in progress
      // that says nothing about a reply; during a run it means the reply's content is awaited. It
      // follows every gap and does not take the gap back: only the next snapshot does.
      return live.run.kind === 'idle' || live.content.liveStatus !== null
        ? same(live)
        : same({ ...live, content: { ...live.content, liveStatus: { kind: 'refreshing' } } })
  }
}

const UNREADABLE: Notice = { kind: 'refused', text: '正在生成的内容读不懂，已忽略这一帧。' }

/** The run axis after a state frame names the current run (or none). */
function runAfter(run: Run, current: string | null): Run {
  if (current === null) return { kind: 'idle' }
  if (run.kind === 'cancelling' && run.run === current) return run
  return { kind: 'running', run: current }
}

function reobserve(state: Open, attempt: number): Step {
  const generation = state.observation.generation + 1
  const stop: Effect = { kind: 'stop-observing', generation: state.observation.generation }
  if (attempt === 0)
    return {
      state: { ...state, observation: { kind: 'connecting', generation } },
      effects: [stop, { kind: 'observe', session: state.session, generation }],
    }
  return {
    state: { ...state, observation: { kind: 'reconnecting', generation, attempt } },
    effects: [
      stop,
      {
        kind: 'reconnect-later',
        session: state.session,
        generation,
        delayMs: reconnectDelay(attempt),
      },
    ],
  }
}

function onObservationEnded(
  state: State,
  event: Extract<Event, { kind: 'observation-ended' }>,
): Step {
  if (state.kind !== 'open' || state.session !== event.session) return same(state)
  if (state.observation.generation !== event.generation) return same(state)
  const end = event.end
  const denied =
    (end.kind === 'ended' && end.reason === 'denied') ||
    (end.kind === 'refused' && end.outcome === 'denied')
  if (denied)
    return {
      state: {
        kind: 'unavailable',
        session: state.session,
        content: state.content,
        notice: { kind: 'refused', text: '会话不可用：没有权限看这个会话，或登录已失效。' },
      },
      effects: [],
    }
  if (end.kind === 'aborted') return same(state)
  const attempt = state.observation.kind === 'reconnecting' ? state.observation.attempt + 1 : 1
  return reobserve({ ...state, content: { ...state.content, liveStatus: null } }, attempt)
}

function onReconnectDue(state: State, event: Extract<Event, { kind: 'reconnect-due' }>): Step {
  if (state.kind !== 'open' || state.session !== event.session) return same(state)
  const observation = state.observation
  if (observation.kind !== 'reconnecting' || observation.generation !== event.generation)
    return same(state)
  // Stays `reconnecting` until the first frame: a failure right away backs off further.
  return {
    state,
    effects: [{ kind: 'observe', session: state.session, generation: event.generation }],
  }
}

function onHistoryRead(state: State, event: Extract<Event, { kind: 'history-read' }>): Step {
  if (state.kind !== 'open' || state.session !== event.session) return same(state)
  if (state.history.reading !== event.token) return same(state)
  const answer = event.answer
  if (answer.outcome === 'denied')
    return same({
      kind: 'unavailable',
      session: state.session,
      content: state.content,
      notice: { kind: 'refused', text: '会话不可用：没有权限读这个会话，或登录已失效。' },
    })
  if (answer.outcome !== 'succeeded') {
    const failure: Notice =
      answer.outcome === 'unavailable' || answer.outcome === 'uncertain'
        ? { kind: 'unavailable', text: '历史暂时读不到，有新内容时会再读。' }
        : refused(answer.outcome, '历史没有读到：')
    return same({ ...state, history: { ...state.history, reading: null, again: false, failure } })
  }
  const page = answer.body
  const known = reachesKnown(state.content, page.entries)
  const content = mergeHistory(state.content, page.entries)
  const merged: Open = { ...state, content, inputs: uncommittedInputs(content, state.inputs) }
  if (!known && !page.exhausted && page.next !== null)
    return {
      state: merged,
      effects: [
        {
          kind: 'read-history',
          session: state.session,
          token: event.token,
          request: { cursor: page.next },
        },
      ],
    }
  // The traversal from the tail reached what was held (or the start of the log): everything the
  // log had at the page's pinned revision is here.
  const read = readThroughTo(merged.content, page.upper)
  const done: Open = {
    ...merged,
    history: { ...merged.history, reading: null, again: false, failure: null },
    content:
      merged.run.kind === 'idle' && merged.revision !== null
        ? settleLive(read, merged.revision)
        : read,
  }
  return state.history.again || (done.revision !== null && behind(done, done.revision))
    ? startHistoryRead(done)
    : same(done)
}

/** A pending input whose message is now in history is committed: history shows it from here on. */
function uncommittedInputs(
  content: Content,
  inputs: readonly PendingInput[],
): readonly PendingInput[] {
  const committed = new Set<string>()
  for (const entry of content.entries) {
    if (entry.kind !== 'message.user' || !isRecord(entry.payload)) continue
    const message = entry.payload['message']
    const id = isRecord(message) ? textOf(message['id']) : undefined
    if (id !== undefined) committed.add(id)
  }
  return inputs.filter(input => !committed.has(input.messageId))
}
