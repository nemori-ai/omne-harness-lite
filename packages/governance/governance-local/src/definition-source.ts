import {
  GovernanceDefinitionBundleSchema,
  GovernanceDefinitionReadSchema,
  type GovernanceDefinitionBundle,
  type GovernanceDefinitionSource,
} from '@omne-harness/governance-contract'
import { canonical, equal } from './encoding.ts'
import { validateBundle } from './definition.ts'

function identity(declaration: GovernanceDefinitionBundle) {
  const { ownerId, definitionId, version } = declaration.reference
  return { ownerId, definitionId, version }
}

async function readDefinition(
  source: GovernanceDefinitionSource,
  requested: GovernanceDefinitionBundle,
) {
  try {
    const response = await source.resolve(identity(requested))
    const parsed = GovernanceDefinitionReadSchema.safeParse(response)
    if (!parsed.success || parsed.data.kind !== 'definition') return undefined
    if (!equal(response, parsed.data)) return undefined
    const declaration = parsed.data.declaration
    if (!equal(identity(declaration), identity(requested))) return undefined
    if (validateBundle(declaration).kind !== 'valid') return undefined
    return declaration
  } catch {
    return undefined
  }
}

export async function resolveDefinition(
  source: GovernanceDefinitionSource,
  declaration: GovernanceDefinitionBundle,
) {
  const parsed = GovernanceDefinitionBundleSchema.safeParse(declaration)
  if (!parsed.success)
    return { kind: 'invalid-input' as const, field: 'declaration', reason: 'shape' }
  const requested = parsed.data
  const valid = validateBundle(requested)
  if (valid.kind !== 'valid') return valid
  const original = canonical(declaration)
  const published = await readDefinition(source, requested)
  if (!published) return { kind: 'unavailable' as const, owner: requested.reference.ownerId }
  if (canonical(published) !== original)
    return { kind: 'conflict' as const, reason: 'definition' as const }
  return { kind: 'verified' as const, declaration: published }
}
