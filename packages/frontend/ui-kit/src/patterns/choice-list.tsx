import { createContext, useContext, useId, useLayoutEffect, useRef } from 'react'

import { DoneIcon } from '../icons/index.ts'
import { cn } from '../lib/utils.ts'
import { GlideMenu } from './ai/glide-menu.tsx'
import { DisclosureContent } from './disclosure.tsx'

interface Choosing {
  readonly value: string | undefined
  readonly disabled: boolean
  readonly choose: (value: string) => void
}

const ChoosingContext = createContext<Choosing | null>(null)

const ROW = '[role="radio"]'

const MOVES: Readonly<Record<string, (at: number, count: number) => number>> = {
  ArrowDown: (at, count) => (at + 1) % count,
  ArrowRight: (at, count) => (at + 1) % count,
  ArrowUp: (at, count) => (at - 1 + count) % count,
  ArrowLeft: (at, count) => (at - 1 + count) % count,
  Home: () => 0,
  End: (_at, count) => count - 1,
}

function takeable(host: HTMLElement): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>(ROW)].filter(
    row => !row.disabled && row.closest('[inert]') === null,
  )
}

export function ChoiceList({
  label,
  value,
  onValueChange,
  disabled = false,
  children,
  className,
}: {
  readonly label: string
  readonly value: string | undefined
  readonly onValueChange: (value: string) => void
  readonly disabled?: boolean
  readonly children: React.ReactNode
  readonly className?: string
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const list = host.current
    if (list === null) return
    const rows = takeable(list)
    const stop = rows.find(row => row.getAttribute('aria-checked') === 'true') ?? rows[0]
    for (const row of list.querySelectorAll<HTMLButtonElement>(ROW))
      row.tabIndex = row === stop ? 0 : -1
  })

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const list = host.current
    const target = event.target
    if (list === null || !(target instanceof HTMLButtonElement) || !target.matches(ROW)) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      target.click()
      return
    }
    const move = MOVES[event.key]
    if (move === undefined) return
    const rows = takeable(list)
    if (rows.length === 0) return
    event.preventDefault()
    rows[move(Math.max(rows.indexOf(target), 0), rows.length)]?.focus()
  }

  return (
    <ChoosingContext.Provider value={{ value, disabled, choose: onValueChange }}>
      <GlideMenu className={cn('omne-choice-list', className)}>
        <div
          ref={host}
          role="radiogroup"
          aria-label={label}
          aria-disabled={disabled || undefined}
          className="omne-choice-rows"
          onKeyDown={onKeyDown}
        >
          {children}
        </div>
      </GlideMenu>
    </ChoosingContext.Provider>
  )
}

export function ChoiceRow({
  value,
  label,
  description,
  disabled = false,
  children,
  className,
}: {
  readonly value: string
  readonly label: React.ReactNode
  readonly description?: React.ReactNode
  readonly disabled?: boolean
  readonly children?: React.ReactNode
  readonly className?: string
}): React.JSX.Element {
  const choosing = useContext(ChoosingContext)
  if (choosing === null) throw new Error('ChoiceRow is drawn inside a ChoiceList')
  const id = useId()
  const checked = choosing.value === value
  const off = disabled || choosing.disabled
  const said = description !== undefined && description !== null && description !== ''
  const holds = children !== undefined && children !== null && children !== false
  return (
    <div className={cn('omne-choice', className)} data-state={checked ? 'checked' : 'unchecked'}>
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        {...(said && { 'aria-describedby': `${id}-description` })}
        {...(holds && { 'aria-controls': `${id}-held` })}
        data-control="row"
        data-glide-row=""
        data-selected={checked}
        disabled={off}
        className="omne-choice-row"
        onClick={() => choosing.choose(value)}
      >
        <span aria-hidden="true" className="omne-choice-mark">
          {checked ? <DoneIcon /> : null}
        </span>
        <span id={`${id}-label`} className="omne-choice-label">
          {label}
        </span>
        {said && (
          <span id={`${id}-description`} className="omne-choice-description">
            {description}
          </span>
        )}
      </button>
      {holds && (
        <div id={`${id}-held`} className="omne-choice-held">
          <DisclosureContent open={checked}>{children}</DisclosureContent>
        </div>
      )}
    </div>
  )
}
