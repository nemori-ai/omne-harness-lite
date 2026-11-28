/* SPDX-License-Identifier: MIT -- adapted from shadcn/ui new-york-v4, notice in LICENSE.shadcn */
import * as React from 'react'
import { cn } from '../lib/utils.ts'

const VARIANTS = {
  box: 'rounded-control border border-line bg-surface-field px-3 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink-primary',
  line: 'border-0 border-b border-line bg-transparent px-0 focus-visible:border-line-focus',
} as const

function Input({
  className,
  type,
  variant = 'box',
  ...props
}: React.ComponentProps<'input'> & { readonly variant?: keyof typeof VARIANTS }) {
  return (
    <input
      type={type}
      data-slot="input"
      data-variant={variant}
      className={cn(
        'h-(--omne-control-height) w-full min-w-0 py-1.5 text-sm outline-none selection:bg-accent selection:text-accent-ink placeholder:text-ink-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        'focus-visible:ring-0',
        'aria-invalid:border-danger-ink aria-invalid:ring-danger-ink/20',
        className,
      )}
      {...props}
      data-control="field"
    />
  )
}

export { Input }
