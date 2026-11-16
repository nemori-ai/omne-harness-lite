import { createContext, Fragment, useContext } from 'react'

import { Button } from '../controls/button.tsx'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../controls/tooltip.tsx'

const TOOLTIP_DELAY_MS = 500
const TOOLTIP_SKIP_DELAY_MS = 300

const TooltipScope = createContext(false)

let keyboardUsed = false
if (typeof window !== 'undefined')
  window.addEventListener(
    'keydown',
    () => {
      keyboardUsed = true
    },
    { capture: true, once: true },
  )

export function AppTooltipProvider({
  children,
  labelsOnly = false,
}: {
  readonly children: React.ReactNode

  readonly labelsOnly?: boolean
}): React.JSX.Element {
  return (
    <TooltipScope.Provider value={true}>
      <TooltipProvider
        delayDuration={TOOLTIP_DELAY_MS}
        skipDelayDuration={TOOLTIP_SKIP_DELAY_MS}
        disableHoverableContent={labelsOnly}
      >
        {children}
      </TooltipProvider>
    </TooltipScope.Provider>
  )
}

function LocalTooltipScope({
  children,
}: {
  readonly children: React.ReactNode
}): React.JSX.Element {
  return <TooltipProvider delayDuration={TOOLTIP_DELAY_MS}>{children}</TooltipProvider>
}

type IconButtonProps = Omit<React.ComponentProps<typeof Button>, 'aria-label' | 'title'> & {
  readonly label: string

  readonly tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
}

export function ActionTooltip({
  label,
  side = 'top',
  children,
}: {
  readonly label: string
  readonly side?: IconButtonProps['tooltipSide']
  readonly children: React.ReactElement
}): React.JSX.Element {
  const Scope = useContext(TooltipScope) ? Fragment : LocalTooltipScope
  return (
    <Scope>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} sideOffset={4} className="pe-action-tooltip">
          {label}
        </TooltipContent>
      </Tooltip>
    </Scope>
  )
}

export function IconButton({
  label,
  tooltipSide = 'top',
  variant = 'ghost',
  size = 'icon',
  children,
  ...props
}: IconButtonProps): React.JSX.Element {
  return (
    <ActionTooltip label={label} side={tooltipSide}>
      <Button
        variant={variant}
        size={size}
        aria-label={label}
        {...props}
        onFocus={event => {
          props.onFocus?.(event)
          if (!keyboardUsed) event.preventDefault()
        }}
      >
        {children}
      </Button>
    </ActionTooltip>
  )
}
