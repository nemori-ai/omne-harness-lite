import {
  decodeModelOperationId,
  decodeProviderName,
  type Adoption,
  type FixedModelRequest,
  type ModelCountingBasis,
  type ModelOperationId,
  type ModelProfileDefinition,
  type ProfileIdentity,
  type Supplier,
} from '@omne-harness/model-contract'

export function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export const adoption = (name: string): Adoption => ({
  owner: 'author',
  name,
  revision: '1',
  digest: '0'.repeat(64),
})

const provider = decodeProviderName('recipient')
if ('failure' in provider) throw new Error('the provider fixture is not a provider name')

export const supplier: Supplier = {
  adoption: adoption('supplier'),
  provider: provider.ok,
  model: 'model',
  credential: { layer: 'official' },
}

export const basis: ModelCountingBasis = {
  supplier: { adoption: supplier.adoption, provider: supplier.provider, model: supplier.model },
  meter: adoption('meter'),
  tokenization: { kind: 'not-used', method: adoption('method') },
  prompt: { kind: 'declared-template', template: adoption('template') },
  projection: adoption('projection'),
  mediaTransform: adoption('media'),
  replay: adoption('replay'),
  evidence: adoption('evidence'),
}

export const request: FixedModelRequest = {
  profile: adoption('profile'),
  suppliers: [supplier],
  fallback: false,
  retryPolicy: adoption('retry'),
  parameters: [],
  system: [],
  messages: [],
  tools: [],
  toolChoice: 'none',
  declarations: [
    { produces: 'recipient/model', accepts: ['recipient/model'], foreignThinking: 'omit' },
  ],
  representation: adoption('representation'),
  parameterAdoptions: [],
  source: adoption('source'),
}

export function operationOf(name: string): ModelOperationId {
  const decoded = decodeModelOperationId(`mop_${name}`)
  if (!('ok' in decoded)) throw new Error('the fixture operation is invalid')
  return decoded.ok
}

const unknownUpstream = [{ supplier: adoption('supplier'), limit: { kind: 'unknown' } }] as const

export const definition: ModelProfileDefinition = {
  suppliers: [{ adoption: supplier.adoption, provider: supplier.provider, model: supplier.model }],
  fallback: false,
  input: ['text', 'image'],
  output: ['text'],
  context: {
    window: { provided: '1000', upstream: unknownUpstream },
    input: null,
    output: { provided: '200', upstream: unknownUpstream },
    compactionTriggerPercent: '80',
  },
  limits: [{ metric: 'image-bytes', provided: '4096', upstream: unknownUpstream }],
  parameters: [{ kind: 'max-output-tokens', value: '100' }],
  representation: adoption('representation'),
  meter: adoption('meter'),
  retryPolicy: adoption('retry'),
}

export const identity: ProfileIdentity = { scope: { kind: 'factory' }, route: 'author-model' }
