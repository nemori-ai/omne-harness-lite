import { cn } from '../../lib/utils.ts'
import { LoadingIndicator } from '../loading-state.tsx'
import { type DataAttributes } from './data-attributes.ts'
import { FACT_TONE, TONE_BADGE, TONE_INK, type Fact, type Tone } from './tone.ts'
import { type Icon as SetIcon } from '../../icons/index.ts'

export type MarkPhase = 'pending' | 'running' | 'settled'

type MarkLook =
  | { readonly fact: Fact; readonly tone?: never }
  | { readonly tone: Tone; readonly fact?: never }

export function StatusMark({
  phase,
  fact,
  tone: chosen,
  icon: Icon,
  size = 16,
  children,
  className,
  ...data
}: {
  readonly phase: MarkPhase

  readonly icon?: SetIcon
  readonly size?: 12 | 16 | 24

  readonly children?: React.ReactNode
  readonly className?: string
} & MarkLook &
  DataAttributes): React.JSX.Element {
  const tone = fact === undefined ? chosen : FACT_TONE[fact]
  const box = { width: size, height: size }
  if (phase === 'running') {
    return (
      <span
        aria-hidden="true"
        {...data}
        style={box}
        className={cn(
          'inline-flex shrink-0 items-center justify-center',
          TONE_INK[tone],
          className,
        )}
      >
        <LoadingIndicator size={size === 12 ? 'sm' : 'md'}>{children}</LoadingIndicator>
      </span>
    )
  }
  if (phase === 'settled') {
    return (
      <span
        aria-hidden="true"
        {...data}
        style={box}
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-full',
          TONE_BADGE[tone],
          className,
        )}
      >
        {Icon !== undefined && <Icon className="size-3" />}
      </span>
    )
  }

  return (
    <span
      aria-hidden="true"
      {...data}
      style={box}
      className={cn('inline-block shrink-0 rounded-full border border-line', className)}
    />
  )
}
