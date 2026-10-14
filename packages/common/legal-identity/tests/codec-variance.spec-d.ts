import {
  accountCodec,
  type AccountId,
  type IdentityTextCodec,
  type OrganizationId,
} from '@omne-harness/legal-identity'

// @ts-expect-error accountCodec.encode accepts only AccountId
const _widened: IdentityTextCodec<AccountId | OrganizationId> = accountCodec
