import { useLayoutEffect, useRef, useState } from 'react'

import { DisclosureIcon } from '../icons/kit-only.ts'
import { cn } from '../lib/utils.ts'
import { IconButton } from '../patterns/icon-button.tsx'
import { type PlaceBox, useCarry } from './carry.ts'
import {
  PAPER_NAME_LINE,
  type PaperBox,
  type PaperPoint,
  type PaperRect,
  spreadShift,
} from './geometry.ts'
import { boxStyle, PaperHandle } from './paper-page.tsx'
import { usePaperFrame } from './paper-surface.tsx'

const SHOWN = 4
const COLUMNS = 4

type Size = Readonly<{ width: number; height: number }>
type Spread = Readonly<{ by: PaperPoint; room: number }>

function stacked(
  open: boolean,
  leaves: readonly PileLeaf[],
): readonly { leaf: PileLeaf; depth: number }[] {
  const placed = leaves.map((leaf, depth) => ({ leaf, depth }))
  return open ? placed : placed.reverse()
}

export type PileLeaf = Readonly<{
  key: string
  name: string
  content: React.ReactNode
  size?: Size
}>

const rectOf = (element: Element): PaperRect => {
  const { left, top, width, height } = element.getBoundingClientRect()
  return { left, top, width, height }
}

function useSpread(open: boolean, scale: number): [React.RefObject<HTMLDivElement | null>, Spread] {
  const leaves = useRef<HTMLDivElement>(null)
  const [spread, setSpread] = useState<Spread>({ by: { x: 0, y: 0 }, room: 0 })
  useLayoutEffect(() => {
    const drawn = leaves.current
    const pile = drawn?.parentElement
    const name = pile?.querySelector('.omne-paper-name')
    const surface = drawn?.closest('.omne-paper-surface')
    if (!open || drawn == null || name == null || surface == null || !(scale > 0)) return
    const view = rectOf(surface)
    const at = rectOf(drawn)
    const here = {
      ...at,
      left: at.left - spread.by.x * scale,
      top: at.top - spread.by.y * scale,
    }
    const by = spreadShift(rectOf(name), here, view)
    const next = { by: { x: by.x / scale, y: by.y / scale }, room: view.width / scale }
    const moved = Math.abs(next.by.x - spread.by.x) + Math.abs(next.by.y - spread.by.y)
    if (moved > 0.5 || Math.abs(next.room - spread.room) > 0.5) setSpread(next)
  })
  return [leaves, spread]
}

function sizesOf(leaves: readonly PileLeaf[], box: PaperBox): readonly Size[] {
  const own = { width: box.width, height: box.height - PAPER_NAME_LINE }
  return leaves.map(leaf => leaf.size ?? own)
}

function Leaf({
  leaf,
  depth,
  open,
  size,
}: {
  readonly leaf: PileLeaf
  readonly depth: number
  readonly open: boolean
  readonly size: Size
}): React.JSX.Element {
  const hidden = !open && depth > 0
  return (
    <div
      role="group"
      aria-label={leaf.name}
      aria-hidden={hidden || undefined}
      inert={hidden}
      data-depth={depth}
      className="omne-paper-pile-leaf"
      style={
        {
          '--omne-paper-depth': depth,
          '--omne-paper-leaf-w': size.width,
          '--omne-paper-leaf-h': size.height,
        } as React.CSSProperties
      }
    >
      {open ? <span className="omne-paper-name-text omne-paper-quiet">{leaf.name}</span> : null}
      <div className="omne-paper-leaf">{leaf.content}</div>
    </div>
  )
}

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
  const sizes = sizesOf(drawn, box)
  const widths = sizes.map(size => size.width)
  const [spreadRef, spread] = useSpread(open, frame.scale)
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
          '--omne-paper-row': Math.max(COLUMNS * Math.min(...widths), Math.max(...widths)),
          '--omne-paper-room': spread.room > 0 ? spread.room : frame.sheet.width,
          '--omne-paper-spread-x': spread.by.x,
          '--omne-paper-spread-y': spread.by.y,
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
      <div ref={spreadRef} className="omne-paper-pile-leaves">
        {stacked(open, drawn).map(({ leaf, depth }) => (
          <Leaf key={leaf.key} leaf={leaf} depth={depth} open={open} size={sizes[depth]!} />
        ))}
      </div>
    </div>
  )
}
