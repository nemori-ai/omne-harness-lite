import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import {
  capabilityIdEquals,
  readOpaqueJson,
  type JsonValue,
} from '@omne-harness-lite/content-blocks'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'
import { decodeContextData } from '@omne-harness-lite/runtime-context'
import type { SessionBootstrapOptions } from './session-bootstrap-types.ts'

function selectedRootBody(
  input: Parameters<SessionBootstrapOptions['contextSeed']>[1],
): JsonValue | undefined {
  if (input.root.definition.category !== 'agent_definition') return undefined
  const definitions = input.definitions.filter(
    definition =>
      definition.id === input.root.source.asset &&
      capabilityIdEquals(definition.capability, input.root.definition),
  )
  if (definitions.length !== 1 || definitions[0]!.origin !== 'official') return undefined
  const factoryHeld = input.holdings.some(
    holding =>
      holding.asset === input.root.source.asset &&
      holding.holder.layer === 'factory' &&
      holding.basis.kind === 'official',
  )
  if (!factoryHeld) return undefined
  const expected = ExactDecimal.from(input.root.source.version)
  const versions = definitions[0]!.versions.filter(
    version => ExactDecimal.from(version.number).compare(expected) === 0,
  )
  if (versions.length !== 1 || versions[0]!.content.category !== 'agent_definition')
    return undefined
  return readOpaqueJson(versions[0]!.content.body)
}
/** Application-owned Context declaration from the exact legal selected root. This function grants no authority. */
export const contextSeedFromDefinition: SessionBootstrapOptions['contextSeed'] = async (
  scope,
  input,
) => {
  if (!tenantIdEquals(scope.tenant, input.tenant)) return { unavailable: true }
  const body = selectedRootBody(input)
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { unavailable: true }
  const declaration = Object.getOwnPropertyDescriptor(body, 'contextSessionSeed')?.value
  const seed = decodeContextData('Seed', declaration)
  return seed ? { seed } : { unavailable: true }
}
