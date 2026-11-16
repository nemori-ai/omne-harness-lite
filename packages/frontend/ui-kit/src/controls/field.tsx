import { Label } from './label.tsx'

export function Field({
  id,
  label,
  hint,
  children,
}: {
  readonly id: string
  readonly label: string
  readonly hint?: string
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="text-sm text-ink-muted">
        {label}
      </Label>
      {children}
      {hint !== undefined && <p className="text-xs text-ink-faint">{hint}</p>}
    </div>
  )
}

export function Section({
  id,
  title,
  badge,
  children,
}: {
  readonly id: string
  readonly title: string
  readonly badge?: React.ReactNode
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="omne-section">
      <div className="omne-section-heading">
        <h3 id={`${id}-heading`} className="omne-section-title">
          {title}
        </h3>
        {badge}
      </div>
      <div className="omne-section-body">{children}</div>
    </section>
  )
}
