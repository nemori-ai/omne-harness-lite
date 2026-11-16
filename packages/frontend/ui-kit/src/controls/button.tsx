/* SPDX-License-Identifier: MIT -- adapted from shadcn/ui new-york-v4, notice in LICENSE.shadcn */
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../lib/utils.ts'
import { Slot } from 'radix-ui'

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 text-sm leading-none font-medium whitespace-nowrap select-none outline-none focus-visible:ring-0 disabled:pointer-events-none aria-invalid:border-danger-ink [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          'bg-accent text-accent-ink disabled:bg-accent-disabled disabled:text-accent-ink-disabled',
        destructive:
          'bg-danger-ink text-danger-foreground disabled:bg-accent-disabled disabled:text-accent-ink-disabled',
        outline:
          'bg-surface-overlay text-ink-primary shadow-control aria-expanded:bg-hover disabled:opacity-50',

        field:
          "border border-line bg-surface-field font-normal text-ink-primary aria-expanded:bg-hover disabled:opacity-50 [&_svg:not([class*='text-'])]:text-ink-muted",
        secondary: 'bg-surface-panel-soft text-ink-primary disabled:opacity-50',
        ghost: 'text-ink-primary aria-expanded:bg-hover disabled:opacity-50',
        link: 'text-accent underline-offset-4 disabled:opacity-50',
      },

      size: {
        compact:
          "h-(--omne-control-height-compact) gap-1 rounded-control px-2.5 has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3.5",
        default: 'h-(--omne-control-height) rounded-control px-3.5 has-[>svg]:px-3',
        large: 'h-(--omne-control-height-large) rounded-control px-5 has-[>svg]:px-4',
        touch: 'h-(--omne-control-height-touch) rounded-control px-5 has-[>svg]:px-4',
        icon: "size-(--omne-control-height) rounded-control [&_svg:not([class*='size-'])]:size-4.5",
        'icon-compact':
          "size-(--omne-control-height-compact) rounded-control [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  type = 'button',
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      type={type}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}

      data-control={variant === 'link' ? 'link' : 'button'}
    />
  )
}

export { Button, buttonVariants }
