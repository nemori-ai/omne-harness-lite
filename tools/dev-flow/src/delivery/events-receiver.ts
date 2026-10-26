import { createHmac, timingSafeEqual } from 'node:crypto'
import { appendFileSync, mkdirSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname } from 'node:path'
import { normalizeGithubEvent } from './events.ts'
import { deleteHooks, listForwarderHooks, type GhText, type SpawnForward } from './events-gh.ts'
import { InputError } from './protocol.ts'

const MAX_BODY_BYTES = 26 * 1024 * 1024

/** True when `signature` is the `sha256=` HMAC of `body` under `secret`. */
export function signatureValid(
  secret: string,
  body: Buffer,
  signature: string | undefined,
): boolean {
  if (signature === undefined) return false
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`),
    given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

function reply(response: ServerResponse, status: number, message?: string): void {
  response.writeHead(status, { 'content-type': 'text/plain' }).end(message)
}

/**
 * The HTTP server of the receiver. It accepts only POST, checks `X-Hub-Signature-256` when a
 * secret is given, reduces each delivery with `normalizeGithubEvent` and appends one JSON line
 * to `file`. The answer is 204 after the line is written. It is not yet listening.
 */
export function createReceiverServer(args: {
  file: string
  secret?: string
  now?: () => string
}): Server {
  mkdirSync(dirname(args.file), { recursive: true })
  const now = args.now ?? (() => new Date().toISOString())
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== 'POST') return reply(response, 405, 'POST only')
    const chunks: Buffer[] = []
    let size = 0,
      refused = false
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES && !refused) {
        refused = true
        reply(response, 413, 'Body too large')
        request.destroy()
      } else if (!refused) chunks.push(chunk)
    })
    request.on('end', () => {
      if (refused) return
      const body = Buffer.concat(chunks)
      if (
        args.secret !== undefined &&
        !signatureValid(
          args.secret,
          body,
          request.headers['x-hub-signature-256'] as string | undefined,
        )
      )
        return reply(response, 401, 'Bad signature')
      try {
        const line = normalizeGithubEvent(request.headers, JSON.parse(body.toString('utf8')), now())
        appendFileSync(args.file, `${JSON.stringify(line)}\n`)
        reply(response, 204)
      } catch (error) {
        if (error instanceof InputError || error instanceof SyntaxError)
          reply(response, 400, 'Not a webhook delivery')
        else reply(response, 500, 'Cannot write the event file')
      }
    })
  })
}

export type ServeArgs = {
  port: number
  file: string
  repository: string
  secret?: string
  gh: GhText
  spawnForward: SpawnForward
  /** Resolves when the operator asks to stop (SIGINT or SIGTERM). */
  stopped: Promise<void>
  log: (message: string) => void
}

/**
 * Runs the receiver until `stopped` resolves or the forwarder exits. Returns the exit code:
 * 0 after a requested stop with its hooks removed, 1 when the forwarder died or a hook could not
 * be removed. Startup deletes the forwarder hooks that earlier runs left. Shutdown stops the
 * forwarder first, then deletes the hooks it created, then closes the server.
 */
export async function serveReceiver(args: ServeArgs): Promise<number> {
  const { repository, gh, log } = args
  const server = createReceiverServer({
    file: args.file,
    ...(args.secret === undefined ? {} : { secret: args.secret }),
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(args.port, '127.0.0.1', resolve)
  })
  const port = (server.address() as AddressInfo).port
  const closeServer = () =>
    new Promise<void>(resolve => {
      server.close(() => resolve())
      server.closeAllConnections()
    })
  try {
    const stale = listForwarderHooks(repository, gh)
    const failed = deleteHooks(repository, stale, gh)
    if (failed.length > 0)
      throw new InputError(`Cannot delete the stale forwarder hooks ${failed.join(', ')}`)
    if (stale.length > 0) log(`Deleted stale forwarder hooks: ${stale.join(', ')}`)
  } catch (error) {
    await closeServer()
    throw error
  }
  const forward = args.spawnForward({
    repository,
    port,
    secret: args.secret,
  })
  log(`Receiving on 127.0.0.1:${port}, appending to ${args.file}`)
  const reason = await Promise.race([
    args.stopped.then(() => 'stop' as const),
    forward.exited.then(code => ({ exited: code })),
  ])
  let code = 0
  if (reason !== 'stop') {
    log(`The forwarder exited unexpectedly with code ${reason.exited}`)
    code = 1
  }
  await forward.stop()
  let leftover: number[]
  try {
    leftover = deleteHooks(repository, listForwarderHooks(repository, gh), gh)
  } catch {
    log(
      'Cannot list the forwarder hooks to delete. Delete the cli hooks of the repository by hand.',
    )
    leftover = []
    code = 1
  }
  if (leftover.length > 0) {
    log(`Forwarder hooks left behind: ${leftover.join(', ')}. Delete them by hand.`)
    code = 1
  }
  await closeServer()
  return code
}
