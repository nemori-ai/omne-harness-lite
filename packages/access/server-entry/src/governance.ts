// The governance location (SPEC「治理位置」): `register-and-activate` and `issue-login` go to
// identity's public operations without a login check; the four stage operations and the operations
// this deployment declares not provided get `stage-not-provided` before any login check; the other
// eighteen take steps 4 and 6 of the judgment order here and go to identity's governance port; the
// three model credential operations take the same steps and go to the model credential port. A
// thrown identity call leaves the entry with no trustworthy answer, except `create-organization`,
// whose result set has the wire `unknown`.
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
import type { ModelCredentialAccess, ModelCredentialCustody } from './model-credentials.ts'
import { STATUS_BY_OUTCOME, type PublicOutcome } from './status.ts'

/**
 * The governance operations this deployment declares not provided (public contract「部署声明不提供
 * 的操作」). A request for one of them that passed the closed field check answers
 * `stage-not-provided` with an empty body; no login is checked and no record is read.
 */
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

/**
 * The model credential operations (SPEC「模型凭据」). The entry provides them only when the assembly
 * gives a `modelCredentials` port; without it they answer `stage-not-provided` like the declared ones.
 */
export const MODEL_CREDENTIAL_OPERATIONS = Object.freeze([
  'bind-model-credential',
  'unbind-model-credential',
  'describe-model-credential',
] as const) satisfies readonly GovernanceProvidedOperation[]

type CredentialOperation = (typeof MODEL_CREDENTIAL_OPERATIONS)[number]

/** The operations this location answers itself: the two without a login, the eighteen governed ones and the three credential ones. */
type Handled = Exclude<GovernanceProvidedOperation, NotProvided>

export type GovernanceContext = Readonly<{
  identity: IdentityOperations
  governance: IdentityGovernance
  steps: IdentitySteps
  /** Ends every observation of one login on this instance with `ended(denied)` (SPEC「登录失效时结束观察」). */
  endObservationsOf: (loginText: string) => void
  /** Absent: the three model credential operations are not provided by this deployment. */
  modelCredentials: ModelCredentialCustody | undefined
  readLimits: JsonLimits
  diagnostics: DiagnosticSink | undefined
}>

type Reply = JsonAnswer | NoAnswer

const VERSION = 'governance-public/1'
const NOT_PROVIDED: ReadonlySet<string> = new Set(NOT_PROVIDED_GOVERNANCE_OPERATIONS)
const CREDENTIAL: ReadonlySet<string> = new Set(MODEL_CREDENTIAL_OPERATIONS)

/** The business responses of one operation without the head: the outcome and its body. */
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

/** Encodes one of the two common refusals. */
export function governanceRefusal(response: GovernanceProtocolResult): JsonAnswer {
  const result = encodeGovernanceResponse({ response, limits: OUTPUT_LIMITS })
  if (result.kind !== 'encoded')
    throw new TypeError('server-entry: a governance refusal did not encode')
  return encoded(result.bytes, response.outcome)
}

/** The location's own `protocol-rejected`, for the HTTP steps before the message is read. */
export function governanceProtocolRejected(): JsonAnswer {
  return governanceRefusal({ protocolVersion: VERSION, outcome: 'protocol-rejected', body: {} })
}

/**
 * Encodes one business response. The codec checks the outcome and the body against the operation,
 * so the loose input type is checked at run time; an encode failure is this member's own fault.
 */
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

// --- the two operations without a login --------------------------------------------------------

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

// --- the governed operations ------------------------------------------------------------------

type GovernedRequest = Readonly<{
  operation: Handled
  messageId: string
  proof: ProofInput
  actingTenant?: TenantId
}>

/**
 * What a rejected governance call answers: `unknown` where the operation's result set has it,
 * otherwise no answer, because the effect may have committed (SPEC「服务端的 HTTP 层责任」).
 */
type OnRejected = 'unknown' | 'no-answer'

/**
 * Step 4 (the login goes to identity, its refusals unchanged), step 6 (the acting tenant must be
 * the login's current selection), then the governance port, which checks both again at commit.
 */
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

/**
 * The model credential operations: step 4 (the login), step 6 (the acting tenant is the login's
 * current selection), then the acting principal for that tenant, issued only when its account is
 * the login's account. The port decides the rest. A rejected `bind` or `unbind` may have written,
 * so it answers `unknown`; a rejected `describe` wrote nothing and answers `basis-unavailable`.
 */
async function credential(
  request: GovernanceRequest<CredentialOperation>,
  context: GovernanceContext,
  call: (port: ModelCredentialCustody, access: ModelCredentialAccess) => Promise<LooseWire>,
): Promise<Reply> {
  const answer = (wire: LooseWire): Reply =>
    respond(request.operation, request.messageId, wire, context.diagnostics)
  const port = context.modelCredentials
  // Only a request for a provided operation reaches a handler; this guards the type.
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
    emit(context.diagnostics, { code: 'model-credential.fault', operation: request.operation })
    return answer(
      bare(request.operation === 'describe-model-credential' ? 'basis-unavailable' : 'unknown'),
    )
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
      // The duration text is the deployment's to read (public contract「body 字段」); text that is
      // not an SI-second duration is outside the authorized range: denied, no invitation.
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
      // `succeeded` and `no-change` both say the target is not valid now: its observations on
      // this instance end at once instead of at their next login check.
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
      // The list holds at least the calling login; an empty list is not a list the wire can carry.
      if (first === undefined) return bare('basis-unavailable')
      return { outcome: 'succeeded', body: { logins: [first, ...rest], completeness: 'complete' } }
    }),

  'bind-model-credential': (request, context) =>
    credential(request, context, async (port, access) => {
      const outcome = await port.bind({ access, secret: request.body.secret })
      if (outcome.kind !== 'succeeded') return bare(outcome.kind)
      return { outcome: 'succeeded', body: { configuredAt: outcome.configuredAt } }
    }),

  'unbind-model-credential': (request, context) =>
    credential(request, context, async (port, access) =>
      bare((await port.unbind({ access })).kind),
    ),

  'describe-model-credential': (request, context) =>
    credential(request, context, async (port, access) => {
      const outcome = await port.describe({ access })
      if (outcome.kind !== 'succeeded') return bare(outcome.kind)
      return { outcome: 'succeeded', body: outcome.credential }
    }),
}

function isHandled(
  request: GovernanceRequest,
  context: GovernanceContext,
): request is GovernanceRequest<Handled> {
  if (NOT_PROVIDED.has(request.operation)) return false
  return context.modelCredentials !== undefined || !CREDENTIAL.has(request.operation)
}

function dispatch<O extends Handled>(
  request: GovernanceRequest<O>,
  context: GovernanceContext,
): Promise<Reply> {
  const handler: Handler<O> = HANDLERS[request.operation as O]
  return handler(request, context)
}

/** Answers one governance message. */
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
    // `register-and-activate` and `issue-login`: activation or issue may have committed and their
    // result sets have no wire `unknown`. A governed call catches its own port's rejection.
    emit(context.diagnostics, { code: 'identity.fault', operation: request.operation })
    return { kind: 'no-answer' }
  }
}
