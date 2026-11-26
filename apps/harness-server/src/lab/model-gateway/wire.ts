import {
  finishOf,
  wireOf,
  type ChatCall,
  type ChatDetail,
  type ChatFrame,
  type ChatUsage,
  type Finish,
  type Open,
  type Wire,
  type Writer,
} from './chat-frames.ts'
import type { GatewayAnswer } from './gateway.ts'
import { messagesWriter, responsesWriter } from './wire-writers.ts'

export { chatRequestOf } from './wire-request.ts'

// An operator address replaces every endpoint of the release, so any request can arrive on the chat path: the body tells.
// A Responses body has `input` and no `messages`; a Messages body has `messages` and the `thinking` member its engine always writes.
export function interfacePath(path: string, raw: string): string {
  if (wireOf(path) !== null) return path
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return path
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return path
  if ('input' in body && !('messages' in body)) return '/api/v1/responses'
  if ('messages' in body && 'thinking' in body) return '/api/v1/messages'
  return path
}

/** The chat answer of a script, written in the interface of the request path; what is no successful stream goes out as written. */
export function renderReply(path: string, reply: GatewayAnswer): GatewayAnswer {
  const wire = wireOf(path)
  if (wire === null || reply.status !== 200 || reply.contentType !== 'text/event-stream')
    return reply
  const translate = translator(writerOf(wire))
  const body = translate(reply.body)
  if (reply.rest === undefined) return { ...reply, body }
  return { ...reply, body, rest: { after: reply.rest.after, body: translate(reply.rest.body) } }
}

/** A translator for one streamed reply on `path`, fed the chat frames in order; null on the chat-completions path. */
export function streamTranslator(path: string): ((part: string) => string) | null {
  const wire = wireOf(path)
  return wire === null ? null : translator(writerOf(wire))
}

function writerOf(wire: Wire): Writer {
  return wire === 'responses' ? responsesWriter() : messagesWriter()
}

// The reply finishes at the end marker, or at the end of a part once a finish reason came: a usage frame after it still counts.
function translator(writer: Writer): (part: string) => string {
  let started = false
  let next = 0
  let open: Open | null = null
  let finish: Finish | null = null
  let usage: ChatUsage | undefined
  let finished = false

  const close = (): string => {
    const closing = open
    open = null
    return closing === null ? '' : writer.close(closing)
  }

  const complete = (): string => {
    if (finish === null || finished) return ''
    finished = true
    return close() + writer.finish(finish, usage)
  }

  const reasoning = (detail: ChatDetail): string => {
    if (detail.type !== 'reasoning.encrypted')
      throw new Error(`gateway-wire: a reasoning detail of type ${detail.type} is not covered`)
    const out = close() + writer.reasoning(next, detail)
    next += 1
    return out
  }

  const text = (piece: string): string => {
    let out = ''
    if (open?.kind !== 'text') {
      out = close()
      open = { kind: 'text', at: next, text: '' }
      next += 1
      out += writer.open(open)
    }
    open = { ...open, text: open.text + piece }
    return out + writer.grow(open, piece)
  }

  const call = (chunk: ChatCall): string => {
    let out = ''
    if (open?.kind !== 'call' || open.index !== chunk.index) {
      const name = chunk.function?.name
      if (chunk.id === undefined || name === undefined)
        throw new Error('gateway-wire: a tool call chunk without an id and a name opens no call')
      out = close()
      open = { kind: 'call', at: next, index: chunk.index, callId: chunk.id, name, args: '' }
      next += 1
      out += writer.open(open)
    }
    const piece = chunk.function?.arguments ?? ''
    if (piece === '') return out
    open = { ...open, args: open.args + piece }
    return out + writer.grow(open, piece)
  }

  const frame = (data: string): string => {
    if (data === '[DONE]') return complete() + writer.endMarker
    if (finished) throw new Error('gateway-wire: a chat frame after the reply finished')
    const chat = JSON.parse(data) as ChatFrame
    if (chat.error !== undefined) return writer.error(chat.error)
    let out = started ? '' : writer.start(chat)
    started = true
    if (chat.usage !== undefined) usage = chat.usage
    const choice = chat.choices?.[0]
    const delta = choice?.delta
    for (const detail of delta?.reasoning_details ?? []) out += reasoning(detail)
    if (typeof delta?.content === 'string' && delta.content !== '') out += text(delta.content)
    for (const chunk of delta?.tool_calls ?? []) out += call(chunk)
    if (typeof choice?.finish_reason === 'string') finish = finishOf(choice.finish_reason)
    return out
  }

  return part => {
    let out = ''
    for (const line of part.split('\n'))
      if (line.startsWith('data:')) out += frame(line.slice('data:'.length).trim())
    return out + complete()
  }
}
