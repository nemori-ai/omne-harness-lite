import { connect } from 'node:net'
import { join } from 'node:path'
import { OPS_SOCKET_NAME, readOpsReplyBody } from '@omne-harness-lite/governance-center-entry-node'
import type { MaintenanceCommand } from './command-data.ts'

/** One request, no retries. Disconnect only abandons the client's wait. */
export function callOps(
  command: Extract<MaintenanceCommand, { kind: 'ops' }>,
  signal: AbortSignal,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = connect(join(command.socketDirectory, OPS_SOCKET_NAME))
    let done = false
    let bytes = Buffer.alloc(0)
    const finish = (error?: Error, value?: unknown) => {
      if (done) return
      done = true
      signal.removeEventListener('abort', abort)
      socket.destroy()
      if (error !== undefined) reject(error)
      else resolve(value)
    }
    const abort = () => finish(new Error('ops-result-unconfirmed'))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    socket.on('error', abort)
    socket.on('close', () => {
      if (!done) abort()
    })
    socket.on('connect', () => {
      if (done) return
      const body = JSON.stringify({
        opsVersion: '1',
        operation: command.operation,
        payload: command.operation === 'backup' ? { onlyIfDue: command.onlyIfDue } : {},
      })
      socket.end(`POST / HTTP/1.1\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
    })
    socket.on('data', (chunk: Buffer) => {
      if (done) return
      if (bytes.length + chunk.length > 8192 + 65_536) {
        abort()
        return
      }
      bytes = Buffer.concat([bytes, chunk])
    })
    socket.on('end', () => {
      if (done) return
      const boundary = bytes.indexOf('\r\n\r\n')
      const header = bytes.subarray(0, boundary + 4).toString('latin1')
      const match =
        /^HTTP\/1\.1 200 OK\r\nContent-Type: application\/json\r\nCache-Control: no-store\r\nContent-Length: (0|[1-9][0-9]*)\r\nConnection: close\r\n\r\n$/.exec(
          header,
        )
      if (boundary < 0 || match === null || Number(match[1]) !== bytes.length - boundary - 4) {
        abort()
        return
      }
      try {
        finish(undefined, readOpsReplyBody(command.operation, bytes.subarray(boundary + 4)))
      } catch {
        abort()
      }
    })
  })
}
