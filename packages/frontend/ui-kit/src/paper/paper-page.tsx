import { cn } from '../lib/utils.ts'
import { KEY_SHORTCUTS, type PlaceBox, useCarry } from './carry.ts'
import { PAPER_NAME_LINE, type PaperBox, type PaperCorner } from './geometry.ts'
import { PaperEdge } from './paper-edge.tsx'
import { usePaperFrame } from './paper-surface.tsx'

const CORNERS: readonly PaperCorner[] = ['nw', 'ne', 'sw', 'se']

export function boxStyle(box: PaperBox): React.CSSProperties {
  return {
    '--omne-paper-x': box.x,
    '--omne-paper-y': box.y,
    '--omne-paper-w': box.width,
    '--omne-paper-h': box.height,
  } as React.CSSProperties
}

export function PaperHandle({
  label,
  roleDescription,
  onKeyDown,
  children,
  ...pointer
}: {
  readonly label: string
  readonly roleDescription: string
  readonly onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void
  readonly children: React.ReactNode
  readonly onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
  readonly onPointerMove: (event: React.PointerEvent<HTMLElement>) => void
  readonly onPointerUp: (event: React.PointerEvent<HTMLElement>) => void
  readonly onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void
}): React.JSX.Element {
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-roledescription={roleDescription}
      aria-keyshortcuts={KEY_SHORTCUTS}
      data-control="paper-handle"
      data-slot="paper-handle"
      className="omne-paper-handle"
      onKeyDown={onKeyDown}
      {...pointer}
    >
      {children}
    </span>
  )
}

export function PaperPage({
  box,
  name,
  aside,
  onPlace,
  onPress,
  locked = false,
  pending = false,
  selected = false,
  roleDescription = '页',
  handleLabel,
  handleDescription = '把手',
  edgeKey,
  className,
  children,
}: {
  readonly box: PaperBox
  readonly name: string
  readonly edgeKey?: string
  readonly aside?: React.ReactNode
  readonly onPlace: PlaceBox
  readonly onPress?: () => void
  readonly locked?: boolean
  readonly pending?: boolean
  readonly selected?: boolean
  readonly roleDescription?: string
  readonly handleLabel?: string
  readonly handleDescription?: string
  readonly className?: string
  readonly children?: React.ReactNode
}): React.JSX.Element {
  const frame = usePaperFrame()
  const carry = useCarry({ box, frame, onPlace, onPress, resizable: true })
  return (
    <div
      role="group"
      aria-label={name}
      aria-roledescription={roleDescription}
      aria-busy={pending || undefined}
      data-paper-item=""
      data-slot="paper-page"
      data-selected={selected || undefined}
      data-locked={locked || undefined}
      data-gesture={carry.gesture}
      className={cn('omne-paper-page', className)}
      style={boxStyle(carry.shown)}
    >
      <div className="omne-paper-name">
        {locked ? (
          <span className="omne-paper-name-text omne-paper-quiet">{name}</span>
        ) : (
          <PaperHandle
            label={handleLabel ?? `挪动${name}`}
            roleDescription={handleDescription}
            onKeyDown={carry.onKeyDown}
            {...carry.grip({ gesture: 'move' })}
          >
            <span className="omne-paper-name-text omne-paper-quiet">{name}</span>
          </PaperHandle>
        )}
        {aside === undefined ? null : <span className="omne-paper-aside">{aside}</span>}
      </div>
      <div className="omne-paper-leaf">{children}</div>
      {selected ? (
        <PaperEdge
          width={carry.shown.width}
          height={carry.shown.height - PAPER_NAME_LINE}
          edgeKey={edgeKey ?? name}
        />
      ) : null}
      {locked
        ? null
        : CORNERS.map(corner => (
            <span
              key={corner}
              aria-hidden="true"
              data-control="paper-handle"
              data-corner={corner}
              className="omne-paper-corner"
              {...carry.grip({ gesture: 'resize', corner })}
            />
          ))}
    </div>
  )
}
