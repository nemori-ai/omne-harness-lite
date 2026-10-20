// The values that the paths of this fixture send and read. Every identity comes from a decoder of
// a public package and every block and message from the judge of the package that owns it, so no
// value is made by an assertion.
import { judgeContentBlock, type ContentBlock } from '@omne-harness/content-block'
import {
  accountCodec,
  organizationCodec,
  tenant,
  type TenantId,
} from '@omne-harness/legal-identity'
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import { parseMessageId, type Message, type MessagePart } from '@omne-harness/message'
import {
  decodeModelCallId,
  decodeRevision,
  type Access,
  type Adoption,
  type DurableEvidence,
  type ModalityRequirement,
  type ModelCallId,
  type ModelProfile,
  type ToolDeclaration,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'

export type Principal = Readonly<{ name: string }>

export function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export function must<T>(outcome: Outcome<T, unknown>): T {
  if ('ok' in outcome) return outcome.ok
  throw new Error(`expected success, got ${JSON.stringify(outcome.failure)}`)
}

function tenantOf(account: string, organization: string): TenantId {
  const parsedAccount = accountCodec.parse(account)
  const parsedOrganization = organizationCodec.parse(organization)
  if (!parsedAccount.ok || !parsedOrganization.ok) throw new Error('the fixture tenant is invalid')
  return tenant(parsedOrganization.value, parsedAccount.value)
}

/** The identity under which the context asks the profile, preparation and conversion services. */
export const access: Access<Principal> = {
  principal: { name: 'context' },
  tenant: tenantOf('acc_abcdefghjkmnpqrstvwxyz2345', 'org_abcdefghjkmnpqrstvwxyz2345'),
}

export const adoption = (name: string): Adoption => ({
  owner: 'fixture',
  name,
  revision: '1',
  digest: '0'.repeat(64),
})

export const evidence = (label: string): DurableEvidence => ({
  owner: 'fixture',
  record: label,
  revision: '1',
  digest: `digest-${label}`,
})

export const required: ModalityRequirement = {
  modalities: ['text'],
  source: evidence('modality'),
}

export const callId = (name: string): ModelCallId => must(decodeModelCallId(`mcall_${name}`))

const unknownUpstream = [{ supplier: adoption('supplier'), limit: { kind: 'unknown' } }] as const

/**
 * The profile that the profile service of this fixture offers. The window is 50 tokens and the
 * output limit 10, so an input holds at most 40 tokens; the compaction trigger is 60 percent of
 * the window, which is 30 tokens.
 */
export const profile: ModelProfile = {
  identity: { scope: { kind: 'factory' }, route: 'default' },
  adoption: adoption('profile'),
  revision: must(decodeRevision('1')),
  updatedAt: '2026-10-19T00:00:00Z',
  availability: 'active',
  definition: {
    suppliers: [{ adoption: adoption('supplier'), recipient: 'recipient', model: 'model' }],
    fallback: false,
    input: ['text', 'image'],
    output: ['text'],
    context: {
      window: { provided: '50', upstream: unknownUpstream },
      input: null,
      output: { provided: '10', upstream: unknownUpstream },
      compactionTriggerPercent: '60',
    },
    limits: [{ metric: 'image-bytes', provided: '4096', upstream: unknownUpstream }],
    parameters: [],
    representation: adoption('representation'),
    meter: adoption('meter'),
    retryPolicy: adoption('retry'),
  },
}

function judged(value: unknown): ContentBlock {
  const outcome = judgeContentBlock(value)
  if (!('ok' in outcome)) throw new Error(`the fixture block is invalid: ${outcome.rejected}`)
  return outcome.ok
}

const visible = { toHuman: true, toModel: true }

export const textBlock = (id: string, text: string): ContentBlock =>
  judged({ kind: 'text', id, visibility: visible, text })

export const voiceBlock = (id: string): ContentBlock =>
  judged({ kind: 'voice', id, visibility: visible, mediaType: 'audio/wav', inline: 'AAAA' })

export const imageBlock = (id: string): ContentBlock =>
  judged({
    kind: 'image',
    id,
    visibility: visible,
    ref: { storage: 'store', key: id, mediaType: 'image/png', bytes: '2048', digest: 'sha256:abc' },
    transcript: null,
  })

export function userMessage(name: string, blocks: readonly MessagePart[]): Message {
  const parsed = parseMessageId(`msg_${name.padEnd(22, 'x')}`)
  if (!parsed.ok) throw new Error('the fixture message id is invalid')
  return { id: parsed.value, role: 'user', blocks }
}

const limits = {
  maxBytes: 4096,
  maxDepth: 8,
  maxItems: 256,
  maxMembers: 32,
  maxStringLength: 256,
  maxNumberLength: 16,
}

/** The JSON value of a plain value, read the way a tool package would read its own schema text. */
export function json(value: unknown): JsonValue {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new Error(`the fixture value is not JSON: ${read.kind}`)
  return read.value
}

/** A tool, declared only by its name, its description and a JSON schema for its arguments. */
export const readFileTool: ToolDeclaration = {
  name: 'read_file',
  description: 'Reads one file of the workspace',
  argumentsSchema: json({
    type: 'object',
    properties: { path: { type: 'string' } },
    required: ['path'],
  }),
}
