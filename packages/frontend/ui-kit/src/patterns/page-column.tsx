import { cn } from '../lib/utils.ts'

export function PageColumn({
  className,
  children,
  ...rest
}: React.ComponentProps<'main'>): React.JSX.Element {
  return (
    <main className={cn('page-column', className)} {...rest}>
      {children}
    </main>
  )
}
