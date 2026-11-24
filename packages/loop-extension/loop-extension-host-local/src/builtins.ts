import type { BuiltinExtension, BuiltinExtensions } from '@omne-harness/loop-extension-contract'
import { fail, succeed } from '@omne-harness/operation-result'

/** The builtin implementations by name. One name holds one registration; leaving withdraws only that one. */
export function createBuiltinExtensions(): BuiltinExtensions {
  const registered = new Map<string, BuiltinExtension>()
  return {
    register(name, invoke) {
      if (registered.has(name)) return fail('taken')
      const own: BuiltinExtension = (...args) => invoke(...args)
      registered.set(name, own)
      return succeed(() => {
        if (registered.get(name) === own) registered.delete(name)
      })
    },
    get: name => registered.get(name),
  }
}
