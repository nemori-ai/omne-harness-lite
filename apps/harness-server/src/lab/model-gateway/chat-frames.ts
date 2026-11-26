/** One chat-completions frame of a script, and the pieces a writer of another interface is handed. Scripts are trusted to write this shape. */
export type ChatUsage = Readonly<{
  prompt_tokens?: number
  completion_tokens?: number
  prompt_tokens_details?: Readonly<{ cached_tokens?: number }>
  completion_tokens_details?: Readonly<{ reasoning_tokens?: number }>
  cost?: number
}>

export type ChatDetail = Readonly<{ type: string; id?: string; format?: string; data?: string }>

export type ChatCall = Readonly<{
  index: number
  id?: string
  function?: Readonly<{ name?: string; arguments?: string }>
}>

export type ChatFrame = Readonly<{
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

export type Finish = 'stop' | 'tool_calls' | 'length'

export function finishOf(reason: string): Finish {
  if (reason === 'stop' || reason === 'tool_calls' || reason === 'length') return reason
  throw new Error(`gateway-wire: the finish reason ${reason} is not covered`)
}

export type Open =
  | Readonly<{ kind: 'text'; at: number; text: string }>
  | Readonly<{
      kind: 'call'
      at: number
      index: number
      callId: string
      name: string
      args: string
    }>

export type Writer = Readonly<{
  start(frame: ChatFrame): string
  error(error: Readonly<Record<string, unknown>>): string
  reasoning(at: number, detail: ChatDetail): string
  open(item: Open): string
  grow(item: Open, piece: string): string
  close(item: Open): string
  finish(reason: Finish, usage: ChatUsage | undefined): string
  endMarker: string
}>

export type Wire = 'responses' | 'messages'

export function wireOf(path: string): Wire | null {
  if (path.endsWith('/responses')) return 'responses'
  return path.endsWith('/messages') ? 'messages' : null
}
