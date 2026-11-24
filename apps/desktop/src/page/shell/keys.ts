import type { ActionItem } from '@omne-harness/shell-contract'
import { rememberFocus } from '@omne-harness/ui-kit'
import { bindActionKeys, type ActionKeys } from './dispatch.ts'
import { frameActions, regionActions, sizeActions } from './layout-actions.ts'
import { paletteActions, type PaletteSwitch } from './palette.tsx'
import type { SizeSwitch } from './sidebar.tsx'
import type { KeyTarget } from './size.ts'
import type { ShellState } from './state.ts'

const KEYS = { name: 'shell keys' }
const MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

/** The shell's own actions first, then what the modules put; a refusal or a failure is told. */
export function shellKeys(state: ShellState, size: SizeSwitch, palette: PaletteSwitch) {
  const tell = (id: string, title: string): void =>
    state.told.show(KEYS, { id, tone: 'attention', title })
  return {
    mac: MAC,
    changes: () => state.slots.items('keymap')[0]?.changes() ?? {},
    actions: (): readonly ActionItem[] => [
      ...regionActions(),
      ...sizeActions(size),
      ...frameActions(),
      ...paletteActions(palette),
      ...state.slots.items('actions'),
    ],
    refused: (action: ActionItem, reason: string) => tell(action.id, reason),
    failed: (action: ActionItem, error: unknown) => {
      console.error(error)
      tell(action.id, `${action.title}没有做成`)
    },
    leave: () => document.getElementById('shell-content')?.focus(),
  } satisfies ActionKeys
}

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
