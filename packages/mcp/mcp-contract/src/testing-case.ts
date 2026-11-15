import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'

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

export function isNotApplicable(error: unknown): error is NotApplicable {
  return error instanceof NotApplicable
}

export type CaseVerdict =
  | Readonly<{ kind: 'passed' }>
  | Readonly<{ kind: 'not-applicable'; handle: string }>

export async function runConformanceCase<F>(
  conformance: ConformanceCase<F>,
  fixture: F,
): Promise<CaseVerdict> {
  try {
    await conformance.run(fixture)
  } catch (error) {
    if (isNotApplicable(error)) return { kind: 'not-applicable', handle: error.handle }
    throw error
  }
  return { kind: 'passed' }
}

export function conformanceCase<F>(
  clause: string,
  name: string,
  run: (fixture: F) => Promise<void>,
): ConformanceCase<F> {
  return Object.freeze({ name, clause, run })
}

export function handle<T>(offered: T | undefined, name: string): T {
  if (offered === undefined) throw new NotApplicable(name)
  return offered
}

export function tenantText(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new TypeError('the tenant did not come from legal-identity')
  return encoded.value
}
