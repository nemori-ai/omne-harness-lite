import type { CanvasItemBody } from '@omne-harness/canvas-protocol'
import {
  Ago,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  IconButton,
  LockIcon,
  MoreIcon,
} from '@omne-harness/ui-kit'
import { encodeInstant } from '@omne-harness/utc-instant'
import type { JSX } from 'react'
import { KEYS, shortcutOf, type KeyAct } from './keys.ts'

/** Who last arranged it: a person, or an agent; never the full identifier of a session. */
export function ByLine({ by, when }: Readonly<Pick<CanvasItemBody, 'by' | 'when'>>): JSX.Element {
  const who = by.kind === 'human' ? '人' : 'agent'
  return (
    <span className="canvas-by" title={by.kind === 'human' ? '最近由人摆放' : '最近由 agent 摆放'}>
      {who} · <Ago at={encodeInstant(when)} />
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
}>

export type PileChoice = Readonly<{ id: string; name: string }>

function Act({ act, label, run, disabled = false }: MenuAct): JSX.Element {
  return (
    <DropdownMenuItem
      disabled={disabled}
      aria-keyshortcuts={shortcutOf(act)}
      onSelect={() => run()}
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label={label} size="icon-compact" className="canvas-more">
          <MoreIcon aria-hidden="true" />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {acts.map(act => (
          <Act key={act.act} {...act} />
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
