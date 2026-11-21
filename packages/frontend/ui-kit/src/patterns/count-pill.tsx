import { cn } from '../lib/utils.ts'

const SHOWN_MAX = 99

export function CountPill({
  count,
  label,
  className,
}: {
  readonly count: number
  readonly label?: string
  readonly className?: string
}): React.JSX.Element {
  return (
    <span
      data-count-pill=""
      {...(label === undefined ? {} : { 'aria-label': label })}
      className={cn('omne-count-pill', className)}
    >
      {count > SHOWN_MAX ? `${SHOWN_MAX}+` : count}
    </span>
  )
}
