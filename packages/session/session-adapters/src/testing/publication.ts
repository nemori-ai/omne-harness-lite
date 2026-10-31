/** Test scheduling lives outside the business root and never supplies a committed answer. */
export function publicationHooks() {
  const pauses = new Map<string, { reached(): void; released: Promise<void> }>()
  const faults = new Map<string, 'before-publish' | 'after-publish'>()
  return {
    pause(key: string) {
      const reached = Promise.withResolvers<void>(),
        released = Promise.withResolvers<void>()
      pauses.set(key, { reached: reached.resolve, released: released.promise })
      return { reached: reached.promise, release: () => released.resolve() }
    },
    async wait(key: string) {
      const value = pauses.get(key)
      if (value) {
        pauses.delete(key)
        value.reached()
        await value.released
      }
    },
    fault: (key: string, point: 'before-publish' | 'after-publish') => {
      faults.set(key, point)
    },
    takeFault(key: string) {
      const value = faults.get(key)
      faults.delete(key)
      return value
    },
  }
}
