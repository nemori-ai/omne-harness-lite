import { useId, useState } from 'react'

import { cn } from '../lib/utils.ts'
import { type DataAttributes } from './ai/data-attributes.ts'
import { DisclosureIcon } from '../icons/kit-only.ts'

export function Disclosure({
  label,
  children,
  defaultOpen = false,
  open: controlled,
  onOpenChange,
  className,
  triggerClassName,
  contentClassName,
  ...rest
}: {
  readonly label: React.ReactNode
  readonly children: React.ReactNode
  readonly defaultOpen?: boolean
  readonly open?: boolean
  readonly onOpenChange?: (open: boolean) => void
  readonly className?: string
  readonly triggerClassName?: string
  readonly contentClassName?: string
  readonly 'data-testid'?: string
}): React.JSX.Element {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen)
  const region = useId()
  const open = controlled ?? uncontrolled
  const state = open ? 'open' : 'closed'
  const change = (next: boolean): void => {
    if (controlled === undefined) setUncontrolled(next)
    onOpenChange?.(next)
  }
  return (
    <div
      data-slot="collapsible"
      data-state={state}
      className={cn('omne-disclosure', className)}
      {...rest}
    >
      <DisclosureTrigger
        open={open}
        controls={region}
        onToggle={() => change(!open)}
        className={triggerClassName}
      >
        <span>{label}</span>
      </DisclosureTrigger>
      <div id={region}>
        <DisclosureContent open={open}>
          <div
            data-slot="collapsible-content"
            data-state={state}
            className={cn('omne-disclosure-content', contentClassName)}
          >
            {children}
          </div>
        </DisclosureContent>
      </div>
    </div>
  )
}

export function DisclosureTrigger({
  open,
  controls,
  onToggle,
  size = 'default',
  className,
  children,
  ...rest
}: DataAttributes & {
  readonly open: boolean

  readonly controls: string
  readonly onToggle: () => void
  readonly size?: 'default' | 'compact'
  readonly className?: string | undefined
  readonly children: React.ReactNode
  readonly 'aria-label'?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      {...rest}
      data-slot="collapsible-trigger"
      data-control="button"
      data-state={open ? 'open' : 'closed'}
      data-size={size}
      aria-expanded={open}
      aria-controls={controls}
      className={cn('omne-disclosure-trigger', className)}
      onClick={onToggle}
    >
      <DisclosureIcon aria-hidden="true" />
      {children}
    </button>
  )
}

export function DisclosureContent({
  open,
  children,
  className,
}: {
  readonly open: boolean
  readonly children: React.ReactNode
  readonly className?: string
}): React.JSX.Element {
  return (
    <div
      data-expand=""
      data-open={open}
      className={cn('grid', className)}
      style={{
        gridTemplateRows: open ? '1fr' : '0fr',
        opacity: open ? 1 : 0,
        transition:
          'grid-template-rows var(--omne-motion-layout) var(--omne-motion-ease-enter), opacity var(--omne-motion-layout) var(--omne-motion-ease-enter)',
      }}
    >
      <div
        data-expand-content=""
        className="min-h-0"
        inert={!open}
        aria-hidden={open ? undefined : true}
      >
        {children}
      </div>
    </div>
  )
}
