import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { mintIdentity } from './mint.ts'
import type { ProviderName } from './root.ts'

const PROVIDER_NAME = /^[a-z0-9][a-z0-9.-]{0,63}$/u

export function decodeProviderName(value: unknown): Outcome<ProviderName, 'invalid-name'> {
  return typeof value === 'string' && PROVIDER_NAME.test(value)
    ? succeed(mintIdentity<'ModelProviderName'>(value))
    : fail('invalid-name')
}
