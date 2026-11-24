import type { CanvasItemBody } from '@omne-harness/canvas-protocol'
import {
  Ago,
  AssistantIcon,
  ContactIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  formatRelative,
  IconButton,
  LockIcon,
  MoreIcon,
  PaperQuiet,
  useAgeClock,
} from '@omne-harness/ui-kit'
import { encodeInstant } from '@omne-harness/utc-instant'
import { useRef, type JSX } from 'react'
import { KEYS, shortcutOf, type KeyAct } from './keys.ts'

type Placed = Readonly<Pick<CanvasItemBody, 'by' | 'when'>>

const tipOf = (by: Placed['by']): string =>
  by.kind === 'human' ? '最近由人摆放' : '最近由 agent 摆放'

function Mark({ by }: Readonly<Pick<Placed, 'by'>>): JSX.Element {
  const Drawn = by.kind === 'human' ? ContactIcon : AssistantIcon
  return <Drawn aria-hidden="true" className="canvas-by-mark" />
}

/** Who last arranged it, a person or an agent, never a session: a mark, and words shown while the page is looked at. */
export function ByLine({ by, when }: Placed): JSX.Element {
  return (
    <span className="canvas-by" title={tipOf(by)}>
      <PaperQuiet>
        {by.kind === 'human' ? '人' : 'agent'} · <Ago at={encodeInstant(when)} />
      </PaperQuiet>
      <Mark by={by} />
    </span>
  )
}

/** Who last arranged a pile: the mark alone takes room in the line; the words are its tip and its name. */
export function ByMark({ by, when }: Placed): JSX.Element {
  const said = `${tipOf(by)} · ${formatRelative(encodeInstant(when), useAgeClock(true))}`
  return (
    <span className="canvas-by" role="img" aria-label={said} title={said}>
      <Mark by={by} />
    </span>
  )
}

export function LockMark({ onUnlock }: Readonly<{ onUnlock: () => void }>): JSX.Element {
  return (
    <IconButton
      label="锁着，解开"
      size="icon-compact"
      aria-keyshortcuts={shortcutOf('lock')}
      onClick={onUnlock}
    >
      <LockIcon aria-hidden="true" />
    </IconButton>
  )
}

export type MenuAct = Readonly<{
  act: KeyAct
  label: string
  run: () => void
  disabled?: boolean
  /** The act opens a field of its own: it runs once the menu has closed, and the focus stays where it put it. */
  focuses?: boolean
}>

export type PileChoice = Readonly<{ id: string; name: string }>

function Act({
  act,
  label,
  run,
  disabled = false,
  focuses = false,
  later,
}: MenuAct & Readonly<{ later: (run: () => void) => void }>): JSX.Element {
  return (
    <DropdownMenuItem
      disabled={disabled}
      aria-keyshortcuts={shortcutOf(act)}
      onSelect={() => (focuses ? later(run) : run())}
    >
      {label}
      <DropdownMenuShortcut>{KEYS[act].shown}</DropdownMenuShortcut>
    </DropdownMenuItem>
  )
}

/** The occasional acts of a thing behind one `⋯`, each with its key beside it. */
export function ThingMenu({
  label,
  acts,
  piles = [],
  onPutInto,
}: Readonly<{
  label: string
  acts: readonly MenuAct[]
  piles?: readonly PileChoice[]
  onPutInto?: (pile: string) => void
}>): JSX.Element {
  const after = useRef<(() => void) | null>(null)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label={label} size="icon-compact" className="canvas-more">
          <MoreIcon aria-hidden="true" />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={event => {
          const run = after.current
          if (run === null) return
          after.current = null
          event.preventDefault()
          run()
        }}
      >
        {acts.map(act => (
          <Act key={act.act} {...act} later={run => (after.current = run)} />
        ))}
        {onPutInto === undefined || piles.length === 0 ? null : (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>放进一叠</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {piles.map(pile => (
                <DropdownMenuItem key={pile.id} onSelect={() => onPutInto(pile.id)}>
                  {pile.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
