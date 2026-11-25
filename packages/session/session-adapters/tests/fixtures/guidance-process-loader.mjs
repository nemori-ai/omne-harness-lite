import { registerHooks } from 'node:module'

// Source exports contain emitted .js specifiers; use their .ts siblings without building dist.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.')) throw error
      if (specifier.endsWith('.js')) return nextResolve(specifier.slice(0, -3) + '.ts', context)
      if (specifier.endsWith('.mjs')) return nextResolve(specifier.slice(0, -4) + '.mts', context)
      throw error
    }
  },
})
