// The `modelProfiles` plugin of the single-machine host: the official OpenAI profiles as one
// frozen snapshot behind `createModelProfiles`. This file is the only place in the member that
// imports a family package; the source construction next to it knows no family.
import type { Context } from '@deepseek-ai/cordis'
import type { Adoption, ModelFailure } from '@omne-harness/model-contract'
import type { ModelProfiles } from '@omne-harness/model-contract/provider'
import { ModelProfilesService } from '@omne-harness/model-cordis-contract/cordis'
import { createModelProfiles } from '@omne-harness/model'
import { officialOpenAiProfiles } from '@omne-harness/pi-ai-openai'
import { fieldOf, isRecord } from '../fields.ts'
import { createOfficialProfileSource } from '../profile-source.ts'

type PluginConfig = Readonly<{
  /** The Model retry policy of every official profile. */
  retryPolicy: Adoption
  /** A decimal integer from 1 to 100: the compaction trigger of every profile. */
  compactionTriggerPercent: string
  /** The RFC 3339 UTC text of every profile and of the snapshot revision. */
  updatedAt: string
}>

type Issue = { message: string }
type Parsed<T> = Readonly<{ value: T }> | Readonly<{ issues: Issue[] }>

const PERCENT = /^(100|[1-9][0-9]?)$/
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/
const ADOPTION_MEMBERS = ['owner', 'name', 'revision', 'digest'] as const

function rejected(message: string): Parsed<never> {
  return { issues: [{ message }] }
}

/** The retry policy is stored as an adoption, so it is read as one. */
function parseAdoption(value: unknown): Parsed<Adoption> {
  if (!isRecord(value)) return rejected('retryPolicy must be an object')
  const texts: string[] = []
  for (const member of ADOPTION_MEMBERS) {
    const text = fieldOf(value, member)
    if (typeof text !== 'string' || text === '')
      return rejected(`retryPolicy.${member} must be a non-empty string`)
    texts.push(text)
  }
  const [owner = '', name = '', revision = '', digest = ''] = texts
  return { value: { owner, name, revision, digest } }
}

function parseConfig(value: unknown): Parsed<PluginConfig> {
  const retryPolicy = parseAdoption(fieldOf(value, 'retryPolicy'))
  if ('issues' in retryPolicy) return retryPolicy
  const compactionTriggerPercent = fieldOf(value, 'compactionTriggerPercent')
  if (typeof compactionTriggerPercent !== 'string' || !PERCENT.test(compactionTriggerPercent))
    return rejected('compactionTriggerPercent must be a decimal integer from 1 to 100')
  const updatedAt = fieldOf(value, 'updatedAt')
  if (typeof updatedAt !== 'string' || !INSTANT.test(updatedAt))
    return rejected('updatedAt must be an RFC 3339 UTC timestamp')
  return { value: { retryPolicy: retryPolicy.value, compactionTriggerPercent, updatedAt } }
}

/** Why a handle kept past the plugin's removal answers `unavailable`. */
/** Why a handle kept past the plugin's removal answers `unavailable`. */
function removedFailure(): ModelFailure {
  return { kind: 'unavailable', dependency: 'model-profiles', diagnostic: 'plugin-removed' }
}

const configSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'model-host-local',
    validate: parseConfig,
  },
}

/**
 * The official profiles the plugin publishes: one layer, one timestamp, no credential state.
 * The source is built once at construction, so every read of this plugin sees the same snapshot.
 * A handle kept past the plugin's removal answers `unavailable`: the profiles were never durable
 * state of its own, and the assembly no longer publishes them.
 */
export class ModelProfilesLocalPlugin extends ModelProfilesService<unknown> {
  static readonly Config = configSchema

  readonly list: ModelProfiles<unknown>['list']
  readonly resolve: ModelProfiles<unknown>['resolve']

  constructor(ctx: Context, config: PluginConfig) {
    super(ctx)
    // The profiles live only in these closures: Cordis hands consumers a proxy of the instance,
    // and a `#private` field fails through it. The service itself has nothing to close.
    const source = createOfficialProfileSource({
      definitions: officialOpenAiProfiles({
        retryPolicy: config.retryPolicy,
        compactionTriggerPercent: config.compactionTriggerPercent,
      }),
      updatedAt: config.updatedAt,
    })
    const profiles = createModelProfiles(source)
    let removed = false
    this.list = async input => (removed ? { failure: removedFailure() } : profiles.list(input))
    this.resolve = async input =>
      removed ? { failure: removedFailure() } : profiles.resolve(input)
    ctx.fiber.effect(() => () => {
      removed = true
    })
  }
}
