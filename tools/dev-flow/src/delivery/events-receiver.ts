import { createHmac, timingSafeEqual } from 'node:crypto'
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { errorCode, normalizeGithubEvent } from './events.ts'
import {
  deleteHooks,
  listForwarderHooks,
  newHooks,
  type GhText,
  type SpawnForward,
} from './events-gh.ts'
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
  gh: GhText
  spawnForward: SpawnForward
  /** Resolves when the operator asks to stop (SIGINT, SIGTERM or SIGHUP). */
  stopped: Promise<void>
  log: (message: string) => void
  /** Time between two reads of the hook list while the new hook is not yet there. Default 500. */
  hookPollMs?: number
  /** Longest time to look for the new hook after the forwarder started. Default 30000. */
  hookDiscoveryMs?: number
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return errorCode(error) === 'EPERM'
  }
}

/**
 * Writes the process id to `pidFile` only when the file does not exist. An existing file that
 * names a running process refuses the start with `InputError`. Any other existing file is stale
 * and is replaced.
 */
function claimPidFile(pidFile: string): void {
  const content = `${process.pid}\n`
  try {
    writeFileSync(pidFile, content, { flag: 'wx' })
    return
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error
  }
  let pid = Number.NaN
  try {
    pid = Number(readFileSync(pidFile, 'utf8').trim())
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error
  }
  if (Number.isSafeInteger(pid) && pid > 0 && processAlive(pid))
    throw new InputError(
      `Another receiver (process ${pid}) writes to the event file in ${dirname(pidFile)}. Only one receiver may use an event file. Stop it, or pass another --file.`,
    )
  writeFileSync(pidFile, content)
}

/**
 * Runs the receiver until `stopped` resolves, the forwarder exits or the listening server fails.
 * Returns the exit code: 0 after a requested stop with its hook removed, 1 when the forwarder
 * died, the server failed, or its hook could not be removed or identified. It rejects when the
 * start fails: the port is taken, another receiver holds the event file, or the first hook list
 * cannot be read.
 *
 * Startup deletes nothing. It claims `receiver.pid`, lists the forwarder hooks, starts the
 * forwarder, and looks for the hooks that were not in the first list. Shutdown stops the
 * forwarder first, then deletes the one hook of this receiver, then removes `receiver.pid` and
 * closes the server. Hooks of other receivers stay. When it sees several new hooks, the receiver
 * cannot tell which one is its own and deletes none of them. Every exit path, a rejection
 * included, stops the forwarder, removes `receiver.pid` and closes the server.
 */
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
  const pidFile = join(dirname(args.file), 'receiver.pid')
  try {
    claimPidFile(pidFile)
  } catch (error) {
    await closeServer()
    throw error
  }
  try {
    return await runForwarder(args, (server.address() as AddressInfo).port, serverFailed)
  } finally {
    rmSync(pidFile, { force: true })
    await closeServer()
  }
}

/** Runs the forwarder for the receiver on `port` and removes its hook when it ends. */
async function runForwarder(
  args: ServeArgs,
  port: number,
  serverFailed: Promise<Error>,
): Promise<number> {
  const { repository, gh, log } = args
  const before = listForwarderHooks(repository, gh)
  const forward = args.spawnForward({ repository, port, secret: args.secret })
  let stopping: Promise<void> | undefined
  const stopForward = () => (stopping ??= forward.stop())
  const end = new AbortController()
  try {
    log(`Receiving on 127.0.0.1:${port}, appending to ${args.file}`)
    const discovery = discoverHooks(args, before, end.signal)
    const reason = await Promise.race([
      args.stopped.then(() => ({ kind: 'stop' as const })),
      forward.exited.then(exit => ({ kind: 'exited' as const, exit })),
      serverFailed.then(error => ({ kind: 'server' as const, error })),
    ])
    end.abort()
    if (reason.kind === 'exited') log(`The forwarder exited unexpectedly with code ${reason.exit}`)
    if (reason.kind === 'server') {
      const code = errorCode(reason.error)
      log(`The receiver server failed${code === undefined ? '' : ` (${code})`}. Shutting down.`)
    }
    await stopForward()
    return removeOwnHook(args, before, await discovery, reason.kind === 'stop' ? 0 : 1)
  } finally {
    end.abort()
    await stopForward()
  }
}

/**
 * Reads the hook list until hooks appear that are not in `before`, and returns them. Returns
 * undefined when `signal` aborts or the discovery time passes first.
 */
async function discoverHooks(
  args: ServeArgs,
  before: readonly number[],
  signal: AbortSignal,
): Promise<number[] | undefined> {
  const { repository, gh, log } = args
  const pollMs = args.hookPollMs ?? 500,
    discoveryMs = args.hookDiscoveryMs ?? 30_000
  const deadline = Date.now() + discoveryMs
  while (!signal.aborted && Date.now() < deadline) {
    try {
      const fresh = newHooks(listForwarderHooks(repository, gh), before)
      if (fresh.length > 1)
        log(`Multiple forwarder hooks appeared: ${fresh.join(', ')}; none will be deleted on stop`)
      if (fresh.length > 0) return fresh
    } catch {
      // The next read tries again. The shutdown read reports a failure.
    }
    await sleep(pollMs)
  }
  if (!signal.aborted)
    log(
      `No new forwarder hook appeared within ${discoveryMs} ms. On stop the receiver takes the hooks that are not in its starting list.`,
    )
  return undefined
}

/**
 * Deletes the hook of this receiver after the forwarder stopped and returns the exit code. The
 * candidates are the hooks that discovery `found` together with the hooks of the shutdown list
 * that are not in `before`, kept only when still in the shutdown list. One candidate is deleted.
 * Several candidates are all kept and give 1. When the shutdown list cannot be read, the hook
 * that discovery found alone is still deleted, and the result is 1.
 */
function removeOwnHook(
  args: ServeArgs,
  before: readonly number[],
  found: readonly number[] | undefined,
  code: number,
): number {
  const { repository, gh, log } = args
  let current: number[]
  try {
    current = listForwarderHooks(repository, gh)
  } catch {
    const known = found ?? []
    const left = known.length === 1 ? deleteHooks(repository, known, gh) : known
    log(
      `Cannot list the forwarder hooks. Forwarder hooks left behind: ${left.length > 0 ? left.join(', ') : 'none known'}. Other cli hooks of the repository may remain; check them by hand.`,
    )
    return 1
  }
  const candidates = [...new Set([...(found ?? []), ...newHooks(current, before)])].filter(id =>
    current.includes(id),
  )
  if (candidates.length > 1) {
    log(
      `Cannot tell which of the hooks ${candidates.join(', ')} this receiver created. None deleted. Stop the other receivers, then run the clean command.`,
    )
    return 1
  }
  const leftover = deleteHooks(repository, candidates, gh)
  if (leftover.length > 0) {
    log(`Forwarder hooks left behind: ${leftover.join(', ')}. Delete them by hand.`)
    return 1
  }
  return code
}
