import type { ClientOf } from '@omne-harness/sdk/core'
import type { SessionProtocol } from '@omne-harness/session-protocol'
import type { SayReply } from '@omne-harness/shell-contract'
import { terminalOf, type Content, type HistoryEntry, type LiveBlock } from './content.ts'
import { compareDecimal, isRecord, listOf, textOf, type Plain } from './plain.ts'
import { underWay, type Open, type State } from './session-machine.ts'

/** Where one input went, as the server answered the one read of it. */
export type FateAnswer = Awaited<ReturnType<ClientOf<SessionProtocol>['read-input-fate']>>

/** Which run a message is followed in: not known yet, a named one, or the first to start after it. */
export type Taker =
  | Readonly<{ kind: 'unclear' }>
  | Readonly<{ kind: 'run'; run: string }>
  | Readonly<{ kind: 'next' }>

/** What a message has been answered with so far; or, the run going when it was written has ended, whether that run took it. */
export type Reading =
  | Readonly<{ kind: 'reply'; reply: SayReply }>
  | Readonly<{ kind: 'ask'; session: string; run: string; reply: SayReply }>

export const UNCLEAR: Taker = { kind: 'unclear' }
const NEXT: Taker = { kind: 'next' }
const ENDED: ReadonlySet<string> = new Set(['completed', 'failed', 'cancelled'])
const WAITING: Reading = { kind: 'reply', reply: { text: '', state: 'coming' } }
const UNNAMED: Reading = { kind: 'reply', reply: { text: '', state: 'unknown' } }

type Followed = Readonly<{ run: string; from: number; unclear: boolean }>

const messageOf = (entry: HistoryEntry): Plain | undefined =>
  isRecord(entry.payload) ? entry.payload['message'] : undefined

const idOf = (entry: HistoryEntry): string | undefined => {
  const message = messageOf(entry)
  return isRecord(message) ? textOf(message['id']) : undefined
}

const runOf = (entry: HistoryEntry): string | null =>
  isRecord(entry.payload) ? (textOf(entry.payload['run']) ?? null) : null

const wordsOf = (block: Plain): string =>
  isRecord(block) && block['kind'] === 'text' ? (textOf(block['text']) ?? '') : ''

function said(entry: HistoryEntry): string {
  const message = messageOf(entry)
  return listOf(isRecord(message) ? message['blocks'] : undefined)
    .map(wordsOf)
    .join('')
}

const liveWords = (block: LiveBlock): string =>
  block.kind === 'sealed' ? wordsOf(block.block) : block.content === 'text' ? block.value : ''

function text(entries: readonly HistoryEntry[], live: Content['live']): string {
  const replies = entries.filter(entry => entry.kind === 'message.assistant').map(said)
  if (live !== null) replies.push(live.blocks.map(liveWords).join(''))
  return replies.filter(reply => reply !== '').join('\n\n')
}

function goingAt(entries: readonly HistoryEntry[], at: number): string | null {
  let going: string | null = null
  for (const entry of entries.slice(0, at))
    if (entry.kind === 'run.started') going = runOf(entry)
    else if (going !== null && terminalOf(entry)?.run === going) going = null
  return going
}

/** The first run to start after the message: null before it starts, undefined when its start names no run. */
function firstAfter(entries: readonly HistoryEntry[], at: number): Followed | null | undefined {
  const from = entries.findIndex((entry, index) => index > at && entry.kind === 'run.started')
  if (from === -1) return null
  const run = runOf(entries[from]!)
  return run === null ? undefined : { run, from, unclear: false }
}

function followed(
  entries: readonly HistoryEntry[],
  at: number,
  taker: Taker,
): Followed | null | undefined {
  if (taker.kind === 'run') {
    const from = entries.findIndex(
      entry => entry.kind === 'run.started' && runOf(entry) === taker.run,
    )
    return from === -1 ? null : { run: taker.run, from, unclear: false }
  }
  const going = taker.kind === 'unclear' ? goingAt(entries, at) : null
  return going === null ? firstAfter(entries, at) : { run: going, from: at, unclear: true }
}

const caughtUp = (open: Open): boolean =>
  open.revision !== null &&
  open.content.readThrough !== null &&
  compareDecimal(open.content.readThrough, open.revision) >= 0

function sayingStill(open: Open, run: Followed): SayReply {
  const live = underWay(open.run) && open.run.run === run.run ? open.content.live : null
  const words = text(open.content.entries.slice(run.from + 1), live)
  return { text: words, state: open.run.kind === 'idle' && caughtUp(open) ? 'unknown' : 'coming' }
}

function untilEnd(open: Open, run: Followed): Reading {
  const entries = open.content.entries
  const end = entries.findIndex(
    (entry, index) => index > run.from && terminalOf(entry)?.run === run.run,
  )
  if (end === -1) return { kind: 'reply', reply: sayingStill(open, run) }
  const outcome = terminalOf(entries[end]!)?.outcome ?? ''
  const reply: SayReply = {
    text: text(entries.slice(run.from + 1, end), null),
    state: ENDED.has(outcome) ? 'ended' : 'unknown',
  }
  return run.unclear
    ? { kind: 'ask', session: open.session, run: run.run, reply }
    : { kind: 'reply', reply }
}

/** What the agent said after one message of the open session, in the run that takes it; null once that session holds the message no longer. */
export function replyTo(state: State, message: string, taker: Taker): Reading | null {
  if (state.kind !== 'open') return null
  const entries = state.content.entries
  const at = entries.findIndex(entry => entry.kind === 'message.user' && idOf(entry) === message)
  if (at === -1) return state.inputs.some(input => input.messageId === message) ? WAITING : null
  const run = followed(entries, at, taker)
  if (run === undefined) return UNNAMED
  return run === null ? WAITING : untilEnd(state, run)
}

/** Whom the read says took the input, against the run that ended: that run ('it'), another, none yet, or not to be told (null). */
export function takerFrom(answer: FateAnswer, ended: string): Taker | 'it' | null {
  if (answer.outcome !== 'succeeded') return null
  const fate = answer.body.fate
  if (fate.kind === 'pending') return fate.returnedFrom === ended ? 'it' : NEXT
  const run = 'run' in fate ? fate.run : null
  if (run === null) return null
  return run === ended ? 'it' : { kind: 'run', run }
}
