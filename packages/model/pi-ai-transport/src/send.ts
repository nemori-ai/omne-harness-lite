import {
  DECISION_REPRESENTATION,
  type Adoption,
  type FixedModelRequest,
  type LlmModelRequest,
  type Supplier,
  type TransportFailure,
} from '@omne-harness/model-contract'
import type { MaterializeFailure, TransportDispatch } from '@omne-harness/model-contract/provider'
import type { JsonLimits, JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/operation-result'
import type { ProviderEndpoint, RouteAccounting } from './config.ts'
import { decisionsCodec } from './decisions/binding.ts'
import {
  isBindingOf,
  type PiChatBinding,
  type PiFamilyBinding,
  type PiMaterializedMedia,
  type PiResponseDecoder,
} from './family.ts'
import { gatherMedia, type PiMediaReader } from './media.ts'

/** A binding paired with the request it sends: where it goes, how it is written, how the answer is read. */
export type PiSend = Readonly<{
  adoption: Adoption
  endpoint: ProviderEndpoint
  representation: Adoption
  replayFormat: string | null
  media(
    read: PiMediaReader | undefined,
    signal: AbortSignal,
  ): Promise<Outcome<readonly PiMaterializedMedia[], MaterializeFailure>>
  encode(
    media: readonly PiMaterializedMedia[],
    resent: TransportDispatch['resent'],
  ): Outcome<
    Readonly<{
      body: JsonValue
      diagnostics: Encoded['diagnostics']
      replayPrefix: string
      replayCarried: boolean
    }>,
    TransportFailure
  >
  createDecoder(accounting: RouteAccounting): PiResponseDecoder
  release(): Promise<void>
}>
type Encoded = Extract<ReturnType<PiChatBinding['encode']>, { ok: unknown }>['ok']

export type SendLimits = Readonly<{ maxDecisionBytes: number | undefined; json: JsonLimits }>

export const NOT_IN_REQUEST: TransportFailure = Object.freeze({
  kind: 'invalid',
  field: 'supplier',
  reason: 'not-in-request',
})

function sameSupplier(left: Supplier, right: Supplier): boolean {
  return (
    left.credential.layer === right.credential.layer &&
    left.provider === right.provider &&
    left.model === right.model &&
    left.adoption.owner === right.adoption.owner &&
    left.adoption.name === right.adoption.name &&
    left.adoption.revision === right.adoption.revision &&
    left.adoption.digest === right.adoption.digest
  )
}

/** Where the request names this supplier; a negative index when it does not. */
export function supplierIndex(request: FixedModelRequest, supplier: Supplier): number {
  return request.suppliers.findIndex(item => sameSupplier(item, supplier))
}

function chatSend(
  binding: PiChatBinding,
  request: LlmModelRequest,
  index: number,
): Outcome<PiSend, TransportFailure> {
  const declaration = request.declarations[index]
  if (declaration === undefined) return { failure: NOT_IN_REQUEST }
  return {
    ok: {
      adoption: binding.adoption,
      endpoint: binding.endpoint,
      representation: request.representation,
      replayFormat: binding.replayFormat,
      media: (read, signal) => gatherMedia({ request, binding, read, signal }),
      encode: (media, resent) => binding.encode({ request, media, declaration, resent }),
      createDecoder: accounting => binding.createDecoder({ request, accounting }),
      release: binding.release,
    },
  }
}

/** Pairs a binding with a request of its own kind of model (MD-51); another kind answers unsupported. */
export function sendOf(
  binding: PiFamilyBinding,
  request: FixedModelRequest,
  index: number,
  limits: SendLimits,
): Outcome<PiSend, TransportFailure> {
  const unsupported = (field: string): { failure: TransportFailure } => ({
    failure: { kind: 'unsupported', field, adapter: binding.adoption },
  })
  switch (request.kind) {
    case 'llm':
      return isBindingOf(binding, 'llm')
        ? chatSend(binding, request, index)
        : unsupported('request.kind')
    case 'decisions': {
      if (!isBindingOf(binding, 'decisions')) return unsupported('request.kind')
      const { maxDecisionBytes, json } = limits
      if (maxDecisionBytes === undefined) return unsupported('limits.decisions')
      const codec = decisionsCodec(binding, request.ask, {
        maxRequestBytes: maxDecisionBytes,
        json,
      })
      return {
        ok: {
          adoption: binding.adoption,
          endpoint: binding.endpoint,
          representation: DECISION_REPRESENTATION,
          replayFormat: null,
          media: async () => ({ ok: [] }),
          ...codec,
          release: binding.release,
        },
      }
    }
    default: {
      const _exhaustive: never = request
      return _exhaustive
    }
  }
}
