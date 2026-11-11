// 本适配层调用的外部入口的位置，全部相对 Git 根。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** pqw-skills 的子模块：钉住的提交，是下限。 */
export const PQW_VENDOR = '.meta_harness/agents/vendor/pqw-skills'

/** 接入约定版本相同的最新发行版，由 `pqw_contract.py` 解到这里；不进 Git。 */
export const PQW_FLOAT = '.meta_harness/.vendor-float/pqw-skills'

const PQW_PINNED = '.meta_harness/agents/pqw/contract-version'
const PQW_CONTRACT = 'design/consumer-contract.json'

/** 读不到或不是数字时没有值：两边都按「没有」处理。 */
function versionIn(path: string, parse: (text: string) => unknown): number | undefined {
  if (!existsSync(path)) return undefined
  const value = parse(readFileSync(path, 'utf8'))
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

/**
 * pqw slice-closeout 自带的两个脚本所在目录（绝对路径，只读）。
 * 与技能正文读同一处：浮动副本的接入约定版本等于项目钉的版本时读它，否则读子模块。
 * 规则与 `.meta_harness/tooling/src/pqw_contract.py` 的 `root` 相同。
 */
export function pqwScripts(root: string): string {
  const pinned = versionIn(join(root, PQW_PINNED), text => Number(text.trim()))
  const floated = versionIn(
    join(root, PQW_FLOAT, PQW_CONTRACT),
    text => (JSON.parse(text) as { version?: unknown }).version,
  )
  const source = pinned !== undefined && floated === pinned ? PQW_FLOAT : PQW_VENDOR
  return join(root, source, 'skills/slice-closeout/scripts')
}

/** Stryker 与它的 vitest runner 由本适配层的 devDependencies 声明，装在本成员的 node_modules。 */
export const STRYKER_MODULES = 'tools/pqw-adapter/node_modules'

/**
 * 只跑快层的 vitest 配置：差分变异经 pqw 的 --vitest-config 交给 Stryker 与沙箱预检。
 * omne 的层由 vitest 的 mode 选，Stryker 不传 mode，所以要一份把 mode 固定为 fast 的配置。
 */
export const FAST_VITEST_CONFIG = fileURLToPath(
  new URL('../resources/vitest-fast.config.mts', import.meta.url),
)

/** 成员目录到产物文件名的 slug：`/` 换成 `__`，与 omne metrics 的产物命名相同。 */
export const slugOf = (member: string): string => member.replaceAll('/', '__')
