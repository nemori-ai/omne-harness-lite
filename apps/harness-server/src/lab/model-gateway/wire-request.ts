import { wireOf } from './chat-frames.ts'

type ChatPart =
  | Readonly<{ type: 'text'; text: string }>
  | Readonly<{
      type: 'image_url'
      image_url: Readonly<{ url: string; detail?: string | undefined }>
    }>
  | Readonly<{ type: 'file'; file: Readonly<{ filename?: string | undefined; file_data: string }> }>

type ChatToolCall = Readonly<{
  id: string | undefined
  type: 'function'
  function: Readonly<{ name: string | undefined; arguments: string | undefined }>
}>

type Turn = { parts: ChatPart[]; details: object[]; calls: ChatToolCall[] }

/** The chat-completions body equal to a request sent on `path`, as the chat engine writes one: members in key order, no spaces. */
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

type ResponsesPart = Readonly<{
  type: string
  text?: string
  image_url?: string
  detail?: string
  filename?: string
  file_data?: string
}>

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
    if (part.type === 'input_file' && part.file_data !== undefined)
      return { type: 'file', file: { filename: part.filename, file_data: part.file_data } }
    throw new Error(`gateway-wire: a content part of type ${part.type} is not covered`)
  })
}

// The system prompt is `instructions`, or the developer message that opens the input; a later developer message is a reminder.
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
  if (block.type === 'document' && block.source?.data !== undefined)
    return {
      type: 'file',
      file: { file_data: `data:${block.source.media_type ?? ''};base64,${block.source.data}` },
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
