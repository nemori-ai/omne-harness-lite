/* SPDX-License-Identifier: MIT -- adapted from shadcn/ui new-york-v4, notice in LICENSE.shadcn */
'use client'

import * as React from 'react'
import { cn } from '../lib/utils.ts'
import { Tooltip as TooltipPrimitive } from 'radix-ui'

function TooltipProvider({
  delayDuration = 500,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

const TooltipDismiss = React.createContext<(() => void) | null>(null)

function Tooltip({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const [held, setHeld] = React.useState(defaultOpen ?? false)
  const isOpen = open ?? held
  const change = React.useCallback(
    (next: boolean) => {
      if (open === undefined) setHeld(next)
      onOpenChange?.(next)
    },
    [open, onOpenChange],
  )
  const dismiss = React.useCallback(() => change(false), [change])
  return (
    <TooltipDismiss.Provider value={dismiss}>
      <TooltipPrimitive.Root data-slot="tooltip" open={isOpen} onOpenChange={change} {...props} />
    </TooltipDismiss.Provider>
  )
}

function TooltipTrigger({
  onPointerDown,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  const dismiss = React.useContext(TooltipDismiss)
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      {...props}
      onPointerDown={event => {
        onPointerDown?.(event)
        dismiss?.()
      }}
    />
  )
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-control bg-tooltip px-2.5 py-1.5 text-xs text-balance text-tooltip-ink shadow-overlay',
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-tooltip fill-tooltip" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
