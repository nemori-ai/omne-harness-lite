import { createHash } from 'node:crypto'
import {
  GovernanceDefinitionBundleSchema,
  GovernanceDefinitionReadSchema,
  type GovernanceDefinitionBundle,
  type GovernanceDefinitionSource,
} from '@omne-harness/governance-contract'
import { canonical, equal } from './encoding.ts'
import { validateBundle } from './definition.ts'

const REMEMBERED_VALID_BUNDLES = 1024
const validItemCounts = new Map<string, number>()

function validate(bundle: GovernanceDefinitionBundle, text: string) {
  const key = createHash('sha256').update(text).digest('hex')
  const itemCount = validItemCounts.get(key)
  if (itemCount !== undefined) return { kind: 'valid' as const, itemCount }
  const result = validateBundle(bundle)
  if (result.kind !== 'valid') return result
  if (validItemCounts.size >= REMEMBERED_VALID_BUNDLES) validItemCounts.clear()
  validItemCounts.set(key, result.itemCount)
  return result
}

function identity(declaration: GovernanceDefinitionBundle) {
  const { ownerId, definitionId, version } = declaration.reference
  return { ownerId, definitionId, version }
}

async function readDefinition(
  source: GovernanceDefinitionSource,
  requested: GovernanceDefinitionBundle,
  requestedText: string,
) {
  try {
    const response = await source.resolve(identity(requested))
    const parsed = GovernanceDefinitionReadSchema.safeParse(response)
    if (!parsed.success || parsed.data.kind !== 'definition') return undefined
    if (!equal(response, parsed.data)) return undefined
    const declaration = parsed.data.declaration
    if (!equal(identity(declaration), identity(requested))) return undefined
    const text = canonical(declaration)
    if (text !== requestedText && validate(declaration, text).kind !== 'valid') return undefined
    return { declaration, text }
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
  const requestedText = canonical(requested)
  const valid = validate(requested, requestedText)
  if (valid.kind !== 'valid') return valid
  const original = canonical(declaration)
  const published = await readDefinition(source, requested, requestedText)
  if (!published) return { kind: 'unavailable' as const, owner: requested.reference.ownerId }
  if (published.text !== original)
    return { kind: 'conflict' as const, reason: 'definition' as const }
  return { kind: 'verified' as const, declaration: published.declaration }
}
