import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import { createServer } from 'node:https'
import type { ServerResponse } from 'node:http'
import { join } from 'node:path'
import { MODEL } from '../src/deployment.ts'

export function deferred() {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>(r => {
    resolve = r
  })
  return { promise, resolve }
}
export interface CapturedLocalRequest {
  readonly body: unknown
  readonly authorization: string | undefined
}
/** HTTPS is the only controlled boundary. Account/storage/source/log/transport stay actual public providers. */
export async function createLocalTls(
  directory: string,
  onReceive: () => Promise<void> = async () => {},
  cacheWrite: number | undefined = 0,
  model: string | ((body: unknown) => string) = MODEL,
  finalUsageJson?: string,
  provider: string = 'DeepInfra',
  /** Reasoning-mode deltas, one SSE frame each; default one `reasoning_content` frame. */
  reasoningDeltas?: readonly Readonly<Record<string, unknown>>[],
) {
  await mkdir(directory, { mode: 0o700 })
  const key = join(directory, 'local-key.pem'),
    cert = join(directory, 'local-cert.pem')
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      cert,
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1,DNS:localhost',
    ],
    { stdio: 'ignore' },
  )
  const certBytes = await readFile(cert)
  const requests: CapturedLocalRequest[] = [],
    received = deferred(),
    contentSent = deferred(),
    socketClosed = deferred()
  const pending = new Set<Promise<void>>()
  const failures: unknown[] = []
  let nextUsageJson: string | null | undefined = finalUsageJson
  let mode: 'complete' | 'reasoning' | 'hold' | 'usage_hold' | 'http503' | 'http503empty' | 'tool' =
      'complete',
    closedSockets = 0,
    held: ServerResponse | undefined
  const server = createServer({ key: await readFile(key), cert: certBytes }, (req, res) => {
    const work = (async () => {
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        assert.ok(Buffer.isBuffer(chunk))
        chunks.push(chunk)
      }
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      const responseModel = typeof model === 'function' ? model(body) : model
      requests.push({ body, authorization: req.headers.authorization })
      await onReceive()
      received.resolve()
      if (mode === 'http503') {
        res.writeHead(503, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'controlled failure', code: 503 } }))
        return
      }
      if (mode === 'http503empty') {
        res.writeHead(503, { 'content-type': 'application/json' })
        res.end()
        return
      }
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'x-request-id': 'independent-upstream-id',
        'set-cookie': ['safe-one=1', 'safe-two=2'],
      })
      if (mode === 'tool') {
        res.end(
          `data: ${JSON.stringify({ id: 'independent-generation', model: responseModel, provider, choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_exact', function: { name: 'example__read', arguments: '{}' } }] }, finish_reason: null }] })}\n\n` +
            `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 9, completion_tokens: 3, total_tokens: 12, prompt_tokens_details: { cached_tokens: 4, cache_write_tokens: 0 }, cost: 0.0000117 } })}\n\ndata: [DONE]\n\n`,
        )
        return
      }
      if (mode === 'reasoning')
        for (const delta of reasoningDeltas ?? [{ reasoning_content: 'private reasoning' }])
          res.write(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: null }] })}\n\n`)
      if (mode === 'usage_hold')
        res.write(
          `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: null }], usage: { prompt_tokens: 9, completion_tokens: 3, total_tokens: 12, prompt_tokens_details: { cached_tokens: 4, cache_write_tokens: 0 }, cost: 0.0000117 } })}\n\n`,
        )
      res.write(
        `data: ${JSON.stringify({ id: 'independent-generation', model: responseModel, provider, choices: [{ delta: { role: 'assistant', content: 'first ' }, finish_reason: null }] })}\n\n`,
      )
      contentSent.resolve()
      if (mode === 'hold' || mode === 'usage_hold') {
        held = res
        return
      }
      await new Promise<void>(resolve => setTimeout(resolve, 15))
      res.write(
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'second' }, finish_reason: null }] })}\n\n`,
      )
      const usage =
        nextUsageJson ??
        JSON.stringify({
          prompt_tokens: 9,
          completion_tokens: 3,
          total_tokens: 12,
          prompt_tokens_details: {
            cached_tokens: 4,
            ...(cacheWrite === undefined ? {} : { cache_write_tokens: cacheWrite }),
          },
          cost: 0.0000117,
        })
      const usageField = nextUsageJson === null ? '' : `,"usage":${usage}`
      res.end(
        `data: {"choices":[{"delta":{},"finish_reason":"stop"}]${usageField}}\n\ndata: [DONE]\n\n`,
      )
    })()
    pending.add(work)
    work.then(
      () => pending.delete(work),
      error => {
        failures.push(error)
        pending.delete(work)
        res.destroy()
      },
    )
  })
  server.on('secureConnection', socket =>
    socket.once('close', () => {
      closedSockets++
      socketClosed.resolve()
    }),
  )
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string')
    throw new Error('local HTTPS address missing')
  return {
    requests,
    failures,
    received,
    contentSent,
    socketClosed,
    developmentTransport: {
      baseUrl: `https://127.0.0.1:${address.port}/api/v1/`,
      tls: { ca: certBytes },
    },
    setMode(value: typeof mode) {
      mode = value
    },
    /** Null omits usage; undefined restores the standard controlled usage frame. */
    setUsageJson(value: string | null | undefined) {
      nextUsageJson = value
    },
    closedSockets: () => closedSockets,
    finishHeld() {
      held?.end('data: [DONE]\n\n')
    },
    async close() {
      server.closeAllConnections()
      await Promise.allSettled([...pending])
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve())),
      )
    },
  }
}
