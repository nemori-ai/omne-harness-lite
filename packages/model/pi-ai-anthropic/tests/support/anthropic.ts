// Test support of the Anthropic family: the family configuration of the tests, the records by name,
// and builders that make contract values through the contract judge, so branded identities are
// real. Every value here is a test parameter, not a package default.
import type { JsonValue } from '@omne-harness/json-text'
import {
  decodeRevision,
  judgeFixedModelRequest,
  judgeReplayDeclaration,
  type Adoption,
  type AssembledModelInput,
  type FixedModelRequest,
  type ModelProfile,
  type ReplayDeclaration,
  type Supplier,
  type TransportDispatch,
} from '@omne-harness/model-contract'
import { composeFamilies, recordAdoption } from '@omne-harness/pi-ai-transport'
import type { PiFamilyBinding } from '@omne-harness/pi-ai-transport'
import {
  createAnthropicFamily,
  officialAnthropicProfiles,
  ANTHROPIC_OWNER,
  ANTHROPIC_RECORDS,
  anthropicTokenizerResources,
  type AnthropicFamilyConfig,
  type AnthropicRecord,
} from '@omne-harness/pi-ai-anthropic'
import { componentAdoption } from '../../src/adoptions.ts'

export function adoption(name: string): Adoption {
  return { owner: 'pi-ai-anthropic-tests', name, revision: '1', digest: 'a'.repeat(64) }
}

export const SOURCE = adoption('source')
export const PROFILE = adoption('profile')
export const RETRY = adoption('retry')
export const MARGIN_SOURCE = adoption('margin-policy')

/** The family configuration of the tests. */
export const CONFIG: AnthropicFamilyConfig = {
  tokenizer: anthropicTokenizerResources(),
  limits: {
    toolArguments: {
      maxBytes: 65_536,
      maxDepth: 32,
      maxItems: 1_024,
      maxMembers: 256,
      maxStringLength: 65_536,
      maxNumberLength: 64,
    },
    maxReasoningText: 65_536,
  },
  margin: { percent: '10', source: MARGIN_SOURCE },
}

/** One family for the whole test run: the tokenizer initializes once per family. */
export const FAMILY = createAnthropicFamily(CONFIG)

export function recordNamed(name: string): AnthropicRecord {
  const records: readonly AnthropicRecord[] = ANTHROPIC_RECORDS
  const record = records.find(item => item.name === name)
  if (record === undefined) throw new Error(`no record ${name}`)
  return record
}

export function supplierOf(record: AnthropicRecord): Supplier {
  return {
    adoption: recordAdoption(ANTHROPIC_OWNER, record),
    recipient: record.route.recipient,
    model: record.route.model,
    credential: { kind: 'factory' },
  }
}

/** The binding of one record through `composeFamilies`, as a transport acquires it. */
export async function bindingOf(record: AnthropicRecord): Promise<PiFamilyBinding> {
  const acquired = await composeFamilies([FAMILY]).acquire(
    supplierOf(record),
    new AbortController().signal,
  )
  if (!('ok' in acquired)) throw new Error(`acquire: ${JSON.stringify(acquired.failure)}`)
  return acquired.ok
}

const SHOWN = { toHuman: true, toModel: true }

export function textBlock(id: string, text: string): unknown {
  return { kind: 'text', id, visibility: SHOWN, text }
}

export function thinkingBlock(id: string, text: string): unknown {
  return { kind: 'thinking', id, visibility: SHOWN, text }
}

export function imageBlock(id: string, mediaType = 'image/png'): unknown {
  return { kind: 'image', id, visibility: SHOWN, mediaType, inline: 'iVBORw0KGgo=' }
}

export function stateBlock(id: string, payload: string, pairs: readonly string[] = []): unknown {
  return {
    kind: 'reasoning_state',
    id,
    visibility: { toHuman: false, toModel: true },
    payload,
    pairs,
  }
}

export function callBlock(id: string, callId: string, name = 'lookup'): unknown {
  return {
    kind: 'tool_call',
    id,
    visibility: SHOWN,
    callId,
    name,
    arguments: { kind: 'object', entries: [{ key: 'q', value: { kind: 'string', value: 'x' } }] },
  }
}

export function resultBlock(id: string, callId: string): unknown {
  return { kind: 'tool_result', id, visibility: SHOWN, callId }
}

/** A message; the id is `msg_` and the given id padded to the identity length. */
export function message(
  id: string,
  role: string,
  blocks: readonly unknown[],
  extra: object = {},
): unknown {
  return { id: `msg_${id.padEnd(22, '0')}`, role, blocks, ...extra }
}

export function tool(name: string, schema?: JsonValue): unknown {
  return {
    name,
    description: `${name} tool`,
    argumentsSchema: schema ?? {
      kind: 'object',
      entries: [{ key: 'type', value: { kind: 'string', value: 'object' } }],
    },
  }
}

export type RequestParts = Readonly<{
  system?: readonly unknown[]
  messages?: readonly unknown[]
  tools?: readonly unknown[]
  toolChoice?: unknown
  /** Explicit parameters; each becomes an explicit adoption of the record supplier. */
  parameters?: readonly unknown[]
  /** The declaration that the request fixes; the official declaration expanded by default. */
  declaration?: ReplayDeclaration
  /** The parameter adoptions, e.g. of a plan; by default each explicit parameter as itself. */
  parameterAdoptions?: readonly unknown[]
}>

/** The official replay declaration of a record with every default applied. */
export function declarationOf(record: AnthropicRecord): ReplayDeclaration {
  const judged = judgeReplayDeclaration(
    {
      recipient: record.route.recipient,
      model: record.route.model,
      replay: record.replay.declaration,
    },
    0,
  )
  if (!('ok' in judged)) throw new Error(`declaration of ${record.name}: ${judged.failure.reason}`)
  return judged.ok
}

/** The fixed request as plain JSON: what `request.json` holds. */
export function requestJson(record: AnthropicRecord, parts: RequestParts = {}): unknown {
  const supplier = supplierOf(record)
  const parameters = parts.parameters ?? []
  return {
    profile: PROFILE,
    suppliers: [supplier],
    fallback: false,
    retryPolicy: RETRY,
    parameters,
    system: parts.system ?? [],
    messages: parts.messages ?? [message('u1', 'user', [textBlock('b1', 'hello')])],
    tools: parts.tools ?? [],
    toolChoice: parts.toolChoice ?? 'auto',
    declarations: [parts.declaration ?? declarationOf(record)],
    representation: componentAdoption(record, 'representation'),
    parameterAdoptions:
      parts.parameterAdoptions ??
      parameters.map(requested => ({
        supplier: supplier.adoption,
        applied: requested,
        origin: { kind: 'explicit', requested, source: SOURCE },
      })),
    source: SOURCE,
  }
}

/** The fixed request through the contract judge; throws when the judge refuses it. */
export function fixedRequest(record: AnthropicRecord, parts: RequestParts = {}): FixedModelRequest {
  const judged = judgeFixedModelRequest(requestJson(record, parts))
  if (!('ok' in judged)) throw new Error(`test request refused: ${JSON.stringify(judged.failure)}`)
  return judged.ok
}

/** The encode input of a request of one supplier: its declaration, no media, the resent messages. */
export function encodeInput(
  request: FixedModelRequest,
  resent: TransportDispatch['resent'] = [],
): Parameters<PiFamilyBinding['encode']>[0] {
  return { request, media: [], declaration: request.declarations[0], resent }
}

/** The assembled input of a fixed request: what a plan receives. */
export function assembledOf(request: FixedModelRequest): AssembledModelInput {
  return {
    system: request.system,
    messages: request.messages,
    tools: request.tools,
    toolChoice: request.toolChoice,
    parameters: request.parameters,
    representation: request.representation,
    source: request.source,
  }
}

/** The official profile of a record as a stored factory profile. */
export function officialProfile(record: AnthropicRecord): ModelProfile {
  const revision = decodeRevision('1')
  if (!('ok' in revision)) throw new Error('revision')
  const definition = officialAnthropicProfiles({
    retryPolicy: RETRY,
    compactionTriggerPercent: '80',
  }).find(item => item.suppliers[0].model === record.route.model)
  if (definition === undefined) throw new Error(`no official profile of ${record.name}`)
  return {
    identity: { scope: { kind: 'factory' }, route: record.name },
    adoption: PROFILE,
    revision: revision.ok,
    updatedAt: '2026-10-22T00:00:00Z',
    availability: 'active',
    definition,
  }
}
