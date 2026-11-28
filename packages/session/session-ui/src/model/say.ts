import {
  committedMessages,
  type InputStatus,
  type Open,
  type SayTo,
  type State,
} from './session-machine.ts'

/** Whom a caller says words to; the driver gives a new session the id its creation is known by. */
export type SayTarget = Readonly<{ kind: 'new' }> | Readonly<{ kind: 'session'; session: string }>

/** How words said through the driver ended: taken by the server (with the ids of their message and input), known not sent, or not known. */
export type SayAnswer =
  | Readonly<{ kind: 'sent'; session: string; said: string; input: string }>
  | Readonly<{ kind: 'failed'; reason: string }>
  | Readonly<{ kind: 'unknown' }>

/** The ids words handed to the workspace are found again by. */
export type Said = Readonly<{ to: SayTo; acceptId: string; inputId: string; messageId: string }>

export const NO_WORDS = '没有字，没有发出。'
export const BUSY = '正在建另一个会话，这句话没有交出去。'
export const GONE = '已经退出，这句话没有交出去。'
const NOT_CREATED = '没有建成会话。'
const NOT_SENT = '这句话没有发出。'

const UNKNOWN: SayAnswer = { kind: 'unknown' }
const failed = (reason: string): SayAnswer => ({ kind: 'failed', reason })

type Held = Open['inputs'][number]

const sent = (open: Open, said: Said): SayAnswer => ({
  kind: 'sent',
  session: open.session,
  said: said.messageId,
  input: said.inputId,
})

type Fate = (open: Open, input: Held, said: Said) => SayAnswer | null

const SENT_OR_NOT: Readonly<Record<InputStatus, Fate>> = {
  sending: () => null,
  confirming: () => null,
  accepted: (open, _, said) => sent(open, said),
  unknown: () => UNKNOWN,
  refused: (_, input) => failed(input.notice?.text ?? NOT_SENT),
  'not-committed': (_, input) => failed(input.notice?.text ?? NOT_SENT),
}

function fateIn(open: Open, said: Said): SayAnswer | null {
  const input = open.inputs.find(held => held.acceptId === said.acceptId)
  if (input !== undefined) return SENT_OR_NOT[input.status](open, input, said)
  return committedMessages(open.content).has(said.messageId) ? sent(open, said) : UNKNOWN
}

function fateWhileCreating(
  state: Extract<State, { kind: 'creating' }>,
  to: SayTo,
): SayAnswer | null {
  const mine = to.kind === 'new' && to.createCallId === state.createCallId
  return mine && state.confirm !== 'unknown' ? null : UNKNOWN
}

/** How the words ended as the workspace stands now, or null while that is still open. */
export function sayFate(state: State, said: Said): SayAnswer | null {
  switch (state.kind) {
    case 'creating':
      return fateWhileCreating(state, said.to)
    case 'none':
      return said.to.kind === 'new' ? failed(state.notice?.text ?? NOT_CREATED) : UNKNOWN
    case 'open':
      return fateIn(state, said)
    case 'unavailable':
      return UNKNOWN
  }
}
