import { createHash } from 'node:crypto'
import { chmodSync, rmSync } from 'node:fs'
import { createConnection, createServer } from 'node:net'
import { join } from 'node:path'

export const CONTROL_SOCKET = 'control.sock'
const REQUEST_LIMIT = 64 * 1024

type Line = Readonly<Record<string, unknown>>

/** Answers one request: `tell` writes one line of the reply; the reply ends when this settles. */
export type ControlHandler = (request: unknown, tell: (line: Line) => void) => Promise<void>

export type ControlPort = Readonly<{ path: string; close(): Promise<void> }>

/** The control port is a file of the state directory: who can write there is the operator. */
export function controlPath(
  stateRoot: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform !== 'win32') return join(stateRoot, CONTROL_SOCKET)
  return `\\\\.\\pipe\\omne-control-${createHash('sha256').update(stateRoot).digest('hex').slice(0, 32)}`
}

function requestOf(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/** Opens the control port of this run. Only this user can connect; the socket of a run that fell is replaced. */
export async function openControl(stateRoot: string, handle: ControlHandler): Promise<ControlPort> {
  const path = controlPath(stateRoot)
  const local = process.platform !== 'win32'
  if (local) rmSync(path, { force: true })
  const server = createServer(socket => {
    let received = ''
    let answered = false
    const tell = (line: Line): void => void socket.write(`${JSON.stringify(line)}\n`)
    socket.setEncoding('utf8')
    socket.on('error', () => undefined)
    socket.on('data', (chunk: string) => {
      if (answered) return
      received += chunk
      const end = received.indexOf('\n')
      if (end === -1 && received.length <= REQUEST_LIMIT) return
      answered = true
      const request = end === -1 ? undefined : requestOf(received.slice(0, end))
      void handle(request, tell)
        .catch(() => tell({ kind: 'result', outcome: 'refused', reason: 'internal' }))
        .finally(() => socket.end())
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(path, resolve)
  })
  if (local) chmodSync(path, 0o600)
  return {
    path,
    // Closing the server takes the socket file away.
    close: () => new Promise<void>(resolve => void server.close(() => resolve())),
  }
}

/** Sends one request to the serving process of a state directory and gives every line of its reply. */
export function askControl(stateRoot: string, request: Line): Promise<Line[]> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(controlPath(stateRoot))
    let received = ''
    socket.setEncoding('utf8')
    socket.once('error', reject)
    socket.once('connect', () => socket.write(`${JSON.stringify(request)}\n`))
    socket.on('data', (chunk: string) => (received += chunk))
    socket.once('end', () =>
      resolve(
        received
          .split('\n')
          .filter(line => line !== '')
          .map(line => JSON.parse(line) as Line),
      ),
    )
  })
}
