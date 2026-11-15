import { STATE_FACT, STATE_LABELS, type StateLabel } from './state-labels.ts'
import { cn } from '../../lib/utils.ts'
import { type DataAttributes } from './data-attributes.ts'
import { FACT_INK, FACT_TONE, type Fact } from './tone.ts'
import { type Icon as SetIcon } from '../../icons/index.ts'

type WordSource =
  | { readonly state: StateLabel; readonly fact?: never; readonly children?: never }
  | { readonly fact: Fact; readonly children: React.ReactNode; readonly state?: never }

export function StateWord({
  state,
  fact: named,
  icon: Icon,
  children,
  className,
  title,
  labels = STATE_LABELS,
  ...data
}: WordSource & {
  readonly labels?: Readonly<Record<StateLabel, string>>
  readonly icon?: SetIcon
  readonly className?: string
  readonly title?: string
} & DataAttributes): React.JSX.Element {
  const fact = state === undefined ? named : STATE_FACT[state]
  return (
    <span
      data-state-word={state ?? ''}
      data-fact={fact}
      data-tone={FACT_TONE[fact]}
      {...(title !== undefined && { title })}
      {...data}
      className={cn(
        'inline-flex items-center gap-1',
        FACT_INK[fact],
        FACT_TONE[fact] !== 'neutral' && 'font-medium',
        className,
      )}
    >
      {Icon !== undefined && <Icon aria-hidden="true" className="size-3.5 shrink-0" />}
      {state === undefined ? children : labels[state]}
    </span>
  )
}
