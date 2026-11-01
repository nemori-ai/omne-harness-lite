import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

export const tenantText = JSON.stringify({
  organization: 'org_00000000000000000000000000',
  account: 'acc_00000000000000000000000000',
})
export const otherTenantText = JSON.stringify({
  organization: 'org_00000000000000000000000001',
  account: 'acc_00000000000000000000000001',
})
export const sessionId = '0123456789abcdef'.repeat(4)
export const issuedProof = 'issued-proof-7f3a9c'
export const credentialText = 'correct horse battery staple'

export interface Seen {
  readonly path: string
  readonly headers: Readonly<Record<string, string | string[] | undefined>>
  readonly wire: Record<string, unknown>
}

export interface Answer {
  readonly outcome: string
  readonly body: unknown
}

export interface FakeService {
  readonly origin: string
  readonly port: number
  readonly seen: Seen[]
  close(): Promise<void>
}

const statusOf: Record<string, number> = {
  succeeded: 200,
  'no-change': 200,
  'not-committed': 200,
  invalid: 422,
  'uniform-auth-failure': 401,
  denied: 403,
  'not-loginable': 403,
  'not-found': 404,
  conflict: 409,
  unsupported: 501,
  'basis-unavailable': 503,
  unknown: 500,
}

/** A success for each operation the commands use, in the wire form of the public contract. */
export function defaultAnswer(seen: Seen): Answer {
  const body = (seen.wire['body'] ?? {}) as Record<string, unknown>
  switch (seen.wire['operation']) {
    case 'register-and-activate':
      return {
        outcome: 'succeeded',
        body: {
          accountId: 'acc_00000000000000000000000000',
          organizationId: 'org_00000000000000000000000000',
          tenantId: tenantText,
        },
      }
    case 'issue-login':
      return {
        outcome: 'succeeded',
        body: {
          loginIdentifier: body['loginIdentifier'],
          issuedAt: '2026-11-01T12:00:00Z',
          tenantId: tenantText,
          loginProof: issuedProof,
        },
      }
    case 'create-session':
      return { outcome: 'succeeded', body: { session: sessionId, recovered: false } }
    case 'send-input':
      return { outcome: 'succeeded', body: { recovered: false } }
    case 'cancel-run':
      return {
        outcome: 'succeeded',
        body: { kind: 'requested', controlId: body['controlId'], run: body['run'] },
      }
    case 'stop-call':
      return {
        outcome: 'succeeded',
        body: { kind: 'requested', controlId: body['controlId'], producer: body['producer'] },
      }
    default:
      return { outcome: 'denied', body: {} }
  }
}

/** A real HTTP server on 127.0.0.1 that answers the commands' operations as the public contract writes them. */
export async function startFakeService(
  answer: (seen: Seen) => Answer = defaultAnswer,
): Promise<FakeService> {
  const seen: Seen[] = []
  const server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const wire = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
      const item: Seen = { path: request.url ?? '', headers: request.headers, wire }
      seen.push(item)
      const reply = answer(item)
      const version = String(wire['protocolVersion'])
      response.writeHead(statusOf[reply.outcome] ?? 200, {
        'content-type': 'application/json; charset=utf-8',
      })
      response.end(
        JSON.stringify({
          protocolVersion: version,
          messageId: wire['messageId'],
          outcome: reply.outcome,
          body: reply.body,
        }),
      )
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    origin: `http://127.0.0.1:${port}`,
    port,
    seen,
    close: () =>
      new Promise<void>(resolve => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}

/** A port that nothing listens on. */
export async function closedPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  await new Promise<void>(resolve => server.close(() => resolve()))
  return port
}
