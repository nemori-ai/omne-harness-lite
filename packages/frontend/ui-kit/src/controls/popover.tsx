/* SPDX-License-Identifier: MIT -- adapted from shadcn/ui new-york-v4, notice in LICENSE.shadcn */
'use client'

import { usePresenceInert } from '../motion/motion.ts'

import * as React from 'react'
import { cn } from '../lib/utils.ts'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { focusSurface } from '../lib/focus.ts'

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  ref,
  className,
  align = 'center',
  sideOffset = 4,
  onOpenAutoFocus,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const presenceRef = usePresenceInert(ref)
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={presenceRef}
        data-slot="popover-content"
        data-focus-surface=""
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-72 origin-(--radix-popover-content-transform-origin) bg-surface-overlay p-4 text-ink-primary outline-hidden',
          className,
        )}
        onOpenAutoFocus={event => {
          onOpenAutoFocus?.(event)
          if (!event.defaultPrevented) {
            event.preventDefault()
            focusSurface(event.target as HTMLElement)
          }
        }}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="popover-header"
      className={cn('flex flex-col gap-1 text-sm', className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return <div data-slot="popover-title" className={cn('font-medium', className)} {...props} />
}

function PopoverDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p data-slot="popover-description" className={cn('text-ink-muted', className)} {...props} />
  )
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
}
