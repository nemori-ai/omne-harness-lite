// The three agent instance rows of the matrix (SPEC AU-12): the agent host maintenance principal
// publishes, quiesces and withdraws instances in the tenant branch with fixed arguments. Which
// system principal passes is decided by the grant record alone, never by the component text.
import { describe, expect, it } from 'vitest'
import {
  effectiveArgumentsOf,
  noArguments,
  type MaintenanceGrantSource,
  type SystemActionRequest,
} from '@omne-harness/authorization'
import type { SystemPrincipal } from '@omne-harness/identity'
import { grantOf, installed, requestFor, row } from './system-support.ts'

const AGENT_INSTANCE_PURPOSES = [
  'agent-instance-publish',
  'agent-instance-quiesce',
  'agent-instance-withdraw',
] as const
const OPERATIONS = ['publish', 'quiesce', 'withdraw'] as const

/** A grant source that holds one record: the agent host, with the three agent instance purposes. */
function hostOnlyGrants(): MaintenanceGrantSource {
  return {
    read: input =>
      Promise.resolve(
        input.principal.component === 'agent-host'
          ? { kind: 'found', grant: grantOf([...AGENT_INSTANCE_PURPOSES]) }
          : { kind: 'none' },
      ),
  }
}

function hostAnd(component: string) {
  const base = installed()
  const host = base.principals.authority.issuer.issueSystem({ component: 'agent-host' })
  const other = base.principals.authority.issuer.issueSystem({ component })
  if ('failure' in host || 'failure' in other) throw new Error('fixture principal did not issue')
  const withGrants = (grants: MaintenanceGrantSource | null) =>
    installed({ verifier: base.principals.authority.verifier, grants }).authorization
  return { host: host.ok, other: other.ok, withGrants }
}

const request = (principal: SystemPrincipal, name: (typeof OPERATIONS)[number]) =>
  requestFor(principal, row(name))

describe('the agent instance rows', () => {
  it.each(OPERATIONS)('binds %s to the tenant branch of an agent instance', name => {
    const { host } = hostAnd('restart-scanner')
    const value: SystemActionRequest = request(host, name)
    expect(value.operation).toEqual({ owner: 'agent', name })
    expect(value.target.kind).toBe('tenant')
    expect(value.target.resource).toMatchObject({ owner: 'agent', kind: 'instance' })
    expect(value.arguments).toEqual(noArguments())
  })

  it.each(OPERATIONS)('allows the agent host to %s when its grant record exists', async name => {
    const { host, withGrants } = hostAnd('restart-scanner')
    const decision = await withGrants(hostOnlyGrants()).check(request(host, name))
    expect(decision.kind).toBe('allowed')
  })

  it.each(OPERATIONS)('is unavailable for %s when no grant source is installed', async name => {
    const { host, withGrants } = hostAnd('restart-scanner')
    const decision = await withGrants(null).check(request(host, name))
    expect(decision).toEqual({
      kind: 'unavailable',
      diagnostic: 'no maintenance grant source is installed',
    })
  })

  it.each(OPERATIONS)('denies another system principal %s for a missing grant', async name => {
    const { other, withGrants } = hostAnd('restart-scanner')
    const decision = await withGrants(hostOnlyGrants()).check(request(other, name))
    expect(decision).toMatchObject({ kind: 'denied', reason: 'grant-missing' })
  })

  it('denies a system principal that only carries the component text of the host', async () => {
    const { other, withGrants } = hostAnd('agent-host')
    const forged: SystemPrincipal = { kind: 'system', component: 'agent-host' }
    const authorization = withGrants(hostOnlyGrants())
    await expect(authorization.check(request(forged, 'publish'))).resolves.toMatchObject({
      kind: 'denied',
      reason: 'untrusted-principal',
    })
    // A second issued principal with the same component text is a different object of the same
    // authority; the matrix does not tell them apart, only the grant record does.
    await expect(authorization.check(request(other, 'publish'))).resolves.toMatchObject({
      kind: 'allowed',
    })
  })

  it.each(OPERATIONS)('denies %s in the system branch as a binding mismatch', async name => {
    const { host, withGrants } = hostAnd('restart-scanner')
    const value = request(host, name)
    const decision = await withGrants(hostOnlyGrants()).check({
      ...value,
      target: { kind: 'system', resource: value.target.resource },
    })
    expect(decision).toMatchObject({ kind: 'denied', reason: 'binding-mismatch' })
  })

  it.each(OPERATIONS)('denies %s with arguments other than none', async name => {
    const { host, withGrants } = hostAnd('restart-scanner')
    const decision = await withGrants(hostOnlyGrants()).check({
      ...request(host, name),
      arguments: effectiveArgumentsOf({ instance: 'agi_1' }),
    })
    expect(decision).toMatchObject({ kind: 'denied', reason: 'binding-mismatch' })
  })

  it('does not let one agent instance purpose stand for another', async () => {
    const { host, withGrants } = hostAnd('restart-scanner')
    const publishOnly: MaintenanceGrantSource = {
      read: () => Promise.resolve({ kind: 'found', grant: grantOf(['agent-instance-publish']) }),
    }
    const authorization = withGrants(publishOnly)
    await expect(authorization.check(request(host, 'publish'))).resolves.toMatchObject({
      kind: 'allowed',
    })
    for (const name of ['quiesce', 'withdraw'] as const) {
      await expect(authorization.check(request(host, name))).resolves.toMatchObject({
        kind: 'denied',
        reason: 'grant-missing',
      })
    }
  })
})
