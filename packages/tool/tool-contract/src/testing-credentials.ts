import assert from 'node:assert/strict'
import type { TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  ToolCredentialFailure,
  ToolCredentialRequest,
  ToolCredentials,
  ToolCredentialUsage,
} from './credentials.ts'
import { conformanceCase, type ConformanceCase } from './testing-case.ts'

/** Controls change the backing secret's stored binding, never fields echoed from a request. */
export interface ToolCredentialsFixture<P, C> {
  credentials: ToolCredentials<P, C>
  request: ToolCredentialRequest<P>
  otherTenant: TenantId
  replaceBinding(binding: ToolCredentialUsage & { tenant: TenantId }): void
  failSelected(failure: ToolCredentialFailure): void
  sourcesRead(): readonly string[]
  use(capability: C): Promise<Outcome<unknown, ToolCredentialFailure>>
  uses(): number
}

export function toolCredentialsConformance<P, C>(): readonly ConformanceCase<
  ToolCredentialsFixture<P, C>
>[] {
  type Fixture = ToolCredentialsFixture<P, C>
  const named = (name: string, run: (fixture: Fixture) => Promise<void>) =>
    conformanceCase('P15', name, run)
  const mismatches: readonly (readonly [
    string,
    (fixture: Fixture) => ToolCredentialUsage & { tenant: TenantId },
  ])[] = [
    ['tenant', fixture => ({ ...fixture.request.usage, tenant: fixture.otherTenant })],
    [
      'adoption',
      fixture => ({
        ...fixture.request.usage,
        tenant: fixture.request.tenant,
        adoption: { ...fixture.request.usage.adoption, digest: 'different-secret-binding' },
      }),
    ],
    [
      'purpose',
      fixture => ({
        ...fixture.request.usage,
        tenant: fixture.request.tenant,
        purpose: 'different-purpose',
      }),
    ],
    [
      'target',
      fixture => ({
        ...fixture.request.usage,
        tenant: fixture.request.tenant,
        target: 'different-target',
      }),
    ],
  ]
  const cases = mismatches.flatMap(([field, binding]) => [
    named(`rejects actual ${field} mismatch at resolution`, async fixture => {
      fixture.replaceBinding(binding(fixture))
      const result = await fixture.credentials.resolve(fixture.request)
      assert.ok('failure' in result)
      assert.equal(result.failure.kind, 'invalid')
      assert.equal(fixture.uses(), 0)
    }),
    named(`rechecks actual ${field} binding at protected use`, async fixture => {
      const result = await fixture.credentials.resolve(fixture.request)
      assert.ok('ok' in result)
      fixture.replaceBinding(binding(fixture))
      const used = await fixture.use(result.ok)
      assert.ok('failure' in used)
      assert.equal(used.failure.kind, 'invalid')
      assert.equal(fixture.uses(), 0)
    }),
  ])
  return [
    named('a matching secret can perform the restricted action', async fixture => {
      const result = await fixture.credentials.resolve(fixture.request)
      assert.ok('ok' in result)
      assert.ok('ok' in (await fixture.use(result.ok)))
      assert.equal(fixture.uses(), 1)
    }),
    ...cases,
    ...(
      [
        { kind: 'missing' },
        { kind: 'denied', action: 'credential-use' },
        { kind: 'invalid', field: 'secret', reason: 'invalid' },
        { kind: 'unavailable', dependency: 'vault', diagnostic: 'offline' },
      ] satisfies ToolCredentialFailure[]
    ).map(failure =>
      named(`a selected ${failure.kind} secret terminates without fallback`, async fixture => {
        fixture.failSelected(failure)
        assert.deepEqual(await fixture.credentials.resolve(fixture.request), { failure })
        assert.deepEqual(fixture.sourcesRead(), ['tenant'])
        assert.equal(fixture.uses(), 0)
      }),
    ),
  ]
}
