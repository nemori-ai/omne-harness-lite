import { CopyButton } from './ai/copy-button.tsx'

export function CodeSurface({
  name,
  text,
  copy,
  ...rest
}: {
  readonly name: string
  readonly text: string

  readonly copy?: {
    readonly label: string
    readonly copiedLabel: string
    readonly failedLabel: string
  }
  readonly 'data-testid'?: string
}): React.JSX.Element {
  return (
    <div className="code-surface">
      <div className="code-surface-header">
        <span className="code-surface-name">{name}</span>
        {copy !== undefined && (
          <CopyButton
            value={text}
            label={copy.label}
            copiedLabel={copy.copiedLabel}
            failedLabel={copy.failedLabel}
          />
        )}
      </div>
      <pre {...rest}>{text}</pre>
    </div>
  )
}
