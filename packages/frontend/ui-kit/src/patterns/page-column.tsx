import { cn } from '../lib/utils.ts'

export function PageColumn({
  className,
  children,
  ...rest
}: React.ComponentProps<'div'>): React.JSX.Element {
  return (
    <div className={cn('page-column', className)} {...rest}>
      {children}
    </div>
  )
}
