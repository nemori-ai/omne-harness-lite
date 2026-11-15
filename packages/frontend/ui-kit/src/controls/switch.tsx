/* SPDX-License-Identifier: MIT -- adapted from shadcn/ui new-york-v4, notice in LICENSE.shadcn */
'use client'

import * as React from 'react'
import { cn } from '../lib/utils.ts'
import { Switch as SwitchPrimitive } from 'radix-ui'

function Switch({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: 'sm' | 'default'
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        'peer group/switch inline-flex shrink-0 items-center rounded-full border border-transparent outline-none focus-visible:border-line-focus focus-visible:ring-0 focus-visible:ring-line-focus/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-[1.15rem] data-[size=default]:w-8 data-[size=sm]:h-3.5 data-[size=sm]:w-6 data-[state=checked]:bg-accent data-[state=unchecked]:bg-line dark:data-[state=unchecked]:bg-line/80',
        className,
      )}
      {...props}
      data-control="choice"
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          'pointer-events-none block rounded-full bg-surface-panel ring-0 group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 dark:data-[state=checked]:bg-accent-ink dark:data-[state=unchecked]:bg-ink-primary',
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
