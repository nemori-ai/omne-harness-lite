import type { Context } from '@deepseek-ai/cordis'
import type { Adoption, ModelFailure } from '@omne-harness/model-contract'
import type { ModelProfiles } from '@omne-harness/model-contract/provider'
import { parseInstant } from '@omne-harness/utc-instant'
import { ModelProfilesService } from '@omne-harness/model-cordis-contract/cordis'
import { createModelProfiles } from '@omne-harness/model'
import { officialOpenAiProfiles } from '@omne-harness/pi-ai-openai'
import { fieldOf, isRecord } from '../fields.ts'
import { createOfficialProfileSource } from '../profile-source.ts'

type PluginConfig = Readonly<{
  retryPolicy: Adoption
  compactionTriggerPercent: string
  updatedAt: string
}>

type Issue = { message: string }
type Parsed<T> = Readonly<{ value: T }> | Readonly<{ issues: Issue[] }>

const PERCENT = /^(100|[1-9][0-9]?)$/
const ADOPTION_MEMBERS = ['owner', 'name', 'revision', 'digest'] as const

function rejected(message: string): Parsed<never> {
  return { issues: [{ message }] }
}

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
  if (typeof updatedAt !== 'string' || !parseInstant(updatedAt).ok)
    return rejected('updatedAt must be an RFC 3339 UTC timestamp')
  return { value: { retryPolicy: retryPolicy.value, compactionTriggerPercent, updatedAt } }
}

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

export class ModelProfilesLocalPlugin extends ModelProfilesService<unknown> {
  static readonly Config = configSchema

  readonly list: ModelProfiles<unknown>['list']
  readonly resolve: ModelProfiles<unknown>['resolve']

  constructor(ctx: Context, config: PluginConfig) {
    super(ctx)
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
