import { describe, expect, it } from 'vitest'
import type { ConsumerRef, ResourceScope } from '@omne-harness/tool-contract'
import { decodeToolCallId } from '@omne-harness/tool-contract'
import { runScopeGrants, runToolScope } from '../../../src/rows/tool-runtime/scope.ts'
import { fixtureTenant, okOf } from '../../entry/support.ts'

const TENANT_A = fixtureTenant('a')
const TENANT_B = fixtureTenant('b')
const CALL = okOf(decodeToolCallId('scope-call'), 'call')
const action = (work: string, position: string): ConsumerRef => ({
  owner: '@omne-harness/agent',
  work,
  position,
  purpose: 'action',
})
const RUN = action('exec-1', 'a-1')

async function verdictOf(scope: ResourceScope, tenant = TENANT_A) {
  const verifier = runScopeGrants().get(scope.owner)
  if (verifier === undefined) return { kind: 'no-verifier' }
  return verifier.verifyGrant({ principal: 'principal', tenant, call: CALL, scope })
}

const withGrant = (scope: ResourceScope, change: Partial<ResourceScope['grant']>) => ({
  ...scope,
  grant: { ...scope.grant, ...change },
})

describe('the concurrency scope of one run and its grant verifier', () => {
  it('the actions of one run share one scope, and two runs have two scopes', () => {
    const scope = runToolScope(TENANT_A, RUN)
    expect(runToolScope(TENANT_A, action('exec-1', 'a-2'))).toEqual(scope)
    expect(runToolScope(TENANT_A, action('exec-2', 'a-1')).key).not.toBe(scope.key)
    expect(scope.owner).toBe('@omne-harness/harness-server')
  })

  it('grants the scope that the release gave to the tenant of the call', async () => {
    expect(await verdictOf(runToolScope(TENANT_A, RUN))).toEqual({ kind: 'granted' })
  })

  it('refuses a grant that another owner issued', async () => {
    const scope = withGrant(runToolScope(TENANT_A, RUN), { owner: '@omne-harness/other' })
    expect(await verdictOf(scope)).toEqual({ kind: 'refused', reason: 'scope-not-granted' })
  })

  it('refuses a grant that names another record', async () => {
    const scope = withGrant(runToolScope(TENANT_A, RUN), {
      record: 'harness-server#release-tool-scope',
    })
    expect(await verdictOf(scope)).toEqual({ kind: 'refused', reason: 'scope-not-granted' })
  })

  it('refuses a grant of another revision', async () => {
    const scope = withGrant(runToolScope(TENANT_A, RUN), { revision: '2' })
    expect(await verdictOf(scope)).toEqual({ kind: 'refused', reason: 'scope-not-granted' })
  })

  it('refuses a scope that was granted to another tenant, though its key is the same', async () => {
    const other = runToolScope(TENANT_B, RUN)
    expect(other.key).toBe(runToolScope(TENANT_A, RUN).key)
    expect(await verdictOf(other, TENANT_A)).toEqual({
      kind: 'refused',
      reason: 'scope-not-granted',
    })
  })
})
