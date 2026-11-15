import type { JsonLimits } from '@omne-harness/json-text'
import type {
  IdentityGovernance,
  IdentityOperations,
  MemberInvitation,
} from '@omne-harness/identity'
import type { TenantId } from '@omne-harness/legal-identity'
import {
  encodeGovernanceResponse,
  readGovernanceRequest,
  type GovernanceProtocolResult,
  type GovernanceProvidedOperation,
  type GovernanceRequest,
  type GovernanceResponse,
  type GovernanceResponseEncodeInput,
  type ProofInput,
} from '@omne-harness/public-contract'
import { parseDuration } from '@omne-harness/utc-instant'
import type { JsonAnswer, NoAnswer } from './answers.ts'
import { OUTPUT_LIMITS } from './config.ts'
import { loginTextOf, tenantTextOf } from './derivation.ts'
import { emit, type DiagnosticSink } from './diagnostics.ts'
import { isRefusal, type Caller, type IdentitySteps } from './identity-steps.ts'
import type { SettingsAccess, SettingsGovernance } from './settings.ts'
import { STATUS_BY_OUTCOME, type PublicOutcome } from './status.ts'

export const NOT_PROVIDED_GOVERNANCE_OPERATIONS = Object.freeze([
  'public-health',
  'replace-credential',
  'query-organization',
  'open-affiliation-request',
  'accept-affiliation-request',
  'reject-affiliation-request',
  'withdraw-affiliation-request',
  'release-affiliation',
  'query-received-affiliation-requests',
  'query-issued-affiliation-requests',
  'query-affiliation-request',
  'judge-admission',
  'submit-authorization-expression',
  'withdraw-authorization-expression',
] as const) satisfies readonly GovernanceProvidedOperation[]

type NotProvided = (typeof NOT_PROVIDED_GOVERNANCE_OPERATIONS)[number]

export const SETTING_OPERATIONS = Object.freeze([
  'list-settings',
  'set-setting',
  'describe-setting',
  'clear-setting',
] as const) satisfies readonly GovernanceProvidedOperation[]

type SettingOperation = (typeof SETTING_OPERATIONS)[number]

type Handled = Exclude<GovernanceProvidedOperation, NotProvided>

export type GovernanceContext = Readonly<{
  identity: IdentityOperations
  governance: IdentityGovernance
  steps: IdentitySteps
  endObservationsOf: (loginText: string) => void
  settings: SettingsGovernance | undefined
  readLimits: JsonLimits
  diagnostics: DiagnosticSink | undefined
}>

type Reply = JsonAnswer | NoAnswer

const VERSION = 'governance-public/1'
const NOT_PROVIDED: ReadonlySet<string> = new Set(NOT_PROVIDED_GOVERNANCE_OPERATIONS)
const SETTING: ReadonlySet<string> = new Set(SETTING_OPERATIONS)

type Wire<O extends GovernanceProvidedOperation> =
  Exclude<GovernanceResponse<O>, GovernanceProtocolResult> extends infer R
    ? R extends { readonly outcome: infer K; readonly body: infer B }
      ? Readonly<{ outcome: K; body: B }>
      : never
    : never

type LooseWire = Readonly<{ outcome: PublicOutcome; body: unknown }>

function encoded(bytes: Uint8Array, outcome: PublicOutcome): JsonAnswer {
  return { kind: 'json', status: STATUS_BY_OUTCOME[outcome], bytes }
}

export function governanceRefusal(response: GovernanceProtocolResult): JsonAnswer {
  const result = encodeGovernanceResponse({ response, limits: OUTPUT_LIMITS })
  if (result.kind !== 'encoded')
    throw new TypeError('server-entry: a governance refusal did not encode')
  return encoded(result.bytes, response.outcome)
}

export function governanceProtocolRejected(): JsonAnswer {
  return governanceRefusal({ protocolVersion: VERSION, outcome: 'protocol-rejected', body: {} })
}

function respond(
  operation: Handled,
  messageId: string,
  wire: LooseWire,
  diagnostics: DiagnosticSink | undefined,
): Reply {
  const input = {
    operation,
    response: { protocolVersion: VERSION, messageId, ...wire },
    limits: OUTPUT_LIMITS,
  } as unknown as GovernanceResponseEncodeInput
  const result = encodeGovernanceResponse(input)
  if (result.kind !== 'encoded') {
    emit(diagnostics, { code: 'encode.fault', operation })
    return { kind: 'no-answer' }
  }
  return encoded(result.bytes, wire.outcome)
}

const EMPTY = Object.freeze({})

function bare(outcome: PublicOutcome): LooseWire {
  return { outcome, body: EMPTY }
}

async function registerAndActivate(
  request: GovernanceRequest<'register-and-activate'>,
  context: GovernanceContext,
): Promise<Reply> {
  const outcome = await context.identity.registerAndActivate(request.body)
  const wire: Wire<'register-and-activate'> =
    outcome.kind === 'succeeded'
      ? {
          outcome: 'succeeded',
          body: {
            accountId: outcome.account,
            organizationId: outcome.organization,
            tenantId: outcome.tenant,
          },
        }
      : { outcome: 'not-loginable', body: {} }
  return respond(request.operation, request.messageId, wire, context.diagnostics)
}

async function issueLogin(
  request: GovernanceRequest<'issue-login'>,
  context: GovernanceContext,
): Promise<Reply> {
  const outcome = await context.identity.issueLogin(request.body)
  let wire: Wire<'issue-login'>
  switch (outcome.kind) {
    case 'succeeded':
      wire = {
        outcome: 'succeeded',
        body: {
          loginIdentifier: outcome.loginIdentifier,
          issuedAt: outcome.issuedAt,
          tenantId: outcome.tenant,
          loginProof: outcome.loginProof,
          loginId: outcome.login,
        },
      }
      break
    case 'uniform-auth-failure':
      wire = { outcome: 'uniform-auth-failure', body: {} }
      break
    case 'basis-unavailable':
      wire = { outcome: 'basis-unavailable', body: {} }
      break
  }
  return respond(request.operation, request.messageId, wire, context.diagnostics)
}

type GovernedRequest = Readonly<{
  operation: Handled
  messageId: string
  proof: ProofInput
  actingTenant?: TenantId
}>

type OnRejected = 'unknown' | 'no-answer'

async function governed(
  request: GovernedRequest,
  context: GovernanceContext,
  call: (port: IdentityGovernance, caller: Caller) => Promise<LooseWire>,
  onRejected: OnRejected = 'no-answer',
): Promise<Reply> {
  const answer = (wire: LooseWire): Reply =>
    respond(request.operation, request.messageId, wire, context.diagnostics)
  const caller = await context.steps.recognize(request.proof)
  if (isRefusal(caller)) return answer(bare(caller.outcome))
  if (
    request.actingTenant !== undefined &&
    tenantTextOf(request.actingTenant) !== tenantTextOf(caller.tenant)
  )
    return answer(bare('denied'))
  const port = context.governance
  let wire: LooseWire
  try {
    wire = await call(port, caller)
  } catch {
    emit(context.diagnostics, { code: 'identity.fault', operation: request.operation })
    return onRejected === 'unknown' ? answer(bare('unknown')) : { kind: 'no-answer' }
  }
  return answer(wire)
}

const SETTING_WRITES: ReadonlySet<string> = new Set(['set-setting', 'clear-setting'])

async function setting(
  request: GovernanceRequest<SettingOperation>,
  context: GovernanceContext,
  call: (port: SettingsGovernance, access: SettingsAccess) => Promise<LooseWire>,
): Promise<Reply> {
  const answer = (wire: LooseWire): Reply =>
    respond(request.operation, request.messageId, wire, context.diagnostics)
  const port = context.settings
  if (port === undefined) return answer(bare('basis-unavailable'))
  const caller = await context.steps.recognize(request.proof)
  if (isRefusal(caller)) return answer(bare(caller.outcome))
  const tenant = request.actingTenant
  if (tenantTextOf(tenant) !== tenantTextOf(caller.tenant)) return answer(bare('denied'))
  const principal = await context.steps.actingFor(caller, tenant)
  if (isRefusal(principal)) return answer(bare(principal.outcome))
  try {
    return answer(await call(port, { principal, tenant }))
  } catch {
    emit(context.diagnostics, { code: 'settings.fault', operation: request.operation })
    return answer(bare(SETTING_WRITES.has(request.operation) ? 'unknown' : 'basis-unavailable'))
  }
}

function invitationItem(invitation: MemberInvitation) {
  return {
    invitationId: invitation.invitation,
    state: invitation.state,
    expiresAt: invitation.expiresAt,
    organizationId: invitation.organization,
    invitedAccountId: invitation.invitedAccount,
  }
}

type InvitationListOutcome = Awaited<ReturnType<IdentityGovernance['queryReceivedInvitations']>>

function invitationList(outcome: InvitationListOutcome): LooseWire {
  if (outcome.kind !== 'succeeded') return bare(outcome.kind)
  return {
    outcome: 'succeeded',
    body: { invitations: outcome.invitations.map(invitationItem), completeness: 'complete' },
  }
}

type DispositionOperation =
  | 'accept-member-invitation'
  | 'reject-member-invitation'
  | 'withdraw-member-invitation'

type DispositionMethod =
  | 'acceptMemberInvitation'
  | 'rejectMemberInvitation'
  | 'withdrawMemberInvitation'

function disposition(method: DispositionMethod) {
  return (request: GovernanceRequest<DispositionOperation>, context: GovernanceContext) =>
    governed(request, context, async (port, caller) => {
      const outcome = await port[method]({
        login: caller.login,
        actingTenant: request.actingTenant,
        invitation: request.body.invitationId,
        expectedState: request.body.expectedState,
      })
      switch (outcome.kind) {
        case 'succeeded':
        case 'no-change':
          return {
            outcome: outcome.kind,
            body: { invitationId: outcome.invitation, state: outcome.state },
          }
        default:
          return bare(outcome.kind)
      }
    })
}

type MemberChangeOutcome = Awaited<ReturnType<IdentityGovernance['removeMember']>>

function memberChange(outcome: MemberChangeOutcome): LooseWire {
  return bare(outcome.kind)
}

type Handler<O extends Handled> = (
  request: GovernanceRequest<O>,
  context: GovernanceContext,
) => Promise<Reply>

const HANDLERS: { readonly [O in Handled]: Handler<O> } = {
  'register-and-activate': registerAndActivate,
  'issue-login': issueLogin,

  'create-organization': (request, context) =>
    governed(
      request,
      context,
      async (port, caller) => {
        const outcome = await port.createOrganization({
          login: caller.login,
          actingTenant: request.actingTenant,
          createCallId: request.body.createCallId,
          name: request.body.name,
          governanceModelId: request.body.governanceModelId,
        })
        if (outcome.kind !== 'succeeded') return bare(outcome.kind)
        return {
          outcome: 'succeeded',
          body: { organizationId: outcome.organization, tenantId: outcome.tenant },
        }
      },
      'unknown',
    ),

  'query-create-organization': (request, context) =>
    governed(request, context, async (port, caller) => {
      const outcome = await port.queryCreateOrganization({
        login: caller.login,
        createCallId: request.body.targetCreateCallId,
        name: request.body.name,
        governanceModelId: request.body.governanceModelId,
      })
      if (outcome.kind !== 'succeeded') return bare(outcome.kind)
      return {
        outcome: 'succeeded',
        body: { organizationId: outcome.organization, tenantId: outcome.tenant },
      }
    }),

  'issue-member-invitation': (request, context) =>
    governed(request, context, async (port, caller) => {
      let duration
      if (request.body.duration !== undefined) {
        const parsed = parseDuration(request.body.duration)
        if (!parsed.ok) return bare('denied')
        duration = parsed.value
      }
      const outcome = await port.issueMemberInvitation({
        login: caller.login,
        actingTenant: request.actingTenant,
        invitedLoginIdentifier: request.body.invitedLoginIdentifier,
        ...(duration === undefined ? {} : { duration }),
      })
      if (outcome.kind !== 'succeeded') return bare(outcome.kind)
      return {
        outcome: 'succeeded',
        body: {
          invitationId: outcome.invitation,
          state: outcome.state,
          expiresAt: outcome.expiresAt,
        },
      }
    }),

  'accept-member-invitation': disposition('acceptMemberInvitation'),
  'reject-member-invitation': disposition('rejectMemberInvitation'),
  'withdraw-member-invitation': disposition('withdrawMemberInvitation'),

  'query-invitation': (request, context) =>
    governed(request, context, async (port, caller) => {
      const outcome = await port.queryInvitation({
        login: caller.login,
        actingTenant: request.actingTenant,
        invitation: request.body.invitationId,
      })
      if (outcome.kind !== 'succeeded') return bare(outcome.kind)
      return { outcome: 'succeeded', body: invitationItem(outcome.invitation) }
    }),

  'query-received-invitations': (request, context) =>
    governed(request, context, async (port, caller) =>
      invitationList(await port.queryReceivedInvitations({ login: caller.login })),
    ),

  'query-issued-invitations': (request, context) =>
    governed(request, context, async (port, caller) =>
      invitationList(
        await port.queryIssuedInvitations({
          login: caller.login,
          actingTenant: request.actingTenant,
        }),
      ),
    ),

  'query-own-memberships': (request, context) =>
    governed(request, context, async (port, caller) => {
      const outcome = await port.queryOwnMemberships({ login: caller.login })
      if (outcome.kind !== 'succeeded') return bare(outcome.kind)
      return {
        outcome: 'succeeded',
        body: {
          memberships: outcome.memberships.map(membership => ({
            organizationId: membership.organization,
            tenantId: membership.tenant,
            role: membership.role.role,
          })),
          completeness: 'complete',
        },
      }
    }),

  'query-organization-members': (request, context) =>
    governed(request, context, async (port, caller) => {
      const outcome = await port.queryOrganizationMembers({
        login: caller.login,
        actingTenant: request.actingTenant,
        organization: request.body.organizationId,
        ...(request.body.includeRemoved === undefined
          ? {}
          : { includeRemoved: request.body.includeRemoved }),
      })
      if (outcome.kind !== 'succeeded') return bare(outcome.kind)
      return {
        outcome: 'succeeded',
        body: {
          members: outcome.members.map(member => ({
            accountId: member.account,
            role: member.role.role,
          })),
          completeness: 'complete',
        },
      }
    }),

  'leave-organization': (request, context) =>
    governed(request, context, async (port, caller) =>
      bare(
        (
          await port.leaveOrganization({
            login: caller.login,
            actingTenant: request.actingTenant,
          })
        ).kind,
      ),
    ),

  'remove-member': (request, context) =>
    governed(request, context, async (port, caller) =>
      memberChange(
        await port.removeMember({
          login: caller.login,
          actingTenant: request.actingTenant,
          organization: request.body.organizationId,
          account: request.body.accountId,
          expectedRole: request.body.expectedRole,
        }),
      ),
    ),

  'change-member-role': (request, context) =>
    governed(request, context, async (port, caller) =>
      memberChange(
        await port.changeMemberRole({
          login: caller.login,
          actingTenant: request.actingTenant,
          organization: request.body.organizationId,
          account: request.body.accountId,
          expectedRole: request.body.expectedRole,
          targetRole: request.body.targetRole,
        }),
      ),
    ),

  'switch-current-tenant': (request, context) =>
    governed(request, context, async (port, caller) => {
      const outcome = await port.switchCurrentTenant({
        login: caller.login,
        actingTenant: request.actingTenant,
        tenant: request.body.tenantId,
      })
      if (outcome.kind !== 'succeeded') return bare(outcome.kind)
      return { outcome: 'succeeded', body: { tenantId: outcome.tenant } }
    }),

  'query-current-tenant': (request, context) =>
    governed(request, context, async (port, caller) => {
      const outcome = await port.queryCurrentTenant({ login: caller.login })
      if (outcome.kind !== 'succeeded') return bare(outcome.kind)
      return { outcome: 'succeeded', body: { tenantId: outcome.tenant } }
    }),

  'revoke-login': (request, context) =>
    governed(request, context, async (port, caller) => {
      const target = request.body.targetLoginId
      const outcome = await port.revokeLogin({ login: caller.login, target })
      if (outcome.kind === 'succeeded' || outcome.kind === 'no-change')
        context.endObservationsOf(loginTextOf(target))
      return bare(outcome.kind)
    }),

  'query-own-valid-logins': (request, context) =>
    governed(request, context, async (port, caller) => {
      const outcome = await port.queryOwnValidLogins({ login: caller.login })
      if (outcome.kind !== 'succeeded') return bare(outcome.kind)
      const [first, ...rest] = outcome.logins.map(item => ({
        loginId: item.login,
        issuedAt: item.issuedAt,
        maxDeadline: item.maxDeadline,
        idleDeadline: item.idleDeadline,
      }))
      if (first === undefined) return bare('basis-unavailable')
      return { outcome: 'succeeded', body: { logins: [first, ...rest], completeness: 'complete' } }
    }),

  'list-settings': (request, context) =>
    setting(request, context, async (port, access) => {
      const { asset } = request.body
      const outcome = await port.list(asset === undefined ? { access } : { access, asset })
      if (outcome.kind !== 'succeeded') return bare(outcome.kind)
      return { outcome: 'succeeded', body: { items: outcome.items, completeness: 'complete' } }
    }),

  'set-setting': (request, context) =>
    setting(request, context, async (port, access) => {
      const { asset, item, secret } = request.body
      const outcome = await port.set({ access, asset, item, secret })
      if (outcome.kind !== 'succeeded') return bare(outcome.kind)
      return { outcome: 'succeeded', body: { configuredAt: outcome.configuredAt } }
    }),

  'describe-setting': (request, context) =>
    setting(request, context, async (port, access) => {
      const { asset, item } = request.body
      const outcome = await port.describe({ access, asset, item })
      if (outcome.kind !== 'succeeded') return bare(outcome.kind)
      return { outcome: 'succeeded', body: outcome.setting }
    }),

  'clear-setting': (request, context) =>
    setting(request, context, async (port, access) => {
      const { asset, item } = request.body
      return bare((await port.clear({ access, asset, item })).kind)
    }),
}

function isHandled(
  request: GovernanceRequest,
  context: GovernanceContext,
): request is GovernanceRequest<Handled> {
  if (NOT_PROVIDED.has(request.operation)) return false
  if (SETTING.has(request.operation)) return context.settings !== undefined
  return true
}

function dispatch<O extends Handled>(
  request: GovernanceRequest<O>,
  context: GovernanceContext,
): Promise<Reply> {
  const handler: Handler<O> = HANDLERS[request.operation as O]
  return handler(request, context)
}

export async function handleGovernance(
  bytes: Uint8Array,
  context: GovernanceContext,
): Promise<Reply> {
  const read = readGovernanceRequest({ bytes, limits: context.readLimits })
  if (read.kind !== 'request') return governanceRefusal(read.response)
  const { request } = read
  if (!isHandled(request, context))
    return governanceRefusal({
      protocolVersion: VERSION,
      messageId: request.messageId,
      outcome: 'stage-not-provided',
      body: {},
    })
  try {
    return await dispatch(request, context)
  } catch {
    emit(context.diagnostics, { code: 'identity.fault', operation: request.operation })
    return { kind: 'no-answer' }
  }
}
