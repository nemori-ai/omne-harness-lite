import { useRef } from 'react'

import { type Icon as SetIcon } from '../icons/index.ts'
import { useArrival } from '../motion/motion.ts'
import { cn } from '../lib/utils.ts'

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
  className,
  role,
  still = false,
  ...rest
}: {
  readonly icon?: SetIcon
  readonly title: React.ReactNode
  readonly hint?: React.ReactNode
  readonly action?: React.ReactNode
  readonly className?: string
  readonly role?: 'status' | 'alert'

  readonly still?: boolean
  readonly 'data-testid'?: string
}): React.JSX.Element {
  const root = useRef<HTMLDivElement>(null)
  useArrival(root, { still })
  return (
    <div
      ref={root}
      className={cn('empty-state', className)}
      {...(role !== undefined && { role })}
      {...rest}
    >
      {Icon !== undefined && (
        <span className="empty-state-mark" aria-hidden="true">
          <Icon />
        </span>
      )}
      <p className="empty-state-title">{title}</p>
      {hint !== undefined && <p className="empty-state-hint">{hint}</p>}
      {action !== undefined && <div className="empty-state-action">{action}</div>}
    </div>
  )
}
