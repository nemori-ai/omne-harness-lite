// Fixtures of the session diagnostics scenarios (#1140 A5): a scripted local Model gateway and the
// reads of `omne read-session-diagnostics` as a process. No vitest import.
//
// The gateway is a real HTTPS server on 127.0.0.1 with a self-signed certificate, as
// `tests/fixtures/model-gateway.ts` (R2-D258: a test never sends a Model call to a real supplier).
// It differs in one thing: an answer may be `hold`, which keeps the request open until `release`.
// The capacity scenario needs that: the first call of the tenant must hold its share of the
// result capacity while the second call is admitted.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { createServer } from 'node:https'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bodyOf, type CliRun } from '../../r9/support.ts'

export const GATEWAY_PATH = '/api/v1/chat/completions'

/** The error body of an upstream that timed out: HTTP 504 on the streaming request. */
export const UPSTREAM_504_BODY = JSON.stringify({
  error: { message: 'local test gateway: upstream timed out', code: 504 },
})

export type GatewayReply = Readonly<{
  kind: 'answer'
  status: number
  contentType: string
  body: string
}>
export type ScenarioAnswer = GatewayReply | Readonly<{ kind: 'hold' }>

export const answer504: GatewayReply = Object.freeze({
  kind: 'answer',
  status: 504,
  contentType: 'application/json',
  body: UPSTREAM_504_BODY,
})

/** Answers request `index` (0 for the first) with its JSON body text. */
export type ScenarioScript = (request: Readonly<{ index: number; body: string }>) => ScenarioAnswer

export type ScenarioGateway = Readonly<{
  /** The `https:` route URL on 127.0.0.1. */
  url: string
  /** The PEM certificate file, for `NODE_EXTRA_CA_CERTS` of the `serve` child. */
  certPath: string
  /** How many requests reached the gateway. */
  received(): number
  /** How many requests are held open right now. */
  held(): number
  /** Writes `answer` to every held request. */
  release(answer: GatewayReply): void
  /** Stops the server, releases every held request with 504, deletes the certificate. */
  close(): Promise<void>
}>

function certificate(directory: string): { keyPath: string; certPath: string } {
  const keyPath = join(directory, 'key.pem')
  const certPath = join(directory, 'cert.pem')
  // The child gets the inherited environment without the repository's BASELINE override.
  const { BASELINE: _inherited, ...env } = process.env
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:P-256',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      certPath,
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
    ],
    { env, stdio: 'ignore' },
  )
  return { keyPath, certPath }
}

export async function startScenarioGateway(script: ScenarioScript): Promise<ScenarioGateway> {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'harness-diagnostics-gateway-')))
  const { keyPath, certPath } = certificate(directory)
  let count = 0
  const held = new Set<ServerResponse>()
  const write = (response: ServerResponse, reply: GatewayReply): void => {
    response.writeHead(reply.status, { 'content-type': reply.contentType })
    response.end(reply.body)
  }
  const server = createServer(
    { key: readFileSync(keyPath), cert: readFileSync(certPath) },
    (request, response) => {
      const index = count
      count += 1
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => chunks.push(chunk))
      request.on('end', () => {
        const reply = script({ index, body: Buffer.concat(chunks).toString('utf8') })
        if (reply.kind === 'hold') {
          held.add(response)
          response.on('close', () => held.delete(response))
          return
        }
        write(response, reply)
      })
    },
  )
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const { port } = server.address() as AddressInfo
  const release: ScenarioGateway['release'] = reply => {
    const pending = Array.from(held)
    held.clear()
    for (const response of pending) write(response, reply)
  }
  return {
    url: `https://127.0.0.1:${String(port)}${GATEWAY_PATH}`,
    certPath,
    received: () => count,
    held: () => held.size,
    release,
    close: async () => {
      release(answer504)
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
      rmSync(directory, { recursive: true, force: true })
    },
  }
}

export type Cli = (args: readonly string[], credential?: string) => Promise<CliRun>

export type DiagnosticsBody = Readonly<{
  runs: readonly Record<string, unknown>[]
  gaps: readonly Readonly<{ source: string; subject: string; reason: string }>[]
  complete: boolean
}>

/** The `--json` body of one complete read, or undefined when the read did not succeed. */
export function diagnosticsBodyOf(read: CliRun): DiagnosticsBody | undefined {
  if (read.status !== 0) return undefined
  const body = bodyOf(read)
  if (!Array.isArray(body['runs']) || !Array.isArray(body['gaps'])) return undefined
  return body as DiagnosticsBody
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** The one Run of a session whose diagnostics show it ended, or the evidence why not after `timeoutMs`. */
export async function untilRunEnded(
  cli: Cli,
  session: string,
  timeoutMs: number,
): Promise<Readonly<{ run: Record<string, unknown>; body: DiagnosticsBody }>> {
  const deadline = Date.now() + timeoutMs
  let last: CliRun | undefined
  for (;;) {
    last = await cli(['read-session-diagnostics', '--session', session, '--json'])
    const body = diagnosticsBodyOf(last)
    const run = body?.runs[0]
    if (body !== undefined && run !== undefined && run['terminal'] !== null) return { run, body }
    if (Date.now() > deadline) break
    await sleep(500)
  }
  throw new Error(
    `the Run of session ${session} did not end within ${String(timeoutMs)} ms; last read: status ${String(last.status)}\nstdout:\n${last.stdout}\nstderr:\n${last.stderr}`,
  )
}

/** The `terminal.cause.structured` of a projected Run. */
export function structuredCauseOf(run: Record<string, unknown>): unknown {
  const terminal = run['terminal'] as { cause?: { structured?: unknown } } | null
  return terminal?.cause?.structured
}

/** The model calls of a projected Run. */
export function modelCallsOf(run: Record<string, unknown>): Record<string, unknown>[] {
  const calls = run['modelCalls']
  return Array.isArray(calls) ? (calls as Record<string, unknown>[]) : []
}
