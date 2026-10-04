import type { ToolRuntimeOperations, ToolRuntimeRegistryOperations } from '@omne-harness-lite/tool-execution-runtime'

/** Stable access path. The registered provider retains responsibility for its existing work. */
export function createToolRuntimeRegistry(): ToolRuntimeRegistryOperations {
  let current: { readonly provider: ToolRuntimeOperations } | undefined
  return Object.freeze({
    register(provider) {
      if (current) throw new Error('tool runtime already registered')
      if (!provider || ['submit', 'acquire', 'stop', 'answer'].some(k => typeof Reflect.get(provider, k) !== 'function'))
        throw new TypeError('tool runtime operations required')
      const generation = { provider }
      current = generation
      return async () => { if (current === generation) current = undefined }
    },
    async submit(request) {
      return current ? current.provider.submit(request) : { kind: 'rejected', reason: 'runtimeUnavailable' }
    },
    async acquire(access, ref) {
      return current ? current.provider.acquire(access, ref) : { kind: 'rejected', reason: 'runtimeUnavailable' }
    },
    async stop(access, ref, reason) {
      return current ? current.provider.stop(access, ref, reason) : 'unavailable'
    },
    async answer(access, ref, index, answer) {
      return current ? current.provider.answer(access, ref, index, answer) : 'unavailable'
    },
  } satisfies ToolRuntimeRegistryOperations)
}
