import { cn } from '../../lib/utils.ts'
import { type DataAttributes } from './data-attributes.ts'
import { FACT_TONE, TONE_SURFACE, type Fact, type Tone } from './tone.ts'
import { type Icon as SetIcon } from '../../icons/index.ts'

function saysTheSameThing(label: React.ReactNode, token: string): boolean {
  if (typeof label !== 'string') return false
  const words = (value: string): string =>
    ` ${value
      .toLowerCase()
      .replace(/[_.\-/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()} `
  const said = words(label)
  const machine = words(token)
  return machine !== ' ' && said.includes(machine)
}

type PillLook =
  | { readonly fact: Fact; readonly tone?: never }
  | { readonly tone: Tone; readonly fact?: never }

export function StatusPill({
  fact,
  tone: chosen,
  icon: Icon,
  token,
  tokenIsTheWord = false,
  children,
  className,
  ...data
}: PillLook & {
  readonly icon?: SetIcon

  readonly token?: string

  readonly tokenIsTheWord?: boolean
  readonly children: React.ReactNode
  readonly className?: string
} & DataAttributes): React.JSX.Element {
  const echo = token !== undefined && (tokenIsTheWord || saysTheSameThing(children, token))
  const tone = fact === undefined ? chosen : FACT_TONE[fact]
  return (
    <span
      data-status-pill=""
      data-tone={tone}
      {...(fact !== undefined && { 'data-fact': fact })}
      {...(echo ? { title: token, 'data-status-token': token } : {})}
      {...data}
      className={cn(
        'inline-flex h-(--omne-chip-height) w-fit shrink-0 items-center gap-1 rounded-full px-1.5 text-xs font-medium whitespace-nowrap',
        TONE_SURFACE[tone],
        fact === 'dormant' && 'opacity-70',
        className,
      )}
    >
      {Icon !== undefined && <Icon aria-hidden="true" className="size-3.5 shrink-0" />}
      <span>{children}</span>
      {token !== undefined && !echo && (
        <span data-status-token="" className="font-mono text-micro font-normal opacity-70">
          {token}
        </span>
      )}
    </span>
  )
}
