import { models } from './models.mjs'
import { getPublic } from './network.mjs'

export function summarizeCatalog(directory, endpointDocuments) {
  if (!Array.isArray(directory.data)) throw new Error('Invalid directory')
  return models.map(target => {
    const entry = directory.data.find(m => m.id === target.id)
    const endpoints = endpointDocuments[target.id]?.data?.endpoints
    return {
      ...target,
      state: entry ? 'directory_present' : 'directory_absent',
      certification: 'unverified',
      contextLength: entry?.context_length,
      supportedParameters: entry?.supported_parameters,
      inputModalities: entry?.architecture?.input_modalities,
      outputModalities: entry?.architecture?.output_modalities,
      reasoning: entry?.reasoning,
      pricing: entry?.pricing,
      endpoints: endpoints?.map(e => ({
        tag: e.tag,
        provider: e.provider_name,
        name: e.name,
        pricing: e.pricing,
        supportedParameters: e.supported_parameters,
        supportsImplicitCaching: e.supports_implicit_caching,
        status: e.status,
        contextLength: e.context_length,
        maxCompletionTokens: e.max_completion_tokens,
      })),
      cacheEvidence: 'unverified',
      reminderEvidence: 'unverified',
    }
  })
}
export async function collectCatalog() {
  const catalog = await getPublic('/api/v1/models')
  const documents = {}
  const endpointSources = {}
  // Four bounded workers. No credential is loaded for public inspection.
  let next = 0
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < models.length) {
        const model = models[next++]
        const response = await getPublic(`/api/v1/models/${model.id}/endpoints`)
        endpointSources[model.id] = response
        documents[model.id] = JSON.parse(response.raw)
      }
    }),
  )
  const cards = summarizeCatalog(JSON.parse(catalog.raw), documents)
  return { format: 1, observedAt: catalog.observedAt, directory: catalog, endpointSources, cards }
}
