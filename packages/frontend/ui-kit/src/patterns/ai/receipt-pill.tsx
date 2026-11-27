import { useRef } from 'react'

import { useArrival } from '../../motion/motion.ts'
import { cn } from '../../lib/utils.ts'
import { FACT_TONE, TONE_BADGE, TONE_SURFACE, type Fact } from './tone.ts'
import { CancelledIcon, CloseIcon, DoneIcon, type Icon as SetIcon } from '../../icons/index.ts'
import { UnknownIcon } from '../../icons/kit-only.ts'

export type ReceiptTone = 'accepted' | 'declined' | 'unknown' | 'cancelled'

const RECEIPT_FACT: Record<ReceiptTone, Fact> = {
  accepted: 'done',
  declined: 'released',
  unknown: 'unknown',
  cancelled: 'released',
}

const RECEIPT_ICON: Record<ReceiptTone, SetIcon> = {
  accepted: DoneIcon,
  declined: CloseIcon,
  unknown: UnknownIcon,
  cancelled: CancelledIcon,
}

export function ReceiptPill({
  tone,
  children,
  meta,
  action,
  still = false,
  className,
}: {
  readonly tone: ReceiptTone
  readonly children: React.ReactNode

  readonly meta?: string

  readonly action?: React.ReactNode

  readonly still?: boolean
  readonly className?: string
}): React.JSX.Element {
  const family = FACT_TONE[RECEIPT_FACT[tone]]
  const Icon = RECEIPT_ICON[tone]
  const root = useRef<HTMLSpanElement>(null)
  useArrival(root, { still })

  return (
    <span
      ref={root}
      data-receipt-pill=""
      data-outcome={tone}
      data-tone={family}
      className={cn(
        'inline-flex h-(--omne-chip-height) w-fit max-w-full min-w-0 items-center gap-1.5 rounded-full py-0 pr-2 pl-0.5 text-xs font-medium',
        TONE_SURFACE[family],
        className,
      )}
    >
      <span
        className={cn(
          'flex size-4.5 shrink-0 items-center justify-center rounded-full',
          TONE_BADGE[family],
        )}
      >
        <Icon aria-hidden="true" className="size-3" />
      </span>
      <span className="min-w-0 truncate">{children}</span>
      {meta !== undefined && (
        <span className="font-mono text-micro font-normal opacity-70">{meta}</span>
      )}
      {action}
    </span>
  )
}
