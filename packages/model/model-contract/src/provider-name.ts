// The name of a model provider asset (SPEC「模型供应商资产」): the one boundary that mints a
// `ProviderName`. A supplier names its provider with it, and the provider body carries it.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { mintIdentity } from './mint.ts'
import type { ProviderName } from './root.ts'

/** A provider name: lowercase letters, digits, `.` and `-`, starting with a letter or a digit. */
const PROVIDER_NAME = /^[a-z0-9][a-z0-9.-]{0,63}$/u

/** The text of a provider name, or a rejection. */
export function decodeProviderName(value: unknown): Outcome<ProviderName, 'invalid-name'> {
  return typeof value === 'string' && PROVIDER_NAME.test(value)
    ? succeed(mintIdentity<'ModelProviderName'>(value))
    : fail('invalid-name')
}
