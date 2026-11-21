import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import { accountCodec, organizationCodec, tenant, tenantCodec } from '@omne-harness/legal-identity'
import type { UsageFailure } from '@omne-harness/usage-contract'
import { parseInstant } from '@omne-harness/utc-instant'
import { createUsageContribution } from '../../src/contribution.ts'
import type { UsageFace, UsagePrincipals } from '../../src/ports.ts'

const SUFFIX = 'abcdefghjkmnpqrstvwxyz2345'
const parsed = <T>(read: { ok: true; value: T } | { ok: false }): T => {
  if (!read.ok) throw new Error('fixture identity did not parse')
  return read.value
}
export const TENANT = tenant(
  parsed(organizationCodec.parse(`org_${SUFFIX}`)),
  parsed(accountCodec.parse(`acc_${SUFFIX}`)),
)
const encoded = tenantCodec.encode(TENANT)
if (!encoded.ok) throw new Error('fixture tenant did not encode')
export const TENANT_TEXT = encoded.value
export const LOGIN = { login: 'login-a' } as unknown as LoginIdentity
export const PRINCIPAL = { principal: 'acting-a' } as unknown as Principal

export type Refusal = 'denied' | 'basis-unavailable' | 'throw'
export type Reply = { ok: unknown } | { failure: UsageFailure } | 'throw'

export function createWorld() {
  const asks: Readonly<{ login: LoginIdentity; tenant: string }>[] = []
  const calls: Readonly<{ read: string; input: unknown }>[] = []
  const state: { refusal?: Refusal; face: boolean; reply: Reply } = {
    face: true,
    reply: { ok: null },
  }
  const principals: UsagePrincipals = {
    async actingFor(login, tenantText) {
      asks.push({ login, tenant: tenantText })
      if (state.refusal === 'throw') throw new Error('identity fault')
      if (state.refusal !== undefined) return { refused: state.refusal }
      return { ok: PRINCIPAL }
    },
  }
  const answer = (read: string) => async (input: unknown) => {
    calls.push({ read, input })
    if (state.reply === 'throw') throw new Error('usage fault')
    return state.reply as never
  }
  const face: UsageFace = {
    query: answer('query'),
    records: answer('records'),
    occupancy: answer('occupancy'),
  }
  const contribution = createUsageContribution({
    usage: () => (state.face ? face : undefined),
    principals,
  })
  return { asks, calls, state, principals, face, contribution }
}

const at = (text: string) => {
  const parsed = parseInstant(text)
  if (!parsed.ok) throw new Error('fixture instant')
  return parsed.value
}
export const SESSION = 'a'.repeat(64)
const range = { from: at('2026-11-19T00:00:00Z'), to: at('2026-11-20T00:00:00Z') }
export const BODIES = {
  'query-usage': {
    tenant: TENANT,
    scope: { kind: 'session', session: SESSION },
    range,
    zone: 'Asia/Shanghai',
    bucket: 'day',
    groupBy: ['model'],
  },
  'list-usage-records': {
    tenant: TENANT,
    scope: { kind: 'tenant' },
    range,
    after: null,
    limit: 10,
  },
  'read-context-occupancy': { tenant: TENANT, session: SESSION },
} as const
