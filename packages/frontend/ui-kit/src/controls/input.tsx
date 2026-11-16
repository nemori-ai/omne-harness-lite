/* SPDX-License-Identifier: MIT -- adapted from shadcn/ui new-york-v4, notice in LICENSE.shadcn */
import * as React from 'react'
import { cn } from '../lib/utils.ts'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-(--omne-control-height) w-full min-w-0 rounded-control border border-line bg-surface-field px-3 py-1.5 text-sm outline-none selection:bg-accent selection:text-accent-ink file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink-primary placeholder:text-ink-muted disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 ',
        'focus-visible:ring-0',
        'aria-invalid:border-danger-ink aria-invalid:ring-danger-ink/20 dark:aria-invalid:ring-danger-ink/40',
        className,
      )}
      {...props}
      data-control="field"
    />
  )
}

export { Input }
