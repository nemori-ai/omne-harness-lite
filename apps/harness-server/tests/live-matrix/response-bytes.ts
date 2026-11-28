import type { IncomingMessage } from 'node:http'

/** Observe chunks as the existing consumer reads them. A data listener would start the stream. */
export function observeResponseBytes(response: IncomingMessage, observe: (chunk: Buffer) => void) {
  const emit = response.emit
  response.emit = function (event: string | symbol, ...args: unknown[]): boolean {
    if (event === 'data') observe(Buffer.from(args[0] as Uint8Array))
    return Reflect.apply(emit, this, [event, ...args])
  }
}
