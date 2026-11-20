import {
  formatInstant,
  formatRelative,
  RELATIVE_WORDS,
  type RelativeWords,
  useAgeClock,
} from './time.ts'

export function Ago({
  at,
  now: shared,
  words = RELATIVE_WORDS,
  className,
}: {
  readonly at: string

  readonly now?: number
  readonly words?: RelativeWords
  readonly className?: string
}): React.JSX.Element {
  const own = useAgeClock(shared === undefined)
  const now = shared ?? own

  if (Number.isNaN(Date.parse(at)))
    return <span {...(className === undefined ? {} : { className })}>{at}</span>
  return (
    <time
      {...(className === undefined ? {} : { className })}
      dateTime={at}
      title={formatInstant(at) || at}
    >
      {formatRelative(at, now, words)}
    </time>
  )
}
