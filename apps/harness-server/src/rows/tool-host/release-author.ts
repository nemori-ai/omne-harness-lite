// 发行内置作者的来源与装载器输入（简报 B3-T2a 第 4、7、8 项，L-TOOL 事实清单 §1）。
// - `source.resolve`：只从受信快照取 Shell、Files 的固定模块、配置与上下文，不按调用参数 import。
// - `loaderFor`：`createLocalToolLoader`。`settings` 核固定发行设置采用并交运维者层的构造值；`schemas` 先核
//   定义摘要与清单全等，再履行非空 environment 声明的义务（R2-D68 及补充，R2-D80 经执行域的 schema-provider）。
// - `recordRejection`：本波没有耐久拒绝记录仓，返回被拒绝的 Promise，协调者转为 `unavailable`（具名缺件，波 3）。
// 任何来源缺失、不一致或读不到都答失败，不默认放行。
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
import { registrantOf, releaseOf } from '../../entry/tool-release.ts'
import {
  constructionTree,
  governanceOf,
  sameAdoption,
  type ReleaseToolExport,
  type ToolReleaseEntry,
} from '../../entry/tool-release-manifest.ts'

type B = ToolMessageContentBlock
/** 运维者层给出的构造值，按作者名。发行层不写默认值，缺哪一项哪一个作者就答 `unavailable`。 */
export type OperatorConstruction = Readonly<Partial<Record<string, unknown>>>

/**
 * `environmentNeedAdoption` 映射到的检查（R2-D80）：执行域的 schema-provider 实例，加执行环境契约公开的
 * `environmentNeedSchemaRef`。provider 由 harness-server 入口给出，行不自建预算。
 */
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

/** 运维者层的构造值转成作者要的 JSON 树；缺值或不能表示为 JSON 时为 undefined。 */
function constructionOf(
  operator: OperatorConstruction,
  entry: ToolReleaseEntry,
): JsonValue | undefined {
  const value = operator[entry.asset.name]
  return value === undefined ? undefined : constructionTree(value)
}

/**
 * 履行非空 environment 声明的义务（R2-D80），并给出校验后的声明值。采用不是 `environmentNeedAdoption` 答 invalid；
 * 值读不成 JSON 文本或超出读取上限答 invalid；schema-provider 答 `invalid` 对应 invalid；`refused`、`unavailable`、
 * `cancelled` 或 provider 抛出都答 unavailable。只有 `valid` 才通过。声明为 null 时给 null。
 * Tool 运行时组的环境需求（`rows/tool-runtime/environment.ts`）复用同一条路径取声明值。
 */
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

/** `readEnvironmentNeed` 只取判定、不取值的形式：loader 的 `schemas` 用它。 */
export async function checkEnvironmentNeed(
  definition: ToolDefinition,
  check: EnvironmentNeedCheck,
): Promise<Outcome<void, ToolFailure>> {
  const read = await readEnvironmentNeed(definition, check)
  return 'failure' in read ? read : succeed(undefined)
}

export type ReleaseAuthorOptions = Readonly<{
  /** 执行域的 schema-provider。生产路径由行在装载时按入口的预算建立，并在行撤除时关闭。 */
  schemaProvider?: SchemaProvider
  /** 只在测试里换：映射到 `environmentNeedAdoption` 的 schema，默认是契约的 `environmentNeedSchemaRef`。 */
  environmentNeed?: SchemaRef<EnvironmentNeedProjection>
}>

/** 行自建的 provider：预算来自入口，行 fiber 撤除时关闭，之后的检查答 `refused`，即不可用。 */
function ownProvider(ctx: Context): SchemaProvider {
  const provider = createEnvironmentSchemaProvider()
  ctx.effect(() => () => closeEnvironmentSchemaProvider(provider), 'tool-host.schema-provider')
  return provider
}

/** tool-host 工厂的三个参数，绑定本行的上下文与运维者构造值。 */
export function releaseAuthorInput(
  ctx: Context,
  operator: OperatorConstruction,
  options: ReleaseAuthorOptions = {},
): LocalToolHostPluginInput<unknown, unknown, B> {
  const check: EnvironmentNeedCheck = {
    provider: options.schemaProvider ?? ownProvider(ctx),
    schema: options.environmentNeed ?? environmentNeedSchemaRef,
  }

  // The verifier is the injected authority, read again on every call.
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
            // The authors declare no host services; nothing else is handed to them.
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

  /**
   * 模块绑到清单的固定模块（R2-D82 D1）：调用方交来的模块的 executor 四项必须与清单全等，否则 invalid；
   * 真正交给 loader 的始终是快照里的固定模块，调用方给的 `createAuthor` 不会运行。contributeTool 会把固定
   * 模块包一层再交来，所以这里不能要求同一对象，改为按清单换回固定模块。
   */
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
        return loader.load({ ...input, module: fixed })
      },
    }
  }

  return Object.freeze({
    source,
    loaderFor,
    // No durable rejection store in wave 2 (named gap, wave 3); the coordinator answers unavailable.
    recordRejection: (): Promise<DurableEvidence> =>
      Promise.reject(new Error('tool-host: no durable rejection record store (wave 3)')),
  })
}
