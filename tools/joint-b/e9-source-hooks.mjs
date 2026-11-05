// E9 适配器的源码解析钩子：经 `NODE_OPTIONS=--import=<本文件的 file URL>` 预加载，主线程和 Worker 线程
// （sqlite-provider 的读写 Worker）都注册同一份。只在 `tools/e9/cli.mjs run` 跑 line-through 世界时使用。
//
// line-through 世界的源码是 TypeScript，测试时由 vitest 解析；本仓库的检出不一定有 dist。这里与 vitest 的解析对应：
// - 包导入取 `source` 导出条件（各包 exports 都有，指向 src）；
// - `.ts` 文件里写成 `.js` 的相对导入，找不到时回落到 `.ts`。
// 只改解析，不写文件。Worker 不继承主线程里注册的钩子，也不读主线程改过的 `process.execArgv`，
// 所以必须经 NODE_OPTIONS 预加载。
import { registerHooks } from 'node:module'

export const SOURCE_HOOKS_FLAG = Symbol.for('omne-harness.e9.source-hooks')

if (globalThis[SOURCE_HOOKS_FLAG] !== true) {
  globalThis[SOURCE_HOOKS_FLAG] = true
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const conditions = context.conditions.includes('source')
        ? context.conditions
        : ['source', ...context.conditions]
      const next = { ...context, conditions }
      try {
        return nextResolve(specifier, next)
      } catch (error) {
        const fromTs = context.parentURL?.endsWith('.ts') ?? false
        if (
          error?.code === 'ERR_MODULE_NOT_FOUND' &&
          fromTs &&
          specifier.startsWith('.') &&
          specifier.endsWith('.js')
        )
          return nextResolve(`${specifier.slice(0, -3)}.ts`, next)
        throw error
      }
    },
  })
}
