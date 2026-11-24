import { rememberFocus } from '@omne-harness/ui-kit'
import { bindActionKeys, type ActionKeys } from './dispatch.ts'
import { regionActions } from './layout-actions.ts'
import type { KeyTarget } from './size.ts'

/** The shell's keys: one dispatcher over the actions, and the focus each region last held. */
export function bindShellKeys(
  target: KeyTarget,
  keys: ActionKeys,
  root: Document = document,
): () => void {
  const unbind = bindActionKeys(target, keys)
  const onFocus = (event: FocusEvent): void => rememberFocus(event.target)
  root.addEventListener('focusin', onFocus)
  return () => {
    unbind()
    root.removeEventListener('focusin', onFocus)
  }
}

/** F6 walks the `data-keyboard-region` regions in page order, Shift+F6 back; a region gives back the focus it held. */
export function bindRegionKeys(target: KeyTarget, root: Document = document): () => void {
  return bindShellKeys(target, { actions: regionActions, mac: false }, root)
}
