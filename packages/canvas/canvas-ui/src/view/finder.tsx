import type { CanvasItemBody, CanvasKindBody } from '@omne-harness/canvas-protocol'
import {
  Ago,
  InlineNotice,
  Input,
  ListReadingRow,
  PaperSpot,
  UndoIcon,
  type PaperPoint,
} from '@omne-harness/ui-kit'
import { encodeInstant } from '@omne-harness/utc-instant'
import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react'
import { standingOf } from '../model/kinds.ts'
import type { AwayPage, Reading } from '../model/reading.ts'
import {
  CANVAS_PICKER,
  canvasPicker,
  type CanvasPickerSubject,
  type CanvasReference,
} from '../points.ts'
import { Element, inConflict, kindName, OneThing, type CanvasHost } from './element.tsx'
import type { PlaceNear } from './sheet-layers.tsx'

type PlaceAs = CanvasPickerSubject['pick']

/** How many taken records one read asks for, and how many matching rows are enough before reading on. */
const AWAY_PAGE = 20
const AWAY_ENOUGH = 8
const FOCUSABLE = 'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])'

type Kinds = Reading<readonly CanvasKindBody[]>

type Away =
  | Readonly<{ kind: 'reading' }>
  | Readonly<{ kind: 'read'; items: readonly CanvasItemBody[]; next: number | null; more: boolean }>
  | Readonly<{ kind: 'unreadable'; text: string }>

export type FinderProps = Readonly<{
  host: CanvasHost
  scope: string
  kinds: Kinds
  round: number
  at: PaperPoint
  /** Puts the reference near where the finder was opened. */
  place: PlaceNear
  lookAway: (limit: number, before?: number) => Promise<Reading<AwayPage>>
  /** Closes the finder; the focus goes back where it was opened from unless the person pressed elsewhere. */
  close: (refocus: boolean) => void
}>

const unreadable = (reading: Reading<unknown>): string =>
  reading.kind === 'unreadable' && reading.reason === 'denied'
    ? '没有权限看拿走了的东西。'
    : '现在读不到拿走了的东西。'

/** The taken records, read a page at a time: on while too few match the words, or when the list is read to its end. */
function useAway(lookAway: FinderProps['lookAway']) {
  const [away, setAway] = useState<Away>({ kind: 'reading' })
  const live = useRef(true)
  useEffect(() => {
    live.current = true
    void lookAway(AWAY_PAGE).then(page => {
      if (!live.current) return
      if (page.kind !== 'read') setAway({ kind: 'unreadable', text: unreadable(page) })
      else setAway({ kind: 'read', ...page.value, more: false })
    })
    return () => {
      live.current = false
    }
  }, [lookAway])
  const more = (): void => {
    if (away.kind !== 'read' || away.next === null || away.more) return
    const held = away
    setAway({ ...held, more: true })
    void lookAway(AWAY_PAGE, held.next ?? undefined).then(page => {
      if (!live.current) return
      if (page.kind !== 'read') setAway({ kind: 'unreadable', text: unreadable(page) })
      else
        setAway({
          kind: 'read',
          items: [...held.items, ...page.value.items],
          next: page.value.next,
          more: false,
        })
    })
  }
  return { away, more }
}

const words = (query: string): string => query.trim().toLowerCase()

function Group({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="canvas-finder-group" role="group" aria-label={label}>
      <p className="canvas-finder-heading">{label}</p>
      {children}
    </div>
  )
}

function PickerGroup(
  props: Readonly<{ host: CanvasHost; scope: string; kind: string; label: string; query: string }> &
    Readonly<{ round: number; pick: PlaceAs }>,
) {
  const { host, scope, kind, label, query, round, pick } = props
  const fallback = (): ReactNode => {
    const owners = inConflict(host, CANVAS_PICKER, kind, scope)
    if (owners === undefined) return null
    return (
      <Group label={label}>
        <p className="canvas-finder-none">{`这一类有两份挑法，互相冲突：${owners}`}</p>
      </Group>
    )
  }
  return (
    <OneThing key={round} fallback={fallback}>
      {canvasPicker.draw(host, kind, { query, pick }, fallback, drawn => (
        <Group label={label}>{drawn}</Group>
      ))}
    </OneThing>
  )
}

function AwayGroup(
  props: Readonly<{ host: CanvasHost; scope: string; kinds: Kinds; query: string; round: number }> &
    Readonly<{ away: Away; more: () => void; put: (item: CanvasItemBody) => void }>,
) {
  const { host, scope, kinds, query, round, away, more, put } = props
  const sought = words(query)
  const shown =
    away.kind === 'read'
      ? away.items.filter(item => {
          const name = kindName(item, standingOf(kinds, item.reference.kind))
          return `${name} ${item.reference.ref}`.toLowerCase().includes(sought)
        })
      : []
  const enough = shown.length >= AWAY_ENOUGH
  useEffect(() => {
    if (!enough) more()
  })
  return (
    <Group label="拿走了的">
      {away.kind === 'unreadable' ? <p className="canvas-finder-none">{away.text}</p> : null}
      {away.kind === 'read' && shown.length === 0 && away.next === null ? (
        <p className="canvas-finder-none">
          {sought === '' ? '还没有拿走过东西。' : `拿走了的里没有「${query.trim()}」。`}
        </p>
      ) : null}
      {shown.map(item => (
        <ListReadingRow
          key={item.id}
          data-away={item.id}
          mark={<UndoIcon aria-hidden="true" />}
          title={
            <Element
              host={host}
              scope={scope}
              item={item}
              standing={standingOf(kinds, item.reference.kind)}
              frame="search"
              round={round}
            />
          }
          time={<Ago at={encodeInstant(item.when)} />}
          onSelect={() => put(item)}
        />
      ))}
    </Group>
  )
}

/** Moves the focus along the finder: the line, then every control its groups drew, in order. */
function step(root: HTMLElement, by: 1 | -1): boolean {
  const all = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
  const active = document.activeElement
  const at = all.findIndex(one => one === active || one.contains(active))
  const next = all[Math.max(0, Math.min(all.length - 1, at + by))]
  next?.focus()
  return at + by >= all.length
}

const STEPS = new Map<string, 1 | -1>([
  ['ArrowDown', 1],
  ['ArrowUp', -1],
])

/** One line written on the sheet where the finder was opened, and beneath it what can be put on the sheet. */
export function Finder(props: FinderProps): JSX.Element {
  const { host, scope, kinds, round, at, place, lookAway, close } = props
  const root = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [why, setWhy] = useState<string | undefined>(undefined)
  const { away, more } = useAway(lookAway)
  useEffect(() => {
    const down = (event: PointerEvent): void => {
      if (root.current !== null && !root.current.contains(event.target as Node)) close(false)
    }
    window.addEventListener('pointerdown', down, true)
    return () => window.removeEventListener('pointerdown', down, true)
  }, [close])
  const put: PlaceAs = (reference, placing) => {
    setWhy(undefined)
    void place(reference, placing).then(placed => {
      if (placed.kind === 'not') setWhy(placed.why)
      else close(true)
    })
  }
  const declared = kinds.kind === 'read' ? kinds.value.filter(kind => kind.kind === 'declared') : []
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || root.current === null) return
    const by = STEPS.get(event.key)
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close(true)
    } else if (by !== undefined) {
      event.preventDefault()
      if (step(root.current, by)) more()
    } else if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
      event.preventDefault()
      root.current.querySelector<HTMLElement>(`.canvas-finder-found :is(${FOCUSABLE})`)?.click()
    }
  }
  return (
    <PaperSpot at={at} className="canvas-finder-spot">
      <div
        ref={root}
        className="canvas-finder"
        role="dialog"
        aria-label="查找"
        onKeyDown={onKeyDown}
      >
        <Input
          variant="line"
          autoFocus
          aria-label="查找要摆上来的东西"
          placeholder="查找要摆上来的东西"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        {why === undefined ? null : (
          <InlineNotice tone="caution" role="status">
            {why}
          </InlineNotice>
        )}
        <div
          className="canvas-finder-found"
          onScroll={event => {
            const list = event.currentTarget
            if (list.scrollTop + list.clientHeight >= list.scrollHeight - 1) more()
          }}
        >
          {declared.map(kind => (
            <PickerGroup
              key={kind.name}
              host={host}
              scope={scope}
              kind={kind.name}
              label={kind.kind === 'declared' ? kind.label : kind.name}
              query={query}
              round={round}
              pick={put}
            />
          ))}
          <AwayGroup
            host={host}
            scope={scope}
            kinds={kinds}
            query={query}
            round={round}
            away={away}
            more={more}
            put={item => put(item.reference)}
          />
        </div>
      </div>
    </PaperSpot>
  )
}
