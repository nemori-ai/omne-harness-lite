import {
  sizeStepForKey,
  stepSize,
  type SizeController,
  type SizeKeyPlatform,
  type SizeTier,
} from '@omne-harness/ui-kit'
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
  const onKey = (event: KeyboardEvent): void => {
    const step = sizeStepForKey(event, platform)
    if (step === undefined) return
    event.preventDefault()
    size.set(stepSize(size.current(), step))
  }
  target.addEventListener('keydown', onKey)
  return () => target.removeEventListener('keydown', onKey)
}
