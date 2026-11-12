// Reading a request body under a byte limit, shared by the three existing locations and the new
// address. It counts the bytes actually read; a declared Content-Length over the limit is refused
// unread.
import type { IncomingMessage } from 'node:http'

export type BodyRead =
  | Readonly<{ kind: 'ok'; bytes: Uint8Array }>
  | Readonly<{ kind: 'over' }>
  | Readonly<{ kind: 'aborted' }>
  /** `stop` fired before the body was complete. Only when a `stop` signal is given. */
  | Readonly<{ kind: 'stopped' }>

/** Without a stop signal the read never ends as `stopped`. */
export function readBody(
  req: IncomingMessage,
  maxBytes: number,
): Promise<Exclude<BodyRead, { kind: 'stopped' }>>
export function readBody(
  req: IncomingMessage,
  maxBytes: number,
  stop: AbortSignal,
): Promise<BodyRead>
export function readBody(
  req: IncomingMessage,
  maxBytes: number,
  stop?: AbortSignal,
): Promise<BodyRead> {
  const declared = req.headers['content-length']
  if (declared !== undefined && /^\d+$/.test(declared) && Number(declared) > maxBytes)
    return Promise.resolve({ kind: 'over' })
  if (stop?.aborted === true) return Promise.resolve({ kind: 'stopped' })
  return new Promise(resolve => {
    const chunks: Uint8Array[] = []
    let total = 0
    let done = false
    const onStop = (): void => finish({ kind: 'stopped' })
    const finish = (result: BodyRead): void => {
      if (done) return
      done = true
      stop?.removeEventListener('abort', onStop)
      req.removeAllListeners('data')
      req.pause()
      resolve(result)
    }
    stop?.addEventListener('abort', onStop, { once: true })
    req.on('data', (chunk: Uint8Array) => {
      total += chunk.byteLength
      if (total > maxBytes) {
        finish({ kind: 'over' })
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => finish({ kind: 'ok', bytes: Buffer.concat(chunks) }))
    req.on('error', () => finish({ kind: 'aborted' }))
    req.on('aborted', () => finish({ kind: 'aborted' }))
  })
}
