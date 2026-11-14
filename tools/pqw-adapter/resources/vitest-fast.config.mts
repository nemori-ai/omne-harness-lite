import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

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
