import { DisclosureIcon } from '../icons/kit-only.ts'
import { cn } from '../lib/utils.ts'
import { IconButton } from '../patterns/icon-button.tsx'
import { type PlaceBox, useCarry } from './carry.ts'
import { type PaperBox } from './geometry.ts'
import { boxStyle, PaperHandle } from './paper-page.tsx'
import { usePaperFrame } from './paper-surface.tsx'

const SHOWN = 4
const COLUMNS = 4

function stacked(
  open: boolean,
  leaves: readonly PileLeaf[],
): readonly { leaf: PileLeaf; depth: number }[] {
  const placed = leaves.map((leaf, depth) => ({ leaf, depth }))
  return open ? placed : placed.reverse()
}

export type PileLeaf = Readonly<{ key: string; name: string; content: React.ReactNode }>

export function PaperPile({
  box,
  name,
  leaves,
  open,
  onOpenChange,
  onPlace,
  aside,
  pending = false,
  roleDescription = '一叠',
  unnamedLabel = '没有名字的一叠',
  handleLabel,
  handleDescription = '把手',
  openLabel = '展开',
  closeLabel = '收起',
  className,
}: {
  readonly box: PaperBox
  readonly name?: string
  readonly leaves: readonly PileLeaf[]
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onPlace: PlaceBox
  readonly aside?: React.ReactNode
  readonly pending?: boolean
  readonly roleDescription?: string
  readonly unnamedLabel?: string
  readonly handleLabel?: string
  readonly handleDescription?: string
  readonly openLabel?: string
  readonly closeLabel?: string
  readonly className?: string
}): React.JSX.Element {
  const frame = usePaperFrame()
  const carry = useCarry({ box, frame, onPlace, onPress: undefined, resizable: false })
  const title = name ?? unnamedLabel
  const drawn = open ? leaves : leaves.slice(0, SHOWN)
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    onOpenChange(false)
    event.currentTarget.querySelector<HTMLElement>('[data-slot="paper-pile-toggle"]')?.focus()
  }
  return (
    <div
      role="group"
      aria-label={title}
      aria-roledescription={roleDescription}
      aria-busy={pending || undefined}
      data-paper-item=""
      data-slot="paper-pile"
      data-state={open ? 'open' : 'closed'}
      data-gesture={carry.gesture}
      className={cn('omne-paper-page omne-paper-pile', className)}
      style={
        {
          ...boxStyle(carry.shown),
          '--omne-paper-columns': Math.max(1, Math.min(leaves.length, COLUMNS)),
        } as React.CSSProperties
      }
      onKeyDown={onKeyDown}
    >
      <div className="omne-paper-name">
        <PaperHandle
          label={handleLabel ?? `挪动${title}`}
          roleDescription={handleDescription}
          onKeyDown={carry.onKeyDown}
          {...carry.grip({ gesture: 'move' })}
        >
          {name === undefined ? null : <span className="omne-paper-name-text">{name}</span>}
          <span className="omne-paper-count">{leaves.length}</span>
        </PaperHandle>
        {aside === undefined ? null : <span className="omne-paper-aside">{aside}</span>}
        <IconButton
          label={open ? closeLabel : openLabel}
          size="icon-compact"
          variant="ghost"
          aria-expanded={open}
          data-slot="paper-pile-toggle"
          onClick={() => onOpenChange(!open)}
        >
          <DisclosureIcon aria-hidden="true" className={open ? 'rotate-90' : undefined} />
        </IconButton>
      </div>
      <div className="omne-paper-pile-leaves">
        {stacked(open, drawn).map(({ leaf, depth }) => {
          const hidden = !open && depth > 0
          return (
            <div
              key={leaf.key}
              role="group"
              aria-label={leaf.name}
              aria-hidden={hidden || undefined}
              inert={hidden}
              data-depth={depth}
              className="omne-paper-pile-leaf"
              style={{ '--omne-paper-depth': depth } as React.CSSProperties}
            >
              {open ? <span className="omne-paper-name-text">{leaf.name}</span> : null}
              <div className="omne-paper-leaf">{leaf.content}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
