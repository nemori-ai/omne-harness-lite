import type { IncomingMessage } from 'node:http'

export type BodyRead =
  | Readonly<{ kind: 'ok'; bytes: Uint8Array }>
  | Readonly<{ kind: 'over' }>
  | Readonly<{ kind: 'aborted' }>
  | Readonly<{ kind: 'stopped' }>

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
