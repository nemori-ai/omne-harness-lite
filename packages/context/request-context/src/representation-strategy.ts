import {
  modalityOfBlock,
  representationPolicyConfigSchema,
  type Adoption,
  type RepresentationPolicyConfig,
  type RepresentationPolicyPort,
} from '@omne-harness/request-context-contract'
import { adoptionDigest } from './digest.ts'
import { decodeParameters } from './policy-input.ts'

export const DEFAULT_REPRESENTATION_CONFIG: RepresentationPolicyConfig = Object.freeze({
  preferences: Object.freeze({
    text: Object.freeze(['original', 'derived', 'transcript'] as const),
    image: Object.freeze(['original', 'derived', 'transcript'] as const),
    voice: Object.freeze(['original', 'derived', 'transcript'] as const),
  }),
})

export type DefaultRepresentationOptions = Readonly<{
  preferences?: Partial<RepresentationPolicyConfig['preferences']>
}>

const FILE_ORDER = ['original', 'derived', 'transcript'] as const

export function createDefaultRepresentationPolicy(
  options: DefaultRepresentationOptions = {},
): RepresentationPolicyPort {
  const config = decodeParameters(
    representationPolicyConfigSchema,
    { preferences: { ...DEFAULT_REPRESENTATION_CONFIG.preferences, ...options.preferences } },
    'The representation strategy configuration',
  )
  const identity: Adoption = {
    owner: 'request-context',
    name: 'default-representation',
    revision: '1',
    digest: adoptionDigest({ strategy: 'default-representation', revision: '1', config }),
  }
  return {
    identity,
    config,
    choose({ block, available }) {
      const modality = modalityOfBlock(block)
      const known = modality === 'text' || modality === 'image' || modality === 'voice'
      const order = known ? config.preferences[modality] : FILE_ORDER
      return order.find(option => available.includes(option)) ?? 'none'
    },
  }
}
