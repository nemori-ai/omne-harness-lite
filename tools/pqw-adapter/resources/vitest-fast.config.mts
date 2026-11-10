// 差分变异用的快层配置。Stryker 与 pqw 的沙箱预检都在沙箱（当前目录）里用它起 vitest：
// 展开沙箱里成员自己的 vitest.config.ts，把 mode 固定为 fast，根目录固定为当前目录。
// 成员配置不是按 mode 的函数时选不了层，报错，不悄悄两层都跑。
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export default async (env: { mode: string; command: string }) => {
  const root = process.cwd()
  const own: unknown = (await import(pathToFileURL(join(root, 'vitest.config.ts')).href)).default
  if (typeof own !== 'function')
    throw new Error(`${root}/vitest.config.ts 须写成 defineConfig(({ mode }) => …)，否则选不了快层`)
  const config = await own({ ...env, mode: 'fast' })
  return { ...config, root }
}
