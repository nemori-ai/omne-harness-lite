// Runtime values of the chapter "凭据引用与解析端口". This file imports types only from the chapter
// files, so the type imports between chapters never see runtime code.
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { tenantEquals } from '@omne-harness/legal-identity'
import type { CredentialId, CredentialReference } from './credential.ts'
import { MODEL_IDENTITY_MAX_LENGTH } from './identity-values.ts'
import { mintIdentity } from './mint.ts'
import type { ModelIdentityRejection } from './root.ts'

const FORBIDDEN_CHARACTER = /[\s\p{Cc}\p{Cf}\p{Cs}]/u

function reject(reason: ModelIdentityRejection<'ModelCredentialId'>['reason']) {
  return fail({ field: 'ModelCredentialId', reason } as const)
}

export function decodeCredentialId(
  value: unknown,
): Outcome<CredentialId, ModelIdentityRejection<'ModelCredentialId'>> {
  if (typeof value !== 'string') return reject('type')
  if (value.length === 0) return reject('empty')
  if (value.length > MODEL_IDENTITY_MAX_LENGTH) return reject('length')
  if (FORBIDDEN_CHARACTER.test(value)) return reject('character')
  return succeed(mintIdentity<'ModelCredentialId'>(value))
}

export function sameCredentialHolder(
  left: Pick<CredentialReference, 'id' | 'tenant'>,
  right: Pick<CredentialReference, 'id' | 'tenant'>,
): boolean {
  return left.id === right.id && tenantEquals(left.tenant, right.tenant)
}
