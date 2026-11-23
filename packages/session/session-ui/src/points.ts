import {
  definePoint,
  defineRenderPoint,
  type Point,
  type PointCodec,
  type RenderPoint,
} from '@omne-harness/shell-contract'

export type SessionSubject = Readonly<{ session: string }>

const sessionSubject: PointCodec<SessionSubject> = {
  encode: value => value.session,
  decode: text => ({ session: text }),
}

export const SESSION_DOCK = 'session.dock'
export const SESSION_SIDE = 'session.side'
export const SESSION_STATUS = 'session.status'

export const sessionDock: Point<SessionSubject> = definePoint({
  name: SESSION_DOCK,
  summary: 'What stands above the composer of the open session, one under another.',
  subject: sessionSubject,
})

export const sessionSide: Point<SessionSubject> = definePoint({
  name: SESSION_SIDE,
  summary: 'The tabs of the side area of the open session.',
  subject: sessionSubject,
})

export const sessionStatus: Point<SessionSubject> = definePoint({
  name: SESSION_STATUS,
  summary: 'The quiet facts in the status line of the open session.',
  subject: sessionSubject,
})

/** A call of a session: the session and the call reference Session listed it by. */
export type SessionCallSubject = Readonly<{ session: string; call: string }>

const sessionCallSubject: PointCodec<SessionCallSubject> = {
  encode: value => JSON.stringify([value.session, value.call]),
  decode: text => {
    const [session, call] = JSON.parse(text) as [string, string]
    return { session, call }
  },
}

export const SESSION_CALL_DETAIL = 'session.call-detail'

// Under each call in the background; the session module does not know what goes here.
export const sessionCallDetail: Point<SessionCallSubject> = definePoint({
  name: SESSION_CALL_DETAIL,
  summary:
    'What is shown under one background call of a session, by the domain that owns its output.',
  subject: sessionCallSubject,
})

function jsonSubject<S>(holds: (value: Record<string, unknown>) => boolean): PointCodec<S> {
  return {
    encode: value => JSON.stringify(value),
    decode: text => {
      try {
        const value: unknown = JSON.parse(text)
        const read = typeof value === 'object' && value !== null && !Array.isArray(value)
        return read && holds(value as Record<string, unknown>) ? (value as S) : undefined
      } catch {
        return undefined
      }
    },
  }
}
const texts = (value: Record<string, unknown>, names: readonly string[]): boolean =>
  names.every(name => typeof value[name] === 'string')

/** The message being written in a session: `draft` changes when it is sent or dropped. */
export type SessionDraftSubject = Readonly<{ session: string; draft: string }>
/** One block of a message that is not words, with the block as the history holds it. */
export type SessionBlockSubject = Readonly<{
  session: string
  message: string
  block: string
  content: unknown
  /** Which representation the model read of this block in its latest request, when known. */
  read?: 'original' | 'fitted' | 'derived' | 'transcript'
}>

export const SESSION_COMPOSER_ATTACHMENTS = 'session.composer-attachments'
export const SESSION_BLOCK_RENDER = 'session.block-render'
export const SESSION_TOOL_CALL = 'session.tool-call'

export const sessionComposerAttachments: Point<SessionDraftSubject> = definePoint({
  name: SESSION_COMPOSER_ATTACHMENTS,
  summary: 'What a draft of the composer carries beside its words.',
  subject: jsonSubject(value => texts(value, ['session', 'draft'])),
})

export const sessionBlockRender: RenderPoint<SessionBlockSubject> = defineRenderPoint({
  name: SESSION_BLOCK_RENDER,
  key: 'the kind of the block',
  summary: 'How a block of a message that is not text is drawn, by its kind.',
})

/** One call of a tool, as the transcript holds it. */
export type SessionToolCallSubject = Readonly<{
  session: string
  call: string | null
  name: string
  arguments: unknown
  state: 'working' | 'completed' | 'no-result'
  result: string | null
}>

export const sessionToolCall: RenderPoint<SessionToolCallSubject> = defineRenderPoint({
  name: SESSION_TOOL_CALL,
  key: 'the name of the tool',
  summary: 'How a call of one tool is drawn in the transcript.',
})
