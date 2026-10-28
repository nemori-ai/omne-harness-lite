// Legal Tool values that the conformance suites and their non-durable doubles build. The suites
// take identity from the fixture (`Access`), so no value here names a caller or a tenant.
import { createHash } from 'node:crypto'
import type { BlockId, ContentBlock } from '@omne-harness/content-block'
import {
  accountCodec,
  organizationCodec,
  tenant as composeTenant,
  workspaceCodec,
  type TenantId,
  type WorkspaceId,
} from '@omne-harness/legal-identity'
import type { FixedToolRequest } from './definitions.ts'
import {
  decodeToolCallId,
  decodeToolInstanceId,
  decodeToolOperationId,
  decodeToolWaitId,
  type Access,
  type Adoption,
  type DurableEvidence,
  type ToolCallId,
  type ToolInstanceId,
  type ToolOperationId,
  type ToolWaitId,
} from './identity.ts'
import type { ToolStartRecord } from './ports.ts'
import type { PreparationRecord, ReleaseRecord, StartPermit, WaitIntent } from './records.ts'
import type { ToolResult } from './results.ts'

/** The owner named in every evidence that a double mints. */
export const TESTING_OWNER = '@omne-harness/tool-contract/testing'

export function adoption(name: string): Adoption {
  return { owner: 'conformance', name, revision: '1', digest: `sha256:${name}` }
}

export function evidence(record: string): DurableEvidence {
  return { owner: 'conformance', record, revision: '1', digest: `sha256:${record}` }
}

export function digestOf(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

/** An evidence that a double mints; its digest follows `content`, so other content, other digest. */
export function mintEvidence(record: string, content: unknown): DurableEvidence {
  return { owner: TESTING_OWNER, record, revision: '1', digest: digestOf(content) }
}

/** The text of a tenant, so a double can key its records by it. */
export function tenantKey(tenant: TenantId): string {
  return JSON.stringify([tenant.organization.text, tenant.account.text])
}

/**
 * The values that identify a record of `tenant` to a cross-tenant case: the `TenantId` itself, the
 * texts of its organization and its account, and the record and digest of each evidence. What the
 * other tenant sent itself is given to the check apart, as `submitted`, and is not looked for.
 */
export function identifyingValues(
  tenant: TenantId,
  ...evidences: readonly DurableEvidence[]
): readonly unknown[] {
  return [
    tenant,
    tenant.organization.text,
    tenant.account.text,
    ...evidences.flatMap(item => [item.record, item.digest]),
  ]
}

/**
 * Mints a real legal-identity tenant for a test: both halves must be legal atomic texts
 * (`org_`/`acc_` plus the 26-character body). A reference can be encoded only for a minted
 * tenant, so a test of the reference paths builds its tenants here, not as shaped objects.
 */
export function testingTenant(organization: string, account: string): TenantId {
  const org = organizationCodec.parse(organization)
  const acc = accountCodec.parse(account)
  if (!org.ok || !acc.ok) throw new Error(`illegal test tenant text: ${organization} / ${account}`)
  return composeTenant(org.value, acc.value)
}

/** Mints a real legal-identity workspace for a test: `wsp_` plus the 26-character body. */
export function testingWorkspace(text: string): WorkspaceId {
  const parsed = workspaceCodec.parse(text)
  if (!parsed.ok) throw new Error(`illegal test workspace text: ${text}`)
  return parsed.value
}

// Each access mints its tenant when it is built, not when the module loads: an illegal text then
// fails the case that uses it instead of the import of every suite.

/** The access of the tenant that the in-memory fixtures use. */
export function memoryAccess<P>(principal: P): Access<P> {
  return {
    principal,
    tenant: testingTenant('org_c0nf0rmance000000000000000', 'acc_c0nf0rmance000000000000000'),
  }
}

/**
 * The access of a second tenant, with a principal of its own, for the cross-tenant cases of the
 * in-memory fixtures. Its tenant and its principal both differ from those of `memoryAccess`.
 */
export function memoryOtherAccess<P>(principal: P): Access<P> {
  return {
    principal,
    tenant: testingTenant('org_c0nf0rmance0ther0000000000', 'acc_c0nf0rmance0ther0000000000'),
  }
}

function minted<T>(decoded: { ok: T } | { failure: unknown }, text: string): T {
  if ('failure' in decoded) throw new Error(`conformance identity is not legal: ${text}`)
  return decoded.ok
}

export const callId = (text: string): ToolCallId => minted(decodeToolCallId(text), text)
export const operationId = (text: string): ToolOperationId =>
  minted(decodeToolOperationId(text), text)
export const waitId = (text: string): ToolWaitId => minted(decodeToolWaitId(text), text)
export const instanceId = (): ToolInstanceId => minted(decodeToolInstanceId('instance-1'), 'inst')

/** A fixed request that the contract judge accepts. */
export function fixedRequest(): FixedToolRequest {
  return {
    availability: {
      kind: 'available',
      layer: { kind: 'official' },
      definition: {
        adoption: adoption('read_file'),
        name: 'read_file',
        description: 'The read_file tool.',
        requiredCapabilities: [],
        backgroundAllowed: false,
        declarations: {
          adoption: adoption('declarations'),
          environment: null,
          attachments: [],
          inputModalities: [],
          outputModalities: [],
          settings: null,
        },
        kind: 'function',
        parameters: {
          schema: {
            kind: 'object',
            entries: [{ key: 'type', value: { kind: 'string', value: 'object' } }],
          },
          vocabulary: adoption('json-schema'),
          descriptions: [{ path: 'path', text: 'The path value.' }],
        },
        returns: { kind: 'ordinary', program: { kind: 'none' } },
      },
      executor: adoption('executor'),
    },
    invocation: { kind: 'direct', source: evidence('entry') },
    command: null,
    arguments: { original: '{"path":"a.txt"}', effective: '{"path":"a.txt"}', complete: true },
    settings: adoption('settings'),
    context: adoption('context'),
    workspace: null,
    environment: adoption('environment'),
    resources: [],
    scope: { owner: 'scope-owner', key: 'scope-1', grant: evidence('grant') },
    consumer: { owner: 'consumer', work: 'work-1', position: 'position-1', purpose: 'tool-result' },
    batchDecision: null,
    mode: 'foreground',
    limits: { concurrency: 1, foregroundMs: null, backgroundAfterMs: null },
  }
}

/** The first start record of `call`; its start operation is `<call>/start`. */
export function startRecord(
  access: Access<unknown>,
  call: ToolCallId,
): Extract<ToolStartRecord, { kind: 'start' }> {
  return {
    kind: 'start',
    operation: operationId(`${call}/start`),
    executor: adoption('executor'),
    execution: { tenant: access.tenant, call, instance: instanceId(), generation: '1' },
  }
}

/** A permit that a binding double accepts: it names the start, and it holds no guard. */
export function syntheticPermit(
  access: Access<unknown>,
  call: ToolCallId,
  start: Extract<ToolStartRecord, { kind: 'start' }>,
  request: FixedToolRequest,
): StartPermit {
  return {
    tenant: access.tenant,
    call,
    operation: start.operation,
    adoption: adoption('permit'),
    inputDigest: digestOf(request),
    start,
    guards: [],
    request: evidence('permit-request'),
  }
}

export function preparationRecord(
  access: Access<unknown>,
  call: ToolCallId,
  operation: string,
  request: FixedToolRequest,
): PreparationRecord {
  return {
    tenant: access.tenant,
    call,
    operation: operationId(operation),
    adoption: adoption('environment'),
    inputDigest: digestOf(request),
    purpose: 'initial',
    request,
  }
}

export function releaseRecord(
  preparation: PreparationRecord,
  operation: string,
  resource: DurableEvidence,
): ReleaseRecord {
  return {
    tenant: preparation.tenant,
    call: preparation.call,
    operation: operationId(operation),
    adoption: preparation.adoption,
    inputDigest: digestOf({ release: operation, resource }),
    preparation: preparation.operation,
    resource,
    custody: evidence('release-custody'),
  }
}

/** A result with one text block, for the custody retention cases. */
export function textResult(text: string): ToolResult<ContentBlock> {
  return {
    content: [
      {
        kind: 'text',
        id: 'block-1' as BlockId,
        visibility: { toHuman: true, toModel: true },
        text,
      },
    ],
    data: { kind: 'none' },
    original: { kind: 'none' },
    attachments: [],
  }
}

/** A deadline far in the future, so a provider with a real clock does not consider it reached. */
export const FAR_DEADLINE = '2099-12-31T23:59:59.000Z'

/**
 * A resource wait of `wait`. `deadline` is an instant or `null` (no expiry is scheduled), and
 * `expiry` is what the fixed wait protocol allows.
 */
export function resourceWait(
  wait: string,
  options: Readonly<{ deadline?: string | null; expiry?: 'forbidden' | 'supported' }> = {},
): Extract<WaitIntent, { kind: 'resource' }> {
  const { deadline = FAR_DEADLINE, expiry = 'supported' } = options
  const schema = { id: 'conformance-schema', revision: '1', digest: 'sha256:conformance-schema' }
  const contract = adoption('resource-wait')
  return {
    kind: 'resource',
    wait: waitId(wait),
    resume: evidence(`${wait}/resume`),
    schemas: {
      contract,
      request: schema,
      response: schema,
      requestMaxBytes: 1024,
      responseMaxBytes: 1024,
      expiry,
      source: evidence('wait-schemas'),
    },
    contract,
    request: evidence(`${wait}/request`),
    deadline,
  }
}
