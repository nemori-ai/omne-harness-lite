// Tool 运行时组的来源资格（`sourceAuthority`）：组合用例里外租户先被准入核验拒绝，这里单独守第二道——
// 来源资格只认本租户、经核验的会话工作主体，consumer 只认 Agent 的动作位置；核验器缺席答 unavailable，不放行。
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { PrincipalIssuer } from '@omne-harness/identity'
import { principalIssuerKey } from '@omne-harness/identity/cordis'
import type { ConsumerRef } from '@omne-harness/tool-contract'
import { sessionWorkIssuerOf } from '../../../src/entry/principals.ts'
import type { ToolRuntimeHolder } from '../../../src/rows/tool-runtime/holder.ts'
import { createReleaseToolIdentity } from '../../../src/rows/tool-runtime/access.ts'
import { fixtureTenant, okOf } from '../../entry/support.ts'
import { releaseFixture } from '../tool-host/support.ts'

const TENANT_A = fixtureTenant('a')
const TENANT_B = fixtureTenant('b')
const AGENT_ACTION = {
  owner: '@omne-harness/agent',
  work: 'exec-access',
  position: 'p-1',
  purpose: 'action',
} as unknown as ConsumerRef
// The holder's session work source is not read by the source authority.
const holder = { workPrincipals: () => undefined } as unknown as ToolRuntimeHolder

async function world() {
  const fixture = await releaseFixture()
  const issue = sessionWorkIssuerOf(fixture.env)
  return {
    fixture,
    principalA: okOf(issue({ tenant: TENANT_A, session: 'ses-a' }), 'issue A'),
    principalB: okOf(issue({ tenant: TENANT_B, session: 'ses-b' }), 'issue B'),
  }
}

describe('release Tool source authority', () => {
  it('allows a verified session work principal of the tenant for the Agent action consumer', async () => {
    const { fixture, principalA } = await world()
    const { sourceAuthority } = createReleaseToolIdentity(fixture.root, holder)
    expect(
      await sourceAuthority.qualify({
        principal: principalA,
        tenant: TENANT_A,
        consumer: AGENT_ACTION,
      }),
    ).toEqual({ kind: 'allowed' })
  })

  it('denies a verified principal of another tenant', async () => {
    const { fixture, principalB } = await world()
    const { sourceAuthority } = createReleaseToolIdentity(fixture.root, holder)
    expect(
      await sourceAuthority.qualify({
        principal: principalB,
        tenant: TENANT_A,
        consumer: AGENT_ACTION,
      }),
    ).toEqual({ kind: 'denied', reason: 'foreign-tenant' })
  })

  it('refuses a verified principal that names a session but was issued for another component (N3)', async () => {
    const { fixture } = await world()
    const issuer = fixture.env
      .readTrusted(principalIssuerKey)
      .get(principalIssuerKey) as PrincipalIssuer
    const actor = okOf(issuer.issueSystem({ component: 'notSessionWork' }), 'actor')
    const other = okOf(
      issuer.issueActingForTenant({
        actor,
        tenant: TENANT_A,
        work: { owner: 'session', work: 'ses-a' },
      }),
      'principal',
    )
    const identity = createReleaseToolIdentity(fixture.root, holder)
    expect(
      await identity.sourceAuthority.qualify({
        principal: other,
        tenant: TENANT_A,
        consumer: AGENT_ACTION,
      }),
    ).toEqual({ kind: 'denied', reason: 'not-a-session-work-principal' })
    expect(await identity.subjects.project(other)).toMatchObject({ failure: { kind: 'denied' } })
    expect(await identity.sessionOf(other, TENANT_A)).toBeUndefined()
  })

  it('denies a consumer that is not the Agent action position', async () => {
    const { fixture, principalA } = await world()
    const { sourceAuthority } = createReleaseToolIdentity(fixture.root, holder)
    expect(
      await sourceAuthority.qualify({
        principal: principalA,
        tenant: TENANT_A,
        consumer: { ...AGENT_ACTION, purpose: 'observe' } as ConsumerRef,
      }),
    ).toEqual({ kind: 'denied', reason: 'not-an-agent-action-consumer' })
  })

  it('answers unavailable when the principal verifier is absent', async () => {
    const { principalA } = await world()
    const empty = { get: () => undefined } as unknown as Context
    const { sourceAuthority } = createReleaseToolIdentity(empty, holder)
    expect(
      await sourceAuthority.qualify({
        principal: principalA,
        tenant: TENANT_A,
        consumer: AGENT_ACTION,
      }),
    ).toMatchObject({ kind: 'unavailable' })
  })
})
