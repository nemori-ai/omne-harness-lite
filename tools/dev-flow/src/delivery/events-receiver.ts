import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { appendFileSync, mkdirSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { dirname, resolve } from 'node:path'
import { errorCode, FORWARDED_EVENTS, normalizeGithubEvent } from './events.ts'
import { type SpawnForward } from './events-gh.ts'
import { InputError } from './protocol.ts'
import { claimReceiver } from './events-receiver-state.ts'
import { receiverPaths, writePrivateJson } from './events-channel-config.ts'

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
 * to `file`. The answer is 204 after the line is written. When the line cannot be written, the
 * answer is 500 and `log` gets one line. It is not yet listening.
 */
export function createReceiverServer(args: {
  file: string
  secret?: string
  now?: () => string
  log?: (message: string) => void
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
          typeof request.headers['x-hub-signature-256'] === 'string'
            ? request.headers['x-hub-signature-256']
            : undefined,
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
        else {
          const code = errorCode(error)
          args.log?.(
            `Cannot write the event file ${args.file}${code === undefined ? '' : ` (${code})`}. Answered 500.`,
          )
          reply(response, 500, 'Cannot write the event file')
        }
      }
    })
  })
}

export type ServeArgs = {
  port: number
  file: string
  repository: string
  secret?: string
  spawnForward: SpawnForward
  /** Resolves when the operator asks to stop (SIGINT, SIGTERM or SIGHUP). */
  stopped: Promise<void>
  log: (message: string) => void
}

/** Runs the legacy single-machine forwarder. Hook ownership is never inferred from lists. */
export async function serveReceiver(args: ServeArgs): Promise<number> {
  const server = createReceiverServer({
    file: args.file,
    ...(args.secret === undefined ? {} : { secret: args.secret }),
    log: args.log,
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(args.port, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve()
    })
  })
  /** Settles when the listening server fails. The receiver then shuts down. */
  const serverFailed = new Promise<Error>(resolve => server.on('error', resolve))
  const closeServer = () =>
    new Promise<void>(resolve => {
      server.close(() => resolve())
      server.closeAllConnections()
    })
  let owner: ReturnType<typeof claimReceiver>
  try {
    owner = claimReceiver({
      instanceId: randomUUID(),
      repository: args.repository,
      eventFile: resolve(args.file),
      mode: 'legacy',
      managed: true,
      hookId: null,
      events: [...FORWARDED_EVENTS],
    })
  } catch (error) {
    await closeServer()
    throw error
  }
  try {
    const address = server.address()
    if (address === null || typeof address === 'string')
      throw new InputError('Receiver address unavailable')
    return await runForwarder(args, address.port, serverFailed)
  } finally {
    owner.state.state = 'recovery-needed'
    owner.state.reasonCode = 'legacy-hook-ownership-unknown'
    try {
      writePrivateJson(receiverPaths(args.file).state, owner.state)
    } finally {
      try {
        owner.release()
      } finally {
        await closeServer()
      }
    }
  }
}

/** Stops only the owned child. Legacy hook creation provides no provable ownership receipt. */
async function runForwarder(
  args: ServeArgs,
  port: number,
  serverFailed: Promise<Error>,
): Promise<number> {
  const { repository, log } = args
  const forward = args.spawnForward({ repository, port, secret: args.secret })
  let stopping: Promise<void> | undefined
  const stopForward = () => (stopping ??= forward.stop())
  try {
    log(`Receiving on 127.0.0.1:${port}, appending to ${args.file}`)
    const reason = await Promise.race([
      args.stopped.then(() => ({ kind: 'stop' as const })),
      forward.exited.then(exit => ({ kind: 'exited' as const, exit })),
      serverFailed.then(error => ({ kind: 'server' as const, error })),
    ])
    if (reason.kind === 'exited') log(`The forwarder exited unexpectedly with code ${reason.exit}`)
    if (reason.kind === 'server') {
      const code = errorCode(reason.error)
      log(`The receiver server failed${code === undefined ? '' : ` (${code})`}. Shutting down.`)
    }
    await stopForward()
    if (reason.kind === 'exited' && reason.exit === 422) {
      log(
        JSON.stringify({
          kind: 'receiver-error',
          reasonCode: 'legacy-hook-conflict',
          message: 'The legacy forwarder returned HTTP 422. Use an independent channel.',
        }),
      )
      return 2
    }
    log(
      JSON.stringify({
        kind: 'receiver-error',
        reasonCode: 'recovery-needed',
        message: 'Legacy hook ownership is unproven. No hooks were deleted.',
      }),
    )
    return 2
  } finally {
    await stopForward()
  }
}
