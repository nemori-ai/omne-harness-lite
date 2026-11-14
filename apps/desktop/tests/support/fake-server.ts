import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import {
  createInProcessTransport,
  type CallReport,
  type Credentials,
  type ObserveEnd,
  type ObserveRequest,
} from '@omne-harness/sdk/core'
import type { ServerConnector } from '../../src/main-core/index.ts'

export const TENANT_TEXT = JSON.stringify({
  organization: 'org_00000000000000000000000000',
  account: 'acc_00000000000000000000000000',
})
export const LOGIN_ID = 'lgn_00000000000000000000000002'
export const PROOF_SENTINEL = 'proof-SENTINEL-4f1c9a7e'

export function value(plain: unknown): JsonValue {
  const read = readJsonText(JSON.stringify(plain), {
    maxBytes: 1 << 20,
    maxDepth: 64,
    maxItems: 10_000,
    maxMembers: 1_000,
    maxStringLength: 1 << 20,
    maxNumberLength: 64,
  })
  if (read.kind !== 'ok') throw new Error('not JSON')
  return read.value
}

export const plain = (json: JsonValue): unknown => JSON.parse(writeJsonText(json))

export const answered = (outcome: string, body: unknown = {}): CallReport => ({
  kind: 'answered',
  outcome,
  body: value(body),
})

export const issued = (): CallReport =>
  answered('succeeded', {
    loginIdentifier: 'alice',
    issuedAt: '2026-11-13T06:00:00Z',
    tenantId: TENANT_TEXT,
    loginProof: PROOF_SENTINEL,
    loginId: LOGIN_ID,
  })

export type Seen = {
  readonly target: string
  readonly credentials: Credentials
  readonly body: unknown
}

type Answer = (seen: Seen) => CallReport | Promise<CallReport>
type Stream = (
  request: ObserveRequest,
  seen: Seen,
) => AsyncGenerator<JsonValue, ObserveEnd, undefined>

export type FakeServer = {
  readonly connect: ServerConnector
  readonly seen: Seen[]
  answer(target: string, answer: Answer): void
  stream(target: string, stream: Stream): void
}

const DEFAULTS: Readonly<Record<string, Answer>> = {
  'identity/v1 issue-login': () => issued(),
  'identity/v1 revoke-login': () => answered('succeeded'),
  'identity/v1 query-current-tenant': () => answered('succeeded', { tenantId: TENANT_TEXT }),
}

export function fakeServer(): FakeServer {
  const seen: Seen[] = []
  const answers = new Map<string, Answer>()
  const streams = new Map<string, Stream>()
  const connect: ServerConnector = credentials =>
    createInProcessTransport({
      async call(request) {
        const target = `${request.protocol.name}/v${request.protocol.major} ${request.operation}`
        const record = { target, credentials, body: plain(request.body) }
        seen.push(record)
        const answer = answers.get(target) ?? DEFAULTS[target] ?? (() => answered('succeeded'))
        return answer(record)
      },
      async *observe(request) {
        const target = `${request.protocol.name}/v${request.protocol.major} ${request.observation}`
        const record = { target, credentials, body: plain(request.open) }
        seen.push(record)
        const stream = streams.get(target)
        if (stream === undefined) return { kind: 'refused', outcome: 'basis-unavailable' }
        return yield* stream(request, record)
      },
    })
  return {
    connect,
    seen,
    answer: (target, answer) => answers.set(target, answer),
    stream: (target, stream) => streams.set(target, stream),
  }
}

export function gate<T>(): { readonly promise: Promise<T>; readonly open: (value: T) => void } {
  let open!: (value: T) => void
  const promise = new Promise<T>(resolve => {
    open = resolve
  })
  return { promise, open }
}

export const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))
