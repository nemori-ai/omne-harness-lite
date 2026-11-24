import type { Context } from '@deepseek-ai/cordis'
import { canonicalDigest } from '@omne-harness/tool'
import type { Access, SourceLayer, ToolAvailability } from '@omne-harness/tool-contract'
import {
  sameSourceLayer,
  type ToolMessageContentBlock,
  type ToolSourceEntry,
} from '@omne-harness/tool-contract/provider'
import {
  toolEntrySourcesKey,
  type ToolEntrySourcesService,
} from '@omne-harness/tool-cordis-contract/cordis'

export type SourcedEntries = Readonly<{
  /** Whether a source now in service owns this name. */
  owns(name: string): boolean
  /** The entry its source last listed to this asker under this name. */
  entry(access: Access<unknown>, name: string): ToolSourceEntry | undefined
}>

/** The source entry this availability is, when its source lists it so to this asker now. */
export function sourcedEntryFor(
  entries: SourcedEntries,
  access: Access<unknown>,
  availability: Pick<ToolAvailability, 'kind' | 'definition'> & Readonly<{ layer?: SourceLayer }>,
): ToolSourceEntry | undefined {
  const { layer } = availability
  if (availability.kind !== 'available' || layer === undefined) return undefined
  // A fixed request read back from the ledger carries its layer as plain data, so it is compared by text.
  if (!sameSourceLayer(layer, { kind: 'tenant', tenant: access.tenant })) return undefined
  const entry = entries.entry(access, availability.definition.name)
  return entry !== undefined &&
    canonicalDigest(entry.definition.adoption) === canonicalDigest(availability.definition.adoption)
    ? entry
    : undefined
}

/** Whether the source of this name lists it to this asker now, in its tenant: a definition kept since need not be the one it lists. */
export function sourceListsName(
  entries: SourcedEntries,
  access: Access<unknown>,
  availability: Pick<ToolAvailability, 'kind' | 'definition'> & Readonly<{ layer?: SourceLayer }>,
): boolean {
  const { layer } = availability
  if (availability.kind !== 'available' || layer === undefined) return false
  if (!sameSourceLayer(layer, { kind: 'tenant', tenant: access.tenant })) return false
  return entries.entry(access, availability.definition.name)?.availability.kind === 'available'
}

export function sourcedEntriesOf(ctx: Context): SourcedEntries {
  const sourceOf = (name: string) => {
    const service = ctx.get(toolEntrySourcesKey, false) as
      | ToolEntrySourcesService<unknown, ToolMessageContentBlock>
      | undefined
    const owners = service?.sources().filter(source => name.startsWith(source.prefix)) ?? []
    return owners.length === 1 ? owners[0] : undefined
  }
  return Object.freeze({
    owns: name => sourceOf(name) !== undefined,
    entry: (access, name) => {
      try {
        return sourceOf(name)?.select(access, name)
      } catch {
        return undefined
      }
    },
  })
}
