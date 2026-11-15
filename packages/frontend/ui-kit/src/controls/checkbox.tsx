/* SPDX-License-Identifier: MIT -- adapted from shadcn/ui new-york-v4, notice in LICENSE.shadcn */
'use client'

import * as React from 'react'
import { cn } from '../lib/utils.ts'
import { Checkbox as CheckboxPrimitive } from 'radix-ui'
import { DoneIcon } from '../icons/index.ts'

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer size-4 shrink-0 rounded-chip border border-line outline-none focus-visible:border-line-focus focus-visible:ring-0 focus-visible:ring-line-focus/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger-ink aria-invalid:ring-danger-ink/20 data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-ink dark:bg-line/30 dark:aria-invalid:ring-danger-ink/40 dark:data-[state=checked]:bg-accent',
        className,
      )}
      {...props}
      data-control="choice"
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        <DoneIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
