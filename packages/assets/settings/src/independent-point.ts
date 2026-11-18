import { defineSettings } from './definition.ts'
import type { createSettingsRegistry } from './registry.ts'
import type { SettingDefinitions } from './schema.ts'

export type IndependentSettingsView = Readonly<{ list(): readonly SettingDefinitions[] }>
export type IndependentSettingsPoint = IndependentSettingsView &
  Readonly<{ contribute(definition: unknown): () => void }>

type Registry = Pick<
  ReturnType<typeof createSettingsRegistry>,
  'registerContribution' | 'releaseContribution'
>
type Contribution = Readonly<{ registrationId: number; definition: SettingDefinitions }>

function keyOf(definition: Pick<SettingDefinitions, 'providerId' | 'definitionId'>): string {
  return JSON.stringify([definition.providerId, definition.definitionId])
}

function independentDefinition(input: unknown): SettingDefinitions {
  const defined = defineSettings(input)
  if (defined.kind !== 'defined')
    throw new TypeError(`independent settings declaration rejected: ${defined.kind}`)
  const definition = defined.definition
  if (definition.items.some(item => item.category === 'governance'))
    throw new TypeError('independent settings carry no governance item')
  if (definition.items.some(item => item.sensitivity === 'secret'))
    throw new TypeError('independent settings carry no secret item')
  return definition
}

/** Domains bring their own independent settings; one declaration per provider and definition. */
export function createIndependentSettingsPoint(registry: Registry): IndependentSettingsPoint {
  const contributions = new Map<string, Contribution>()
  return Object.freeze({
    contribute(input: unknown) {
      const definition = independentDefinition(input)
      const key = keyOf(definition)
      if (contributions.has(key))
        throw new Error(`independent settings ${key} are already contributed`)
      const registered = registry.registerContribution(definition)
      if (registered.kind !== 'registered')
        throw new Error(`independent settings ${key} not registered: ${registered.kind}`)
      const contribution = { registrationId: registered.registrationId, definition }
      contributions.set(key, contribution)
      return () => {
        if (contributions.get(key) !== contribution) return
        contributions.delete(key)
        registry.releaseContribution(contribution.registrationId)
      }
    },
    list() {
      return [...contributions.entries()]
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([, contribution]) => contribution.definition)
    },
  })
}
