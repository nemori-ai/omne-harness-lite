// The `identity` participant. It runs inside the provider's write transaction and only executes
// SQL: every identity, digest and time value arrives in the facts, computed by the provider in the
// main thread (DP3-C7). A registration writes its five rows in this one command, so a failure at
// any row rolls back all of them. A taken login identifier is a `conflict`; the unique index on
// the identifier is the second guard against two concurrent registrations.
import type {
  ParticipantModule,
  ParticipantPort,
  ParticipantReply,
} from '@omne-harness/sql-contract/worker'
import {
  IDENTITY_PARTICIPANT,
  MEMBERSHIP_ACTIVE,
  PERSONAL_ORGANIZATION,
  PROTOCOL,
  isRecord,
  isText,
  type IdentityFacts,
  type IssueLoginFacts,
  type RegisterFacts,
} from './schema.ts'
import { oneRow } from './support.ts'

const REGISTER_FIELDS = [
  'loginIdentifier',
  'account',
  'organization',
  'tenantText',
  'material',
  'roleModel',
  'roleModelRevision',
  'role',
] as const

const ISSUE_FIELDS = [
  'login',
  'account',
  'tenantText',
  'proofDigest',
  'issuedAt',
  'maxDeadline',
  'idleDeadline',
  'maxLifetime',
  'idlePeriod',
] as const

function hasTextFields<K extends string>(
  value: Readonly<Record<string, unknown>>,
  fields: readonly K[],
): value is Readonly<Record<K, string>> {
  return fields.every(field => isText(value[field]))
}

function parseFacts(facts: unknown): IdentityFacts | undefined {
  if (!isRecord(facts)) return undefined
  if (facts['kind'] === 'register' && hasTextFields(facts, REGISTER_FIELDS))
    return { kind: 'register', ...pick(facts, REGISTER_FIELDS) }
  if (facts['kind'] === 'issue-login' && hasTextFields(facts, ISSUE_FIELDS))
    return { kind: 'issue-login', ...pick(facts, ISSUE_FIELDS) }
  return undefined
}

function pick<K extends string>(
  value: Readonly<Record<K, string>>,
  fields: readonly K[],
): Readonly<Record<K, string>> {
  return Object.fromEntries(fields.map(field => [field, value[field]])) as Record<K, string>
}

function register(facts: RegisterFacts, port: ParticipantPort): ParticipantReply {
  const taken = oneRow(port, 'SELECT account FROM id_account WHERE login_identifier = ? LIMIT 1', [
    facts.loginIdentifier,
  ])
  if (taken !== undefined) return { kind: 'conflict', basis: { reason: 'identifier-taken' } }
  port.execute(
    'INSERT INTO id_account (account, login_identifier, personal_organization) VALUES (?, ?, ?)',
    [facts.account, facts.loginIdentifier, facts.organization],
  )
  port.execute('INSERT INTO id_credential (account, material, revision) VALUES (?, ?, ?)', [
    facts.account,
    facts.material,
    1n,
  ])
  port.execute('INSERT INTO id_organization (organization, kind) VALUES (?, ?)', [
    facts.organization,
    PERSONAL_ORGANIZATION,
  ])
  port.execute('INSERT INTO id_tenant (tenant_text, organization, account) VALUES (?, ?, ?)', [
    facts.tenantText,
    facts.organization,
    facts.account,
  ])
  port.execute(
    `INSERT INTO id_membership
      (organization, account, tenant_text, state, role_model, role_model_revision, role, revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      facts.organization,
      facts.account,
      facts.tenantText,
      MEMBERSHIP_ACTIVE,
      facts.roleModel,
      facts.roleModelRevision,
      facts.role,
      1n,
    ],
  )
  return { kind: 'participated', response: {} }
}

function issueLogin(facts: IssueLoginFacts, port: ParticipantPort): ParticipantReply {
  port.execute(
    `INSERT INTO id_login
      (login, proof_digest, account, tenant_text, issued_at, max_deadline, idle_deadline, max_lifetime, idle_period)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      facts.login,
      facts.proofDigest,
      facts.account,
      facts.tenantText,
      facts.issuedAt,
      facts.maxDeadline,
      facts.idleDeadline,
      facts.maxLifetime,
      facts.idlePeriod,
    ],
  )
  return { kind: 'participated', response: {} }
}

const participant: ParticipantModule = {
  participant: IDENTITY_PARTICIPANT,
  protocol: PROTOCOL,
  execute(rawFacts, port) {
    const facts = parseFacts(rawFacts)
    if (facts === undefined) return { kind: 'unsupported', basis: { reason: 'facts' } }
    return facts.kind === 'register' ? register(facts, port) : issueLogin(facts, port)
  },
}
export default participant
