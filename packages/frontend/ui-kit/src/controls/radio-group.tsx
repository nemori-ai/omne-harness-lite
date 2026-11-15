/* SPDX-License-Identifier: MIT -- adapted from shadcn/ui new-york-v4, notice in LICENSE.shadcn */
'use client'

import * as React from 'react'
import { cn } from '../lib/utils.ts'
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn('grid gap-3', className)}
      {...props}
    />
  )
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        'aspect-square size-4 shrink-0 rounded-full border border-line text-accent outline-none focus-visible:border-line-focus focus-visible:ring-0 focus-visible:ring-line-focus/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger-ink aria-invalid:ring-danger-ink/20 dark:bg-line/30 dark:aria-invalid:ring-danger-ink/40',
        className,
      )}
      {...props}
      data-control="choice"
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="relative flex items-center justify-center"
      >
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
        />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
}

export { RadioGroup, RadioGroupItem }
