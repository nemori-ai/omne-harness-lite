import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@omne-harness/ui-kit'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import type { HistoryEntry } from '../model/content.ts'

/** In the bar a choice reports its element, so its width is known while folded; in the `⋯` it tells `say`. */
export type HeadingFold =
  | Readonly<{
      place: 'bar'
      folded: number
      register: (rank: FoldRank, element: HTMLElement | null) => void
    }>
  | Readonly<{ place: 'menu'; folded: number; say: (text: string) => void; opening?: FoldRank }>

/** Short of room, the workspace folds into the `⋯` first, then permissions, then the model. */
export const FOLD_RANK = { workspace: 1, mode: 2, model: 3 } as const
export type FoldRank = (typeof FOLD_RANK)[keyof typeof FOLD_RANK]
const ALL_FOLDED = Math.max(...Object.values(FOLD_RANK))

export const HeadingFoldContext = createContext<HeadingFold>({
  place: 'bar',
  folded: 0,
  register: () => undefined,
})

export function useHeadingPlace(): HeadingFold['place'] {
  return useContext(HeadingFoldContext).place
}

export const HeadingRevisionContext = createContext<string | null>(null)
export const HeadingEntriesContext = createContext<readonly HistoryEntry[]>([])

type HeadingReader = Readonly<{ load(tenant: string, session: string): Promise<void> }>

/** The bar reads a heading item's value at each log position: the server answers, whoever changed it. */
export function useHeadingOpening(rank: FoldRank): boolean {
  const fold = useContext(HeadingFoldContext)
  return fold.place === 'menu' && fold.opening === rank
}

export function useHeadingFolded(rank: FoldRank): boolean {
  return useContext(HeadingFoldContext).folded >= rank
}

export function useHeadingRead(store: HeadingReader, tenant: string, session: string): boolean {
  const inBar = useHeadingPlace() === 'bar'
  const at = useContext(HeadingRevisionContext)
  useEffect(() => {
    if (inBar) void store.load(tenant, session)
  }, [store, tenant, session, inBar, at])
  return inBar
}

export function HeadingChoice({
  rank,
  bar,
  menu,
}: {
  readonly rank: FoldRank
  readonly bar: ReactNode
  readonly menu: (say: (text: string) => void) => ReactNode
}) {
  const fold = useContext(HeadingFoldContext)
  const register = fold.place === 'bar' ? fold.register : null
  const measured = useCallback(
    (element: HTMLElement | null) => {
      if (register === null) return undefined
      register(rank, element)
      return () => register(rank, null)
    },
    [register, rank],
  )
  const folded = fold.folded >= rank
  if (fold.place === 'menu') return folded ? menu(fold.say) : null
  return (
    <span
      ref={measured}
      className="omne-session-choice"
      data-folded={folded || undefined}
      aria-hidden={folded || undefined}
      inert={folded || undefined}
    >
      {bar}
    </span>
  )
}

export type FoldedOption = Readonly<{
  value: string
  label: string
  note?: string | null
  disabled?: boolean
}>

/** In the `⋯`: the name and the value in force, opening on the values when there are any. */
export function FoldedChoice({
  label,
  value,
  shown,
  options,
  onPick,
  onOpen,
  opened,
}: {
  readonly label: string
  readonly value: string
  readonly shown: string
  readonly options: readonly FoldedOption[] | null
  readonly onPick: (value: string) => void
  readonly onOpen?: () => void
  readonly opened?: boolean
}) {
  const face = (
    <>
      {label}
      <span className="omne-session-folded-value">{shown}</span>
    </>
  )
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (opened !== true) return undefined
    const frame = requestAnimationFrame(() => {
      trigger.current?.focus()
      setOpen(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [opened])
  if (options === null) return <DropdownMenuItem disabled>{face}</DropdownMenuItem>
  return (
    <DropdownMenuSub
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (next) onOpen?.()
      }}
    >
      <DropdownMenuSubTrigger ref={trigger}>{face}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={value} onValueChange={onPick}>
          {options.map(option => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              disabled={option.disabled ?? false}
            >
              {option.label}
              {option.note === undefined || option.note === null ? null : (
                <span className="omne-session-model-note">（{option.note}）</span>
              )}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0)
const widthOf = (element: Element): number => (element as HTMLElement).offsetWidth
const lengthOf = (value: string): number => Number.parseFloat(value) || 0

/** The fewest folds that fit the end in its own column, as wide as the title's either side of the figure, with the
 *  room it keeps clear at its far side. A folded choice keeps its unseen box, so every width is the natural one. */
function foldFor(
  row: HTMLElement,
  title: HTMLElement,
  end: HTMLElement,
  choices: ReadonlyMap<FoldRank, HTMLElement>,
): number {
  const middle = [...row.children].filter(child => child !== title && child !== end)
  const column =
    (row.clientWidth - sum(middle.map(widthOf)) - 2 * lengthOf(getComputedStyle(row).columnGap)) / 2
  const endStyle = getComputedStyle(end)
  const held = new Set<Element>(choices.values())
  const rest = [...end.children].filter(child => !held.has(child))
  for (let folded = 0; folded < ALL_FOLDED; folded += 1) {
    const inline = [...choices].filter(([rank]) => rank > folded).map(([, element]) => element)
    const right =
      lengthOf(endStyle.marginInlineEnd) +
      sum(rest.map(widthOf)) +
      sum(inline.map(widthOf)) +
      lengthOf(endStyle.columnGap) * Math.max(0, rest.length + inline.length - 1)
    if (right <= column) return folded
  }
  return ALL_FOLDED
}

export function useHeadingFold(bar: RefObject<HTMLElement | null>, words: string) {
  const title = useRef<HTMLHeadingElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const choices = useRef(new Map<FoldRank, HTMLElement>())
  const watch = useRef<ResizeObserver | null>(null)
  const [folded, setFolded] = useState(0)
  const measure = useCallback(() => {
    const row = bar.current
    if (row === null || title.current === null || end.current === null) return
    setFolded(foldFor(row, title.current, end.current, choices.current))
  }, [bar])
  const register = useCallback(
    (rank: FoldRank, element: HTMLElement | null) => {
      const before = choices.current.get(rank)
      if (before !== undefined) watch.current?.unobserve(before)
      if (element === null) choices.current.delete(rank)
      else {
        choices.current.set(rank, element)
        watch.current?.observe(element)
      }
      measure()
    },
    [measure],
  )
  useLayoutEffect(() => {
    const fonts = typeof document === 'undefined' ? undefined : document.fonts
    fonts?.addEventListener('loadingdone', measure)
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure)
      watch.current = observer
      for (const element of [bar.current, title.current, end.current, ...choices.current.values()])
        if (element !== null) observer.observe(element)
    }
    return () => {
      fonts?.removeEventListener('loadingdone', measure)
      watch.current?.disconnect()
      watch.current = null
    }
  }, [bar, measure])
  useLayoutEffect(measure, [measure, words])
  const inBar = useMemo<HeadingFold>(() => ({ place: 'bar', folded, register }), [folded, register])
  return { folded, title, end, bar: inBar }
}
