// The governance location (SPEC「治理位置」「治理位置的偏离」): `register-and-activate` and
// `issue-login` go to identity's public operations without a login check; the four stage operations
// and the 32 operations this deployment does not provide get `stage-not-provided`; a throwing
// identity leaves the entry with no trustworthy answer.
import type { JsonLimits } from '@omne-harness/json-text'
import type { IdentityOperations } from '@omne-harness/identity'
import {
  encodeGovernanceResponse,
  readGovernanceRequest,
  type GovernanceProtocolResult,
  type GovernanceRequest,
  type GovernanceResponse,
  type GovernanceResponseEncodeInput,
} from '@omne-harness/public-contract'
import type { JsonAnswer, NoAnswer } from './answers.ts'
import { OUTPUT_LIMITS } from './config.ts'
import { emit, type DiagnosticSink } from './diagnostics.ts'
import { STATUS_BY_OUTCOME, type PublicOutcome } from './status.ts'

export type GovernanceContext = Readonly<{
  identity: IdentityOperations
  readLimits: JsonLimits
  diagnostics: DiagnosticSink | undefined
}>

const VERSION = 'governance-public/1'

function encoded(bytes: Uint8Array, outcome: PublicOutcome, close = false): JsonAnswer {
  return { kind: 'json', status: STATUS_BY_OUTCOME[outcome], bytes, ...(close ? { close } : {}) }
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

function business(
  input: GovernanceResponseEncodeInput,
  diagnostics: DiagnosticSink | undefined,
): JsonAnswer | NoAnswer {
  const result = encodeGovernanceResponse(input)
  if (result.kind !== 'encoded') {
    emit(diagnostics, { code: 'encode.fault', operation: input.operation })
    return { kind: 'no-answer' }
  }
  return encoded(result.bytes, input.response.outcome)
}

async function registerAndActivate(
  request: GovernanceRequest<'register-and-activate'>,
  context: GovernanceContext,
): Promise<JsonAnswer | NoAnswer> {
  const outcome = await context.identity.registerAndActivate(request.body)
  const head = { protocolVersion: VERSION, messageId: request.messageId } as const
  const response: GovernanceResponse<'register-and-activate'> =
    outcome.kind === 'succeeded'
      ? {
          ...head,
          outcome: 'succeeded',
          body: {
            accountId: outcome.account,
            organizationId: outcome.organization,
            tenantId: outcome.tenant,
          },
        }
      : { ...head, outcome: 'not-loginable', body: {} }
  return business(
    { operation: 'register-and-activate', response, limits: OUTPUT_LIMITS },
    context.diagnostics,
  )
}

async function issueLogin(
  request: GovernanceRequest<'issue-login'>,
  context: GovernanceContext,
): Promise<JsonAnswer | NoAnswer> {
  const outcome = await context.identity.issueLogin(request.body)
  const head = { protocolVersion: VERSION, messageId: request.messageId } as const
  let response: GovernanceResponse<'issue-login'>
  switch (outcome.kind) {
    case 'succeeded':
      response = {
        ...head,
        outcome: 'succeeded',
        body: {
          loginIdentifier: outcome.loginIdentifier,
          issuedAt: outcome.issuedAt,
          tenantId: outcome.tenant,
          loginProof: outcome.loginProof,
        },
      }
      break
    case 'uniform-auth-failure':
      response = { ...head, outcome: 'uniform-auth-failure', body: {} }
      break
    case 'basis-unavailable':
      response = { ...head, outcome: 'basis-unavailable', body: {} }
      break
  }
  return business(
    { operation: 'issue-login', response, limits: OUTPUT_LIMITS },
    context.diagnostics,
  )
}

/** Answers one governance message. A thrown identity call gives no answer: the effect may have committed. */
export async function handleGovernance(
  bytes: Uint8Array,
  context: GovernanceContext,
): Promise<JsonAnswer | NoAnswer> {
  const read = readGovernanceRequest({ bytes, limits: context.readLimits })
  if (read.kind !== 'request') return governanceRefusal(read.response)
  const { request } = read
  try {
    switch (request.operation) {
      case 'register-and-activate':
        return await registerAndActivate(request, context)
      case 'issue-login':
        return await issueLogin(request, context)
      default:
        // The deviation of SPEC「治理位置的偏离」: this deployment provides no other operation.
        return governanceRefusal({
          protocolVersion: VERSION,
          messageId: request.messageId,
          outcome: 'stage-not-provided',
          body: {},
        })
    }
  } catch {
    emit(context.diagnostics, { code: 'identity.fault', operation: request.operation })
    return { kind: 'no-answer' }
  }
}
