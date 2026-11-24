import { DisclosureIcon } from '../icons/kit-only.ts'
import { cn } from '../lib/utils.ts'
import { ActionTooltip, IconButton } from './icon-button.tsx'

export type DotMark = 'waiting' | 'filled' | 'failed' | 'quiet'

export type PagerDot = Readonly<{
  key: string
  label: string
  mark: DotMark
  controls?: string
}>

const MOVES: Readonly<Record<string, (at: number, count: number) => number>> = {
  ArrowRight: at => at + 1,
  ArrowLeft: at => at - 1,
  Home: () => 0,
  End: (_at, count) => count - 1,
}

export function DotPager({
  label,
  dots,
  current,
  onCurrentChange,
  previousLabel,
  nextLabel,
  className,
}: {
  readonly label: string
  readonly dots: readonly PagerDot[]
  readonly current: string
  readonly onCurrentChange: (key: string) => void
  readonly previousLabel: string
  readonly nextLabel: string
  readonly className?: string
}): React.JSX.Element {
  const at = Math.max(
    dots.findIndex(dot => dot.key === current),
    0,
  )
  const go = (index: number): void => {
    const dot = dots[index]
    if (dot !== undefined) onCurrentChange(dot.key)
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const move = MOVES[event.key]
    if (move === undefined) return
    event.preventDefault()
    const index = move(at, dots.length)
    go(index)
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus()
  }
  const step = (by: -1 | 1, name: string, glyph: React.ReactNode) => {
    const stuck = dots[at + by] === undefined
    return (
      <IconButton
        label={name}
        size="icon-compact"
        aria-disabled={stuck || undefined}
        onClick={() => go(at + by)}
      >
        {glyph}
      </IconButton>
    )
  }
  return (
    <div className={cn('omne-dot-pager', className)}>
      <div role="tablist" aria-label={label} className="omne-dot-pager-dots" onKeyDown={onKeyDown}>
        {dots.map((dot, index) => (
          <ActionTooltip key={dot.key} label={dot.label}>
            <button
              type="button"
              role="tab"
              aria-label={dot.label}
              aria-selected={index === at}
              aria-controls={dot.controls}
              tabIndex={index === at ? 0 : -1}
              data-control="segment"
              data-state={index === at ? 'active' : 'inactive'}
              data-mark={dot.mark}
              className="omne-dot"
              onClick={() => go(index)}
            />
          </ActionTooltip>
        ))}
      </div>
      <div className="omne-dot-pager-steps">
        {step(-1, previousLabel, <DisclosureIcon aria-hidden="true" className="rotate-180" />)}
        {step(1, nextLabel, <DisclosureIcon aria-hidden="true" />)}
      </div>
    </div>
  )
}
