import { MAX_ASSET_PAGE } from '@omne-harness/assets'
import type { AssetsLocal } from '@omne-harness/assets-local'
import { canonicalText } from '@omne-harness/authorization'
import type {
  AssetTarget,
  SettingDefinitions,
  SettingsDefinitionRef,
  SettingsRebase,
  SettingsState,
} from '@omne-harness/settings'
import type {
  ReleaseSettingsObservation,
  ReleaseSettingsRebaseDecision,
  ReleaseSettingsRebaseResult,
} from './tenant-settings-write.ts'

export type ReleaseSettingsMaintenance = Readonly<{
  observe(target: AssetTarget): Promise<ReleaseSettingsObservation>
  rebase(
    target: AssetTarget,
    decide: ReleaseSettingsRebaseDecision,
  ): Promise<ReleaseSettingsRebaseResult>
}>
export type GovernedToolSettings = Readonly<{
  name: string
  assetRef: string
  target: AssetTarget
}>
type Reconciliation = Readonly<{
  releaseSettings: ReleaseSettingsMaintenance
  assets: Pick<AssetsLocal, 'listVersions' | 'readVersion'>
  tenantRef: string
  warn(message: string): void
}>

export function releaseRebaseAssignments(
  previous: SettingDefinitions,
  state: SettingsState,
  next: SettingDefinitions,
): SettingsRebase['assignments'] {
  const declared = (definition: SettingDefinitions, itemId: string) =>
    definition.items.find(item => item.id === itemId)
  return state.sources.flatMap(source =>
    source.values.map(({ itemId }) => {
      const before = declared(previous, itemId)
      const after = declared(next, itemId)
      const unchanged =
        before !== undefined &&
        after !== undefined &&
        canonicalText(before) === canonicalText(after)
      return { sourceId: source.id, itemId, disposition: unchanged ? 'retain' : 'discard' } as const
    }),
  )
}

async function declaredBy(
  assets: Reconciliation['assets'],
  assetRef: string,
  definitionRef: SettingsDefinitionRef,
): Promise<
  | Readonly<{ kind: 'found'; definition: SettingDefinitions }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'unknown' }>
> {
  let after: string | null = null
  do {
    const page = await assets.listVersions({ assetRef, after, limit: MAX_ASSET_PAGE })
    if (page.kind !== 'page') return { kind: 'unknown' }
    for (const version of page.versions) {
      const read = await assets.readVersion({ assetRef, version })
      if (read.kind !== 'version') return { kind: 'unknown' }
      const { declaration } = read.version
      if (
        declaration.kind === 'declared' &&
        canonicalText(declaration.definitionRef) === canonicalText(definitionRef)
      )
        return { kind: 'found', definition: declaration.definition }
    }
    after = page.next
  } while (after !== null)
  return { kind: 'absent' }
}

export async function reconcileToolSettings(
  input: Reconciliation,
  tool: GovernedToolSettings,
): Promise<void> {
  const observed = await input.releaseSettings.observe(tool.target)
  if (observed.kind !== 'changed') return
  const { definitionRef } = observed.stored
  const previous = await declaredBy(input.assets, tool.assetRef, definitionRef)
  if (previous.kind === 'unknown') return
  if (previous.kind === 'absent') {
    input.warn(
      `tool installation left the settings of tool ${tool.name} in tenant ${input.tenantRef} as stored: no version of ${tool.assetRef} declares ${canonicalText(definitionRef)}`,
    )
    return
  }
  await input.releaseSettings.rebase(tool.target, (stored, definition) =>
    canonicalText(stored.definitionRef) === canonicalText(definitionRef)
      ? releaseRebaseAssignments(previous.definition, stored.state, definition)
      : undefined,
  )
}
