export interface ModelDefinition {
  readonly modelId: string
  readonly revision: string
  readonly implementation: { readonly name: string; readonly revision: string }
  readonly reminderRole: 'developer' | 'user'
  readonly routes: Readonly<Record<string, 'automatic' | 'explicit'>>
}

/** Copies static contributions; dynamic admission/reference ownership is delivered separately. */
export function ownDefinitions(values: readonly ModelDefinition[]): readonly ModelDefinition[] {
  if (!Array.isArray(values)) throw new TypeError('model definitions required')
  const seen = new Set<string>()
  return Object.freeze(
    values.map(value => {
      if (
        !value ||
        typeof value !== 'object' ||
        !value.implementation ||
        !value.routes ||
        Object.keys(value).some(
          key => !['modelId', 'revision', 'implementation', 'reminderRole', 'routes'].includes(key),
        ) ||
        Object.keys(value.implementation).some(key => !['name', 'revision'].includes(key)) ||
        ![
          value.modelId,
          value.revision,
          value.implementation.name,
          value.implementation.revision,
        ].every(v => typeof v === 'string' && v.length > 0 && v.trim() === v) ||
        !['developer', 'user'].includes(value.reminderRole) ||
        !Object.keys(value.routes).length ||
        !Object.entries(value.routes).every(
          ([route, mode]) =>
            route.trim() === route &&
            route.length > 0 &&
            typeof mode === 'string' &&
            ['automatic', 'explicit'].includes(mode),
        )
      )
        throw new TypeError('invalid model definition')
      const key = JSON.stringify([
        value.implementation.name,
        value.implementation.revision,
        value.modelId,
        value.revision,
      ])
      if (seen.has(key)) throw new TypeError('duplicate model definition')
      seen.add(key)
      return Object.freeze({
        ...value,
        implementation: Object.freeze({ ...value.implementation }),
        routes: Object.freeze({ ...value.routes }),
      })
    }),
  )
}

function definition(
  modelId: string,
  family: string,
  reminderRole: 'developer' | 'user',
  routes: ModelDefinition['routes'],
): ModelDefinition {
  return Object.freeze({
    modelId,
    revision: '1',
    implementation: Object.freeze({ name: `omne-official:openrouter-${family}`, revision: '5' }),
    reminderRole,
    routes: Object.freeze(routes),
  })
}

/** P1 pilot only; the complete curated 37 contribution set is delivered at P2. */
export const pilotDefinitions: readonly ModelDefinition[] = Object.freeze([
  definition('openai/gpt-6-sol', 'openai', 'developer', { openai: 'automatic' }),
  definition('anthropic/claude-sonnet-5', 'anthropic', 'user', { anthropic: 'explicit' }),
])

export type CachePolicy =
  | { readonly mode: 'automatic' }
  | {
      readonly mode: 'explicit'
      readonly ttl: string
      readonly breakpoints: readonly ('system' | 'last_tool' | 'last_message')[]
    }
