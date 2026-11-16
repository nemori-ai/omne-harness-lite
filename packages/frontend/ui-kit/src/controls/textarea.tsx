/* SPDX-License-Identifier: MIT -- adapted from shadcn/ui new-york-v4, notice in LICENSE.shadcn */
import * as React from 'react'
import { cn } from '../lib/utils.ts'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-control border border-line bg-surface-field px-3 py-2 text-sm outline-none placeholder:text-ink-muted focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger-ink aria-invalid:ring-danger-ink/20  dark:aria-invalid:ring-danger-ink/40',
        className,
      )}
      {...props}
      data-control="field"
    />
  )
}

export { Textarea }
