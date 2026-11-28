import { cn } from '../lib/utils.ts'
import { type DataAttributes } from '../patterns/ai/data-attributes.ts'
import { type PaperPoint } from './geometry.ts'
import { usePaperFrame } from './paper-surface.tsx'

export function PaperSpot({
  at,
  className,
  children,
  ...data
}: DataAttributes & {
  readonly at: PaperPoint
  readonly className?: string
  readonly children?: React.ReactNode
}): React.JSX.Element {
  usePaperFrame()
  return (
    <div
      {...data}
      data-paper-item=""
      data-slot="paper-spot"
      className={cn('omne-paper-spot', className)}
      style={{ '--omne-paper-x': at.x, '--omne-paper-y': at.y } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
