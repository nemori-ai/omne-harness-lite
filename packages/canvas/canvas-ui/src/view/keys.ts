/** The keys of the sheet, each shown beside its menu item; the paper's own move and size keys are the kit's. */
export const KEYS = {
  select: { keys: ' ', shown: '空格' },
  pile: { keys: 'g', shown: 'G' },
  lock: { keys: 'l', shown: 'L' },
  take: { keys: 'Delete Backspace', shown: '⌫' },
  rename: { keys: 'F2', shown: 'F2' },
  scatter: { keys: 's', shown: 'S' },
  out: { keys: 'o', shown: 'O' },
} as const

export type KeyAct = keyof typeof KEYS

/** What `aria-keyshortcuts` says of an act. */
export const shortcutOf = (act: KeyAct): string =>
  KEYS[act].keys
    .split(' ')
    .map(key => (key.length === 1 ? key.toUpperCase() : key))
    .join(' ')

/** The act a key press asks for; none for a press with a modifier, or from a field being typed in. */
export function actOf(event: React.KeyboardEvent): KeyAct | undefined {
  if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return undefined
  const target = event.target as Element
  if (target.closest('input, textarea, [contenteditable="true"]') !== null) return undefined
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  for (const [act, { keys }] of Object.entries(KEYS))
    if (act !== 'select' && keys.split(' ').includes(key)) return act as KeyAct
  return undefined
}
