import { cn } from '../lib/utils.ts'
import { type DataAttributes } from './ai/data-attributes.ts'

export function SettingRow({
  label,
  labelId,
  controlId,
  hint,
  notice,
  className,
  children,
  ...data
}: DataAttributes & {
  readonly label: React.ReactNode
  readonly labelId?: string
  readonly controlId?: string
  readonly hint?: React.ReactNode
  readonly notice?: React.ReactNode
  readonly className?: string
  readonly children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div {...data} className={cn('setting-row', className)}>
      <div className="setting-row-text">
        {controlId === undefined ? (
          <p id={labelId} className="setting-row-label">
            {label}
          </p>
        ) : (
          <label id={labelId} htmlFor={controlId} className="setting-row-label">
            {label}
          </label>
        )}
        {hint !== undefined && <p className="setting-row-hint">{hint}</p>}
      </div>
      {children !== undefined && <div className="setting-row-control">{children}</div>}
      {notice !== undefined && <div className="setting-row-notice">{notice}</div>}
    </div>
  )
}
