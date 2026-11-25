import type { PortRead } from '@omne-harness/goal'
import { accountCodec, organizationCodec, tenant, tenantCodec } from '@omne-harness/legal-identity'
import type { SessionFailure, WorkSnapshot } from '@omne-harness/session-contract'
import { createGoalSessions, type Called, type SessionCalls } from '../src/index.ts'

const organization = organizationCodec.parse('org_c0nf0rmance000000000000000')
const account = accountCodec.parse('acc_c0nf0rmance000000000000000')
if (!organization.ok || !account.ok) throw new Error('illegal test tenant')
export const LEGAL_TENANT = tenant(organization.value, account.value)
const encoded = tenantCodec.encode(LEGAL_TENANT)
if (!encoded.ok) throw new Error('the test tenant has no text')
export const TENANT = encoded.value
export const SESSION = 'a'.repeat(64)

export function work(change: Partial<WorkSnapshot> = {}): WorkSnapshot {
  return { session: SESSION, lifecycle: 'dormant', ...change } as unknown as WorkSnapshot
}
export const failure = (kind: SessionFailure['kind']): Called<unknown> => ({
  failure: { kind, owner: 'session', diagnostic: kind } as SessionFailure,
})

export function world() {
  const accepted: Parameters<SessionCalls['accept']>[0][] = []
  const state = {
    work: { kind: 'read', value: work() } as PortRead<WorkSnapshot | null>,
    answer: { ok: null } as Called<unknown> | Error,
  }
  const calls: SessionCalls = {
    async accept(input) {
      accepted.push(input)
      if (state.answer instanceof Error) throw state.answer
      return state.answer
    },
    async work() {
      return state.work
    },
  }
  return { sessions: createGoalSessions(calls), accepted, state }
}
