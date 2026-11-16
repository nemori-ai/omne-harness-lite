import type { AssemblyReuse, CachedAssemblyMaterial } from '@omne-harness/request-context-contract'

export const CACHE_SLOT_LIMIT = 32

type Slot = Readonly<{ revision: number; material: CachedAssemblyMaterial }>
export type CacheTransaction = Readonly<{
  reuse: AssemblyReuse
  commit(): void
}>
export type GenerationCache = Readonly<{
  begin(): CacheTransaction
  clear(): void
  size(): number
}>

function slotName(parts: Readonly<{ principal: string; purpose: string }>) {
  return `${parts.principal}\u0000${parts.purpose}`
}

export function createGenerationCache(limit: number = CACHE_SLOT_LIMIT): GenerationCache {
  const slots = new Map<string, Slot>()
  let revisions = 0
  // A cleared cache must not let a call that started before the clear commit afterwards.
  let cleared = 0

  return {
    begin() {
      const startedAt = cleared
      const seen = new Map<string, number>()
      const staged = new Map<string, CachedAssemblyMaterial>()
      return {
        reuse: {
          load(input) {
            const name = slotName(input)
            const slot = slots.get(name)
            seen.set(name, slot?.revision ?? 0)
            return slot?.material ?? null
          },
          stage(material) {
            const name = slotName({
              principal: material.key.principal,
              purpose: material.key.identity.purpose,
            })
            if (!seen.has(name)) seen.set(name, slots.get(name)?.revision ?? 0)
            staged.set(name, material)
          },
        },
        commit() {
          if (cleared !== startedAt) return
          for (const [name, material] of staged) {
            if ((slots.get(name)?.revision ?? 0) !== seen.get(name)) continue
            slots.delete(name)
            slots.set(name, { revision: ++revisions, material })
            if (slots.size > limit) {
              const oldest = slots.keys().next()
              if (oldest.done !== true) slots.delete(oldest.value)
            }
          }
          staged.clear()
        },
      }
    },
    clear() {
      cleared++
      slots.clear()
    },
    size: () => slots.size,
  }
}
