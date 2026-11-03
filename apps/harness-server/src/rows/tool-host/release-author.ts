// 发行内置作者的来源与装载器输入（简报 B3-T2a 第 4、7、8 项，L-TOOL 事实清单 §1）。
// - `source.resolve`：只从受信快照取 Shell、Files 的固定模块、配置与上下文，不按调用参数 import。
// - `loaderFor`：`createLocalToolLoader`。`settings` 核固定发行设置采用并交运维者层的构造值；`schemas` 先核
//   定义摘要与清单全等，再履行非空 environment 声明的义务（R2-D68 及补充，R2-D79 改为契约自带的 Standard Schema）。
// - `recordRejection`：本波没有耐久拒绝记录仓，返回被拒绝的 Promise，协调者转为 `unavailable`（具名缺件，波 3）。
// 任何来源缺失、不一致或读不到都答失败，不默认放行。
import type { Context } from '@deepseek-ai/cordis'
import {
  environmentNeedAdoption,
  environmentNeedSchema,
} from '@omne-harness/execution-environment-contract'
import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
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
 * `environmentNeedAdoption` 映射到的校验件（R2-D79）：执行环境契约自带的 Standard Schema
 * `environmentNeedSchema` 的同步 `validate`。只取它的 `~standard.validate`，不经 schema-provider。
 */
export type EnvironmentNeedValidator = Readonly<{
  '~standard': Readonly<{ validate(value: unknown): unknown }>
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

/** 同步调用契约校验件；抛出时为 undefined（调用方答 unavailable）。 */
function runValidator(validator: EnvironmentNeedValidator, value: unknown): unknown {
  try {
    return validator['~standard'].validate(value)
  } catch {
    return undefined
  }
}

/** 把校验件的结果读成判定。只有明确的 `{ value }` 通过；非空 issues 是 invalid；其余都不可用。 */
function verdictOf(result: unknown): Outcome<void, ToolFailure> {
  if (typeof result !== 'object' || result === null)
    return unavailable('environment need validator threw or gave no result')
  if (result instanceof Promise || typeof Reflect.get(result, 'then') === 'function') {
    // A Promise is outside the synchronous contract; settle it quietly and fail closed.
    void Promise.resolve(result).catch(() => undefined)
    return unavailable('environment need validator is not synchronous')
  }
  const issues: unknown = Reflect.get(result, 'issues')
  if (Array.isArray(issues) && issues.length > 0)
    return invalid('environment', 'environment need declaration is invalid')
  return issues === undefined && 'value' in result
    ? succeed(undefined)
    : unavailable('environment need validator gave an unreadable result')
}

/**
 * 履行非空 environment 声明的义务（R2-D79）。采用不是 `environmentNeedAdoption` 答 invalid；契约校验件报
 * issues 答 invalid；校验件抛出、返回 Promise 或返回读不懂的结果答 unavailable。只有明确的 `{ value }` 才通过。
 */
export function checkEnvironmentNeed(
  definition: ToolDefinition,
  validator: EnvironmentNeedValidator = environmentNeedSchema,
): Outcome<void, ToolFailure> {
  const environment = definition.declarations.environment
  if (environment === null) return succeed(undefined)
  if (!sameAdoption(environment.adoption, environmentNeedAdoption))
    return invalid('environment', 'unknown environment declaration adoption')
  let value: unknown
  try {
    value = JSON.parse(writeJsonText(environment.value))
  } catch {
    return invalid('environment', 'environment need declaration is not JSON')
  }
  return verdictOf(runValidator(validator, value))
}

export type ReleaseAuthorOptions = Readonly<{
  /** 只在测试里换：映射到 `environmentNeedAdoption` 的校验件，默认是契约的 `environmentNeedSchema`。 */
  environmentNeed?: EnvironmentNeedValidator
}>

/** tool-host 工厂的三个参数，绑定本行的上下文与运维者构造值。 */
export function releaseAuthorInput(
  ctx: Context,
  operator: OperatorConstruction,
  options: ReleaseAuthorOptions = {},
): LocalToolHostPluginInput<unknown, unknown, B> {
  const validator = options.environmentNeed ?? environmentNeedSchema

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
        return checkEnvironmentNeed(loaded.definition, validator)
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
