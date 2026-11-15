import type { ThemeChoice } from '@omne-harness/ui-kit'

export const THEME_KEY = 'omne.theme'

const CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system']

export type PreferenceStore = Pick<Storage, 'getItem' | 'setItem'>

export function storedThemePreference(store: () => PreferenceStore): {
  read(): ThemeChoice
  write(choice: ThemeChoice): void
} {
  return {
    read() {
      try {
        const value = store().getItem(THEME_KEY)
        return CHOICES.find(choice => choice === value) ?? 'system'
      } catch {
        return 'system'
      }
    },
    write(choice) {
      try {
        store().setItem(THEME_KEY, choice)
      } catch {}
    },
  }
}
