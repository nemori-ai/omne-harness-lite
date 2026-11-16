import type { Context } from '@deepseek-ai/cordis'
import {
  environmentNeedAdoption,
  environmentNeedSchemaRef,
  type EnvironmentNeedProjection,
} from '@omne-harness/execution-environment-contract'
import { readJsonText, writeJsonText, type JsonRead, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  validate,
  type SchemaProvider,
  type SchemaRef,
  type SchemaVerdict,
} from '@omne-harness/schema-provider'
import { canonicalDigest } from '@omne-harness/tool'
import type { DurableEvidence, ToolDefinition, ToolFailure } from '@omne-harness/tool-contract'
import type {
  ToolAuthority,
  ToolLoader,
  ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import { toolContributionAuthorityKey } from '@omne-harness/tool-cordis-contract/cordis'
import {
  createLocalToolLoader,
  type LocalToolContributionVerifier,
} from '@omne-harness/tool-host-local'
import type { LocalToolHostPluginInput } from '@omne-harness/tool-host-local/cordis'
import {
  closeEnvironmentSchemaProvider,
  createEnvironmentSchemaProvider,
  ENVIRONMENT_DECLARATION_LIMITS,
} from '../../entry/schema-domain.ts'
import { registrantOf, releaseOf, rememberReleaseDefinition } from '../../entry/tool-release.ts'
import {
  constructionTree,
  governanceOf,
  sameAdoption,
  type ReleaseToolExport,
  type ToolReleaseEntry,
} from '../../entry/tool-release-manifest.ts'

type B = ToolMessageContentBlock
export type OperatorConstruction = Readonly<Partial<Record<string, unknown>>>

export type EnvironmentNeedCheck = Readonly<{
  provider: SchemaProvider
  schema: SchemaRef<EnvironmentNeedProjection>
}>

const unavailable = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency: 'tool-host', diagnostic })
const invalid = (field: string, reason: string) => fail({ kind: 'invalid' as const, field, reason })

function entryFor(ctx: Context, name: string) {
  const release = releaseOf(ctx)
  if (release.kind !== 'trusted') return undefined
  const entry = release.manifest.entries.find(candidate => candidate.asset.name === name)
  return entry === undefined ? undefined : { release, entry }
}

function constructionOf(
  operator: OperatorConstruction,
  entry: ToolReleaseEntry,
): JsonValue | undefined {
  const value = operator[entry.asset.name]
  return value === undefined ? undefined : constructionTree(value)
}

export async function readEnvironmentNeed(
  definition: ToolDefinition,
  check: EnvironmentNeedCheck,
): Promise<Outcome<EnvironmentNeedProjection | null, ToolFailure>> {
  const environment = definition.declarations.environment
  if (environment === null) return succeed(null)
  if (!sameAdoption(environment.adoption, environmentNeedAdoption))
    return invalid('environment', 'unknown environment declaration adoption')
  let read: JsonRead
  try {
    read = readJsonText(writeJsonText(environment.value), ENVIRONMENT_DECLARATION_LIMITS)
  } catch {
    return invalid('environment', 'environment need declaration is not JSON')
  }
  if (read.kind !== 'ok') return invalid('environment', 'environment need declaration is not JSON')
  let verdict: SchemaVerdict<EnvironmentNeedProjection>
  try {
    verdict = await validate(check.provider, check.schema, read)
  } catch {
    return unavailable('environment need check threw')
  }
  switch (verdict.kind) {
    case 'valid':
      return succeed(verdict.value)
    case 'invalid':
      return invalid('environment', 'environment need declaration is invalid')
    default:
      return unavailable(`environment need check gave ${verdict.kind}`)
  }
}

export async function checkEnvironmentNeed(
  definition: ToolDefinition,
  check: EnvironmentNeedCheck,
): Promise<Outcome<void, ToolFailure>> {
  const read = await readEnvironmentNeed(definition, check)
  return 'failure' in read ? read : succeed(undefined)
}

export type ReleaseAuthorOptions = Readonly<{
  schemaProvider?: SchemaProvider
  environmentNeed?: SchemaRef<EnvironmentNeedProjection>
}>

function ownProvider(ctx: Context): SchemaProvider {
  const provider = createEnvironmentSchemaProvider()
  ctx.effect(() => () => closeEnvironmentSchemaProvider(provider), 'tool-host.schema-provider')
  return provider
}

export function releaseAuthorInput(
  ctx: Context,
  operator: OperatorConstruction,
  options: ReleaseAuthorOptions = {},
): LocalToolHostPluginInput<unknown, unknown, B> {
  const check: EnvironmentNeedCheck = {
    provider: options.schemaProvider ?? ownProvider(ctx),
    schema: options.environmentNeed ?? environmentNeedSchemaRef,
  }

  const verifier: LocalToolContributionVerifier<unknown> = {
    verify: authority => {
      const current = ctx.get(toolContributionAuthorityKey)
      return current === undefined
        ? fail({ kind: 'unavailable', diagnostic: 'tool-host: no contribution authority' })
        : current.verify(authority)
    },
    admits: (access, layer) => {
      const current = ctx.get(toolContributionAuthorityKey)
      return current === undefined
        ? fail({ kind: 'unavailable', diagnostic: 'tool-host: no contribution authority' })
        : current.admits(access, layer)
    },
  }

  const source: LocalToolHostPluginInput<unknown, unknown, B>['source'] = {
    async resolve(authority) {
      try {
        const found = entryFor(ctx, authority.asset.name)
        if (found === undefined) {
          return releaseOf(ctx).kind === 'trusted'
            ? fail({ kind: 'denied' })
            : fail({ kind: 'unavailable', diagnostic: 'tool-host: release snapshot unavailable' })
        }
        const { release, entry } = found
        if (canonicalDigest(authority.asset) !== canonicalDigest(entry.asset))
          return fail({ kind: 'invalid', reason: 'authority asset is not the release asset' })
        const construction = constructionOf(operator, entry)
        if (construction === undefined)
          return fail({
            kind: 'unavailable',
            diagnostic: `tool-host: operator construction for ${entry.asset.name} is missing`,
          })
        const access = registrantOf(ctx)
        if (access === undefined)
          return fail({ kind: 'unavailable', diagnostic: 'tool-host: release registrant absent' })
        const module = release.modules[entry.module.export as keyof typeof release.modules]
        if (module === undefined || !sameAdoption(module.executor, entry.module.executor))
          return fail({ kind: 'invalid', reason: 'release module differs from the manifest' })
        return succeed(
          Object.freeze({
            module,
            config: Object.freeze({
              authority: authority satisfies ToolAuthority,
              construction,
              settings: entry.settings,
            }),
            context: Object.freeze({
              access,
              asset: governanceOf(entry),
              services: Object.freeze({}),
            }),
          }),
        )
      } catch {
        return fail({ kind: 'unavailable', diagnostic: 'tool-host: release source failed' })
      }
    },
  }

  const inner = (authority: ToolAuthority): ToolLoader<unknown, unknown, B> =>
    createLocalToolLoader<unknown, unknown, B>({
      authority,
      verifier,
      async settings(input) {
        const found = entryFor(ctx, input.authority.asset.name)
        if (found === undefined) return unavailable('release snapshot or entry unavailable')
        if (!sameAdoption(input.settings, found.entry.settings))
          return invalid('settings', 'settings adoption differs from the release')
        const construction = constructionOf(operator, found.entry)
        return construction === undefined
          ? unavailable(`operator construction for ${found.entry.asset.name} is missing`)
          : succeed(construction)
      },
      async schemas(_input, loaded) {
        const found = entryFor(ctx, loaded.key.asset.name)
        if (found === undefined) return unavailable('release snapshot or entry unavailable')
        if (!sameAdoption(loaded.executor, found.entry.module.executor))
          return invalid('executor', 'loaded executor differs from the release module')
        if (canonicalDigest(loaded.definition) !== found.entry.definition)
          return invalid('definition', 'definition digest differs from the release')
        return checkEnvironmentNeed(loaded.definition, check)
      },
    })

  const loaderFor = (authority: ToolAuthority): ToolLoader<unknown, unknown, B> => {
    const loader = inner(authority)
    return {
      async load(input) {
        const found = entryFor(ctx, authority.asset.name)
        if (found === undefined) return unavailable('release snapshot or entry unavailable')
        const fixed = found.release.modules[found.entry.module.export as ReleaseToolExport]
        if (fixed === undefined) return unavailable('release module is absent')
        if (!sameAdoption(input.module.executor, found.entry.module.executor))
          return invalid('module', 'module executor differs from the release module')
        const loaded = await loader.load({ ...input, module: fixed })
        if ('failure' in loaded) return loaded
        return rememberReleaseDefinition(ctx, found.release.generation, loaded.ok.definition)
          ? loaded
          : unavailable('release definition changed during loading')
      },
    }
  }

  return Object.freeze({
    source,
    loaderFor,
    recordRejection: (): Promise<DurableEvidence> =>
      Promise.reject(new Error('tool-host: no durable rejection record store (wave 3)')),
  })
}
