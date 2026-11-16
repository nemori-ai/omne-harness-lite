import { cn } from '../lib/utils.ts'

export function PageHeader({
  title,
  titleId,
  description,
  actions,
  className,
}: {
  readonly title: React.ReactNode
  readonly titleId?: string

  readonly description?: React.ReactNode

  readonly actions?: React.ReactNode
  readonly className?: string
}): React.JSX.Element {
  return (
    <header className={cn('page-header', className)}>
      <div className="page-header-text">
        <h1 id={titleId} className="page-header-title">
          {title}
        </h1>
        {description !== undefined && <p className="page-header-description">{description}</p>}
      </div>
      {actions !== undefined && <div className="page-header-actions">{actions}</div>}
    </header>
  )
}
