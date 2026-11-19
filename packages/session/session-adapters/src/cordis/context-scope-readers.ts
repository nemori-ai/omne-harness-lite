import type { TenantId } from '@omne-harness/legal-identity'
import type {
  ConsumerClass,
  ContextBlockKey,
  NeedBinding,
  NeedBindingRef,
  ScopeRef,
} from '@omne-harness/runtime-context-contract'

export type Registered = Readonly<{
  bindings: readonly NeedBinding[]
  checkpointed: boolean
}>

/** The scope a Session scope of this tenant hangs under: the tenant-level scope, when there is one. */
export type ParentScope = (tenant: TenantId) => ScopeRef | undefined

export function under(
  parentOf: ParentScope | undefined,
  scope: ScopeRef,
  tenant: TenantId,
): ScopeRef {
  const parent = parentOf?.(tenant)
  return parent === undefined ? scope : { ...scope, parent }
}

export function readableBy(
  final: ReadonlyMap<ContextBlockKey, Registered>,
  consumer: ConsumerClass,
): Readonly<{ keys: readonly ContextBlockKey[]; bindings: readonly NeedBindingRef[] }> {
  const keys = new Set<ContextBlockKey>()
  const bindings: NeedBindingRef[] = []
  for (const registered of final.values())
    for (const binding of registered.bindings) {
      if (binding.need.consumer !== consumer) continue
      if (binding.translate === undefined) keys.add(binding.key)
      else bindings.push({ need: binding.need.name, key: binding.key })
    }
  return { keys: [...keys], bindings }
}
