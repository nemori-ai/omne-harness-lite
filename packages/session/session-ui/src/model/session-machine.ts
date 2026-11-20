import type { ClientOf, ObservationEnd as ClientObservationEnd } from '@omne-harness/sdk/core'
import type { ObserveSessionFrame, SessionProtocol } from '@omne-harness/session-protocol'
import {
  applyDelta,
  applySnapshot,
  EMPTY_CONTENT,
  failedTerminalArrived,
  lastTerminalFailed,
  mergeHistory,
  reachesKnown,
  readThroughTo,
  settleLive,
  type Content,
} from './content.ts'
import { NOT_SENT, refused, STILL_UNKNOWN, UNKNOWN } from './notices.ts'
import { compareDecimal, isRecord, textOf } from './plain.ts'
import {
  NO_WAITING,
  readWaiting,
  retry,
  retryAnswered,
  waitingRead,
  type RetryAnswer,
  type Waiting,
  type WaitingAnswer,
  type WaitingEffect,
  type WaitingStep,
} from './waiting.ts'

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
  reading: number | null
  issued: number
  again: boolean
  failure: Notice | null
}>

export type Open = Readonly<{
  kind: 'open'
  session: string
  run: Run
  observation: Observation
  history: History
  revision: string | null
  content: Content
  inputs: readonly PendingInput[]
  notice: Notice | null
  waiting: Waiting
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

/** What a new session is created with; a part left out is the definition's own. */
export type CreateChoice = Readonly<{
  model?: string
  workspace?: Readonly<{ workspace: string; instance: string }>
}>

export type Event =
  | (Readonly<{ kind: 'create'; createCallId: string }> & CreateChoice)
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
  | Readonly<{ kind: 'waiting-read'; session: string; token: number; answer: WaitingAnswer }>
  | Readonly<{ kind: 'retry'; controlId: string }>
  | Readonly<{ kind: 'retry-answered'; session: string; controlId: string; answer: RetryAnswer }>

export type HistoryRequest = Readonly<{ cursor: null }> | Readonly<{ cursor: string }>

export type Effect =
  | (Readonly<{ kind: 'create-session'; createCallId: string }> & CreateChoice)
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
  | WaitingEffect

export type Step = Readonly<{ state: State; effects: readonly Effect[] }>

export const INITIAL: State = { kind: 'none', notice: null }

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 15_000

export function reconnectDelay(attempt: number): number {
  return Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.max(0, attempt - 1))
}

const same = (state: State): Step => ({ state, effects: [] })

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
    waiting: NO_WAITING,
  }
  return {
    state,
    effects: [
      { kind: 'observe', session, generation: 1 },
      { kind: 'read-history', session, token: 1, request: { cursor: null } },
    ],
  }
}

function leave(state: State): Effect[] {
  return state.kind === 'open'
    ? [{ kind: 'stop-observing', generation: state.observation.generation }]
    : []
}

type Handlers = {
  readonly [K in Event['kind']]: (state: State, event: Extract<Event, { kind: K }>) => Step
}

const HANDLERS: Handlers = {
  create: (state, event) => onCreate(state, event),
  'create-answered': (state, event) => onCreateAnswered(state, event),
  'create-confirm': state => onCreateConfirm(state),
  'create-confirmed': (state, event) => onCreateConfirmed(state, event),
  send: (state, event) => onSend(state, event),
  'send-answered': (state, event) => afterSend(state, onSendAnswered(state, event)),
  'send-confirmed': (state, event) => onSendConfirmed(state, event),
  'send-confirm': (state, event) => onSendConfirm(state, event.acceptId),
  cancel: (state, event) => onCancel(state, event.controlId),
  'cancel-answered': (state, event) => onCancelAnswered(state, event),
  frame: (state, event) => afterFrame(state, event.frame, onFrame(state, event)),
  'observation-ended': (state, event) => onObservationEnded(state, event),
  'reconnect-due': (state, event) => onReconnectDue(state, event),
  'history-read': (state, event) => afterHistory(state, event, onHistoryRead(state, event)),
  'open-session': (state, event) => onOpenSession(state, event.session),
  'waiting-read': (state, event) =>
    onWaiting(state, event.session, waiting =>
      waitingRead(waiting, event.session, event.token, event.answer),
    ),
  retry: (state, event) =>
    onWaiting(state, null, (waiting, session) => retry(waiting, session, event.controlId)),
  'retry-answered': (state, event) =>
    onWaiting(state, event.session, waiting =>
      retryAnswered(waiting, event.session, event.controlId, event.answer),
    ),
}

export function step(state: State, event: Event): Step {
  const handle = HANDLERS[event.kind] as (state: State, event: Event) => Step
  return handle(state, event)
}

function withWaiting(state: Open, next: WaitingStep, effects: readonly Effect[] = []): Step {
  if (next.waiting === state.waiting && next.effects.length === 0) return { state, effects }
  return { state: { ...state, waiting: next.waiting }, effects: [...effects, ...next.effects] }
}

function onWaiting(
  state: State,
  session: string | null,
  change: (waiting: Waiting, session: string) => WaitingStep,
): Step {
  if (state.kind !== 'open' || (session !== null && state.session !== session)) return same(state)
  return withWaiting(state, change(state.waiting, state.session))
}

function afterSend(before: State, next: Step): Step {
  const waited = before.kind === 'open' && before.waiting.fact.kind === 'waiting'
  return waited && next.state !== before ? alsoReadWaiting(next) : next
}

function afterFrame(before: State, frame: ObserveSessionFrame, next: Step): Step {
  if (frame.kind !== 'state' || frame.run !== null || next.state === before) return next
  return next.state.kind === 'open' && lastTerminalFailed(next.state.content)
    ? alsoReadWaiting(next)
    : next
}

function afterHistory(
  before: State,
  event: Extract<Event, { kind: 'history-read' }>,
  next: Step,
): Step {
  if (before.kind !== 'open' || before.history.reading !== event.token) return next
  if (before.session !== event.session || event.answer.outcome !== 'succeeded') return next
  return failedTerminalArrived(before.content, event.answer.body.entries)
    ? alsoReadWaiting(next)
    : next
}

function alsoReadWaiting(next: Step): Step {
  const state = next.state
  if (state.kind !== 'open') return next
  return withWaiting(state, readWaiting(state.waiting, state.session), next.effects)
}

export function createInFlight(state: State): boolean {
  return state.kind === 'creating' && state.confirm !== 'unknown'
}

function onOpenSession(state: State, session: string): Step {
  if (createInFlight(state)) return same(state)
  if (state.kind === 'open' && state.session === session) return same(state)
  const next = opened(session)
  return { state: next.state, effects: [...leave(state), ...next.effects] }
}

function onCreate(state: State, event: Extract<Event, { kind: 'create' }>): Step {
  if (state.kind === 'creating') return same(state)
  const create: Effect = { ...event, kind: 'create-session' }
  return {
    state: { kind: 'creating', createCallId: event.createCallId, confirm: 'no', notice: null },
    effects: [...leave(state), create],
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

type Cancelling = Extract<Run, { kind: 'cancelling' }>

function cancelling(state: State, session: string, controlId: string): Open | null {
  if (state.kind !== 'open' || state.session !== session) return null
  const run = state.run
  return run.kind === 'cancelling' && run.controlId === controlId && !run.unknown ? state : null
}

function onCancelAnswered(state: State, event: Extract<Event, { kind: 'cancel-answered' }>): Step {
  const open = cancelling(state, event.session, event.controlId)
  return open === null
    ? same(state)
    : same(cancelAnswered(open, open.run as Cancelling, event.answer))
}

function cancelAnswered(state: Open, run: Cancelling, answer: CancelAnswer): Open {
  switch (answer.outcome) {
    case 'succeeded':
      return answer.body.kind === 'ended' ? { ...state, run: { kind: 'idle' } } : state
    case 'unknown':
    case 'uncertain':
      return {
        ...state,
        run: { ...run, unknown: true },
        notice: {
          kind: 'unknown',
          text: '取消的结果未知。可以再点一次「停止」确认，用的是同一次取消。',
        },
      }
    case 'unavailable':
      return { ...state, run: { kind: 'running', run: run.run }, notice: NOT_SENT('取消') }
    default:
      return {
        ...state,
        run: { kind: 'running', run: run.run },
        notice: refused(answer.outcome, '没有取消：'),
      }
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

function observing(state: State, session: string, generation: number): Open | null {
  if (state.kind !== 'open' || state.session !== session) return null
  if (state.observation.generation !== generation) return null
  return state.observation.kind === 'live'
    ? state
    : { ...state, observation: { kind: 'live', generation } }
}

type FrameOf<K extends ObserveSessionFrame['kind']> = Extract<ObserveSessionFrame, { kind: K }>

type FrameHandlers = {
  readonly [K in ObserveSessionFrame['kind']]: (live: Open, frame: FrameOf<K>) => Step
}

function laterRevision(held: string | null, seen: string): string {
  return held === null || compareDecimal(held, seen) < 0 ? seen : held
}

const FRAME: FrameHandlers = {
  state: (live, frame) => {
    const run = runAfter(live.run, frame.run)
    const revision = laterRevision(live.revision, frame.revision)
    const content = run.kind === 'idle' ? settleLive(live.content, revision) : live.content
    const next: Open = { ...live, run, revision, content }
    return behind(next, revision) ? startHistoryRead(next) : same(next)
  },
  snapshot: (live, frame) => {
    const applied = applySnapshot(live.content, frame.value, live.revision ?? '0')
    return applied.kind === 'applied'
      ? same({ ...live, content: applied.content })
      : same({ ...live, notice: UNREADABLE })
  },
  delta: (live, frame) => {
    const applied = applyDelta(live.content, frame.value)
    if (applied.kind === 'applied') return same({ ...live, content: applied.content })
    if (applied.kind === 'unreadable') return same({ ...live, notice: UNREADABLE })
    return reobserve(live, 0)
  },
  gap: (live, frame) =>
    same({
      ...live,
      content: { ...live.content, liveStatus: { kind: 'gap', reason: frame.reason } },
    }),
  refreshing: live =>
    live.run.kind === 'idle' || live.content.liveStatus !== null
      ? same(live)
      : same({ ...live, content: { ...live.content, liveStatus: { kind: 'refreshing' } } }),
}

function onFrame(state: State, event: Extract<Event, { kind: 'frame' }>): Step {
  const live = observing(state, event.session, event.generation)
  if (live === null) return same(state)
  const handle = FRAME[event.frame.kind] as (live: Open, frame: ObserveSessionFrame) => Step
  return handle(live, event.frame)
}

const UNREADABLE: Notice = { kind: 'refused', text: '正在生成的内容读不懂，已忽略这一帧。' }

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
  return {
    state,
    effects: [{ kind: 'observe', session: state.session, generation: event.generation }],
  }
}

type HistoryPage = Extract<HistoryAnswer, { outcome: 'succeeded' }>['body']

function onHistoryRead(state: State, event: Extract<Event, { kind: 'history-read' }>): Step {
  if (state.kind !== 'open' || state.session !== event.session) return same(state)
  if (state.history.reading !== event.token) return same(state)
  const answer = event.answer
  if (answer.outcome === 'succeeded') return historyPage(state, event.token, answer.body)
  return same(historyRefused(state, answer))
}

function historyRefused(
  state: Open,
  answer: Exclude<HistoryAnswer, { outcome: 'succeeded' }>,
): State {
  if (answer.outcome === 'denied')
    return {
      kind: 'unavailable',
      session: state.session,
      content: state.content,
      notice: { kind: 'refused', text: '会话不可用：没有权限读这个会话，或登录已失效。' },
    }
  const failure: Notice =
    answer.outcome === 'unavailable' || answer.outcome === 'uncertain'
      ? { kind: 'unavailable', text: '历史暂时读不到，有新内容时会再读。' }
      : refused(answer.outcome, '历史没有读到：')
  return { ...state, history: { ...state.history, reading: null, again: false, failure } }
}

function historyPage(state: Open, token: number, page: HistoryPage): Step {
  const known = reachesKnown(state.content, page.entries)
  const content = mergeHistory(state.content, page.entries)
  const merged: Open = { ...state, content, inputs: uncommittedInputs(content, state.inputs) }
  if (!known && !page.exhausted && page.next !== null)
    return {
      state: merged,
      effects: [
        { kind: 'read-history', session: state.session, token, request: { cursor: page.next } },
      ],
    }
  const done = historyDone(merged, page.upper)
  return state.history.again || (done.revision !== null && behind(done, done.revision))
    ? startHistoryRead(done)
    : same(done)
}

function historyDone(merged: Open, upper: string): Open {
  const read = readThroughTo(merged.content, upper)
  return {
    ...merged,
    history: { ...merged.history, reading: null, again: false, failure: null },
    content:
      merged.run.kind === 'idle' && merged.revision !== null
        ? settleLive(read, merged.revision)
        : read,
  }
}

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
