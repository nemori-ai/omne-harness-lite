// 两种模式各自的取名、allowlist 与清单来源（候选 3.4）。一个进程只有一种模式（DP1-C6）。
// `s0`：全部行是 S0 替身，名字带 `s0.` 前缀，allowlist 只含 `stubPlugin`。
// `serve`：名字不带前缀，真实导出用自带声明，`stubPlugin` 行用 `stubs.ts` 的表去掉前缀；唯一的 `s0.` 名字是 `s0.assemblyLifecycle`。
import type { Plugin } from '@deepseek-ai/cordis'
import * as cordisExports from './cordis.ts'
import { rowDeclarationOf, type RowDeclaration } from './row.ts'
import { trustedScopes, visibility as s0Visibility } from './s0/rows.ts'
import { rowManifests as s0Manifests } from './s0/stubs.ts'
import type { RowId, RowManifest, ServiceName, Visibility } from './types.ts'

/** `./cordis` 里 S0 替身的导出名，也是两种模式的发行配置里替身行 `plugin` 的取值。 */
export const STUB_EXPORT = 'stubPlugin'

export type Mode = 's0' | 'serve'

/** 一个经 `defineRow` 声明的导出：包装插件与读回的声明。 */
export type DeclaredExport = Readonly<{ plugin: Plugin.Object; declaration: RowDeclaration }>

export type Profile = Readonly<{
  mode: Mode
  /** 发行层与运维层 `plugin` 可取的导出名。 */
  allowlist: readonly string[]
  /** `stubPlugin` 行的清单。 */
  stubManifests: ReadonlyMap<RowId, RowManifest>
  /** 受信表：行 → 可见的受信名。 */
  visibility: Visibility
  /** 导出名 → 真实行的导出。`s0` 模式为空。 */
  declarations: ReadonlyMap<string, DeclaredExport>
}>

function isPluginObject(value: unknown): value is Plugin.Object {
  return (
    typeof value === 'object' &&
    value !== null &&
    'apply' in value &&
    typeof value.apply === 'function'
  )
}

const S0_PREFIX = 's0.'

function stripPrefix(name: ServiceName): ServiceName {
  return name.startsWith(S0_PREFIX) ? name.slice(S0_PREFIX.length) : name
}

export const s0Profile: Profile = {
  mode: 's0',
  allowlist: [STUB_EXPORT],
  stubManifests: s0Manifests,
  visibility: s0Visibility,
  declarations: new Map(),
}

const serveManifests: ReadonlyMap<RowId, RowManifest> = new Map(
  [...s0Manifests].map(([row, manifest]) => [
    row,
    {
      ...manifest,
      provides: manifest.provides.map(stripPrefix),
      injects: manifest.injects.map(stripPrefix),
    },
  ]),
)

const serveVisibility: Visibility = new Map(
  trustedScopes.map(scope => [scope.row, [...scope.names]]),
)

/**
 * `serve` 模式的配置。`plugins` 默认是 `./cordis` 的全部导出；测试可以换一张表。
 * 没有声明、又不是 `stubPlugin` 的导出不进 allowlist：发行层引用它得到 `unknown-plugin`，退出 2（DP1-C8）。
 */
export function serveProfile(plugins: Readonly<Record<string, unknown>> = cordisExports): Profile {
  const declarations = new Map<string, DeclaredExport>()
  const allowlist: string[] = []
  for (const [name, plugin] of Object.entries(plugins)) {
    if (name === STUB_EXPORT) {
      allowlist.push(name)
      continue
    }
    const declaration = rowDeclarationOf(plugin)
    if (declaration === undefined || !isPluginObject(plugin)) continue
    declarations.set(name, { plugin, declaration })
    allowlist.push(name)
  }
  return {
    mode: 'serve',
    allowlist,
    stubManifests: serveManifests,
    visibility: serveVisibility,
    declarations,
  }
}
