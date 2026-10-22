// Test support for the gateway engine: a small record, hook and meter stubs, and builders that
// make contract values through the contract judge, so the branded identities are real.
import type { JsonValue } from '@omne-harness/json-text'
import {
  decodeRevision,
  judgeFixedModelRequest,
  judgeReplayDeclaration,
  type Adoption,
  type AssembledModelInput,
  type FixedModelRequest,
  type ModelCountingBasis,
  type ModelProfile,
  type Parameter,
  type ProfileReplay,
  type ReplayDeclaration,
  type ReplayTreatment,
  type Supplier,
  type TransportFailure,
} from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  ChatCompletionsLimits,
  ChatCompletionsRecord,
  FamilyMeter,
  ProjectedRequest,
  ReplayPart,
  VendorHooks,
} from '../../src/chat-completions/index.ts'
import { recordAdoption } from '../../src/index.ts'

export const OWNER = '@omne-harness/pi-ai-engine-test'
export const ROUTE: ChatCompletionsRecord['route'] = { recipient: 'gateway', model: 'lab/model-a' }
export const SCOPE = 'gateway/lab/model-a'
export const FORMAT = 'lab-v1'

export function adoption(name: string): Adoption {
  return { owner: 'engine-test', name, revision: '1', digest: 'a'.repeat(64) }
}

/** The decoder buffer limits of the engine tests: test parameters, not package defaults. */
export const LIMITS: ChatCompletionsLimits = {
  toolArguments: {
    maxBytes: 4_096,
    maxDepth: 16,
    maxItems: 256,
    maxMembers: 64,
    maxStringLength: 4_096,
    maxNumberLength: 32,
  },
  maxReasoningText: 4_096,
}

export const REPRESENTATION = adoption('representation')
export const SOURCE = adoption('source')
export const EXTENSION = adoption('extension-top-p')

/** The engine-test record. Every variation point has a value a test can change. */
export function testRecord(overrides: Partial<ChatCompletionsRecord> = {}): ChatCompletionsRecord {
  return {
    name: 'model-a',
    revision: '1',
    route: ROUTE,
    status: 'current',
    serving: { order: ['Lab'], reports: ['Lab'] },
    wire: {
      roles: { instruction: 'developer', reminder: 'user' },
      content: 'compact',
      cache: { kind: 'none' },
      image: { mediaTypes: ['image/png'], detail: 'auto' },
      fixed: [{ field: 'store', value: false }],
      usageTail: { maxFrames: 2 },
    },
    parameters: {
      temperature: {
        support: 'supported',
        default: { kind: 'absent' },
        accept: { min: 0, max: 1 },
        wire: { field: 'temperature' },
      },
      'top-p': { support: 'unsupported' },
      'max-output-tokens': {
        support: 'supported',
        default: { kind: 'send', value: '1000' },
        accept: { max: '4096' },
        wire: { field: 'max_tokens' },
      },
      stop: {
        support: 'supported',
        default: { kind: 'absent' },
        accept: { maxItems: 2, maxLength: 8 },
        wire: { field: 'stop' },
      },
      'reasoning-effort': {
        support: 'supported',
        default: { kind: 'send', value: 'medium' },
        accept: {},
        wire: {
          none: 'unsupported',
          low: { field: 'reasoning.effort', value: 'low' },
          medium: { field: 'reasoning.effort', value: 'medium' },
          high: { field: 'reasoning.effort', value: 'high' },
          max: { field: 'reasoning.effort', value: 'xhigh' },
        },
      },
      seed: { support: 'unsupported' },
      'frequency-penalty': { support: 'unsupported' },
      'presence-penalty': { support: 'unsupported' },
    },
    extensions: [{ definition: EXTENSION, field: 'top_p' }],
    replay: {
      declaration: {},
      formats: { produces: FORMAT, accepts: [FORMAT] },
      prefix: { kind: 'none' },
    },
    ...overrides,
  }
}

export function supplierOf(record: ChatCompletionsRecord): Supplier {
  return {
    adoption: recordAdoption(OWNER, record),
    recipient: record.route.recipient,
    model: record.route.model,
    credential: { kind: 'factory' },
  }
}

/** What the hook and meter stubs saw, and how a test makes them answer. */
export type EngineProbe = {
  checks: { applied: readonly Parameter[]; treatments: readonly ReplayTreatment[] }[]
  checkFailure: TransportFailure | undefined
  replays: { parts: readonly ReplayPart[]; thinking: readonly string[] }[]
  views: ProjectedRequest[]
  representation: Adoption
  released: number
}

export function engineProbe(): EngineProbe {
  return {
    checks: [],
    checkFailure: undefined,
    replays: [],
    views: [],
    representation: REPRESENTATION,
    released: 0,
  }
}

function str(value: string): JsonValue {
  return { kind: 'string', value }
}

/**
 * Hook stubs. Replay writes one detail per carried part, or plain text for thinking alone. A tool
 * schema with a member `refuse` is unsupported.
 */
export function testHooks(probe: EngineProbe, reasoning = true): VendorHooks {
  return {
    reasoning: reasoning
      ? {
          seal: () => ({ ok: [] }),
          replay(parts, thinking) {
            probe.replays.push({ parts, thinking })
            if (parts.length === 0) return { ok: { kind: 'plain', text: thinking.join('') } }
            return {
              ok: {
                kind: 'details',
                details: parts.map(part => ({
                  type: str('reasoning.encrypted'),
                  data: str(part.payload),
                  format: str(part.format),
                })),
              },
            }
          },
        }
      : null,
    usage: () => ({ ok: { items: [], diagnostics: [] } }),
    toolSchema(schema): Outcome<JsonValue, TransportFailure> {
      if (schema.kind === 'object' && schema.entries.some(entry => entry.key === 'refuse'))
        return {
          failure: { kind: 'unsupported', field: 'schema', adapter: adoption('tool-schema') },
        }
      return { ok: schema }
    },
    check(input) {
      probe.checks.push({ applied: input.applied, treatments: input.treatments })
      return probe.checkFailure === undefined ? { ok: undefined } : { failure: probe.checkFailure }
    },
  }
}

export function testMeter(record: ChatCompletionsRecord, probe: EngineProbe): FamilyMeter {
  const supplier = supplierOf(record)
  const basis: ModelCountingBasis = {
    supplier: { adoption: supplier.adoption, recipient: supplier.recipient, model: supplier.model },
    meter: adoption('meter'),
    tokenization: { kind: 'not-used', method: adoption('method') },
    prompt: { kind: 'provider-private', estimation: adoption('estimation') },
    projection: adoption('projection'),
    mediaTransform: adoption('media-transform'),
    replay: adoption('replay'),
    evidence: adoption('evidence'),
  }
  return {
    instance: {
      basis,
      measure: () => ({
        failure: { kind: 'unavailable', dependency: 'meter', diagnostic: 'test' },
      }),
    },
    represent(view) {
      probe.views.push(view)
      return { adoption: probe.representation, tokenInput: str(`turns:${view.turns.length}`) }
    },
  }
}

const SHOWN = { toHuman: true, toModel: true }

export function textBlock(id: string, text: string, toModel = true): unknown {
  return { kind: 'text', id, visibility: { toHuman: true, toModel }, text }
}

export function imageBlock(id: string, mediaType = 'image/png'): unknown {
  return { kind: 'image', id, visibility: SHOWN, mediaType, inline: 'iVBORw0KGgo=' }
}

export function thinkingBlock(id: string, text: string): unknown {
  return { kind: 'thinking', id, visibility: SHOWN, text }
}

export function stateBlock(id: string, payload: string): unknown {
  return {
    kind: 'reasoning_state',
    id,
    visibility: { toHuman: false, toModel: true },
    payload,
    pairs: [],
  }
}

export function callBlock(id: string, callId: string, name = 'lookup'): unknown {
  return {
    kind: 'tool_call',
    id,
    visibility: SHOWN,
    callId,
    name,
    arguments: { kind: 'object', entries: [{ key: 'q', value: str('x') }] },
  }
}

export function resultBlock(id: string, callId: string): unknown {
  return { kind: 'tool_result', id, visibility: SHOWN, callId }
}

export function message(
  id: string,
  role: string,
  blocks: readonly unknown[],
  extra: object = {},
): unknown {
  return { id: `msg_${id.padEnd(22, '0')}`, role, blocks, ...extra }
}

export function tool(
  name: string,
  schema: JsonValue = { kind: 'object', entries: [{ key: 'type', value: str('object') }] },
): unknown {
  return { name, description: `${name} tool`, argumentsSchema: schema }
}

export type RequestParts = Readonly<{
  system?: readonly unknown[]
  messages?: readonly unknown[]
  tools?: readonly unknown[]
  toolChoice?: unknown
  parameters?: readonly unknown[]
  parameterAdoptions?: readonly unknown[]
  replay?: 'off'
  /** The declaration that the request fixes; the record declaration expanded by default. */
  declaration?: ReplayDeclaration
}>

/** The declaration of the record with every default applied, as a request of its profile fixes it. */
export function declarationOf(record: ChatCompletionsRecord): ReplayDeclaration {
  const judged = judgeReplayDeclaration(
    {
      recipient: record.route.recipient,
      model: record.route.model,
      replay: record.replay.declaration,
    },
    0,
  )
  if (!('ok' in judged)) throw new Error(`test record declaration: ${judged.failure.reason}`)
  return judged.ok
}

/** A fixed request through the contract judge; throws when the judge refuses it. */
export function fixedRequest(
  record: ChatCompletionsRecord,
  parts: RequestParts = {},
): FixedModelRequest {
  const judged = judgeFixedModelRequest({
    profile: adoption('profile'),
    suppliers: [supplierOf(record)],
    fallback: false,
    retryPolicy: adoption('retry'),
    parameters: parts.parameters ?? [],
    system: parts.system ?? [],
    messages: parts.messages ?? [message('u1', 'user', [textBlock('b1', 'hello')])],
    tools: parts.tools ?? [],
    toolChoice: parts.toolChoice ?? 'auto',
    ...(parts.replay === undefined ? {} : { replay: parts.replay }),
    declarations: [parts.declaration ?? declarationOf(record)],
    representation: REPRESENTATION,
    parameterAdoptions: parts.parameterAdoptions ?? [],
    source: SOURCE,
  })
  if (!('ok' in judged)) throw new Error(`test request refused: ${JSON.stringify(judged.failure)}`)
  return judged.ok
}

export function assembledOf(request: FixedModelRequest): AssembledModelInput {
  return {
    system: request.system,
    messages: request.messages,
    tools: request.tools,
    toolChoice: request.toolChoice,
    parameters: request.parameters,
    ...(request.replay === undefined ? {} : { replay: request.replay }),
    representation: request.representation,
    source: request.source,
  }
}

/** A profile with the one supplier of the record and the given replay declaration. */
export function profileOf(
  record: ChatCompletionsRecord,
  options: Readonly<{ replay?: ProfileReplay; outputLimit?: string }> = {},
): ModelProfile {
  const revision = decodeRevision('1')
  if (!('ok' in revision)) throw new Error('revision')
  const supplier = supplierOf(record)
  const limit = { provided: options.outputLimit ?? '8192', upstream: [] }
  return {
    identity: { scope: { kind: 'factory' }, route: 'test' },
    adoption: adoption('profile'),
    revision: revision.ok,
    updatedAt: '2026-10-22T00:00:00Z',
    availability: 'active',
    definition: {
      suppliers: [
        {
          adoption: supplier.adoption,
          recipient: supplier.recipient,
          model: supplier.model,
          ...(options.replay === undefined ? {} : { replay: options.replay }),
        },
      ],
      fallback: false,
      input: ['text', 'image'],
      output: ['text'],
      context: {
        window: { provided: '100000', upstream: [] },
        input: null,
        output: limit,
        compactionTriggerPercent: '80',
      },
      limits: [],
      parameters: [],
      representation: REPRESENTATION,
      meter: adoption('meter'),
      retryPolicy: adoption('retry'),
    },
  }
}
