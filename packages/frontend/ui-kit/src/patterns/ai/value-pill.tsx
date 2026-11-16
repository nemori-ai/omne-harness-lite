import { cn } from '../../lib/utils.ts'
import { TONE_SURFACE, type Tone } from './tone.ts'

export function ValuePill({
  tone = 'neutral',
  mono = false,
  children,
  className,
}: {
  readonly tone?: Tone

  readonly mono?: boolean
  readonly children: React.ReactNode
  readonly className?: string
}): React.JSX.Element {
  return (
    <span
      data-value-pill=""
      className={cn(
        'mx-0.5 inline-flex h-(--omne-chip-height) items-center rounded-full px-1.5 align-middle text-xs font-medium',
        tone === 'neutral' ? 'bg-surface-field text-ink-muted shadow-hairline' : TONE_SURFACE[tone],
        mono && 'font-mono',
        className,
      )}
    >
      {children}
    </span>
  )
}
