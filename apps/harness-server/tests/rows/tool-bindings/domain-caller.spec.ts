import { describe, expect, it } from 'vitest'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { SESSION_WORK_OWNER } from '../../../src/rows/authorization/principals.ts'
import { domainCallerOf } from '../../../src/rows/tool-bindings/domain-caller.ts'
import { SESSION_WORK_COMPONENT } from '../../../src/rows/tool-runtime/session-work.ts'

const tenantOf = (account: string): TenantId => {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: `org_${'a'.repeat(26)}`, account: `acc_${account.repeat(26)}` }),
  )
  if (!parsed.ok) throw new Error('fixture tenant')
  return parsed.value
}
const A = tenantOf('1')
const B = tenantOf('2')
const work = (
  tenant: TenantId,
  owner = SESSION_WORK_OWNER,
  component = SESSION_WORK_COMPONENT,
) => ({
  kind: 'acting-for-tenant',
  actor: { kind: 'system', component },
  tenant,
  work: { owner, work: 'session-1' },
})
const verifier = (
  answer: Awaited<ReturnType<PrincipalVerifier['verify']>> | Error,
): PrincipalVerifier =>
  ({
    async verify() {
      if (answer instanceof Error) throw answer
      return answer
    },
  }) as unknown as PrincipalVerifier

describe('domainCallerOf: who a domain tool call acts for', () => {
  it('names the call tenant and account as owner, and the session agent as actor', async () => {
    const caller = await domainCallerOf(
      verifier({ kind: 'verified', principal: work(A) } as never),
      work(A),
      A,
    )
    expect(caller).toMatchObject({
      tenantId: tenantCodec.encode(A).ok ? (tenantCodec.encode(A) as { value: string }).value : '',
      ownerId: `acc_${'1'.repeat(26)}`,
      session: 'session-1',
    })
    expect(caller?.principalRef).toMatch(/^principal\/1\//)
    expect(caller?.actorRef).toBe(caller?.principalRef)
  })

  it.each([
    ['no verifier', undefined],
    ['a verifier that throws', verifier(new Error('down'))],
    ['an unverified principal', verifier({ kind: 'rejected' } as never)],
    [
      'a work principal of another tenant',
      verifier({ kind: 'verified', principal: work(B) } as never),
    ],
    [
      'a login principal',
      verifier({ kind: 'verified', principal: work(A, 'identity-login') } as never),
    ],
    [
      'another component',
      verifier({ kind: 'verified', principal: work(A, SESSION_WORK_OWNER, 'other') } as never),
    ],
  ])('answers nothing for %s', async (_, given) => {
    expect(await domainCallerOf(given, work(A), A)).toBeUndefined()
  })
})
