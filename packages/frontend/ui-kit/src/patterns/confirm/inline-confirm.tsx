import { useEffect, useRef, useState } from 'react'

import { useSettleCue } from '../../motion/motion.ts'
import { cn } from '../../lib/utils.ts'
import { IconButton } from '../icon-button.tsx'
import { LoadingIndicator } from '../loading-state.tsx'
import { Button } from '../../controls/button.tsx'

export type ConfirmTone = 'danger' | 'default'

type RestingFace =
  | {
      readonly children: React.ReactNode
      readonly 'aria-label'?: string
      readonly rest?: never
      readonly restFocus?: never
    }
  | {
      readonly rest: (arm: () => void) => React.ReactNode
      readonly restFocus: React.RefObject<HTMLElement | null>
      readonly children?: never
      readonly 'aria-label'?: never
    }

export function InlineConfirm({
  children,
  rest,
  restFocus,
  confirmLabel,
  consequence,
  tone,
  variant = 'ghost',
  size,
  pending = false,
  disabled = false,
  cancelLabel = '取消',
  onConfirm,
  className,
  'aria-label': ariaLabel,
}: RestingFace & {
  readonly confirmLabel: string

  readonly consequence?: React.ReactNode

  readonly tone: ConfirmTone
  readonly variant?: 'ghost' | 'outline' | 'secondary'
  readonly size?: 'default' | 'compact'
  readonly pending?: boolean
  readonly disabled?: boolean
  readonly cancelLabel?: string
  readonly onConfirm: () => void
  readonly className?: string
}): React.JSX.Element {
  const [armed, setArmed] = useState(false)
  const group = useRef<HTMLSpanElement>(null)
  const resting = useRef<HTMLButtonElement>(null)
  const commit = useRef<HTMLButtonElement>(null)
  const restore = useRef(false)
  useSettleCue(group, armed)

  useEffect(() => {
    if (armed) commit.current?.focus({ preventScroll: true })
    else if (restore.current) (restFocus ?? resting).current?.focus({ preventScroll: true })
    restore.current = false
  }, [armed, restFocus])

  const disarm = (returnFocus: boolean): void => {
    restore.current = returnFocus
    setArmed(false)
  }
  const face =
    rest !== undefined ? (
      rest(() => setArmed(true))
    ) : ariaLabel === undefined ? (
      <Button
        ref={resting}
        variant={variant}
        size={size}
        disabled={disabled || pending}
        onClick={() => setArmed(true)}
      >
        {children}
      </Button>
    ) : (
      <IconButton
        ref={resting}
        label={ariaLabel}
        variant={variant}
        disabled={disabled || pending}
        onClick={() => setArmed(true)}
      >
        {children}
      </IconButton>
    )

  return (
    <span
      ref={group}
      role="group"
      className={cn('omne-inline-confirm', className)}
      data-tone={tone}
      data-armed={armed}
      onKeyDown={event => {
        if (armed && event.key === 'Escape') {
          event.stopPropagation()
          disarm(true)
        }
      }}

      onBlur={event => {
        if (
          armed &&
          !event.target.matches(':disabled') &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          disarm(false)
      }}
    >
      {!armed ? (
        face
      ) : (
        <>
          {consequence !== undefined && (
            <span className="omne-inline-confirm-consequence">{consequence}</span>
          )}
          <Button
            ref={commit}
            size={size}
            variant={tone === 'danger' ? 'destructive' : 'default'}
            disabled={disabled || pending}
            onClick={onConfirm}
          >
            {pending && <LoadingIndicator size="sm" />}
            {confirmLabel}
          </Button>
          <Button variant="ghost" size={size} disabled={pending} onClick={() => disarm(true)}>
            {cancelLabel}
          </Button>
        </>
      )}
    </span>
  )
}
