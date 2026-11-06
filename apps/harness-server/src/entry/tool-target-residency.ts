import { fail, succeed } from '@omne-harness/operation-result'
import type { Access, Reply, ToolAvailability } from '@omne-harness/tool-contract'
import { sameBindingKey } from '@omne-harness/tool-contract/provider'
import type { LocalToolCatalogViewSource } from '@omne-harness/tool-host-local'

/** A current disclosure view does not grant execution; this check only narrows the target set. */
export async function targetResidency(
  source: LocalToolCatalogViewSource<unknown> | undefined,
  access: Access<unknown>,
  target: ToolAvailability,
  required: 'resident' | 'nonresident',
): Reply<void> {
  if (target.kind !== 'available') return fail({ kind: 'denied', action: 'target-unavailable' })
  if (source === undefined)
    return fail({
      kind: 'unavailable',
      dependency: 'toolCatalogView',
      diagnostic: 'The current target view is absent.',
    })
  const current = await source.read(access)
  if ('failure' in current) return current
  const entry = current.ok.entries.find(item =>
    sameBindingKey(item.key, {
      layer: target.layer,
      asset: { name: target.definition.name, adoption: target.definition.adoption },
    }),
  )
  if (entry === undefined) return fail({ kind: 'denied', action: 'target-not-included' })
  if (entry.resident === (required === 'resident')) return succeed(undefined)
  return fail({
    kind: 'denied',
    action: entry.resident
      ? 'resident-tools-require-direct-call'
      : 'nonresident-tools-require-forwarding',
  })
}
