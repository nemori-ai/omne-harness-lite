// 发行内置作者的来源与装载器输入（简报 B3-T2a 第 4、7、8 项，L-TOOL 事实清单 §1）。
// - `source.resolve`：只从受信快照取 Shell、Files 的固定模块、配置与上下文，不按调用参数 import。
// - `loaderFor`：`createLocalToolLoader`。`settings` 核固定发行设置采用并交运维者层的构造值；`schemas` 先核
//   定义摘要与清单全等，再履行非空 environment 声明的义务（R2-D68 及补充）。
// - `recordRejection`：本波没有耐久拒绝记录仓，返回被拒绝的 Promise，协调者转为 `unavailable`（具名缺件，波 3）。
// 任何来源缺失、不一致或读不到都答失败，不默认放行。
import type { Context } from '@deepseek-ai/cordis'
import {
  environmentNeedAdoption,
  environmentNeedSchema,
} from '@omne-harness/execution-environment-contract'
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  close,
  createSchemaProvider,
  defineSchema,
  validate,
  zodDefinition,
  type SchemaProvider,
  type SchemaRef,
} from '@omne-harness/schema-provider'
import { canonicalDigest } from '@omne-harness/tool'
import type { DurableEvidence, Reply, ToolDefinition } from '@omne-harness/tool-contract'
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
import { governanceOf, type ToolReleaseEntry } from '../../entry/tool-release-manifest.ts'

type B = ToolMessageContentBlock
/** 运维者层给出的构造值，按作者名。发行层不写默认值，缺哪一项哪一个作者就答 `unavailable`。 */
export type OperatorConstruction = Readonly<Partial<Record<string, unknown>>>

/** 构造值转成 JSON 树的上限。值来自运维者配置，上限只防误配，不是发行默认值。 */
const CONSTRUCTION_LIMITS = {
  maxBytes: 65536,
  maxDepth: 8,
  maxItems: 4096,
  maxMembers: 1024,
  maxStringLength: 32768,
  maxNumberLength: 32,
}

/** 本行一代的 Schema 提供者预算。schema-provider 不给默认量级，这里只装一个环境需要 schema。 */
const SCHEMA_BUDGET = {
  maxSnapshots: 1,
  maxConstructDepth: 16,
  maxConstructNodes: 256,
  failureBackoffMs: 1000,
  maxAttempts: 3,
}

/** `environmentNeedAdoption` 映射到的 schema（R2-D68 补充）：执行环境契约的 `environmentNeedSchema`。 */
export const ENVIRONMENT_NEED_SCHEMA: SchemaRef<unknown> = defineSchema({
  id: `${environmentNeedAdoption.owner}/${environmentNeedAdoption.name}/${environmentNeedAdoption.revision}`,
  load: async () =>
    zodDefinition({
      revision: environmentNeedAdoption.revision,
      schema: environmentNeedSchema,
      numbers: 'exact-or-reject',
    }),
})

const unavailable = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency: 'tool-host', diagnostic })
const invalid = (field: string, reason: string) => fail({ kind: 'invalid' as const, field, reason })

const sameAdoption = (left: unknown, right: object): boolean =>
  typeof left === 'object' &&
  left !== null &&
  (['owner', 'name', 'revision', 'digest'] as const).every(
    field => Reflect.get(left, field) === Reflect.get(right, field),
  )

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
  if (value === undefined) return undefined
  const read = readJsonText(JSON.stringify(value), CONSTRUCTION_LIMITS)
  return read.kind === 'ok' ? read.value : undefined
}

/** 履行非空 environment 声明的义务：已知采用经 schema-provider 校验，未知或不可用都失败。 */
async function checkEnvironment(
  provider: SchemaProvider,
  schema: SchemaRef<unknown>,
  definition: ToolDefinition,
): Reply<void> {
  const environment = definition.declarations.environment
  if (environment === null) return succeed(undefined)
  if (!sameAdoption(environment.adoption, environmentNeedAdoption))
    return invalid('environment', 'unknown environment declaration adoption')
  const verdict = await validate(provider, schema, { kind: 'ok', value: environment.value })
  switch (verdict.kind) {
    case 'valid':
      return succeed(undefined)
    case 'invalid':
      return invalid('environment', 'environment need declaration is invalid')
    default:
      return unavailable(`environment need schema is not usable (${verdict.kind})`)
  }
}

export type ReleaseAuthorOptions = Readonly<{
  /** 只在测试里换：映射到 `environmentNeedAdoption` 的 schema。 */
  environmentNeed?: SchemaRef<unknown>
}>

/** tool-host 工厂的三个参数，绑定本行的上下文与运维者构造值。 */
export function releaseAuthorInput(
  ctx: Context,
  operator: OperatorConstruction,
  options: ReleaseAuthorOptions = {},
): LocalToolHostPluginInput<unknown, unknown, B> {
  const provider = createSchemaProvider(SCHEMA_BUDGET)
  const schema = options.environmentNeed ?? ENVIRONMENT_NEED_SCHEMA
  ctx.effect(
    () => () => {
      // Stop new admission; checks that already joined finish on their snapshot.
      close(provider)
    },
    'tool-host.schemas',
  )

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

  const loaderFor = (authority: ToolAuthority): ToolLoader<unknown, unknown, B> =>
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
        if (canonicalDigest(loaded.definition) !== found.entry.definition)
          return invalid('definition', 'definition digest differs from the release')
        return checkEnvironment(provider, schema, loaded.definition)
      },
    })

  return Object.freeze({
    source,
    loaderFor,
    // No durable rejection store in wave 2 (named gap, wave 3); the coordinator answers unavailable.
    recordRejection: (): Promise<DurableEvidence> =>
      Promise.reject(new Error('tool-host: no durable rejection record store (wave 3)')),
  })
}
