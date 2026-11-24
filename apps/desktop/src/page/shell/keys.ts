import {
  blockingOverlay,
  moveRegion,
  rememberFocus,
  type SizeKeyPlatform,
} from '@omne-harness/ui-kit'
import type { KeyTarget } from './size.ts'

/** F6 walks the `data-keyboard-region` regions in page order, Shift+F6 back; a region gives back the focus it held. */
export function bindRegionKeys(target: KeyTarget, root: Document = document): () => void {
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'F6' || event.altKey || event.ctrlKey || event.metaKey) return
    if (event.defaultPrevented || event.isComposing || blockingOverlay()) return
    event.preventDefault()
    if (!event.repeat) moveRegion(event.shiftKey ? 'previous' : 'next')
  }
  const onFocus = (event: FocusEvent): void => rememberFocus(event.target)
  target.addEventListener('keydown', onKey)
  root.addEventListener('focusin', onFocus)
  return () => {
    target.removeEventListener('keydown', onKey)
    root.removeEventListener('focusin', onFocus)
  }
}

function turnsFace(event: KeyboardEvent, platform: SizeKeyPlatform): boolean {
  const held =
    platform === 'mac' ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  return held && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'p'
}

/** ⌘⇧P on the Mac, Ctrl+Shift+P elsewhere, on either face; it is not taken while there is no back to turn to. */
export function bindFaceKeys(
  target: KeyTarget,
  face: Readonly<{ two: { get(): boolean }; turn(): void }>,
  platform: SizeKeyPlatform,
): () => void {
  const onKey = (event: KeyboardEvent): void => {
    if (!turnsFace(event, platform)) return
    if (event.defaultPrevented || event.isComposing || blockingOverlay() || !face.two.get()) return
    event.preventDefault()
    if (!event.repeat) face.turn()
  }
  target.addEventListener('keydown', onKey)
  return () => target.removeEventListener('keydown', onKey)
}
