import type { GatewayAnswer } from './model-gateway.ts'

// The test gateway answers as OpenRouter does: a script says in chat-completions frames what the
// model answered, and the gateway writes that answer in the interface the request was sent to.

type ChatUsage = Readonly<{
  prompt_tokens?: number
  completion_tokens?: number
  prompt_tokens_details?: Readonly<{ cached_tokens?: number }>
  completion_tokens_details?: Readonly<{ reasoning_tokens?: number }>
  cost?: number
}>

type ChatDetail = Readonly<{ type: string; id?: string; format?: string; data?: string }>

type ChatCall = Readonly<{
  index: number
  id?: string
  function?: Readonly<{ name?: string; arguments?: string }>
}>

/** One chat-completions frame of a script; scripts are trusted to write this shape. */
type ChatFrame = Readonly<{
  model?: string
  provider?: string
  error?: Readonly<Record<string, unknown>>
  usage?: ChatUsage
  choices?: readonly Readonly<{
    delta?: Readonly<{
      content?: string | null
      reasoning_details?: readonly ChatDetail[]
      tool_calls?: readonly ChatCall[]
    }>
    finish_reason?: string | null
  }>[]
}>

type Finish = 'stop' | 'tool_calls' | 'length'

function finishOf(reason: string): Finish {
  if (reason === 'stop' || reason === 'tool_calls' || reason === 'length') return reason
  throw new Error(`gateway-wire: the finish reason ${reason} is not covered`)
}

/** An output item that the next chat frames can still add to; `at` is its place in the output. */
type Open =
  | Readonly<{ kind: 'text'; at: number; text: string }>
  | Readonly<{
      kind: 'call'
      at: number
      index: number
      callId: string
      name: string
      args: string
    }>

/** How one interface writes the steps of a reply. */
type Writer = Readonly<{
  start(frame: ChatFrame): string
  error(error: Readonly<Record<string, unknown>>): string
  reasoning(at: number, detail: ChatDetail): string
  open(item: Open): string
  grow(item: Open, piece: string): string
  close(item: Open): string
  finish(reason: Finish, usage: ChatUsage | undefined): string
  endMarker: string
}>

/**
 * Writes the chat answer of a script in the interface of the request path. A reply that is not a
 * stream, or not a success, goes out as written; so does any reply on the chat-completions path.
 */
export function renderReply(path: string, reply: GatewayAnswer): GatewayAnswer {
  const writer = path.endsWith('/responses')
    ? responsesWriter()
    : path.endsWith('/messages')
      ? messagesWriter()
      : null
  if (writer === null || reply.status !== 200 || reply.contentType !== 'text/event-stream')
    return reply
  const translate = translator(writer)
  const body = translate(reply.body)
  if (reply.rest === undefined) return { ...reply, body }
  return { ...reply, body, rest: { after: reply.rest.after, body: translate(reply.rest.body) } }
}

/**
 * Translates the parts of one reply in order. The reply finishes at the end marker, or at the end
 * of a part once a finish reason came, so a usage frame after the finish reason is still counted.
 */
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

function responsesWriter(): Writer {
  let sequence = 0
  let model: string | undefined
  const output: object[] = []
  const event = (type: string, fields: object): string => {
    const written = JSON.stringify({ type, ...fields, sequence_number: sequence })
    sequence += 1
    return `data: ${written}\n\n`
  }
  const response = (status: string, fields: object) => ({
    id: 'gen-test-gateway',
    object: 'response',
    model,
    status,
    ...fields,
  })
  const part = (text: string) => ({ type: 'output_text', text, annotations: [], logprobs: [] })
  const idOf = (item: Open): string => `${item.kind === 'text' ? 'msg' : 'fc'}_${String(item.at)}`
  const itemOf = (item: Open, done: boolean): object => {
    const status = done ? 'completed' : 'in_progress'
    return item.kind === 'text'
      ? {
          id: idOf(item),
          type: 'message',
          status,
          role: 'assistant',
          content: done ? [part(item.text)] : [],
          phase: 'final_answer',
        }
      : {
          id: idOf(item),
          type: 'function_call',
          status,
          call_id: item.callId,
          name: item.name,
          arguments: done ? item.args : '',
        }
  }
  const itemDone = (at: number, item: object): string => {
    output.push(item)
    return event('response.output_item.done', { output_index: at, item })
  }
  return {
    start: frame => {
      model = frame.model
      return event('response.created', { response: response('in_progress', { output: [] }) })
    },
    error: ({ type: _type, ...error }) => event('error', error),
    reasoning: (at, detail) => {
      const id = detail.id ?? `rs_${String(at)}`
      const added = { id, type: 'reasoning', status: 'in_progress', summary: [] }
      return (
        event('response.output_item.added', { output_index: at, item: added }) +
        itemDone(at, {
          ...added,
          status: 'completed',
          encrypted_content: detail.data,
          format: detail.format,
        })
      )
    },
    open: item => {
      const added = event('response.output_item.added', {
        output_index: item.at,
        item: itemOf(item, false),
      })
      if (item.kind === 'call') return added
      const where = { output_index: item.at, item_id: idOf(item), content_index: 0 }
      return added + event('response.content_part.added', { ...where, part: part('') })
    },
    grow: (item, delta) =>
      item.kind === 'text'
        ? event('response.output_text.delta', {
            output_index: item.at,
            item_id: idOf(item),
            content_index: 0,
            delta,
            logprobs: [],
          })
        : event('response.function_call_arguments.delta', {
            output_index: item.at,
            item_id: idOf(item),
            delta,
          }),
    close: item => {
      const where = { output_index: item.at, item_id: idOf(item) }
      const closing =
        item.kind === 'text'
          ? event('response.output_text.done', {
              ...where,
              content_index: 0,
              text: item.text,
              logprobs: [],
            }) +
            event('response.content_part.done', {
              ...where,
              content_index: 0,
              part: part(item.text),
            })
          : event('response.function_call_arguments.done', {
              ...where,
              name: item.name,
              arguments: item.args,
            })
      return closing + itemDone(item.at, itemOf(item, true))
    },
    finish: (reason, usage) => {
      const counted = usage === undefined ? {} : { usage: responsesUsage(usage) }
      return reason === 'length'
        ? event('response.incomplete', {
            response: response('incomplete', {
              incomplete_details: { reason: 'max_output_tokens' },
              output,
              ...counted,
            }),
          })
        : event('response.completed', { response: response('completed', { output, ...counted }) })
    },
    endMarker: 'data: [DONE]\n\n',
  }
}

function responsesUsage(usage: ChatUsage): object {
  return {
    input_tokens: usage.prompt_tokens,
    input_tokens_details: { cached_tokens: usage.prompt_tokens_details?.cached_tokens ?? 0 },
    output_tokens: usage.completion_tokens,
    output_tokens_details: {
      reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
    },
    cost: usage.cost,
  }
}

const STOP_REASONS: Readonly<Record<Finish, string>> = {
  stop: 'end_turn',
  tool_calls: 'tool_use',
  length: 'max_tokens',
}

function messagesWriter(): Writer {
  const event = (type: string, fields: object = {}): string =>
    `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`
  const stop = (at: number): string => event('content_block_stop', { index: at })
  return {
    start: frame =>
      event('message_start', {
        message: {
          id: 'msg_test_gateway',
          type: 'message',
          role: 'assistant',
          content: [],
          model: frame.model,
          stop_reason: null,
          stop_sequence: null,
          usage: messagesUsage(frame.usage),
          provider: frame.provider,
        },
      }),
    error: error => event('error', { error }),
    // An encrypted detail has no text, so the block has no thinking delta, as Messages writes it.
    reasoning: (at, detail) =>
      event('content_block_start', {
        index: at,
        content_block: { type: 'thinking', thinking: '', signature: '' },
      }) +
      event('content_block_delta', {
        index: at,
        delta: { type: 'signature_delta', signature: detail.data },
      }) +
      stop(at),
    open: item =>
      event('content_block_start', {
        index: item.at,
        content_block:
          item.kind === 'text'
            ? { type: 'text', text: '', citations: [] }
            : { type: 'tool_use', id: item.callId, name: item.name, input: {} },
      }),
    grow: (item, piece) =>
      event('content_block_delta', {
        index: item.at,
        delta:
          item.kind === 'text'
            ? { type: 'text_delta', text: piece }
            : { type: 'input_json_delta', partial_json: piece },
      }),
    close: item => stop(item.at),
    finish: (reason, usage) =>
      event('message_delta', {
        delta: { stop_reason: STOP_REASONS[reason], stop_sequence: null },
        usage: messagesUsage(usage),
      }) + event('message_stop'),
    endMarker: '',
  }
}

function messagesUsage(usage: ChatUsage | undefined): object {
  if (usage === undefined) return {}
  return {
    input_tokens: usage.prompt_tokens,
    cache_read_input_tokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
    output_tokens: usage.completion_tokens,
    output_tokens_details: {
      thinking_tokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
    },
    cost: usage.cost,
  }
}
