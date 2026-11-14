import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import { createServer } from 'node:https'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bodyOf, type CliRun } from '../../r9/support.ts'

export const GATEWAY_PATH = '/api/v1/chat/completions'

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

export type ScenarioScript = (request: Readonly<{ index: number; body: string }>) => ScenarioAnswer

export type ScenarioGateway = Readonly<{
  url: string
  certPath: string
  received(): number
  held(): number
  release(answer: GatewayReply): void
  close(): Promise<void>
}>

function certificate(directory: string): { keyPath: string; certPath: string } {
  const keyPath = join(directory, 'key.pem')
  const certPath = join(directory, 'cert.pem')
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

export function diagnosticsBodyOf(read: CliRun): DiagnosticsBody | undefined {
  if (read.status !== 0) return undefined
  const body = bodyOf(read)
  if (!Array.isArray(body['runs']) || !Array.isArray(body['gaps'])) return undefined
  return body as DiagnosticsBody
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

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

export function structuredCauseOf(run: Record<string, unknown>): unknown {
  const terminal = run['terminal'] as { cause?: { structured?: unknown } } | null
  return terminal?.cause?.structured
}

export function modelCallsOf(run: Record<string, unknown>): Record<string, unknown>[] {
  const calls = run['modelCalls']
  return Array.isArray(calls) ? (calls as Record<string, unknown>[]) : []
}
