// 本适配层调用的外部入口的位置，全部相对 Git 根。
import { fileURLToPath } from 'node:url'

/** pqw slice-closeout 自带的两个脚本所在目录（子模块，只读）。 */
export const PQW_SCRIPTS = '.meta_harness/agents/vendor/pqw-skills/skills/slice-closeout/scripts'

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
