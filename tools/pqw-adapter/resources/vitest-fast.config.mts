import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const MUTATION_TEST_TIMEOUT_MS = 60_000

/** 变异工具给源码插桩之后文本必然不同，按源码文本下结论的用例不参加变异。标签在 vitest.tiers.mts 声明。 */
export const SOURCE_TEXT_FILTER = '!source-text'

interface ConfigEnv {
  readonly mode: string
  readonly command: string
}

export async function fastConfig(root: string, env: ConfigEnv) {
  const own: unknown = (await import(pathToFileURL(join(root, 'vitest.config.ts')).href)).default
  if (typeof own !== 'function')
    throw new Error(`${root}/vitest.config.ts 须写成 defineConfig(({ mode }) => …)，否则选不了快层`)
  const config = await own({ ...env, mode: 'fast' })
  return {
    ...config,
    root,
    test: {
      ...config.test,
      testTimeout: MUTATION_TEST_TIMEOUT_MS,
      tagsFilter: [...(config.test?.tagsFilter ?? []), SOURCE_TEXT_FILTER],
      experimental: { ...config.test?.experimental, preParse: false },
    },
  }
}

export default (env: ConfigEnv) => fastConfig(process.cwd(), env)
