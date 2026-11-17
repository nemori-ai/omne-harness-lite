import type { AttachedEntry } from '@omne-harness/shell-contract'
import { Button, Segmented } from '@omne-harness/ui-kit'
import { useState, useSyncExternalStore } from 'react'

const NARROW = '(max-width: 767px)'

function subscribeNarrow(listener: () => void): () => void {
  const media = window.matchMedia(NARROW)
  media.addEventListener('change', listener)
  return () => media.removeEventListener('change', listener)
}

const isNarrow = (): boolean => window.matchMedia(NARROW).matches

const titleOf = (entry: AttachedEntry): string => entry.label ?? entry.id

export function SidePanel({ entries }: { readonly entries: readonly AttachedEntry[] }) {
  const [chosen, setChosen] = useState<string | undefined>(undefined)
  const [foldedByPerson, setFoldedByPerson] = useState<boolean | undefined>(undefined)
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow)
  const active = entries.find(entry => entry.id === chosen) ?? entries[0]
  if (active === undefined) return null
  const folded = foldedByPerson ?? narrow
  return (
    <aside className="omne-session-side" data-folded={folded} aria-label="会话的侧边区">
      <div className="omne-session-side-bar">
        {folded ? null : entries.length > 1 ? (
          <Segmented
            label="侧边区的页签"
            value={active.id}
            onValueChange={setChosen}
            options={entries.map(entry => ({ value: entry.id, label: titleOf(entry) }))}
          />
        ) : (
          <span className="omne-session-side-title">{titleOf(active)}</span>
        )}
        <Button variant="ghost" onClick={() => setFoldedByPerson(!folded)}>
          {folded ? '展开侧边区' : '收起侧边区'}
        </Button>
      </div>
      <div className="omne-session-side-body" hidden={folded}>
        {entries.map(entry => (
          <div key={entry.id} data-side-pane={entry.id} hidden={entry.id !== active.id}>
            {entry.node}
          </div>
        ))}
      </div>
    </aside>
  )
}
