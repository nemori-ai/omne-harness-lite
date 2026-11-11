// 发行内置 Tool 的两个入口对象（简报 B3-T2a 第 2、3 项，R2-D66）：
// - `toolReleaseRegistrant`：装配入口签发的系统主体加发行登记租户，作为 Shell、Files 官方贡献的登记者
//   （作者闭包的 `context.access`）。签发方式与 `toolResidencyPrincipal` 相同，不借用它。
// - `toolContributionAuthority`：同步的来源核验。启动时读 `config/tool-release.json`，按包产物清单重算已安装
//   tool-definitions 的摘要，全等才得到带发行代次的受信快照；快照不可用时一切核验答 `unavailable`。
// 两个模块共用一份按运行建立的状态（`env.once`），登记者必须排在权威之前。行经 `releaseOf` 读同一份快照。
import { readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { tenantCodec, tenantEquals, type Access, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type { ToolDefinition } from '@omne-harness/tool-contract'
import type { ToolAuthority } from '@omne-harness/tool-contract/provider'
import {
  ToolContributionAuthorityService,
  toolContributionAuthorityKey,
  type ToolContributionAuthority,
  type VerifiedAuthority,
} from '@omne-harness/tool-cordis-contract/cordis'
import type { EntryEnv, EntryObjectModule } from '../types.ts'
import { issueEntrySystemPrincipal } from './agent-host-principal.ts'
import {
  importReleaseModules,
  loadToolRelease,
  sameAdoption,
  sameEvidence,
  locateToolDefinitions,
  type ReleaseModules,
  type ToolReleaseManifest,
  type ToolReleaseSnapshot,
} from './tool-release-manifest.ts'

/** 作者闭包按这个名字取登记者（AA 运行时对象表「发行登记者」）。定义包没有键常量。 */
export const TOOL_RELEASE_REGISTRANT_KEY = 'toolReleaseRegistrant'
/** 登记者系统主体的组件名。它不在维护授予表里：登记官方贡献只经本权威的 `admits` 放行。 */
export const TOOL_RELEASE_COMPONENT = 'toolReleaseRegistrant'

/**
 * 发行登记租户：`Access` 需要租户，官方层的登记者不属于任何用户租户。取时间戳为零的标识，真实标识不会生成它；
 * `admits` 同时核主体对象本身，所以同名租户也冒充不了登记者。
 */
export const TOOL_RELEASE_TENANT: TenantId = (() => {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_00000000000000000000000000',
      account: 'acc_00000000000000000000000000',
    }),
  )
  if (!parsed.ok) throw new Error('tool-release: the release tenant text is invalid')
  return parsed.value
})()

/** 启动快照不可用时 warn 日志的记录器名（Cordis 的 `ctx.logger`）。 */
export const TOOL_RELEASE_LOGGER = 'tool-release'

export type ToolReleaseRegistrant = Access<unknown>

/** 行读到的发行事实：受信快照与登记者，或不可用。 */
export type ToolRelease =
  | Readonly<{
      kind: 'trusted'
      generation: string
      manifest: ToolReleaseManifest
      modules: ReleaseModules
    }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

type Bound = Readonly<{ access: ToolReleaseRegistrant; generation: string | null }>
type ReleaseState = { snapshot: Promise<ToolReleaseSnapshot> | null; registrant: Bound | null }

const unavailable = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, diagnostic: `toolContributionAuthority: ${diagnostic}` })

/** 结构上恰好是 `{ kind: 'official' }`。 */
function isOfficial(layer: unknown): boolean {
  return (
    typeof layer === 'object' &&
    layer !== null &&
    Reflect.get(layer, 'kind') === 'official' &&
    Object.keys(layer).length === 1
  )
}

type Trusted = Extract<ToolRelease, { kind: 'trusted' }>
type Verify = ToolContributionAuthority<unknown>['verify']
type Admits = ToolContributionAuthority<unknown>['admits']

/** 清单里与来源资产同名的条目；名字读不到时为 undefined。 */
function entryNamed(release: Trusted, asset: unknown) {
  const name = typeof asset === 'object' && asset !== null ? Reflect.get(asset, 'name') : null
  return release.manifest.entries.find(candidate => candidate.asset.name === name)
}

/** 来源与条目哪一项不全等；全等时为 null。 */
function mismatchOf(
  authority: ToolAuthority,
  entry: Trusted['manifest']['entries'][number],
  generation: string,
): string | null {
  if (!sameAdoption(Reflect.get(authority.asset, 'adoption'), entry.asset.adoption))
    return 'asset adoption differs from the release'
  if (!sameEvidence(authority.holding, entry.holding)) return 'holding differs from the release'
  if (!sameEvidence(authority.publication, entry.publication))
    return 'publication differs from the release'
  if (authority.holding.revision !== generation || authority.publication.revision !== generation)
    return 'release generation differs'
  return null
}

/** `verify` 对受信快照的判定：官方层、资产在清单里、四项采用与两项证据全等。 */
function verifyAgainst(release: Trusted, authority: ToolAuthority): ReturnType<Verify> {
  if (!isOfficial(authority.layer)) return fail({ kind: 'denied' })
  const entry = entryNamed(release, authority.asset)
  if (entry === undefined) return fail({ kind: 'denied' })
  const reason = mismatchOf(authority, entry, release.generation)
  if (reason !== null) return fail({ kind: 'invalid', reason })
  // The verified value is built from the snapshot, never from the caller's object.
  const verified: ToolAuthority = Object.freeze({
    layer: Object.freeze({ kind: 'official' as const }),
    asset: entry.asset,
    holding: entry.holding,
    publication: entry.publication,
  })
  // Only this boundary mints the brand (tool-cordis-contract `VerifiedAuthority`).
  return succeed(verified as VerifiedAuthority)
}

/** 访问就是本运行签发的登记者：同一主体对象，合法且相等的租户。 */
function isRegistrant(access: Access<unknown>, bound: Bound): boolean {
  return (
    access.principal === bound.access.principal &&
    tenantCodec.encode(access.tenant).ok &&
    tenantEquals(access.tenant, bound.access.tenant)
  )
}

/** `admits` 对受信快照的判定：官方层、登记者已安装、代次相同、访问就是登记者。 */
function admitsAgainst(
  release: Trusted,
  bound: Bound | null,
  access: Access<unknown>,
  layer: unknown,
): ReturnType<Admits> {
  if (!isOfficial(layer)) return fail({ kind: 'denied' })
  if (bound === null) return unavailable('the release registrant is not installed')
  if (bound.generation !== release.generation || !isRegistrant(access, bound))
    return fail({ kind: 'denied' })
  return succeed(undefined)
}

/** 同步核验（G7）。`release` 是行读快照的唯一入口；类里不用 `#` 私有字段（经调用方代理时 `this` 不是实例本身）。 */
export class ReleaseToolContributionAuthority extends ToolContributionAuthorityService<unknown> {
  readonly verify: Verify
  readonly admits: Admits
  readonly release: () => ToolRelease

  constructor(ctx: Context, snapshot: ToolReleaseSnapshot, registrant: () => Bound | null) {
    super(ctx)
    const release: ToolRelease =
      snapshot.kind === 'trusted'
        ? Object.freeze({
            kind: 'trusted',
            generation: snapshot.generation,
            manifest: snapshot.manifest,
            modules: snapshot.modules,
          })
        : Object.freeze({ kind: 'unavailable', diagnostic: snapshot.diagnostic })
    this.release = () => release
    this.verify = authority => {
      if (release.kind !== 'trusted') return unavailable('release snapshot unavailable')
      try {
        return verifyAgainst(release, authority)
      } catch {
        return fail({ kind: 'invalid', reason: 'authority is unreadable' })
      }
    }
    this.admits = (access, layer) => {
      if (release.kind !== 'trusted') return unavailable('release snapshot unavailable')
      try {
        return admitsAgainst(release, registrant(), access, layer)
      } catch {
        return fail({ kind: 'denied' })
      }
    }
  }
}

/** 行读快照：注入的权威若是本发行的实现，取它的快照；否则不可用。 */
export function releaseOf(ctx: Context): ToolRelease {
  const service: unknown = ctx.get(toolContributionAuthorityKey)
  return service instanceof ReleaseToolContributionAuthority
    ? service.release()
    : Object.freeze({ kind: 'unavailable', diagnostic: 'no release contribution authority' })
}

/** 行读当前登记者：没有或形状不对时为 undefined。是否就是本发行的登记者由 `admits` 判。 */
export function registrantOf(ctx: Context): ToolReleaseRegistrant | undefined {
  const value: unknown = ctx.get(TOOL_RELEASE_REGISTRANT_KEY)
  if (typeof value !== 'object' || value === null) return undefined
  const principal: unknown = Reflect.get(value, 'principal')
  const tenant: unknown = Reflect.get(value, 'tenant')
  return principal === undefined || tenant === undefined
    ? undefined
    : (value as ToolReleaseRegistrant)
}

const MEMBER_DIR = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

/** 生产读法的输入：清单与包版本取自本成员目录，tool-definitions 按 node_modules 规则定位，核对之后才 import。 */
export function productionReleaseInput(): Parameters<typeof loadToolRelease>[0] {
  return {
    manifestPath: fileURLToPath(new URL('../../config/tool-release.json', import.meta.url)),
    packageRoot: () => locateToolDefinitions(MEMBER_DIR),
    version: async () => {
      const manifest: unknown = JSON.parse(
        await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
      )
      const version: unknown =
        typeof manifest === 'object' && manifest !== null
          ? Reflect.get(manifest, 'version')
          : undefined
      if (typeof version !== 'string') throw new Error('harness-server has no version')
      return version
    },
    // Imported only after the artifacts matched, from the same root; never a path from a caller.
    importModules: importReleaseModules,
  }
}

export const loadProductionRelease = (): Promise<ToolReleaseSnapshot> =>
  loadToolRelease(productionReleaseInput())

/**
 * 建两个入口对象。`load` 只在测试里换成别的读法（例如篡改过的产物副本）；发行注册表用生产读法。
 * 每次调用有自己的 `once` 键，同一次运行只读一次清单。
 */
export function createToolReleaseEntries(
  load: () => Promise<ToolReleaseSnapshot> = loadProductionRelease,
): Readonly<{ registrant: EntryObjectModule; authority: EntryObjectModule }> {
  const key = Symbol('harness-server/tool-release')
  const create = (): ReleaseState => ({ snapshot: null, registrant: null })
  const stateOf = (env: EntryEnv) => env.once(key, create)
  const snapshotOf = (env: EntryEnv) => {
    const state = stateOf(env)
    state.snapshot ??= load().catch(() =>
      Object.freeze({ kind: 'unavailable' as const, diagnostic: 'release load failed' }),
    )
    return state.snapshot
  }
  return Object.freeze({
    registrant: {
      name: TOOL_RELEASE_REGISTRANT_KEY,
      implementation: 'real',
      async install(scope, env) {
        const principal = issueEntrySystemPrincipal(env, TOOL_RELEASE_COMPONENT)
        const access: ToolReleaseRegistrant = Object.freeze({
          principal,
          tenant: TOOL_RELEASE_TENANT,
        })
        const snapshot = await snapshotOf(env)
        stateOf(env).registrant = Object.freeze({
          access,
          generation: snapshot.kind === 'trusted' ? snapshot.generation : null,
        })
        scope.provide(TOOL_RELEASE_REGISTRANT_KEY, access)
      },
    },
    authority: {
      name: toolContributionAuthorityKey,
      implementation: 'real',
      async install(scope, env) {
        const snapshot = await snapshotOf(env)
        const state = stateOf(env)
        // Observation only: the authority still fails closed. The diagnostic is a fixed phrase.
        if (snapshot.kind === 'unavailable')
          scope
            .logger(TOOL_RELEASE_LOGGER)
            .warn(
              'tool release snapshot unavailable: %s; tool contributions are refused',
              snapshot.diagnostic,
            )
        new ReleaseToolContributionAuthority(scope, snapshot, () => state.registrant)
      },
    },
  })
}

const release = createToolReleaseEntries()
export const toolReleaseRegistrant: EntryObjectModule = release.registrant
export const toolContributionAuthority: EntryObjectModule = release.authority

const knownDefinitions = new WeakMap<
  Context,
  { generation: string; entries: Map<string, ToolDefinition> }
>()

/** Plain metadata retained for this verified release generation, independent of live contributors. */
export function rememberReleaseDefinition(
  ctx: Context,
  generation: string,
  definition: ToolDefinition,
): boolean {
  const release = releaseOf(ctx)
  if (release.kind !== 'trusted' || release.generation !== generation) return false
  const entry = release.manifest.entries.find(item => item.asset.name === definition.name)
  if (entry === undefined || entry.definition !== canonicalDigest(definition)) return false
  let known = knownDefinitions.get(ctx.root)
  if (known?.generation !== generation) {
    known = { generation, entries: new Map() }
    knownDefinitions.set(ctx.root, known)
  }
  known.entries.set(definition.name, structuredClone(definition))
  return true
}

export function releaseDefinitionOf(ctx: Context, name: string): ToolDefinition | undefined {
  const release = releaseOf(ctx)
  const known = knownDefinitions.get(ctx.root)
  if (release.kind !== 'trusted' || known?.generation !== release.generation) return undefined
  const definition = known.entries.get(name)
  return definition === undefined ? undefined : structuredClone(definition)
}
