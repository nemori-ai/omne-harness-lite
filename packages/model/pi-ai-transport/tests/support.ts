import { imagePreparation } from './image-transport-support.ts'
import { testDefinitions } from './definitions.ts'
import { syntheticInputMeter } from './synthetic-input-meter.ts'
import { createServer, type Server, type ServerOptions } from 'node:https'
import type { ServerResponse, IncomingHttpHeaders } from 'node:http'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import { judgeMessage, type Message } from '@omne-harness-lite/messages'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import {openRouterCredentialRedactionConfig} from '@omne-harness-lite/model-request-runtime'
import type {PlanInput, InvocationPolicy, InvocationOutcome} from '@omne-harness-lite/model-request-runtime'
import {createPiAiTransport, type PiAiTransport} from '@omne-harness-lite/pi-ai-transport'
import {type PlannedRequest, type TransportPolicy, type ModelDefinition} from '@omne-harness-lite/model-request-runtime'
import { type Diagnostic } from '@omne-harness-lite/model-request-runtime'

export const at = '2026-09-27T01:00:00Z'
export function message(type = 'user', text = 'hello', id = type): Message {
  const raw = {
    type,
    id,
    createdAt: at,
    blocks: [
      { id: `${id}_text`, kind: 'text', text, visibility: { toHuman: true, toModel: true } },
    ],
    ...(type === 'system_reminder'
      ? { nature: 'event', source: { kind: 'attempt_started', attempt: 1, reason: 'first', at } }
      : {}),
    ...(type === 'compaction' ? { silenced: [] } : {}),
  }
  return judgedMessage(raw)
}
export function judgedMessage(raw: unknown): Message {
  const judged = judgeMessage(raw)
  if ('rejected' in judged) throw new Error(`fixture: ${judged.rejected}`)
  return judged.ok
}
export function input(anthropic = false): PlanInput {
  const definition = testDefinitions[anthropic ? 1 : 0]
  if (!definition) throw new Error('missing pilot definition')
  return {
    calibration: { kind: 'none' as const, reason: 'no_observation' as const },
    outputHistory: [],
    tokenMargin: { multiplier: 1, reserveTokens: 0 },
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier('model-call-1', 'ModelCallId')),
      dispatch: 1,
    },
    routeName: definition.modelId,
    provider: anthropic ? 'anthropic' : 'openai',
    parameters: { maxOutputTokens: 128 },
    tools: [],
    messages: [
      message('system', 'instruction'),
      message('system_reminder', 'keep going'),
      message('user'),
    ],
    snapshot: {
      adaptation: {
        implementation: definition.implementation,
        definition: { modelId: definition.modelId, revision: definition.revision },
        configuration: {
          revision: 'c1',
          values: {
            cache: anthropic
              ? {
                  mode: 'explicit',
                  ttl: '1h',
                  breakpoints: ['system', 'last_tool', 'last_message'],
                }
              : { mode: 'automatic' },
          },
        },
      },
      providers: [anthropic ? 'anthropic' : 'openai'],
      allowFallback: false,
      inputModalities: definition.capabilities.inputModalities,
      outputModalities: definition.capabilities.outputModalities,
      maxInputTokens: definition.capabilities.maxInputTokens,
      maxOutputTokens: definition.capabilities.maxOutputTokens,
      inputConstraints: definition.capabilities.inputConstraints,
      upstreamInputLimits: definition.capabilities.upstreamInputLimits,
      updatedAt: at,
    },
  }
}
export const networkPolicy: TransportPolicy = {
  maxConnections: 2,
  idleConnectionTimeoutMs: 60000,
  connectTimeoutMs: 5000,
  maxErrorBodyBytes: 4096,
  maxSseEventBytes: 16384,
  credentialRedaction: openRouterCredentialRedactionConfig,
}
export function policy(): InvocationPolicy {
  return {
    now: () => new Date().toISOString(),
    schedule: (ms, fn) => {
      const timer = setTimeout(fn, ms)
      return () => clearTimeout(timer)
    },
    firstContentTimeoutMs: 3000,
    idleContentTimeoutMs: 3000,
    statusCauseTable: {
      '401': 'credential_unavailable',
      '429': 'upstream_unavailable',
      '503': 'upstream_unavailable',
      '400': 'request_rejected',
    },
    credentialRedaction: openRouterCredentialRedactionConfig,
    diagnostic: () => {},
  }
}
export async function planned(
  transport: PiAiTransport,
  request = input(),
): Promise<PlannedRequest> {
  const result = await transport.plan(request, { signal: new AbortController().signal })
  if ('rejected' in result) throw new Error(`plan: ${result.rejected}`)
  return result.planned
}
export function invocation(result: InvocationOutcome) {
  if (!('outcome' in result))
    throw new Error(`unexpected pre-send branch ${JSON.stringify(result)}`)
  return result
}
export function sse(frame: unknown, lineEnding = '\n'): string {
  return `data: ${typeof frame === 'string' ? frame : writeJsonLossless(frame)}${lineEnding}${lineEnding}`
}
export const finish = (reason = 'stop') =>
  sse({ choices: [{ delta: {}, finish_reason: reason }] }) + sse('[DONE]')
export const content = (value: string) => sse({ choices: [{ delta: { content: value } }] })
export interface CapturedRequest {
  readonly path: string | undefined
  readonly method: string | undefined
  readonly headers: IncomingHttpHeaders
  readonly body: string
}
export type Handler = (res: ServerResponse, request: CapturedRequest) => unknown
export function certificate(): { tls: ServerOptions; dispose: () => void } {
  const directory = mkdtempSync(join(tmpdir(), 'omne-model-https-'))
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      join(directory, 'key.pem'),
      '-out',
      join(directory, 'cert.pem'),
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1,DNS:localhost',
    ],
    { stdio: 'ignore' },
  )
  return {
    tls: {
      key: readFileSync(join(directory, 'key.pem')),
      cert: readFileSync(join(directory, 'cert.pem')),
    },
    dispose: () => rmSync(directory, { recursive: true, force: true }),
  }
}
export async function fixture(
  cert: ServerOptions,
  handler: Handler,
  overrides: Partial<TransportPolicy> = {},
  onDiagnostic?: (event: Diagnostic) => void,
  definitions: readonly ModelDefinition[] = testDefinitions,
) {
  const requests: CapturedRequest[] = []
  let closedSockets = 0
  const server: Server = createServer(cert, (req, res) => {
    void (async () => {
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        if (Buffer.isBuffer(chunk)) chunks.push(chunk)
        else throw new Error('unexpected body chunk')
      }
      const captured = {
        path: req.url,
        method: req.method,
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }
      requests.push(captured)
      await handler(res, captured)
    })().catch(() => res.destroy())
  })
  server.on('secureConnection', socket =>
    socket.once('close', () => {
      closedSockets++
    }),
  )
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('missing HTTPS address')
  const inputMeters = definitions.flatMap(definition =>
    Object.keys(definition.routes).map(provider => syntheticInputMeter(definition, provider)),
  )
  const transport = createPiAiTransport({
    imagePreparation,
    definitions,
    inputMeters,
    baseUrl: `https://127.0.0.1:${address.port}/api/v1/`,
    tls: { ca: cert.cert },
    policy: { ...networkPolicy, ...overrides },
    ...(onDiagnostic ? { onDiagnostic } : {}),
  })
  return {
    requests,
    transport,
    options: {
      imagePreparation,
      inputMeters,
      baseUrl: `https://127.0.0.1:${address.port}/api/v1/`,
      tls: { ca: cert.cert },
      policy: { ...networkPolicy, ...overrides },
    },
    closedSockets: () => closedSockets,
    close: async () => {
      await transport.close()
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve())),
      )
    },
  }
}
