import {
  capabilityId,
  collectCandidates,
  evaluate,
  type AssetLayerSource,
  type Candidate,
} from '@omne-harness/assets'
import {
  definitionNamesOf,
  type ConverterDefinitions,
  type DefinitionAnswer,
} from '@omne-harness/media-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { CONVERTER_CATEGORY, parseConverterBody } from './converter-category.ts'

/** The layers of one tenant's assets, and how to read the body of a candidate. */
export type ConverterLayers = Readonly<{
  sources: readonly AssetLayerSource[]
  /** The body of the version a candidate selects; undefined when it cannot be read. */
  body(candidate: Candidate): Promise<unknown>
}>

type Resolve = ConverterDefinitions['resolve']
type Tenant = Parameters<Resolve>[0]['tenant']
type Answer = Awaited<ReturnType<Resolve>>

const unavailable = (diagnostic: string): Answer => fail({ kind: 'unavailable', diagnostic })

/** Which converter definition is in force by the assets' evaluation: the type's name, then the modality's. */
export function createConverterDefinitions(input: {
  layersOf(tenant: Tenant): Promise<ConverterLayers | undefined>
}): ConverterDefinitions {
  async function named(layers: ConverterLayers, name: string): Promise<Answer | null> {
    const capability = capabilityId(CONVERTER_CATEGORY, name)
    if (!capability.ok) return unavailable(`no capability for ${name}`)
    const candidates = await collectCandidates(layers.sources, capability.id)
    const evaluation = evaluate({ layers: candidates, eligible: () => 'yes' })
    if (evaluation.kind === 'unavailable')
      return unavailable(`the ${evaluation.layer} layer of ${name} cannot be read`)
    if (evaluation.kind === 'none') return null
    const { candidate } = evaluation
    const body = await layers.body(candidate).catch(() => undefined)
    if (body === undefined) return unavailable(`the body of ${candidate.asset} cannot be read`)
    const parsed = parseConverterBody(body, name)
    if (!('ok' in parsed))
      return unavailable(`${candidate.asset} no longer holds: ${parsed.failure}`)
    const { engine, parameters, egress } = parsed.ok
    const definition = { name, revision: candidate.version }
    return succeed({ kind: 'resolved', definition, engine, parameters, egress } as DefinitionAnswer)
  }

  return {
    async resolve({ tenant, mediaType }) {
      const layers = await input.layersOf(tenant).catch(() => undefined)
      if (layers === undefined) return unavailable('the assets of the tenant cannot be had')
      for (const name of definitionNamesOf(mediaType)) {
        const answer = await named(layers, name)
        if (answer !== null) return answer
      }
      return succeed({ kind: 'none' })
    },
  }
}
