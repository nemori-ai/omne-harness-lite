import {
  encodeGovernanceRequest,
  encodeGovernanceResponse,
  readGovernanceRequest,
  readGovernanceResponse,
  type GovernanceRequest,
  type GovernanceProvidedOperation,
  type GovernanceResponse,
  type GovernanceResponseEncodeInput,
  type GovernanceEncodeResult,
  type GovernanceStageOperation,
} from '@omne-harness/public-contract'
import { accountCodec, organizationCodec, tenant } from '@omne-harness/legal-identity'
import type { JsonLimits } from '@omne-harness/json-text'
import { encodeInstant, parseInstant } from '@omne-harness/utc-instant'
import { executeScenario, type ScenarioResult } from './scenarios.ts'

export const GOVERNANCE_LIMITS = {
  maxBytes: 16384,
  maxDepth: 16,
  maxItems: 1024,
  maxMembers: 128,
  maxStringLength: 4096,
  maxNumberLength: 64,
} satisfies JsonLimits
const version = 'governance-public/1'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export type GovernanceInputs = Readonly<{
  /** Corrupt only the fixed registration response; all codecs still run. */
  registrationResponseBytes?: Uint8Array
}>

function bytes(result: GovernanceEncodeResult): Uint8Array {
  if (result.kind !== 'encoded') throw new Error('Fixed protocol input was rejected')
  return result.bytes
}

function fixtures() {
  const account = accountCodec.parse('acc_00000000000000000000000001')
  const organization = organizationCodec.parse('org_00000000000000000000000001')
  const issuedAt = parseInstant('2026-01-01T00:00:00Z')
  if (!account.ok || !organization.ok || !issuedAt.ok) throw new Error('Invalid fixed identity')
  return {
    account: account.value,
    organization: organization.value,
    tenant: tenant(organization.value, account.value),
    issuedAt: issuedAt.value,
  }
}

function roundTrip(
  request: GovernanceRequest,
  response: GovernanceResponseEncodeInput<
    'register-and-activate' | 'issue-login' | 'create-organization'
  >,
  override?: Uint8Array,
): boolean {
  const requestBytes = bytes(encodeGovernanceRequest({ request, limits: GOVERNANCE_LIMITS }))
  const read = readGovernanceRequest({ bytes: requestBytes, limits: GOVERNANCE_LIMITS })
  if (read.kind !== 'request' || read.request.operation !== request.operation) return false
  const encodedAgain = bytes(
    encodeGovernanceRequest({ request: read.request, limits: GOVERNANCE_LIMITS }),
  )
  if (decoder.decode(encodedAgain) !== decoder.decode(requestBytes)) return false
  const responseBytes = bytes(encodeGovernanceResponse(response))
  const result = readGovernanceResponse({
    bytes: override ?? responseBytes,
    operation: request.operation,
    expectedMessageId: request.messageId,
    limits: GOVERNANCE_LIMITS,
  })
  return result.kind === 'response' && responseMatches(result.response, response.response)
}

function responseMatches(
  actualResponse: GovernanceResponse<GovernanceProvidedOperation>,
  expectedResponse: GovernanceResponseEncodeInput<
    'register-and-activate' | 'issue-login' | 'create-organization'
  >['response'],
): boolean {
  if (
    actualResponse.outcome !== expectedResponse.outcome ||
    actualResponse.messageId !== expectedResponse.messageId
  )
    return false
  const actual = actualResponse.body
  const expected = expectedResponse.body
  if ('issuedAt' in actual && 'issuedAt' in expected) {
    const { issuedAt: actualInstant, ...actualFields } = actual
    const { issuedAt: expectedInstant, ...expectedFields } = expected
    return (
      encodeInstant(actualInstant) === encodeInstant(expectedInstant) &&
      JSON.stringify(actualFields) === JSON.stringify(expectedFields)
    )
  }
  if ('issuedAt' in actual || 'issuedAt' in expected) return false
  return JSON.stringify(actual) === JSON.stringify(expected)
}

function refused(text: string): boolean {
  const read = readGovernanceRequest({ bytes: encoder.encode(text), limits: GOVERNANCE_LIMITS })
  if (read.kind !== 'protocol-rejected' || Object.keys(read.response.body).length !== 0)
    return false
  const encoded = bytes(
    encodeGovernanceResponse({ response: read.response, limits: GOVERNANCE_LIMITS }),
  )
  const response = readGovernanceResponse({
    bytes: encoded,
    operation: 'public-health',
    expectedMessageId: 'refusal',
    limits: GOVERNANCE_LIMITS,
  })
  return response.kind === 'response' && response.response.outcome === 'protocol-rejected'
}

function boundary(outcome: 'denied' | 'not-visible' | 'basis-unavailable'): boolean {
  const response = { protocolVersion: version, messageId: 'boundary', outcome, body: {} } as const
  const encoded = bytes(
    encodeGovernanceResponse({ operation: 'judge-admission', response, limits: GOVERNANCE_LIMITS }),
  )
  const read = readGovernanceResponse({
    bytes: encoded,
    operation: 'judge-admission',
    expectedMessageId: 'boundary',
    limits: GOVERNANCE_LIMITS,
  })
  return (
    read.kind === 'response' &&
    read.response.outcome === outcome &&
    Object.keys(read.response.body).length === 0
  )
}

function proof(kind: 'missing' | 'empty'): boolean {
  const input: GovernanceRequest<'query-current-tenant'> = {
    protocolVersion: version,
    messageId: 'proof',
    operation: 'query-current-tenant',
    proof: { kind },
    body: {},
  }
  const encoded = bytes(encodeGovernanceRequest({ request: input, limits: GOVERNANCE_LIMITS }))
  const text = decoder.decode(encoded)
  const read = readGovernanceRequest({ bytes: encoded, limits: GOVERNANCE_LIMITS })
  return (
    read.kind === 'request' &&
    read.request.operation === 'query-current-tenant' &&
    read.request.proof.kind === kind &&
    (kind === 'missing' ? !text.includes('loginProof') : text.includes('"loginProof":""')) &&
    !text.includes('"proof":')
  )
}

function stage(operation: GovernanceStageOperation): boolean {
  const read = readGovernanceRequest({
    bytes: encoder.encode(
      JSON.stringify({ protocolVersion: version, messageId: 'stage', operation, body: {} }),
    ),
    limits: GOVERNANCE_LIMITS,
  })
  if (read.kind !== 'stage-not-provided' || Object.keys(read.response.body).length !== 0)
    return false
  const encoded = bytes(
    encodeGovernanceResponse({ operation, response: read.response, limits: GOVERNANCE_LIMITS }),
  )
  const response = readGovernanceResponse({
    bytes: encoded,
    operation,
    expectedMessageId: 'stage',
    limits: GOVERNANCE_LIMITS,
  })
  return response.kind === 'response' && response.response.outcome === 'stage-not-provided'
}

export function runGovernance(inputs: GovernanceInputs = {}): readonly ScenarioResult[] {
  const f = fixtures()
  const response = {
    protocolVersion: version,
    messageId: 'create',
    outcome: 'succeeded',
    body: { organizationId: f.organization, tenantId: f.tenant },
  } as const
  const request: GovernanceRequest<'create-organization'> = {
    protocolVersion: version,
    messageId: 'create',
    operation: 'create-organization',
    proof: { kind: 'present', value: 'fixed-test-proof' },
    actingTenant: f.tenant,
    body: {
      createCallId: 'fixed-create-call',
      name: 'Fixed organization',
      governanceModelId: 'fixed-model',
    },
  }
  const checks = [
    [
      'G1-register',
      () =>
        roundTrip(
          {
            protocolVersion: version,
            messageId: 'register',
            operation: 'register-and-activate',
            body: { loginIdentifier: 'fixed-user', credential: 'fixed-test-credential' },
          },
          {
            operation: 'register-and-activate',
            response: {
              protocolVersion: version,
              messageId: 'register',
              outcome: 'succeeded',
              body: { accountId: f.account, organizationId: f.organization, tenantId: f.tenant },
            },
            limits: GOVERNANCE_LIMITS,
          },
          inputs.registrationResponseBytes,
        ),
    ],
    [
      'G1-login',
      () =>
        roundTrip(
          {
            protocolVersion: version,
            messageId: 'login',
            operation: 'issue-login',
            body: { loginIdentifier: 'fixed-user', credential: 'fixed-test-credential' },
          },
          {
            operation: 'issue-login',
            response: {
              protocolVersion: version,
              messageId: 'login',
              outcome: 'succeeded',
              body: {
                loginIdentifier: 'fixed-user',
                issuedAt: f.issuedAt,
                tenantId: f.tenant,
                loginProof: 'fixed-response-proof',
              },
            },
            limits: GOVERNANCE_LIMITS,
          },
        ),
    ],
    [
      'G1-create',
      () =>
        roundTrip(request, {
          operation: 'create-organization',
          response,
          limits: GOVERNANCE_LIMITS,
        }),
    ],
    [
      'G2-duplicate-version',
      () =>
        refused(
          '{"protocolVersion":"governance-public/1","protocolVersion":"governance-public/1","messageId":"refusal","operation":"public-health","body":{}}',
        ),
    ],
    [
      'G2-unsupported-version',
      () =>
        refused(
          '{"protocolVersion":"governance-public/2","messageId":"refusal","operation":"public-health","body":{}}',
        ),
    ],
    [
      'G2-unknown-operation',
      () =>
        refused(
          '{"protocolVersion":"governance-public/1","messageId":"refusal","operation":"unknown","body":{}}',
        ),
    ],
    [
      'G2-extra-field',
      () =>
        refused(
          '{"protocolVersion":"governance-public/1","messageId":"refusal","operation":"public-health","body":{},"extra":true}',
        ),
    ],
    [
      'G2-unmatched',
      () =>
        readGovernanceResponse({
          bytes: bytes(
            encodeGovernanceResponse({
              operation: 'create-organization',
              response,
              limits: GOVERNANCE_LIMITS,
            }),
          ),
          operation: 'create-organization',
          expectedMessageId: 'different-message',
          limits: GOVERNANCE_LIMITS,
        }).kind === 'unmatched',
    ],
    [
      'G3-unknown',
      () => {
        const response = {
          protocolVersion: version,
          messageId: 'unknown',
          outcome: 'unknown',
          body: {},
        } as const
        const read = readGovernanceResponse({
          bytes: bytes(
            encodeGovernanceResponse({
              operation: 'create-organization',
              response,
              limits: GOVERNANCE_LIMITS,
            }),
          ),
          operation: 'create-organization',
          expectedMessageId: 'unknown',
          limits: GOVERNANCE_LIMITS,
        })
        return (
          read.kind === 'response' &&
          read.response.outcome === 'unknown' &&
          Object.keys(read.response.body).length === 0
        )
      },
    ],
    ['G3-denied', () => boundary('denied')],
    ['G3-not-visible', () => boundary('not-visible')],
    ['G3-basis-unavailable', () => boundary('basis-unavailable')],
    ['G3-missing-proof', () => proof('missing')],
    ['G3-empty-proof', () => proof('empty')],
    ['G3-disable-subject', () => stage('disable-subject')],
    ['G3-restore-subject', () => stage('restore-subject')],
    ['G3-end-subject', () => stage('end-subject')],
    ['G3-reopen-after-media-loss', () => stage('reopen-after-media-loss')],
  ] satisfies readonly (readonly [ScenarioResult['scenarioId'], () => boolean])[]
  return checks.map(([id, check]) => executeScenario(id, check))
}
