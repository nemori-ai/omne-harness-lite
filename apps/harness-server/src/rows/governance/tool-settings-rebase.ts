import { canonicalText } from '@omne-harness/authorization'
import type {
  AssetTarget,
  SettingDefinitions,
  SettingsRebase,
  SettingsState,
} from '@omne-harness/settings'
import type {
  ReleaseSettingsRebaseDecision,
  ReleaseSettingsRebaseResult,
} from './tenant-settings-write.ts'
import type { ReplacedSettings } from './tool-installation-assets.ts'

export type ReleaseSettingsMaintenance = Readonly<{
  rebase(
    target: AssetTarget,
    decide: ReleaseSettingsRebaseDecision,
  ): Promise<ReleaseSettingsRebaseResult>
}>
export type ReplacedToolSettings = Readonly<{
  target: AssetTarget
  replaced: ReplacedSettings
  next: SettingDefinitions | undefined
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

function decisionFor(replaced: ReplacedSettings): ReleaseSettingsRebaseDecision {
  if (replaced.kind !== 'declared') return () => undefined
  return (stored, definition) =>
    canonicalText(stored.definitionRef) === canonicalText(replaced.definitionRef)
      ? releaseRebaseAssignments(replaced.definition, stored.state, definition)
      : undefined
}

function undecidedReason(replaced: ReplacedSettings): string {
  return replaced.kind === 'unreadable'
    ? 'the earlier definition is unreadable'
    : 'the values were stored under another definition'
}

export async function rebaseReplacedSettings(
  input: Readonly<{ releaseSettings: ReleaseSettingsMaintenance; warn(message: string): void }>,
  { target, replaced, next }: ReplacedToolSettings,
): Promise<void> {
  if (next === undefined) return
  if (replaced.kind === 'declared' && canonicalText(replaced.definition) === canonicalText(next))
    return
  const result = await input.releaseSettings.rebase(target, decisionFor(replaced))
  if (result.kind === 'current' || result.kind === 'rebased') return
  const reason =
    result.kind === 'undecided' ? undecidedReason(replaced) : `the rebase ${result.phase} failed`
  input.warn(
    `tool installation left the settings of ${target.holdingRef} on their earlier definition: ${reason}`,
  )
}
