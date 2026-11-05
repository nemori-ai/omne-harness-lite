// The line port: what the session needs from one wire. A line moves bytes and reports what the
// wire did; it does not classify anything. The session turns an exchange and the line events into
// contract wire events and classifies them with `classifyWireEvent`. Two lines implement this port:
// `stdio-line.ts` and `http-line.ts` (Streamable HTTP, with the legacy HTTP+SSE mode).

/** One outgoing JSON-RPC message, serialized, with the headers the HTTP line puts on its request. */
export type Outbound = Readonly<{
  text: string
  /** The headers of the request on HTTP, by lower-case name; the credential wrote into them first. */
  headers: Headers
}>

/**
 * What the wire did with one outgoing message.
 * - `unsent`: the message failed before it left (contract T8 X01, X02).
 * - `sent`: the message was written; any answer comes as a line event (stdio, and the shared stream
 *   of the legacy HTTP+SSE mode).
 * - `status`: an HTTP answer whose status is not 2xx, with its headers by lower-case name and the
 *   whole body.
 * - `stream`: a 2xx HTTP answer: its headers, the JSON-RPC messages of the body one by one (the
 *   JSON body as one message, or the data of each SSE event), and `abort` to end it. The
 *   iteration ends when the body ended as the peer meant it to, and rejects when it broke.
 * - `aborted`: the HTTP exchange failed after the request started to go out and before the answer
 *   head came.
 */
export type Exchange =
  | Readonly<{ kind: 'unsent' }>
  | Readonly<{ kind: 'sent' }>
  | Readonly<{
      kind: 'status'
      status: number
      headers: Readonly<{ [name: string]: string }>
      body: string
    }>
  | Readonly<{
      kind: 'stream'
      headers: Readonly<{ [name: string]: string }>
      messages: AsyncIterable<string>
      abort(): void
    }>
  | Readonly<{ kind: 'aborted' }>

/**
 * One event of the shared stream of a line.
 * - `line`: one message: a stdio line, or the data of one event of the legacy HTTP+SSE stream.
 * - `ended`: stdio: stdout ended, the root process exited, or both, with the times in milliseconds
 *   on one clock (contract T8, `PROCESS_EXIT_WINDOW_MS`).
 * - `broken`: the legacy HTTP+SSE stream ended or broke.
 */
export type LineEvent =
  | Readonly<{ kind: 'line'; text: string }>
  | Readonly<{ kind: 'ended'; stdoutEndedAt?: number; exitedAt?: number }>
  | Readonly<{ kind: 'broken' }>

/** What the HTTP line found when it tried the legacy HTTP+SSE fallback (contract T3). */
export type SseEntry =
  | Readonly<{ kind: 'entered' }>
  | Readonly<{
      kind: 'status'
      status: number
      headers: Readonly<{ [name: string]: string }>
      body: string
    }>
  | Readonly<{ kind: 'unsent' }>
  | Readonly<{ kind: 'unavailable' }>

export interface Line {
  readonly kind: 'stdio' | 'streamable-http'
  send(message: Outbound, signal: AbortSignal): Promise<Exchange>
  /** The events of the shared stream, until the line closes. A Streamable HTTP line has none. */
  readonly events: AsyncIterable<LineEvent>
  /**
   * HTTP only: GETs the target with `headers` and enters the legacy HTTP+SSE mode when the
   * stream gives a same-origin `endpoint`. After `entered`, `send` posts to the endpoint and the
   * messages of the stream come as `line` events.
   */
  readonly enterSse?: ((headers: Headers, signal: AbortSignal) => Promise<SseEntry>) | undefined
  /** Closes the line. It is idempotent. It does not stop a process. */
  close(): Promise<void>
}
