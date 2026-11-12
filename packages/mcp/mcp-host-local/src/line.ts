// The line port: what the session needs from one wire. A line moves bytes and reports what the
// wire did; it does not classify anything and judges nothing. The session turns an exchange and
// the line events into contract wire events, classifies them with `classifyWireEvent`, and draws
// the conclusion with the contract's decision layer. `http-line.ts` implements this port
// (Streamable HTTP, with the legacy HTTP+SSE mode).

/** One outgoing JSON-RPC message, serialized, with the headers the HTTP line puts on its request. */
export type Outbound = Readonly<{
  text: string
  /** The headers of the request on HTTP, by lower-case name; the credential wrote into them first. */
  headers: Headers
}>

/** The headers of an HTTP answer, by lower-case name. */
export type AnswerHeaders = Readonly<{ [name: string]: string }>

/**
 * What the wire did with one outgoing message.
 * - `unsent`: the message failed before it left (contract T8 X01).
 * - `status`: an HTTP answer whose status is not 2xx, with its headers by lower-case name and the
 *   whole body.
 * - `stream`: a 2xx HTTP answer: its headers, the JSON-RPC messages of the body one by one (the
 *   JSON body as one message, or the data of each SSE event), and `abort` to end it. The
 *   iteration ends when the body ended as the peer meant it to, and rejects when it broke.
 *   `abort` releases local resources only and does not throw: the session calls it while it
 *   settles a request, and a throw there is a defect of the line.
 * - `aborted`: the exchange ended before an answer head: the request failed after it started to
 *   go out, or the signal ended it.
 */
export type Exchange =
  | Readonly<{ kind: 'unsent' }>
  | Readonly<{ kind: 'status'; status: number; headers: AnswerHeaders; body: string }>
  | Readonly<{
      kind: 'stream'
      headers: AnswerHeaders
      messages: AsyncIterable<string>
      abort(): void
    }>
  | Readonly<{ kind: 'aborted' }>

/**
 * One event of the shared stream of the legacy HTTP+SSE mode.
 * - `line`: one message: the data of one event of the stream.
 * - `broken`: the shared stream is gone: it ended or broke.
 */
export type LineEvent = Readonly<{ kind: 'line'; text: string }> | Readonly<{ kind: 'broken' }>

/** The first event of a GET stream, as the SSE parser read it. */
export type FirstEvent = Readonly<{ event?: string; data: string }>

/**
 * What the HTTP line found when it tried the GET of the legacy HTTP+SSE fallback (contract T3).
 * The line reports the facts; the session judges whether the fallback holds.
 * - `stream`: a 2xx answer: its status, headers, and the first event of the body when there was
 *   one. `enter(endpoint)` keeps the stream as the shared stream of the SSE mode, with later
 *   messages posted to `endpoint`; `discard()` ends it.
 * - `status`: an answer whose status is not 2xx, with its headers and the whole body.
 * - `unsent`: the connection was not made. `unavailable`: the line is closed or already in the
 *   SSE mode, or the exchange failed after the request started to go out.
 */
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
  /** Writes one message. The signal ends the wait: it ends the exchange. */
  send(message: Outbound, signal: AbortSignal): Promise<Exchange>
  /** The events of the shared stream of the legacy HTTP+SSE mode, until the line closes. */
  readonly events: AsyncIterable<LineEvent>
  /** GETs the target with `headers` and reports what came back (contract T3). */
  readonly openGet?: ((headers: Headers, signal: AbortSignal) => Promise<GetOpened>) | undefined
  /**
   * Closes the line. It is idempotent: a second call completes no earlier than the first. Its
   * completion depends on local resources only and never waits for the
   * peer: the session's `close()` waits for it alone, so this is the premise of SPEC V4.
   */
  close(): Promise<void>
}
