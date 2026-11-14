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
