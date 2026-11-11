import type { TokenizerDefinition } from '@omne-harness/model-contract'

export function frozenDefinition(definition: TokenizerDefinition): TokenizerDefinition {
  return Object.freeze({
    adoption: Object.freeze({ ...definition.adoption }),
    implementation: Object.freeze({ ...definition.implementation }),
    vocabulary: Object.freeze({ ...definition.vocabulary }),
    configuration: Object.freeze({ ...definition.configuration }),
  })
}

export function definitionKey(definition: TokenizerDefinition): string {
  return JSON.stringify(
    [
      definition.adoption,
      definition.implementation,
      definition.vocabulary,
      definition.configuration,
    ].map(part => [part.owner, part.name, part.revision, part.digest]),
  )
}
