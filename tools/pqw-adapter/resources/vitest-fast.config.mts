// 差分变异用的快层配置。Stryker 与 pqw 的沙箱预检都在沙箱（当前目录）里用它起 vitest：
// 展开沙箱里成员自己的 vitest.config.ts，把 mode 固定为 fast，根目录固定为当前目录，用例时限换成变异的时限。
// 成员配置不是按 mode 的函数时选不了层，报错，不悄悄两层都跑。
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/**
 * 变异时每条用例的时限（毫秒），盖过成员配置与 vitest 缺省的 5 秒；用例自己写的时限仍盖过它。
 * 快层用例的时限按平常跑测试的负载定，差分变异时同一台机器上几个成员的 Stryker 进程一起跑，墙钟慢几倍：
 * 离时限近的用例这时超时，沙箱预检判成员无效，变异体运行里记成杀死，判定随负载变。
 * 卡住的变异体由 Stryker 自己按初跑用时定的时限掐断，不靠这个时限。
 */
export const MUTATION_TEST_TIMEOUT_MS = 60_000

interface ConfigEnv {
  readonly mode: string
  readonly command: string
}

export async function fastConfig(root: string, env: ConfigEnv) {
  const own: unknown = (await import(pathToFileURL(join(root, 'vitest.config.ts')).href)).default
  if (typeof own !== 'function')
    throw new Error(`${root}/vitest.config.ts 须写成 defineConfig(({ mode }) => …)，否则选不了快层`)
  const config = await own({ ...env, mode: 'fast' })
  // 关 preParse：Stryker 按用例名逐个过滤，preParse 只认字面量用例名，`it.each` 等生成名字的用例所在文件
  // 会被整份滤掉，只由它们守的变异体就被记成存活（omne #405）。
  return {
    ...config,
    root,
    test: {
      ...config.test,
      testTimeout: MUTATION_TEST_TIMEOUT_MS,
      experimental: { ...config.test?.experimental, preParse: false },
    },
  }
}

export default (env: ConfigEnv) => fastConfig(process.cwd(), env)
