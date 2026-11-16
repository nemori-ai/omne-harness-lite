import { subscribe, unsubscribe } from 'node:diagnostics_channel'
import { ClientRequest, IncomingMessage } from 'node:http'

const RESPONSE_HEAD = 'http.client.response.finish'

export type TappedResponse = Readonly<{
  status: number
  body(): Buffer
  foreign(): boolean
}>

export type BodyTap = Readonly<{
  responses(): readonly TappedResponse[]
  close(): void
}>

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
