import { Dialog as PalettePrimitive } from 'radix-ui'
import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Input } from '../controls/input.tsx'
import { cn } from '../lib/utils.ts'
import { EmptyState } from './empty-state.tsx'

export type PaletteItem = Readonly<{
  id: string
  title: string
  group: string
  hint?: string
  words?: string
  unavailable?: string
}>

function KeyCap({ children }: { readonly children: ReactNode }) {
  return <kbd className="omne-keycap">{children}</kbd>
}

const matches = (item: PaletteItem, query: string): boolean => {
  const needle = query.trim().toLowerCase()
  if (needle === '') return true
  return [item.title, item.id, item.hint ?? '', item.words ?? ''].some(text =>
    text.toLowerCase().includes(needle),
  )
}

function groupsOf(items: readonly PaletteItem[]): readonly (readonly [string, PaletteItem[]])[] {
  const groups = new Map<string, PaletteItem[]>()
  for (const item of items) groups.set(item.group, [...(groups.get(item.group) ?? []), item])
  return [...groups.entries()]
}

const STEPS: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 }

export function CommandPalette({
  open,
  onOpenChange,
  label,
  placeholder,
  items,
  onPick,
  empty,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly label: string
  readonly placeholder: string
  readonly items: readonly PaletteItem[]
  readonly onPick?: (id: string) => void
  readonly empty: string
}) {
  const [query, setQuery] = useState('')
  const origin = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (open) {
      origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      return
    }
    setQuery('')
    setAt(0)
  }, [open])
  const [at, setAt] = useState(0)
  const listId = useId()
  const shown = useMemo(() => items.filter(item => matches(item, query)), [items, query])
  const selected = shown[Math.min(at, shown.length - 1)]
  const pick = (item: PaletteItem | undefined): void => {
    if (item === undefined || item.unavailable !== undefined || onPick === undefined) return
    onOpenChange(false)
    onPick(item.id)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) return
    const step = STEPS[event.key]
    if (step !== undefined && shown.length > 0) {
      event.preventDefault()
      setAt((Math.min(at, shown.length - 1) + step + shown.length) % shown.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      pick(selected)
    }
  }
  return (
    <PalettePrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <PalettePrimitive.Portal>
        <PalettePrimitive.Content
          className="omne-palette fixed z-50 bg-surface-overlay shadow-overlay"
          data-keyboard-modal=""
          aria-describedby={undefined}
          onCloseAutoFocus={event => {
            event.preventDefault()
            origin.current?.focus({ preventScroll: true })
            origin.current = null
          }}
        >
          <PalettePrimitive.Title className="sr-only">{label}</PalettePrimitive.Title>
          <Input
            className="omne-palette-search"
            aria-label={placeholder}
            placeholder={placeholder}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={selected === undefined ? undefined : `${listId}-${selected.id}`}
            value={query}
            onChange={event => {
              setQuery(event.target.value)
              setAt(0)
            }}
            onKeyDown={onKeyDown}
          />
          <div id={listId} role="listbox" aria-label={label} className="omne-palette-list">
            {shown.length === 0 ? <EmptyState title={empty} still /> : null}
            {groupsOf(shown).map(([group, members]) => (
              <div key={group} role="group" aria-label={group}>
                <p className="omne-palette-group" aria-hidden="true">
                  {group}
                </p>
                {members.map(item => (
                  <div
                    key={item.id}
                    id={`${listId}-${item.id}`}
                    role="option"
                    aria-selected={item === selected}
                    aria-disabled={item.unavailable !== undefined}
                    className={cn('omne-palette-row', item === selected && 'is-selected')}
                    data-glide-row=""
                    onMouseDown={event => {
                      event.preventDefault()
                      pick(item)
                    }}
                  >
                    <span>{item.title}</span>
                    {item.unavailable === undefined ? null : (
                      <span className="omne-palette-why">{item.unavailable}</span>
                    )}
                    {item.hint === undefined ? null : <KeyCap>{item.hint}</KeyCap>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </PalettePrimitive.Content>
      </PalettePrimitive.Portal>
    </PalettePrimitive.Root>
  )
}
