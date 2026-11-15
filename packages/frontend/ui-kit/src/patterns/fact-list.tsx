import { cn } from '../lib/utils.ts'

export function FactList({
  children,
  className,
  ...rest
}: {
  readonly children: React.ReactNode
  readonly className?: string
  readonly 'data-testid'?: string
  readonly 'aria-label'?: string
}): React.JSX.Element {
  return (
    <dl className={cn('fact-list', className)} {...rest}>
      {children}
    </dl>
  )
}

export function FactRow({
  term,
  children,
}: {
  readonly term: React.ReactNode
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="fact-list-row">
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  )
}
