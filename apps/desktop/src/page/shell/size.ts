import type { SizeController, SizeKeyPlatform } from '@omne-harness/ui-kit'
import { bindActionKeys } from './dispatch.ts'
import { sizeActions } from './layout-actions.ts'

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
