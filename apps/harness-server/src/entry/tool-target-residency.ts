import { fail, succeed } from '@omne-harness/operation-result'
import type { Access, Reply, ToolAvailability } from '@omne-harness/tool-contract'
import { sameBindingKey } from '@omne-harness/tool-contract/provider'
import type { LocalToolCatalogViewSource } from '@omne-harness/tool-host-local'
import { sourcedEntryFor, type SourcedEntries } from './tool-entry-sources.ts'

export async function targetResidency(
  source: LocalToolCatalogViewSource<unknown> | undefined,
  access: Access<unknown>,
  target: ToolAvailability,
  required: 'resident' | 'nonresident',
  sourced?: SourcedEntries,
): Reply<void> {
  if (target.kind !== 'available') return fail({ kind: 'denied', action: 'target-unavailable' })
  const fromSource = sourced !== undefined && sourcedEntryFor(sourced, access, target) !== undefined
  if (source === undefined && fromSource)
    return required === 'nonresident'
      ? succeed(undefined)
      : fail({ kind: 'denied', action: 'nonresident-tools-require-forwarding' })
  if (source === undefined)
    return fail({
      kind: 'unavailable',
      dependency: 'toolCatalogView',
      diagnostic: 'The current target view is absent.',
    })
  const current = await source.read(access)
  if ('failure' in current) return current
  const entry = current.ok.entries.find(item =>
    fromSource
      ? item.sourced === true && item.key.asset.name === target.definition.name
      : sameBindingKey(item.key, {
          layer: target.layer,
          asset: { name: target.definition.name, adoption: target.definition.adoption },
        }),
  )
  if (entry === undefined)
    return fromSource
      ? required === 'nonresident'
        ? succeed(undefined)
        : fail({ kind: 'denied', action: 'nonresident-tools-require-forwarding' })
      : fail({ kind: 'denied', action: 'target-not-included' })
  if (entry.resident === (required === 'resident')) return succeed(undefined)
  return fail({
    kind: 'denied',
    action: entry.resident
      ? 'resident-tools-require-direct-call'
      : 'nonresident-tools-require-forwarding',
  })
}
