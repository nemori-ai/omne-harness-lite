export type Outbound = Readonly<{
  text: string
  headers: Headers
}>

export type AnswerHeaders = Readonly<{ [name: string]: string }>

export type Exchange =
  | Readonly<{ kind: 'unsent' }>
  | Readonly<{ kind: 'sent' }>
  | Readonly<{ kind: 'status'; status: number; headers: AnswerHeaders; body: string }>
  | Readonly<{
      kind: 'stream'
      headers: AnswerHeaders
      messages: AsyncIterable<string>
      abort(): void
    }>
  | Readonly<{ kind: 'aborted' }>

export type LineEvent =
  | Readonly<{ kind: 'line'; text: string }>
  | Readonly<{ kind: 'ended'; stdoutEndedAt?: number; exitedAt?: number }>
  | Readonly<{ kind: 'broken' }>

export type FirstEvent = Readonly<{ event?: string; data: string }>

export type GetOpened =
  | Readonly<{
      kind: 'stream'
      status: number
      headers: AnswerHeaders
      first: FirstEvent | undefined
      enter(endpoint: string): void
      discard(): void
    }>
  | Readonly<{ kind: 'status'; status: number; headers: AnswerHeaders; body: string }>
  | Readonly<{ kind: 'unsent' }>
  | Readonly<{ kind: 'unavailable' }>

export interface Line {
  readonly kind: 'stdio' | 'streamable-http'
  send(message: Outbound, signal: AbortSignal): Promise<Exchange>
  readonly events: AsyncIterable<LineEvent>
  readonly openGet?: ((headers: Headers, signal: AbortSignal) => Promise<GetOpened>) | undefined
  close(): Promise<void>
}
