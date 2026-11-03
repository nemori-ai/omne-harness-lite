// The case type that every conformance suite of `./testing` returns. A suite does not depend on
// a test framework: a case fails by throwing an `AssertionError` of `node:assert/strict`, and the
// consumer registers each case in its own framework.
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'

/**
 * One check of one port. `clause` is the SPEC anchor that decides the check. `run` takes a
 * fixture that the consumer built for this case alone. It throws `NotApplicable` when the
 * fixture does not offer a handle that the case needs; that is never a pass.
 */
export type ConformanceCase<F> = Readonly<{
  name: string
  clause: string
  run(fixture: F): Promise<void>
}>

export class NotApplicable extends Error {
  readonly handle: string
  constructor(handle: string) {
    super(`not applicable: the fixture offers no ${handle}`)
    this.name = 'NotApplicable'
    this.handle = handle
  }
}

export function conformanceCase<F>(
  clause: string,
  name: string,
  run: (fixture: F) => Promise<void>,
): ConformanceCase<F> {
  return Object.freeze({ name, clause, run })
}

/** The handle of a fixture, or `NotApplicable` naming it. */
export function handle<T>(offered: T | undefined, name: string): T {
  if (offered === undefined) throw new NotApplicable(name)
  return offered
}

/** The text of a tenant, for the keys of the in-memory doubles. */
export function tenantText(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('the tenant did not come from legal-identity')
  return encoded.value
}
