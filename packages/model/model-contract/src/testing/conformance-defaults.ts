// The values that the suite sends to a provider when the subject gives none of its own. They are
// data of the right shape and mean nothing to a real provider: a subject whose provider checks
// them gives its own.
import type {
  Adoption,
  ConsumerRef,
  FixedModelRequest,
  ResultCapacity,
  Supplier,
} from '../index.ts'

function adoption(name: string): Adoption {
  return { owner: 'conformance', name, revision: '1', digest: `digest-${name}` }
}

export const DEFAULT_SUPPLIER: Supplier = {
  adoption: adoption('supplier'),
  recipient: 'recipient',
  model: 'model',
  credential: { kind: 'factory' },
}

export const DEFAULT_REQUEST: FixedModelRequest = {
  profile: adoption('profile'),
  suppliers: [DEFAULT_SUPPLIER],
  fallback: false,
  retryPolicy: adoption('retry'),
  parameters: [],
  system: [],
  messages: [],
  tools: [],
  toolChoice: 'none',
  representation: adoption('representation'),
  parameterAdoptions: [],
  source: adoption('source'),
}

export const DEFAULT_CONSUMER: ConsumerRef = {
  owner: 'conformance',
  work: 'work-1',
  position: 'position-1',
  purpose: 'purpose',
}

export const DEFAULT_CAPACITY: ResultCapacity = {
  bytes: '1000',
  blocks: '10',
  attachmentBytes: '0',
}

/** The same request with another fixed source, so a provider that fixes inputs sees a difference. */
export function variantOf(request: FixedModelRequest): FixedModelRequest {
  return { ...request, source: { ...request.source, digest: `${request.source.digest}-variant` } }
}
