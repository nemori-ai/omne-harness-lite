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
export const organizationId = 'org_00000000000000000000000000'
export const accountId = 'acc_00000000000000000000000001'
export const ownLoginId = 'lgn_00000000000000000000000002'
export const otherLoginId = 'lgn_00000000000000000000000003'
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
  'protocol-rejected': 400,
  'not-visible': 404,
  'stage-not-provided': 501,
  'not-loginable': 403,
  'not-found': 404,
  conflict: 409,
  unsupported: 501,
  'not-writable': 501,
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
      return (
        governanceAnswer(String(seen.wire['operation']), body) ?? { outcome: 'denied', body: {} }
      )
  }
}

const at = '2026-11-01T12:00:00Z'
/** The configuration time the setting operations answer. */
export const settingAt = '2026-11-09T08:00:00Z'
const invitation = { invitationId: 'inv-1', state: 'open', expiresAt: at }
const emptyOperations = new Set([
  'revoke-login',
  'leave-organization',
  'remove-member',
  'change-member-role',
])

/** A success for each governance operation that is not an account or session step. */
function governanceAnswer(operation: string, body: Record<string, unknown>): Answer | undefined {
  const succeeded = (answer: unknown): Answer => ({ outcome: 'succeeded', body: answer })
  if (emptyOperations.has(operation)) return succeeded({})
  switch (operation) {
    case 'create-organization':
    case 'query-create-organization':
      return succeeded({ organizationId, tenantId: otherTenantText })
    case 'issue-member-invitation':
      return succeeded(invitation)
    case 'accept-member-invitation':
      return succeeded({ invitationId: body['invitationId'], state: 'accepted' })
    case 'reject-member-invitation':
      return succeeded({ invitationId: body['invitationId'], state: 'rejected' })
    case 'withdraw-member-invitation':
      return succeeded({ invitationId: body['invitationId'], state: 'withdrawn' })
    case 'query-invitation':
      return succeeded({ ...invitation, organizationId, invitedAccountId: accountId })
    case 'query-received-invitations':
    case 'query-issued-invitations':
      return succeeded({ invitations: [], completeness: 'complete' })
    case 'query-own-memberships':
      return succeeded({
        memberships: [{ organizationId, tenantId: tenantText, role: 'member' }],
        completeness: 'complete',
      })
    case 'query-organization-members':
      return succeeded({ members: [{ accountId, role: 'member' }], completeness: 'complete' })
    case 'switch-current-tenant':
      return succeeded({ tenantId: body['tenantId'] })
    case 'query-current-tenant':
      return succeeded({ tenantId: tenantText })
    case 'query-own-valid-logins':
      return succeeded({
        logins: [{ loginId: ownLoginId, issuedAt: at, maxDeadline: at, idleDeadline: at }],
        completeness: 'complete',
      })
    case 'list-settings':
      return succeeded({
        items: [
          {
            asset: { category: 'tool', name: 'Web' },
            item: 'exa.apiKey',
            title: 'Exa API key',
            sensitivity: 'secret',
            state: { state: 'usable', tenantId: tenantText, configuredAt: settingAt },
          },
          {
            asset: { category: 'tool', name: 'Web' },
            item: 'maxResults',
            title: 'Search results',
            sensitivity: 'ordinary',
            state: { state: 'not-writable' },
          },
        ],
        completeness: 'complete',
      })
    case 'set-setting':
      return succeeded({ configuredAt: settingAt })
    case 'describe-setting':
      return succeeded({ state: 'usable', tenantId: tenantText, configuredAt: settingAt })
    case 'clear-setting':
      return succeeded({})
    default:
      return undefined
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
