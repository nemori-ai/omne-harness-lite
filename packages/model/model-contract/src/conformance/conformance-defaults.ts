import type { Adoption, ConsumerRef, FixedModelRequest, ProviderName, Supplier } from '../index.ts'
import { decodeProviderName } from '../provider-name.ts'

const decoded = decodeProviderName('provider')
if (!('ok' in decoded)) throw new TypeError('the default provider name does not decode')
const PROVIDER: ProviderName = decoded.ok

function adoption(name: string): Adoption {
  return { owner: 'conformance', name, revision: '1', digest: '0'.repeat(64) }
}

export const DEFAULT_SUPPLIER: Supplier = {
  adoption: adoption('supplier'),
  provider: PROVIDER,
  model: 'model',
  credential: { layer: 'official' },
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
  declarations: [
    { produces: 'provider/model', accepts: ['provider/model'], foreignThinking: 'omit' },
  ],
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

export function variantOf(request: FixedModelRequest): FixedModelRequest {
  return {
    ...request,
    source: {
      ...request.source,
      digest: (request.source.digest[0] === '0' ? '1' : '0') + request.source.digest.slice(1),
    },
  }
}
