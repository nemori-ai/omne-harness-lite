import type { SizeController, SizeKeyPlatform, SizeTier } from '@omne-harness/ui-kit'
import { bindActionKeys } from './dispatch.ts'
import { sizeActions } from './layout-actions.ts'
import type { PreferenceStore } from './theme.ts'

export const SIZE_KEY = 'omne.size'

export function storedSizePreference(store: () => PreferenceStore): {
  read(): string | null
  write(tier: SizeTier): void
} {
  return {
    read() {
      try {
        return store().getItem(SIZE_KEY)
      } catch {
        return null
      }
    },
    write(tier) {
      try {
        store().setItem(SIZE_KEY, tier)
      } catch {}
    },
  }
}

export interface KeyTarget {
  addEventListener(type: 'keydown', listener: (event: KeyboardEvent) => void): void
  removeEventListener(type: 'keydown', listener: (event: KeyboardEvent) => void): void
}

export function bindSizeKeys(
  target: KeyTarget,
  size: SizeController,
  platform: SizeKeyPlatform,
): () => void {
  return bindActionKeys(target, { actions: () => sizeActions(size), mac: platform === 'mac' })
}
