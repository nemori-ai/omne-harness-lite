import { blockingOverlay, moveRegion, rememberFocus } from '@omne-harness/ui-kit'
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
