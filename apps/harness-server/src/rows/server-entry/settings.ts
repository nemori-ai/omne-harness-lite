import type { Context } from '@deepseek-ai/cordis'
import type { SettingsGovernance } from '@omne-harness/server-entry'
import { settingsSecretItemsKey, type SettingsSecretItemsService } from '../settings/index.ts'

const ABSENT = Object.freeze({ kind: 'basis-unavailable' as const })

export function settingsOfCall(ctx: Context): SettingsGovernance {
  const current = (): SettingsSecretItemsService | undefined => ctx.get(settingsSecretItemsKey)
  return Object.freeze({
    async list(input) {
      const settings = current()
      return settings === undefined ? ABSENT : settings.list(input)
    },
    async set(input) {
      const settings = current()
      return settings === undefined ? ABSENT : settings.set(input)
    },
    async describe(input) {
      const settings = current()
      return settings === undefined ? ABSENT : settings.describe(input)
    },
    async clear(input) {
      const settings = current()
      return settings === undefined ? ABSENT : settings.clear(input)
    },
  } satisfies SettingsGovernance)
}
