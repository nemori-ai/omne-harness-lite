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
  title: '对话上方',
  summary: 'What stands above the composer of the open session, one under another.',
  subject: sessionSubject,
})

export const sessionSide: Point<SessionSubject> = definePoint({
  name: SESSION_SIDE,
  title: '会话的侧边页签',
  summary: 'The tabs of the side area of the open session.',
  subject: sessionSubject,
})

export const sessionStatus: Point<SessionSubject> = definePoint({
  name: SESSION_STATUS,
  title: '会话的状态行',
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
  title: '工具调用的详情',
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

const BLOCK_EXAMPLE = [
  '{"point":"session.block-render","key":"image","module":"image-block.js","export":"block"}',
  'image-block.js:',
  'export const block = ({ React }) => ({ subject, generic }) =>',
  "  React.createElement('figure', null, generic(), React.createElement('figcaption', null, subject.block))",
].join('\n')

const TOOL_CALL_EXAMPLE = [
  '{"point":"session.tool-call","key":"Web","module":"web-card.js","export":"card"}',
  'web-card.js:',
  'export const card = ({ React }) => ({ subject }) =>',
  "  React.createElement('div', null, subject.name + ': ' + subject.state)",
].join('\n')

export const SESSION_COMPOSER_ATTACHMENTS = 'session.composer-attachments'
export const SESSION_BLOCK_RENDER = 'session.block-render'
export const SESSION_TOOL_CALL = 'session.tool-call'

export const TOOL_NAMES = 'tool.tools'

export const sessionComposerAttachments: Point<SessionDraftSubject> = definePoint({
  name: SESSION_COMPOSER_ATTACHMENTS,
  title: '输入框里随话带上的东西',
  summary: 'What a draft of the composer carries beside its words.',
  subject: jsonSubject(value => texts(value, ['session', 'draft'])),
})

export const sessionBlockRender: RenderPoint<SessionBlockSubject> = defineRenderPoint({
  name: SESSION_BLOCK_RENDER,
  title: '对话里一块内容的画法',
  key: 'the kind of the block, such as image, file or voice',
  summary:
    'How a block of a message that is not text is drawn in the conversation, by its kind: an image, a file, a voice note.',
  subject:
    'one block of a message: session, message and block, its ids; content, the block as the history holds it; read, which form of it the model read last (original, fitted, derived or transcript), when known',
  example: BLOCK_EXAMPLE,
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
  title: '对话里工具调用的画法',
  key: 'the name of the tool, as the server holds it on tool.tools: OmneExtensionPoints show tool.tools lists the names',
  summary:
    'How a call of one tool is drawn in the conversation: the card of the call, by the tool.',
  keysFrom: TOOL_NAMES,
  subject:
    'one call of the tool: session; call, its reference, or null before it has one; name; arguments; state, which is working, completed or no-result; result, its text, or null',
  example: TOOL_CALL_EXAMPLE,
})

export type SessionRunFailureSubject = Readonly<{
  session: string
  cause: string
  detail: string | null
  fault: Readonly<{ cause: string; upstreamStatus: string | null; throttled: boolean }> | null
}>

const textOrNull = (value: unknown): boolean => value === null || typeof value === 'string'

function faultShape(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const fault = value as Record<string, unknown>
  return (
    typeof fault['cause'] === 'string' &&
    textOrNull(fault['upstreamStatus']) &&
    typeof fault['throttled'] === 'boolean'
  )
}

export const SESSION_RUN_FAILURE = 'session.run-failure'

export const sessionRunFailure: Point<SessionRunFailureSubject> = definePoint({
  name: SESSION_RUN_FAILURE,
  title: '一轮失败时的说明',
  summary:
    'What is shown under the reason of a failed run of a session, by the domain that knows why it failed and how to set it right. The subject carries the kind of the failure, its diagnosis, and what Model said of a failed call.',
  subject: jsonSubject(
    value =>
      texts(value, ['session', 'cause']) &&
      textOrNull(value['detail']) &&
      (value['fault'] === null || faultShape(value['fault'])),
  ),
})
