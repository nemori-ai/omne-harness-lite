// Test support: a family contribution with pure encode and decode, and the values a transport
// test passes around. The protocol of the test family:
//
// - The request body is `{"model":<supplier model>,"messages":<message count>}`.
// - Each SSE data frame is a JSON object with a `kind`:
//   - `{"kind":"text","value":"..."}` gives `block-open` the first time, then `block-delta`.
//   - `{"kind":"stop"}` gives `ended` with `completed` and reason `stop`.
//   - `{"kind":"fault"}` makes the decoder answer an `input-rejected` fault.
//   - any other value makes the decoder answer an `upstream-protocol` fault.
// - The end marker is `[DONE]` and gives no fact.
// - Encode gives the diagnostics that the probe holds, none by default.
import type { JsonValue } from '@omne-harness/json-text'
import type {
  Adoption,
  FixedModelRequest,
  ModelCountingBasis,
  ModelFault,
  Supplier,
  TransportFailure,
} from '@omne-harness/model-contract'
import type { ProviderDiagnostic, TransportFact } from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import type {
  PiFamilyBinding,
  PiFamilyContributions,
  PiProtocolFrame,
  PiResponseDecoder,
  PiTransportLimits,
} from '../../src/index.ts'

export const END_MARKER = '[DONE]'

export function adoption(name: string): Adoption {
  return { owner: 'pi-ai-transport-test', name, revision: '1', digest: 'a'.repeat(64) }
}

export const SUPPLIER: Supplier = {
  adoption: adoption('supplier'),
  recipient: 'test-recipient',
  model: 'test-model',
  credential: { kind: 'factory' },
}

export const REQUEST: FixedModelRequest = {
  profile: adoption('profile'),
  suppliers: [SUPPLIER],
  fallback: false,
  retryPolicy: adoption('retry'),
  parameters: [],
  system: [],
  messages: [],
  tools: [],
  toolChoice: 'none',
  declarations: [
    {
      produces: 'test-recipient/test-model',
      accepts: ['test-recipient/test-model'],
      foreignThinking: 'omit',
    },
  ],
  representation: adoption('representation'),
  parameterAdoptions: [],
  source: adoption('source'),
}

/** The limits of the transport tests; every value is a parameter of the test, not a package default. */
export const LIMITS: PiTransportLimits = {
  connectTimeoutMs: 2_000,
  maxErrorBodyBytes: 4_096,
  maxEventBytes: 4_096,
  json: {
    maxBytes: 4_096,
    maxDepth: 16,
    maxItems: 256,
    maxMembers: 64,
    maxStringLength: 4_096,
    maxNumberLength: 32,
  },
}

/** What the test family records, and how a test makes it fail. */
export type FamilyProbe = {
  acquired: number
  released: number
  /** The signal of the latest acquire. */
  lastSignal: AbortSignal | undefined
  /** The input of the latest encode. */
  encoded: Parameters<PiFamilyBinding['encode']>[0] | undefined
  /** The diagnostics that every encode gives. */
  encodeDiagnostics: readonly ProviderDiagnostic[]
  /** Set: the next acquire answers this failure. */
  acquireFailure: TransportFailure | undefined
  /** Set: acquire waits for this promise before it answers. */
  acquireGate: Promise<void> | undefined
  /** Set: every encode answers this failure. */
  encodeFailure: TransportFailure | undefined
  /** The replay format that the bindings of the next acquires name. */
  replayFormat: string | null
}

export function createTestFamily(): Readonly<{
  families: PiFamilyContributions
  probe: FamilyProbe
}> {
  const probe: FamilyProbe = {
    acquired: 0,
    released: 0,
    lastSignal: undefined,
    encoded: undefined,
    encodeDiagnostics: [],
    acquireFailure: undefined,
    acquireGate: undefined,
    encodeFailure: undefined,
    replayFormat: null,
  }
  const families: PiFamilyContributions = {
    async acquire(supplier, signal) {
      probe.lastSignal = signal
      if (probe.acquireGate !== undefined) await probe.acquireGate
      const failure = probe.acquireFailure
      if (failure !== undefined) return { failure }
      probe.acquired += 1
      return { ok: binding(supplier, probe) }
    },
  }
  return { families, probe }
}

function binding(supplier: Supplier, probe: FamilyProbe): PiFamilyBinding {
  let released = false
  const refused: TransportFailure = {
    kind: 'unsupported',
    field: 'test-family',
    adapter: adoption('family'),
  }
  const counting: ModelCountingBasis = {
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
    supplier,
    adoption: adoption('family'),
    counting,
    rules: { plan: () => ({ failure: refused }) },
    meter: {
      basis: counting,
      measure: () => ({ failure: refused }),
      measureCalibrated: () => ({ failure: refused }),
    },
    replayFormat: probe.replayFormat,
    tools: { convertToModelPayload: () => ({ failure: refused }) },
    encode(input) {
      const { request } = input
      probe.encoded = input
      if (probe.encodeFailure !== undefined) return { failure: probe.encodeFailure }
      const body: JsonValue = {
        kind: 'object',
        entries: [
          { key: 'model', value: { kind: 'string', value: supplier.model } },
          { key: 'messages', value: { kind: 'number', lexeme: String(request.messages.length) } },
        ],
      }
      return {
        ok: {
          body,
          representation: {
            kind: 'materialized',
            adoption: adoption('meter-representation'),
            tokenInput: { kind: 'null' },
            media: [],
            requestBytes: '0',
          },
          diagnostics: probe.encodeDiagnostics,
        },
      }
    },
    createDecoder: createTestDecoder,
    async release() {
      if (released) return
      released = true
      probe.released += 1
    },
  }
}

/** The decoder of the test protocol described at the top of this file. */
export function createTestDecoder(): PiResponseDecoder {
  let opened = false
  return {
    accept(frame: PiProtocolFrame): Outcome<readonly TransportFact[], ModelFault> {
      if (frame.kind === 'end-marker') return { ok: [] }
      const kind = member(frame.value, 'kind')
      if (kind?.kind !== 'string') return { failure: protocolFault('frame without a kind') }
      switch (kind.value) {
        case 'text': {
          const value = member(frame.value, 'value')
          if (value?.kind !== 'string') return { failure: protocolFault('text without a value') }
          const delta: TransportFact = { kind: 'block-delta', index: '0', delta: value.value }
          if (opened) return { ok: [delta] }
          opened = true
          return {
            ok: [{ kind: 'block-open', index: '0', mode: 'append', content: 'text' }, delta],
          }
        }
        case 'stop':
          return { ok: [{ kind: 'ended', termination: { kind: 'completed', reason: 'stop' } }] }
        case 'fault':
          return {
            failure: { cause: 'input-rejected', diagnostic: 'test-fault', upstreamStatus: null },
          }
        default:
          return { failure: protocolFault('unknown kind') }
      }
    },
    end: () => ({ ok: [] }),
  }
}

function member(value: JsonValue, key: string): JsonValue | undefined {
  if (value.kind !== 'object') return undefined
  return value.entries.find(entry => entry.key === key)?.value
}

function protocolFault(diagnostic: string): ModelFault {
  return { cause: 'upstream-protocol', diagnostic, upstreamStatus: null }
}

/** An SSE body of the test protocol: one event per frame, then the end marker. */
export function sseBody(...frames: readonly string[]): string {
  return [...frames, END_MARKER].map(data => `data: ${data}\n\n`).join('')
}
