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

type Wire = 'responses' | 'messages'

function wireOf(path: string): Wire | null {
  if (path.endsWith('/responses')) return 'responses'
  return path.endsWith('/messages') ? 'messages' : null
}

/**
 * The path of the interface a request speaks. An operator address replaces the address of every
 * endpoint of the release, so a request can arrive on the chat-completions path whatever it
 * speaks; its body tells it. A Responses body has `input` and no `messages`; a Messages body has
 * `messages` and the `thinking` member the Messages engine always writes. A chat-completions body
 * has neither.
 */
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

/**
 * Writes the chat answer of a script in the interface of the request path. A reply that is not a
 * stream, or not a success, goes out as written; so does any reply on the chat-completions path.
 */
export function renderReply(path: string, reply: GatewayAnswer): GatewayAnswer {
  const wire = wireOf(path)
  if (wire === null || reply.status !== 200 || reply.contentType !== 'text/event-stream')
    return reply
  const translate = translator(writerOf(wire))
  const body = translate(reply.body)
  if (reply.rest === undefined) return { ...reply, body }
  return { ...reply, body, rest: { after: reply.rest.after, body: translate(reply.rest.body) } }
}

/**
 * A translator for one streamed reply on `path`, fed the chat frames in the order they are written;
 * null on the chat-completions path, where the frames go out as written.
 */
export function streamTranslator(path: string): ((part: string) => string) | null {
  const wire = wireOf(path)
  return wire === null ? null : translator(writerOf(wire))
}

function writerOf(wire: Wire): Writer {
  return wire === 'responses' ? responsesWriter() : messagesWriter()
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
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0
  return {
    input_tokens: usage.prompt_tokens === undefined ? undefined : usage.prompt_tokens - cached,
    cache_read_input_tokens: cached,
    output_tokens: usage.completion_tokens,
    output_tokens_details: {
      thinking_tokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
    },
    cost: usage.cost,
  }
}

// The request half, as OpenRouter does it the other way: the gateway gives a script the chat
// request equal to the one sent, so a script reads every request in chat-completions terms.

type ChatPart =
  | Readonly<{ type: 'text'; text: string }>
  | Readonly<{
      type: 'image_url'
      image_url: Readonly<{ url: string; detail?: string | undefined }>
    }>

type ChatToolCall = Readonly<{
  id: string | undefined
  type: 'function'
  function: Readonly<{ name: string | undefined; arguments: string | undefined }>
}>

/** The items of one assistant turn, which chat writes as one assistant message. */
type Turn = { parts: ChatPart[]; details: object[]; calls: ChatToolCall[] }

/**
 * The chat-completions body equal to a request sent on `path`, written as the chat engine writes
 * one: members in key order, no spaces. A chat-completions request is given as sent.
 */
export function chatRequestOf(path: string, raw: string): string {
  const wire = wireOf(path)
  if (wire === null) return raw
  const chat = wire === 'responses' ? fromResponses(JSON.parse(raw)) : fromMessages(JSON.parse(raw))
  return JSON.stringify(keyOrdered(chat))
}

function keyOrdered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(keyOrdered)
  if (typeof value !== 'object' || value === null) return value
  const entries = Object.entries(value).filter(([, member]) => member !== undefined)
  return Object.fromEntries(
    entries
      .toSorted(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, member]) => [key, keyOrdered(member)]),
  )
}

/** One text part is written as its text, no part as an empty text, as the chat engine writes. */
function compact(parts: readonly ChatPart[]): string | readonly ChatPart[] {
  const [only] = parts
  if (parts.length === 1 && only?.type === 'text') return only.text
  return parts.length === 0 ? '' : parts
}

function assistantOf(turn: Turn): object {
  return {
    role: 'assistant',
    content: compact(turn.parts),
    tool_calls: turn.calls.length === 0 ? undefined : turn.calls,
    reasoning_details: turn.details.length === 0 ? undefined : turn.details,
  }
}

/** Collects chat messages; assistant items in a row become one assistant message. */
function conversation() {
  const messages: object[] = []
  let turn: Turn | null = null
  const flush = (): void => {
    if (turn !== null) messages.push(assistantOf(turn))
    turn = null
  }
  return {
    turn: (): Turn => (turn ??= { parts: [], details: [], calls: [] }),
    push: (message: object): void => {
      flush()
      messages.push(message)
    },
    done: (): readonly object[] => {
      flush()
      return messages
    },
  }
}

type ResponsesPart = Readonly<{ type: string; text?: string; image_url?: string; detail?: string }>

type ResponsesItem = Readonly<{
  type?: string
  role?: string
  content?: string | readonly ResponsesPart[]
  id?: string
  encrypted_content?: string
  format?: string
  call_id?: string
  name?: string
  arguments?: string
  output?: string
}>

type ResponsesRequest = Readonly<{
  model?: string
  stream?: boolean
  instructions?: string
  input?: string | readonly ResponsesItem[]
  tools?: readonly Readonly<{ name: string; description?: string; parameters?: unknown }>[]
  reasoning?: Readonly<{ effort?: string }>
}>

function responsesParts(content: ResponsesItem['content']): readonly ChatPart[] {
  if (content === undefined) return []
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  return content.map(part => {
    if ((part.type === 'input_text' || part.type === 'output_text') && part.text !== undefined)
      return { type: 'text', text: part.text }
    if (part.type === 'input_image' && part.image_url !== undefined)
      return { type: 'image_url', image_url: { url: part.image_url, detail: part.detail } }
    throw new Error(`gateway-wire: a content part of type ${part.type} is not covered`)
  })
}

// The system prompt is `instructions`, or the developer message that opens the input; a later
// developer message is a reminder, which the chat records of OpenAI write as `developer`.
function fromResponses(request: ResponsesRequest): object {
  const chat = conversation()
  if (request.instructions !== undefined)
    chat.push({ role: 'system', content: request.instructions })
  const input =
    typeof request.input === 'string' ? [{ role: 'user', content: request.input }] : request.input
  for (const [at, item] of (input ?? []).entries()) {
    const type = item.type ?? 'message'
    if (type === 'reasoning')
      chat.turn().details.push({
        type: 'reasoning.encrypted',
        id: item.id,
        data: item.encrypted_content,
        format: item.format,
      })
    else if (type === 'function_call')
      chat.turn().calls.push({
        id: item.call_id,
        type: 'function',
        function: { name: item.name, arguments: item.arguments },
      })
    else if (type === 'function_call_output')
      chat.push({ role: 'tool', tool_call_id: item.call_id, content: item.output ?? '' })
    else if (type === 'message' && item.role === 'assistant')
      chat.turn().parts.push(...responsesParts(item.content))
    else if (type === 'message' && item.role !== undefined) {
      const opens = at === 0 && item.role === 'developer' && request.instructions === undefined
      chat.push({
        role: opens ? 'system' : item.role,
        content: compact(responsesParts(item.content)),
      })
    } else throw new Error(`gateway-wire: an input item of type ${type} is not covered`)
  }
  return {
    model: request.model,
    stream: request.stream,
    messages: chat.done(),
    tools: request.tools?.map(tool => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    })),
    reasoning:
      request.reasoning?.effort === undefined ? undefined : { effort: request.reasoning.effort },
  }
}

type MessagesBlock = Readonly<{
  type: string
  text?: string
  signature?: string
  data?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: string | readonly MessagesBlock[]
  source?: Readonly<{ media_type?: string; data?: string }>
}>

type MessagesRequest = Readonly<{
  model?: string
  stream?: boolean
  system?: string | readonly MessagesBlock[]
  messages?: readonly Readonly<{ role: string; content: string | readonly MessagesBlock[] }>[]
  tools?: readonly Readonly<{ name: string; description?: string; input_schema?: unknown }>[]
  output_config?: Readonly<{ effort?: string }>
}>

function blocksOf(
  content: string | readonly MessagesBlock[] | undefined,
): readonly MessagesBlock[] {
  if (content === undefined) return []
  return typeof content === 'string' ? [{ type: 'text', text: content }] : content
}

function messagesPart(block: MessagesBlock): ChatPart {
  if (block.type === 'text' && block.text !== undefined) return { type: 'text', text: block.text }
  if (block.type === 'image' && block.source?.data !== undefined)
    return {
      type: 'image_url',
      image_url: { url: `data:${block.source.media_type ?? ''};base64,${block.source.data}` },
    }
  throw new Error(`gateway-wire: a content block of type ${block.type} is not covered`)
}

// Tool results open the user turn that carries them; the rest of the turn follows as a user message.
function fromMessages(request: MessagesRequest): object {
  const chat = conversation()
  const system = blocksOf(request.system)
  if (system.length > 0) chat.push({ role: 'system', content: compact(system.map(messagesPart)) })
  for (const message of request.messages ?? []) {
    const blocks = blocksOf(message.content)
    if (message.role === 'assistant') {
      const turn = chat.turn()
      for (const block of blocks)
        if (block.type === 'thinking' || block.type === 'redacted_thinking')
          turn.details.push({
            type: 'reasoning.encrypted',
            data: block.type === 'thinking' ? block.signature : block.data,
          })
        else if (block.type === 'tool_use')
          turn.calls.push({
            id: block.id,
            type: 'function',
            function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
          })
        else turn.parts.push(messagesPart(block))
      continue
    }
    for (const block of blocks)
      if (block.type === 'tool_result')
        chat.push({
          role: 'tool',
          tool_call_id: block.tool_use_id,
          content: compact(blocksOf(block.content).map(messagesPart)),
        })
    const rest = blocks.filter(block => block.type !== 'tool_result').map(messagesPart)
    if (rest.length > 0) chat.push({ role: message.role, content: compact(rest) })
  }
  return {
    model: request.model,
    stream: request.stream,
    messages: chat.done(),
    tools: request.tools?.map(tool => ({
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
    })),
    reasoning:
      request.output_config?.effort === undefined
        ? undefined
        : { effort: request.output_config.effort },
  }
}
