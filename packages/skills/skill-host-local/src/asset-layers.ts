import {
  collectCandidates,
  listAssets,
  MAX_ASSET_PAGE,
  type AssetLayerInput,
  type AssetLayerSource,
  type CapabilityId,
  type Candidate,
  type JsonValue,
} from '@omne-harness/assets'
import { fail, succeed } from '@omne-harness/operation-result'
import { skillBodyContract } from '@omne-harness/skill-contract'
import {
  publishedCandidate,
  type SkillCandidate,
  type SkillDecisionInputs,
  type SkillLayerInput,
} from './decisions.ts'

export type VersionBody = (candidate: Candidate) => Promise<JsonValue | undefined>

const SKILL_CATEGORY = skillBodyContract().category

export function skillInputsFromAssets<P, S>(
  input: Readonly<{ sources: readonly AssetLayerSource[]; body: VersionBody }>,
): Pick<SkillDecisionInputs<P, S>, 'layers' | 'identities'> {
  return {
    async layers(_access, _scope, capability) {
      const layers = await collectCandidates(input.sources, capability)
      return Promise.all(layers.map(layer => skillLayer(layer, input.body)))
    },
    async identities() {
      const named = new Map<string, CapabilityId>()
      let after: string | null = null
      do {
        const answer = await listAssets(input.sources, {
          category: SKILL_CATEGORY,
          after,
          limit: MAX_ASSET_PAGE,
        })
        if (answer.state !== 'read' || answer.page.completeness === 'partial')
          return fail('unknown')
        for (const item of answer.page.items)
          if (!named.has(item.capability.name)) named.set(item.capability.name, item.capability)
        after = answer.page.next
      } while (after !== null)
      return succeed([...named.values()])
    },
  }
}

async function skillLayer(layer: AssetLayerInput, body: VersionBody): Promise<SkillLayerInput> {
  if (layer.state !== 'read') return { layer: layer.layer, state: layer.state }
  const candidates: SkillCandidate[] = []
  for (const candidate of layer.candidates) {
    const read = await body(candidate)
    const skill = read === undefined ? undefined : publishedCandidate({ ...candidate, body: read })
    if (skill === undefined) return { layer: layer.layer, state: 'unavailable' }
    candidates.push(skill)
  }
  return { layer: layer.layer, state: 'read', candidates }
}
