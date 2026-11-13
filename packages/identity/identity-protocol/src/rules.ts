import type { Rule } from '@omne-harness/public-contract'

/*
 * The rule text of each identity operation, copied from the shared contract member
 * (`packages/access/public-contract/src/operation-rules.ts`). The rules belong to identity; the
 * shared contract's copy is removed by the access plugin's run.
 */

export const empty = { kind: 'object', fields: {} } as const satisfies Rule

const text = { kind: 'text' } as const
const tenantId = { kind: 'object', fields: { tenantId: { rule: { kind: 'tenant' } } } } as const

const membershipItem = {
  kind: 'object',
  fields: {
    organizationId: { rule: { kind: 'organization' } },
    tenantId: { rule: { kind: 'tenant' } },
    role: { rule: text },
  },
} as const satisfies Rule

const credentialPair = {
  kind: 'object',
  fields: { loginIdentifier: { rule: text }, credential: { rule: text } },
} as const satisfies Rule

/** The body rule of each operation. */
export const requests = {
  'register-and-activate': credentialPair,
  'issue-login': credentialPair,
  'revoke-login': { kind: 'object', fields: { targetLoginId: { rule: { kind: 'login' } } } },
  'query-current-tenant': empty,
  'query-own-memberships': empty,
  'switch-current-tenant': tenantId,
} as const satisfies Readonly<Record<string, Rule>>

/** The `succeeded` body rule of each operation. */
export const successes = {
  'register-and-activate': {
    kind: 'object',
    fields: {
      accountId: { rule: { kind: 'account' } },
      organizationId: { rule: { kind: 'organization' } },
      tenantId: { rule: { kind: 'tenant' } },
    },
  },
  // `loginId` is required here; the shared family has it optional (RFC-0015 §7).
  'issue-login': {
    kind: 'object',
    fields: {
      loginIdentifier: { rule: text },
      issuedAt: { rule: { kind: 'instant' } },
      tenantId: { rule: { kind: 'tenant' } },
      loginProof: { rule: text },
      loginId: { rule: { kind: 'login' } },
    },
  },
  'revoke-login': empty,
  'query-current-tenant': tenantId,
  'query-own-memberships': {
    kind: 'object',
    fields: {
      memberships: { rule: { kind: 'array', item: membershipItem } },
      completeness: { rule: { kind: 'literal', values: ['complete'] } },
    },
  },
  'switch-current-tenant': tenantId,
} as const satisfies Readonly<Record<string, Rule>>

/** The `no-change` body rule of each operation that has that outcome. */
export const noChanges = {
  'revoke-login': empty,
  'switch-current-tenant': empty,
} as const satisfies Readonly<Record<string, Rule>>
