// Tool 运行时组的执行环境输入（B 段，L-TOOL 事实清单 §3「应用提供真实 store、custody/content、source/资格、
// Session 重签回调、无许可需求来源、当前 EE 授权/命名/精确原获取清理和配置」）。只有一种落点：宿主机
// （`host_machine`），由 `execution-host` 行的宿主提供者兑现；本发行不声称隔离。
// - `requirement`：经执行域的 schema-provider 校验 environment 声明并取值（与 `tool-host` 的 loader 同一路径，
//   R2-D80）；声明不允许宿主机落点答 denied；provider 不在（`tool-environments` 行未装）答 unavailable。
// - `binding`：origin 由调用与准备操作铸出并记进本运行的 origin 表；scope 就是固定请求的 requesterScope；
//   保留终端的账本绑在同一 scope 上。
// - `guard`：设施请求的主体经核验是本租户的会话工作主体、origin 是本运行铸的、请求里的每个路径都在文件根内：
//   cwd，文件设施的 `path`、`move`/`copy` 的 `target.path`、`commitBatch` 的每个 `entries[].path`；带了这些字段
//   却不是字符串路径的答 notAuthorized。位置与对象两条都在根内才算（R2-D374、R2-D376），见 `placeAgainstRoot`。
//   命令内容不过滤：Shell 是发行授予的能力，授权规则在 `authorization` 行，本发行不声称沙盒。
// - origin 表与账本视图按调用存，调用结清时（记录仓提交了 `settled`，见 `holder.ts`）删掉；结清后同一 origin 的
//   设施请求与命名一律不授权。
// - `naming`：路径解析到文件根内的宿主对象，取宿主对象令牌；越出文件根答 denied。
// - `facts`：落点必须是宿主机；系统、版本、架构取本进程所在主机，设施取落点的需求。
// - `cleanup.settle`：冷获取的原清理不在本波（与 L-TOOL C06 同一做法），答 pending，责任保留。
import { lstat, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { release as osRelease } from 'node:os'
import {
  originRef,
  type FacilityGuard,
  type FacilityKey,
  type IsolationClaim,
  type OriginRef,
} from '@omne-harness/execution-environment-contract'
import {
  hostObjectToken,
  hostSegmentsBelowRoot,
} from '@omne-harness/execution-environment-host-local'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { SchemaProvider } from '@omne-harness/schema-provider'
import { canonicalDigest } from '@omne-harness/tool'
import { describedAdoption } from '@omne-harness/tool-contract/provider'
import {
  createEnvironmentResourceLedger,
  createEnvironmentStateStore,
  createRetainedTerminalLedger,
  type EnvironmentStateStore,
} from '@omne-harness/tool-host-local'
import type { LocalToolRuntimeInput } from '@omne-harness/tool-host-local/cordis'
import { environmentNeedSchemaRef } from '@omne-harness/execution-environment-contract'
import { readEnvironmentNeed } from '../tool-host/release-author.ts'
import type { ReleaseToolIdentity } from './access.ts'
import { callKeyOf, lateGuarded, lateStore, type ToolRuntimeHolder } from './holder.ts'

type EnvironmentInput = LocalToolRuntimeInput['environment']
type Preparation = Parameters<EnvironmentInput['plan']['ledger']>[0]

/** 本发行的环境适配采用（固定在准备记录里）。 */
export const RELEASE_ENVIRONMENT_ADOPTION = describedAdoption({
  owner: '@omne-harness/harness-server',
  name: 'host-machine-environment',
  revision: '1',
})

export type ReleaseEnvironmentOptions = Readonly<{
  /** 宿主文件根：与 `execution-host` 行的 `filesRoot` 相同（运维者层）。 */
  filesRoot: string
  commitAttempts: number
  /** 执行域的 schema-provider；`tool-environments` 行装载时交来，缺席时需求答 unavailable。 */
  schemaProvider: () => SchemaProvider | null
}>

const unavailable = (dependency: string, diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency, diagnostic })

/** 路径在文件根之内（含文件根本身），按文字判断。相对路径按文件根解析。 */
export function withinRoot(root: string, path: string): boolean {
  const tail = relative(root, resolve(root, path))
  return (
    tail === '' ||
    (!isAbsolute(tail) && tail !== '..' && !tail.startsWith('..\\') && !tail.startsWith('../'))
  )
}

const missingCodes = new Set(['ENOENT', 'ENOTDIR'])

function missing(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : undefined
  return typeof code === 'string' && missingCodes.has(code)
}

/**
 * 宿主路径的规范形式：最近的存在者取真实路径，再接上其下还不存在的段。真实路径由系统给出：Windows 上是长名，
 * 联接与符号链接都解析到目标。`follow` 为假时，最后一段若是链接本身就不解析它，只解析它所在的目录，所以链接按它
 * 所在的位置判断，链接的语义仍由设施决定。查不了（不是「不存在」的错误）时答 undefined。
 */
async function canonicalPath(path: string, follow: boolean): Promise<string | undefined> {
  const rest: string[] = []
  let current = path
  if (!follow)
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        rest.unshift(basename(current))
        current = dirname(current)
      }
    } catch (error) {
      if (!missing(error)) return undefined
    }
  for (;;)
    try {
      return join(await realpath(current), ...rest)
    } catch (error) {
      const up = dirname(current)
      if (!missing(error) || up === current) return undefined
      rest.unshift(basename(current))
      current = up
    }
}

/**
 * 路径相对文件根的位置：`root`（文件根本身）、`inside`、`outside`。相对路径按文件根解析。两条都满足才在根内
 * （R2-D374、R2-D376）：
 * - 位置：不跟随任何链接，路径按段落在根下（`hostSegmentsBelowRoot`，与 Windows 文件后端同一个判断）。Windows 上
 *   根的某段写法不同（8.3 短名、大小写）时按目录项身份比较。`\\?\`、`\\.\`、UNC、别的盘符与 `..` 都不在根下。
 *   经根外的联接指进根内的路径也不在根下：进程按路径的文字解析 `..`，会落到根外。
 * - 对象：路径解析后的真实位置也在根的真实路径内，所以经根内的联接走出根的路径不在根内。`follow` 见
 *   `canonicalPath`。归一失败按根外处理。
 * 这是判断时的事实：判断之后链接仍可被改指，见行页的已知限制。
 */
export async function placeAgainstRoot(
  root: string,
  path: string,
  follow: boolean,
): Promise<'root' | 'inside' | 'outside'> {
  const target = resolve(root, path)
  const below = await hostSegmentsBelowRoot(root, target)
  if (below === undefined) return 'outside'
  if (below.length === 0) return 'root'
  const [canonicalRoot, canonical] = await Promise.all([
    canonicalPath(resolve(root), true),
    canonicalPath(target, follow),
  ])
  if (canonicalRoot === undefined || canonical === undefined) return 'outside'
  if (!withinRoot(canonicalRoot, canonical)) return 'outside'
  return 'inside'
}

function textField(request: object, name: string): unknown {
  return Reflect.get(request, name)
}

/** 记录里 `name` 字段的值；不是对象时答 null（随后被当成不合格的路径）。 */
function memberOf(value: unknown, name: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, name) : null
}

/** 文件设施请求里要落在文件根内的值：`path`、`target.path`、`entries[].path`（字段在时）。 */
function filePathValues(request: object): unknown[] {
  const values: unknown[] = []
  const path = textField(request, 'path')
  if (path !== undefined) values.push(path)
  const target = textField(request, 'target')
  if (target !== undefined) values.push(memberOf(target, 'path'))
  const entries = textField(request, 'entries')
  if (entries !== undefined) {
    if (!Array.isArray(entries)) values.push(null)
    else for (const entry of entries as unknown[]) values.push(memberOf(entry, 'path'))
  }
  return values
}

/**
 * 设施请求里的每个路径值（cwd 与文件设施的路径）都是文件根内的字符串路径。cwd 是命令实际运行的目录，链接解析到
 * 目标再判断；文件设施的路径不解析最后一段链接（见 `placeAgainstRoot`）。
 */
export async function confinedToRoot(
  root: string,
  facility: FacilityKey,
  request: object,
): Promise<boolean> {
  const cwd = textField(request, 'cwd')
  const checks: Array<Readonly<{ value: unknown; follow: boolean }>> =
    cwd === undefined ? [] : [{ value: cwd, follow: true }]
  if (facility === 'files')
    for (const value of filePathValues(request)) checks.push({ value, follow: false })
  for (const { value, follow } of checks)
    if (typeof value !== 'string' || (await placeAgainstRoot(root, value, follow)) === 'outside')
      return false
  return true
}

type NamingResult = Awaited<ReturnType<LocalToolRuntimeInput['environment']['naming']['name']>>

/** 取 `path` 的宿主对象令牌；`ancestor` 时向上找最近的存在者，不越出文件根。 */
async function nearestToken(
  root: string,
  path: string,
  role: 'object' | 'parent' | 'ancestor',
): Promise<NamingResult> {
  let current = role === 'parent' || role === 'ancestor' ? dirname(path) : path
  for (;;) {
    try {
      return succeed(await hostObjectToken(current))
    } catch {
      if (role !== 'ancestor' || (await placeAgainstRoot(root, current, false)) === 'root')
        return unavailable('host-object-naming', 'the exact host object could not be named')
      current = dirname(current)
      if ((await placeAgainstRoot(root, current, false)) === 'outside')
        return fail({ kind: 'denied', action: 'name-host-object' })
    }
  }
}

export type ReleaseEnvironment = Readonly<{
  input: EnvironmentInput
  /** origin → 原调用（(tenant, call) 的摘要）；只在本运行内，调用结清时删掉，重启后旧 origin 一律不授权。 */
  origins: ReadonlyMap<OriginRef, string>
}>

export function createReleaseEnvironment(
  holder: ToolRuntimeHolder,
  identity: ReleaseToolIdentity,
  options: ReleaseEnvironmentOptions,
): ReleaseEnvironment {
  const root = options.filesRoot
  const origins = new Map<OriginRef, string>()
  const state: EnvironmentStateStore = createEnvironmentStateStore({
    store: lateStore(holder),
    guarded: lateGuarded(holder),
    mode: 'production',
    commitAttempts: options.commitAttempts,
  })

  /** 本租户会话工作主体的当前资格，用于账本的授权回调。 */
  const currentAccess = async (request: Preparation) => {
    const verdict = await identity.access.guard.qualify({
      principal: request.principal,
      tenant: request.tenant,
      call: request.call,
      action: 'write',
    })
    return verdict.kind === 'allowed'
      ? ('authorized' as const)
      : verdict.kind === 'denied'
        ? ('notAuthorized' as const)
        : ('unavailable' as const)
  }

  /** (tenant, call, operation) → 账本视图；`call` 是 (tenant, call) 的摘要，结清时按它删。 */
  const ledgerViews = new Map<string, { call: string; view: ReturnType<typeof openLedgers> }>()
  function openLedgers(request: Preparation) {
    return (async () => {
      const input = {
        state,
        address: request.preparation,
        authorize: () => currentAccess(request),
      }
      const regular = await createEnvironmentResourceLedger(input)
      const retained = await createRetainedTerminalLedger({
        ...input,
        scope: request.preparation.request.requesterScope,
      })
      return { regular, retained }
    })()
  }
  const ledgers = (request: Preparation) => {
    const key = canonicalDigest([request.tenant, request.call, request.preparation.operation])
    const found = ledgerViews.get(key)
    if (found !== undefined) return found.view
    const view = openLedgers(request)
    const entry = { call: callKeyOf(request.tenant, request.call), view }
    ledgerViews.set(key, entry)
    // A failed open is not kept, so a later preparation tries again.
    view.catch(() => {
      if (ledgerViews.get(key) === entry) ledgerViews.delete(key)
    })
    return view
  }

  // A settled call forgets its origins and ledger views: the tables hold calls in flight only.
  holder.settled.add(call => {
    for (const [origin, owner] of origins) if (owner === call) origins.delete(origin)
    for (const [key, entry] of ledgerViews) if (entry.call === call) ledgerViews.delete(key)
  })
  holder.residents.set('origins', () => origins.size)
  holder.residents.set('ledgerViews', () => ledgerViews.size)

  const guard: FacilityGuard<unknown> = {
    async authorize(facility, _operation, request) {
      try {
        const session = await identity.sessionOf(request.access.principal, request.access.tenant)
        if (session === undefined || !origins.has(request.origin)) return 'notAuthorized'
        return (await confinedToRoot(root, facility, request)) ? 'authorized' : 'notAuthorized'
      } catch {
        return 'unavailable'
      }
    },
  }

  const naming: EnvironmentInput['naming'] = {
    async name(input) {
      const session = await identity.sessionOf(input.principal, input.tenant)
      if (
        session === undefined ||
        !origins.has(input.origin) ||
        (await placeAgainstRoot(root, input.path, false)) === 'outside'
      )
        return fail({ kind: 'denied', action: 'name-host-object' })
      return nearestToken(root, resolve(root, input.path), input.role)
    },
  }

  const plan: EnvironmentInput['plan'] = {
    async requirement(request) {
      if (request.preparation.request.availability.definition.declarations.environment === null)
        return succeed({
          allowedBindings: [{ kind: 'host_machine' as const }],
          facilities: [],
          isolation: [],
        })
      const provider = options.schemaProvider()
      if (provider === null)
        return unavailable('tool-environments', 'the environment schema provider is not installed')
      const need = await readEnvironmentNeed(request.preparation.request.availability.definition, {
        provider,
        schema: environmentNeedSchemaRef,
      })
      if ('failure' in need) return need
      if (need.ok === null || !need.ok.layers.includes('host_machine'))
        return fail({ kind: 'denied', action: 'host-machine-placement' })
      return succeed({
        allowedBindings: [{ kind: 'host_machine' }],
        // Validated against the contract's need schema; an unregistered key is refused at placement.
        facilities: need.ok.facilities as readonly FacilityKey[],
        isolation: need.ok.isolation as readonly IsolationClaim[],
      })
    },
    async binding(request) {
      if (!tenantCodec.encode(request.tenant).ok)
        return fail({ kind: 'denied', action: 'environment-binding' })
      const origin = originRef(`tool:${request.call}:${request.preparation.operation}`)
      origins.set(origin, callKeyOf(request.tenant, request.call))
      const view = await ledgers(request)
      const scope = request.preparation.request.requesterScope
      return succeed({ origin, scope, retention: { scope, ledger: view.retained } })
    },
    guard,
    ledger: async request => (await ledgers(request)).regular,
    async facts(placement) {
      if (placement.binding.kind !== 'host_machine')
        return unavailable('execution-host', 'the placement is not the host machine')
      return succeed({
        system: process.platform,
        release: osRelease(),
        architecture: process.arch,
        facilities: placement.requirement.facilities,
      })
    },
  }

  const input: EnvironmentInput = {
    adoption: RELEASE_ENVIRONMENT_ADOPTION,
    guarded: lateGuarded(holder),
    naming,
    cleanup: {
      settle: async () =>
        succeed({
          kind: 'pending',
          diagnostic:
            'Cold Tool acquisition cleanup is not part of wave 2; the original stays owned.',
        }),
    },
    plan,
  }
  return Object.freeze({ input, origins })
}
