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
  readonly operation: string
  readonly messageId: string
  readonly headers: Readonly<Record<string, string | string[] | undefined>>
  readonly body: Record<string, unknown>
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
  limited: 429,
  archived: 409,
  frozen: 409,
  'not-loginable': 403,
  'not-found': 404,
  conflict: 409,
  unsupported: 501,
  'not-writable': 501,
  'basis-unavailable': 503,
  unknown: 500,
}

export function defaultAnswer(seen: Seen): Answer {
  const { body } = seen
  switch (seen.operation) {
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
          loginId: ownLoginId,
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
      return governanceAnswer(seen.operation, body) ?? { outcome: 'denied', body: {} }
  }
}

const at = '2026-11-01T12:00:00Z'
export const settingRevision = '3'
const declaration = {
  title: 'Exa API key',
  purpose: 'Search the web',
  appliesAt: 'next call',
  clearEffect: 'search stops',
}
export const secretView = {
  kind: 'secret',
  asset: { category: 'tool', name: 'Web' },
  item: 'exa.apiKey',
  revision: settingRevision,
  declaration,
  own: 'available',
  official: 'unset',
  editable: { kind: 'yes' },
}
export const ordinaryView = {
  kind: 'ordinary',
  asset: { category: 'tool', name: 'Web' },
  item: 'maxResults',
  revision: '0',
  declaration: { ...declaration, title: 'Search results' },
  valueSchema: { type: 'integer' },
  default: { kind: 'unset' },
  own: { kind: 'unset' },
  effective: { value: { kind: 'unset' }, source: null },
  lockedBy: null,
  editable: { kind: 'no', reason: 'locked' },
}
const invitation = { invitationId: 'inv-1', state: 'open', expiresAt: at }
const emptyOperations = new Set([
  'revoke-login',
  'leave-organization',
  'remove-member',
  'change-member-role',
])

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
      return succeeded({ items: [secretView, ordinaryView], next: null, completeness: 'complete' })
    case 'describe-setting':
      return succeeded({ item: secretView })
    case 'set-setting':
    case 'clear-setting':
      return succeeded({ revision: String(Number(settingRevision) + 1) })
    default:
      return undefined
  }
}

const PATH = /^\/api\/[^/]+\/v1\/([^/]+)$/
const PROBE = '/probe'

const fetchFailure = (url: string): Promise<unknown> =>
  fetch(url, { method: 'POST' }).then(
    () => undefined,
    (error: unknown) => error,
  )

function refusalCode(error: unknown): unknown {
  const cause = error instanceof Error ? error.cause : undefined
  return typeof cause === 'object' && cause !== null && 'code' in cause ? cause.code : undefined
}

export async function startFakeService(
  answer: (seen: Seen) => Answer = defaultAnswer,
): Promise<FakeService> {
  for (;;) {
    const service = await listenFakeService(answer)
    if ((await fetchFailure(`${service.origin}${PROBE}`)) === undefined) return service
    await service.close()
  }
}

async function listenFakeService(answer: (seen: Seen) => Answer): Promise<FakeService> {
  const seen: Seen[] = []
  const server = createServer((request, response) => {
    if (request.url === PROBE) {
      request.resume()
      response.end()
      return
    }
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      const path = request.url ?? ''
      const item: Seen = {
        path,
        operation: PATH.exec(path)?.[1] ?? '',
        messageId: String(request.headers['omne-message-id']),
        headers: request.headers,
        body: JSON.parse(text) as Record<string, unknown>,
      }
      seen.push(item)
      const reply = answer(item)
      response.writeHead(statusOf[reply.outcome] ?? 200, {
        'content-type': 'application/json; charset=utf-8',
      })
      response.end(JSON.stringify({ outcome: reply.outcome, body: reply.body }))
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

const NEVER_ASSIGNED_PORTS = [2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18]

export async function closedPort(): Promise<number> {
  for (const port of NEVER_ASSIGNED_PORTS) {
    const failure = await fetchFailure(`http://127.0.0.1:${port}${PROBE}`)
    if (refusalCode(failure) === 'ECONNREFUSED') return port
  }
  throw new Error('no port below 1024 refuses a connection on this host')
}
