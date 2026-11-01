// The default representation strategy: for one block, take the first acceptable form in the
// configured order of its modality. The order is a configuration field; these are initial values.
import type { ContentBlock } from '@omne-harness/content-block'
import type * as M from '@omne-harness/model-contract'
import {
  representationPolicyConfigSchema,
  type Adoption,
  type RepresentationPolicyConfig,
  type RepresentationPolicyPort,
} from '@omne-harness/request-context-contract'
import { digest } from './digest.ts'
import { decodeParameters } from './policy-input.ts'

export const DEFAULT_REPRESENTATION_CONFIG: RepresentationPolicyConfig = Object.freeze({
  preferences: Object.freeze({
    text: Object.freeze(['original', 'derived', 'transcript'] as const),
    image: Object.freeze(['original', 'derived', 'transcript'] as const),
    voice: Object.freeze(['original', 'derived', 'transcript'] as const),
  }),
})

export type DefaultRepresentationOptions = Readonly<{
  /** Replaces the order of the named modalities; the others keep their initial order. */
  preferences?: Partial<RepresentationPolicyConfig['preferences']>
}>

/** The modality a block needs, by its media type; null when the model has no such modality. */
function modalityOf(block: ContentBlock): M.ModelModality | null {
  if (block.kind === 'text' || block.kind === 'thinking') return 'text'
  const media = 'ref' in block ? block.ref.mediaType : block.mediaType
  if (media.startsWith('image/')) return 'image'
  if (media.startsWith('audio/')) return 'voice'
  return media.startsWith('text/') ? 'text' : null
}
function accepted(block: ContentBlock, modalities: readonly M.ModelModality[]): boolean {
  const modality = modalityOf(block)
  return block.visibility.toModel && modality !== null && modalities.includes(modality)
}

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
    digest: digest({ strategy: 'default-representation', revision: '1', config }),
  }
  return {
    identity,
    config,
    choose({ block, conversion, modalities }) {
      const modality = modalityOf(block)
      if (modality === null) return 'none'
      for (const choice of config.preferences[modality]) {
        if (choice === 'original' && modalities.includes(modality)) return 'original'
        if (conversion?.kind !== 'converted') continue
        const { derived, transcript } = conversion.value
        if (
          choice === 'derived' &&
          derived.length > 0 &&
          derived.every(b => accepted(b, modalities))
        )
          return 'derived'
        if (choice === 'transcript' && transcript !== '' && modalities.includes('text'))
          return 'transcript'
      }
      return 'none'
    },
  }
}
