import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const MUTATION_TEST_TIMEOUT_MS = 60_000

/** 变异工具给源码插桩之后文本必然不同，按源码文本下结论的用例不参加变异。标签在 vitest.tiers.mts 声明。 */
export const SOURCE_TEXT_FILTER = '!source-text'

/** 适配层点名的用例文件（相对成员目录，逗号分隔）：给了就只跑它们，预检与初跑都是。 */
export const TESTS_ENV = 'OMNE_MUTATION_TESTS'

export const namedTests = (env: Readonly<Record<string, string | undefined>>): string[] =>
  (env[TESTS_ENV] ?? '').split(',').filter(path => path !== '')

interface ConfigEnv {
  readonly mode: string
  readonly command: string
}

export async function fastConfig(root: string, env: ConfigEnv, tests: readonly string[] = []) {
  const own: unknown = (await import(pathToFileURL(join(root, 'vitest.config.ts')).href)).default
  if (typeof own !== 'function')
    throw new Error(`${root}/vitest.config.ts 须写成 defineConfig(({ mode }) => …)，否则选不了快层`)
  const config = await own({ ...env, mode: 'fast' })
  return {
    ...config,
    root,
    test: {
      ...config.test,
      ...(tests.length === 0 ? {} : { include: [...tests] }),
      testTimeout: MUTATION_TEST_TIMEOUT_MS,
      tagsFilter: [...(config.test?.tagsFilter ?? []), SOURCE_TEXT_FILTER],
      experimental: { ...config.test?.experimental, preParse: false },
    },
  }
}

export default (env: ConfigEnv) => fastConfig(process.cwd(), env, namedTests(process.env))
