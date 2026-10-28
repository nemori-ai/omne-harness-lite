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

/** How the action of an escaping use ends: it returns the raw capability, or throws `error`. */
export type ToolCredentialEscapeExit =
  | Readonly<{ kind: 'return' }>
  | Readonly<{ kind: 'throw'; error: Error }>

/**
 * One protected use whose action kept the raw capability aside. `ended` is what `use` returned,
 * or what it rejected with. `retry` tries the restricted action on the kept raw capability after
 * the use ended and swallows whatever that attempt throws: `uses()` tells whether it acted.
 */
export type ToolCredentialEscape = Readonly<{ ended: unknown; retry(): Promise<void> }>

/**
 * Controls change the backing secret's stored binding, never fields echoed from a request.
 * `escape` runs one use whose action keeps the raw capability aside (and does not act) and ends
 * by `exit`. `failRevocation` makes every later revocation of the backing store throw the error
 * it returns.
 */
export interface ToolCredentialsFixture<P, C> {
  credentials: ToolCredentials<P, C>
  request: ToolCredentialRequest<P>
  otherTenant: TenantId
  replaceBinding(binding: ToolCredentialUsage & { tenant: TenantId }): void
  failSelected(failure: ToolCredentialFailure): void
  sourcesRead(): readonly string[]
  use(capability: C): Promise<Outcome<unknown, ToolCredentialFailure>>
  uses(): number
  escape(capability: C, exit: ToolCredentialEscapeExit): Promise<ToolCredentialEscape>
  failRevocation(): Error
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
    ...(['owner', 'name', 'revision', 'digest'] as const).map(
      field =>
        [
          `adoption.${field}`,
          (fixture: Fixture) => ({
            ...fixture.request.usage,
            tenant: fixture.request.tenant,
            adoption: { ...fixture.request.usage.adoption, [field]: 'different-secret-binding' },
          }),
        ] as const,
    ),
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
  const resolved = async (fixture: Fixture): Promise<C> => {
    const result = await fixture.credentials.resolve(fixture.request)
    assert.ok('ok' in result, 'the matching secret must resolve')
    return result.ok
  }
  const isOutcome = (value: unknown): value is Outcome<unknown, ToolCredentialFailure> =>
    typeof value === 'object' && value !== null && ('ok' in value || 'failure' in value)
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
    named('a capability returned out of a use cannot act after the use ended', async fixture => {
      const capability = await resolved(fixture)
      const escaped = await fixture.escape(capability, { kind: 'return' })
      assert.ok(isOutcome(escaped.ended) && 'ok' in escaped.ended, 'the use itself succeeds')
      await escaped.retry()
      assert.equal(fixture.uses(), 0, 'the escaped capability acted after the use ended')
    }),
    named('a capability thrown out of a use cannot act after the use ended', async fixture => {
      const capability = await resolved(fixture)
      const error = new Error('action failed with the capability attached')
      const escaped = await fixture.escape(capability, { kind: 'throw', error })
      assert.equal(escaped.ended, error, 'the unknown error of the action is rethrown as it was')
      await escaped.retry()
      assert.equal(fixture.uses(), 0, 'the escaped capability acted after the use ended')
    }),
    named(
      'a failed revocation after a successful action is not reported as success',
      async fixture => {
        const capability = await resolved(fixture)
        const revocation = fixture.failRevocation()
        await assert.rejects(
          fixture.use(capability),
          (error: unknown) => error === revocation,
          'use must reject with the revocation error',
        )
        assert.equal(fixture.uses(), 1, 'the action did happen')
      },
    ),
    named('a failed revocation after a failed action keeps both errors', async fixture => {
      const capability = await resolved(fixture)
      const error = new Error('action failed')
      const revocation = fixture.failRevocation()
      const escaped = await fixture.escape(capability, { kind: 'throw', error })
      assert.ok(escaped.ended instanceof AggregateError, 'both errors travel in one AggregateError')
      assert.deepEqual(escaped.ended.errors, [error, revocation])
      assert.equal(fixture.uses(), 0)
    }),
  ]
}
