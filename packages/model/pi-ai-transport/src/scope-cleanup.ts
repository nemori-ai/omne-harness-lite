import type { ImagePreparer } from './image-preparation/types.ts'

/** One construction owner's bounded set of preparers, deduplicated across entries. */
export function createScopeCleaner(resources: readonly Pick<ImagePreparer, 'clearScope'>[]): {
  readonly clear: (scope: object) => void
  readonly drain: () => Promise<void>
} {
  const preparers = [...new Set(resources)]
  const pending = new WeakMap<object, Set<Pick<ImagePreparer, 'clearScope'>>>()
  const active = new Set<Promise<void>>()
  function ownInvalidCompletion(
    value: unknown,
    scope: object,
    preparer: Pick<ImagePreparer, 'clearScope'>,
  ): void {
    if (
      value &&
      (typeof value === 'object' || typeof value === 'function') &&
      'then' in value &&
      typeof value.then === 'function'
    ) {
      const scopes = pending.get(scope) ?? new Set<Pick<ImagePreparer, 'clearScope'>>()
      scopes.add(preparer)
      pending.set(scope, scopes)
      const completion = Promise.resolve(value)
        .then(
          () => {},
          () => {},
        )
        .finally(() => {
          scopes.delete(preparer)
          active.delete(completion)
        })
      active.add(completion)
    }
  }
  return {
    clear(scope) {
      if (!scope || typeof scope !== 'object') throw new TypeError('object reuse scope required')
      const errors: unknown[] = []
      for (const preparer of preparers) {
        try {
          if (pending.get(scope)?.has(preparer)) throw new TypeError('scope cleanup still pending')
          const value: unknown = preparer.clearScope(scope)
          if (value === undefined) continue
          ownInvalidCompletion(value, scope, preparer)
          throw new TypeError('scope cleanup must synchronously return undefined')
        } catch (error) {
          errors.push(error)
        }
      }
      if (errors.length === 1) throw errors[0]
      if (errors.length) throw new AggregateError(errors, 'scope cleanup failed')
    },
    drain: async () => {
      await Promise.all([...active])
    },
  }
}
