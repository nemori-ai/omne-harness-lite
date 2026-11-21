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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'

/** In the bar a choice reports its element, so its width is known while folded; in the `⋯` it tells `say`. */
export type HeadingFold =
  | Readonly<{
      place: 'bar'
      folded: number
      register: (rank: FoldRank, element: HTMLElement | null) => void
    }>
  | Readonly<{ place: 'menu'; folded: number; say: (text: string) => void }>

/** Short of room, permissions fold into the `⋯` first, then the model. */
export const FOLD_RANK = { mode: 1, model: 2 } as const
type FoldRank = (typeof FOLD_RANK)[keyof typeof FOLD_RANK]

export const HeadingFoldContext = createContext<HeadingFold>({
  place: 'bar',
  folded: 0,
  register: () => undefined,
})

export function useHeadingPlace(): HeadingFold['place'] {
  return useContext(HeadingFoldContext).place
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
}: {
  readonly label: string
  readonly value: string
  readonly shown: string
  readonly options: readonly FoldedOption[] | null
  readonly onPick: (value: string) => void
}) {
  const face = (
    <>
      {label}
      <span className="omne-session-folded-value">{shown}</span>
    </>
  )
  if (options === null) return <DropdownMenuItem disabled>{face}</DropdownMenuItem>
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>{face}</DropdownMenuSubTrigger>
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

/** The title keeps eight characters, the ellipsis and half a character for the rounding of the widths. */
const TITLE_ROOM = 9.5

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0)
const widthOf = (element: Element): number => (element as HTMLElement).offsetWidth
const gapOf = (element: Element): number =>
  Number.parseFloat(getComputedStyle(element).columnGap) || 0

/** The fewest folds that fit; a folded choice keeps its unseen box, so every width is the natural one. */
function foldFor(
  row: HTMLElement,
  title: HTMLElement,
  end: HTMLElement,
  choices: ReadonlyMap<FoldRank, HTMLElement>,
): number {
  const type = getComputedStyle(title)
  const character =
    (Number.parseFloat(type.fontSize) || 0) + (Number.parseFloat(type.letterSpacing) || 0)
  const others = [...row.children].filter(child => child !== title && child !== end)
  const fixed =
    Math.min(title.scrollWidth, TITLE_ROOM * character) +
    sum(others.map(widthOf)) +
    gapOf(row) * (others.length + 1)
  const held = new Set<Element>(choices.values())
  const rest = [...end.children].filter(child => !held.has(child))
  for (let folded = 0; folded < 2; folded += 1) {
    const inline = [...choices].filter(([rank]) => rank > folded).map(([, element]) => element)
    const right =
      sum(rest.map(widthOf)) +
      sum(inline.map(widthOf)) +
      gapOf(end) * Math.max(0, rest.length + inline.length - 1)
    if (fixed + right <= row.clientWidth) return folded
  }
  return 2
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
