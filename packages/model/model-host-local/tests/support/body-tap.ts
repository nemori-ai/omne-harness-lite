// Test support of the recorder: the response body of a real exchange, as the bytes that Node's
// HTTP parser hands to the response stream. The send path stays unchanged: the tap subscribes to
// Node's `http.client.response.finish` diagnostics channel, which Node publishes when the response
// head is parsed and before any body byte reaches the stream, and wraps `push` of that one
// response. The bytes are the body after Node removed the transfer coding (chunked); no header is
// kept. The pi transport reads the same stream through its own reader and sees no difference.
import { subscribe, unsubscribe } from 'node:diagnostics_channel'
import { ClientRequest, IncomingMessage } from 'node:http'

const RESPONSE_HEAD = 'http.client.response.finish'

/** One response of the tapped target: its status and every body byte pushed so far. */
export type TappedResponse = Readonly<{
  status: number
  body(): Buffer
  /** `true` when Node pushed a chunk that was not bytes: the body is then not the wire body. */
  foreign(): boolean
}>

export type BodyTap = Readonly<{
  /** Every response of the target since the tap opened, in arrival order. */
  responses(): readonly TappedResponse[]
  /** Unsubscribes. Responses already tapped keep their `push` wrapper until they end. */
  close(): void
}>

/**
 * Taps every response to a POST whose `Host` header is `target.host` and whose path is
 * `target.pathname`. Other exchanges of the process pass untouched.
 */
export function tapResponseBodies(target: URL): BodyTap {
  const responses: TappedResponse[] = []
  const listener = (message: unknown): void => {
    const request: unknown = Reflect.get(Object(message), 'request')
    const response: unknown = Reflect.get(Object(message), 'response')
    if (!(request instanceof ClientRequest) || !(response instanceof IncomingMessage)) return
    if (request.method !== 'POST' || request.path !== target.pathname) return
    if (request.getHeader('host') !== target.host) return
    responses.push(wrap(response))
  }
  subscribe(RESPONSE_HEAD, listener)
  return {
    responses: () => [...responses],
    close: () => {
      unsubscribe(RESPONSE_HEAD, listener)
    },
  }
}

function wrap(response: IncomingMessage): TappedResponse {
  const chunks: Buffer[] = []
  let foreign = false
  const push = response.push.bind(response)
  response.push = (chunk: unknown, encoding?: BufferEncoding): boolean => {
    // A copy: the parser may hand out a view of a buffer that it reuses.
    if (chunk instanceof Uint8Array) chunks.push(Buffer.from(chunk))
    else if (chunk !== null) foreign = true
    return push(chunk, encoding)
  }
  return {
    status: response.statusCode ?? 0,
    body: () => Buffer.concat(chunks),
    foreign: () => foreign,
  }
}
