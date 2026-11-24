import type { CanvasBody, CanvasItemBody } from '@omne-harness/canvas-protocol'
import {
  FigureSeat,
  IconButton,
  InlineNotice,
  PaperSpot,
  PaperSurface,
  SearchIcon,
  Switch,
  type PaperPoint,
  type PaperView,
} from '@omne-harness/ui-kit'
import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import type { CanvasState } from '../model/canvas-driver.ts'
import { itemKey, pileKey, type Command } from '../model/commands.ts'
import { standingOf } from '../model/kinds.ts'
import {
  keep,
  keptMagnet,
  keptView,
  magnetText,
  viewText,
  type CanvasPreferences,
} from '../model/preferences.ts'
import { itemBox, pageLimits, paperSheet, pileBox, ZOOM_LIMITS } from '../model/sheet.ts'
import { canvasPaper } from '../parts.ts'
import type { AwayPage, Reading } from '../model/reading.ts'
import type { CanvasHost } from './element.tsx'
import { Finder } from './finder.tsx'
import { IntakeSpot } from './intake.tsx'
import { ItemPage } from './item-page.tsx'
import { ITEM_DRAG, PileView } from './pile-view.tsx'
import { droppedOut, itemActs, pileActs, type Selection } from './sheet-acts.ts'
import { bareAt, FinderKey, FoundMark, useLayers, type Place } from './sheet-layers.tsx'

/** The seat of the figure on the back is in the middle of the sheet, at the first priority. */
const SEAT = 'canvas'

export type SheetViewProps = Readonly<{
  host: CanvasHost
  scope: string
  canvas: CanvasBody
  state: CanvasState
  preferences: CanvasPreferences
  send: (command: Command) => void
  place: Place
  lookAway: (limit: number, before?: number) => Promise<Reading<AwayPage>>
  dismiss: () => void
  home: () => void
}>

/** Where this device looks and whether its magnet is on: kept on the device, never on the canvas. */
function useLooking(preferences: CanvasPreferences, canvas: CanvasBody) {
  const [view, setView] = useState<PaperView>(
    () =>
      keptView(preferences) ?? {
        x: canvas.sheet.width / 2,
        y: canvas.sheet.height / 2,
        zoom: 1,
      },
  )
  const [magnet, setMagnet] = useState(() => keptMagnet(preferences))
  return {
    view,
    magnet,
    look(next: PaperView) {
      setView(next)
      keep(preferences, 'view', viewText(next))
    },
    snap(on: boolean) {
      setMagnet(on)
      keep(preferences, 'magnet', magnetText(on))
    },
  }
}

/** Counts the registry's changes, so drawings are asked for again when what is put changes. */
function useRound(host: CanvasHost): number {
  const [round, setRound] = useState(0)
  useEffect(() => host.watchChanges(() => setRound(value => value + 1)), [host])
  return round
}

const byRank = (one: CanvasItemBody, other: CanvasItemBody): number => one.rank - other.rank

function Notices({ state, dismiss }: Readonly<{ state: CanvasState; dismiss: () => void }>) {
  return (
    <div className="canvas-notices">
      {state.live === 'retrying' ? (
        <InlineNotice tone="caution" role="status">
          画布的更新暂时连不上，纸上可能不是最新的，正在重连。
        </InlineNotice>
      ) : null}
      {state.notice === undefined ? null : (
        <InlineNotice tone="caution" role="status" onDismiss={dismiss}>
          {state.notice}
        </InlineNotice>
      )}
    </div>
  )
}

function Tools({
  looking,
  find,
}: Readonly<{ looking: ReturnType<typeof useLooking>; find: (opener: Element) => void }>) {
  const percent = Math.round(looking.view.zoom * 100)
  return (
    <div className="canvas-tools">
      <IconButton
        label="查找"
        size="icon-compact"
        aria-keyshortcuts="@"
        onClick={event => find(event.currentTarget)}
      >
        <SearchIcon aria-hidden="true" />
      </IconButton>
      <label className="canvas-tool">
        <Switch checked={looking.magnet} onCheckedChange={looking.snap} aria-label="磁吸" />
        <span aria-hidden="true">磁吸</span>
      </label>
      <span className="canvas-zoom" title="远近">
        {percent}%
      </span>
    </div>
  )
}

/** Escape lets go of what is selected, unless something before it took the key or a menu has it. */
const letsGo = (event: React.KeyboardEvent, selected: Selection): boolean =>
  event.key === 'Escape' &&
  !event.defaultPrevented &&
  selected.size > 0 &&
  (event.target as Element).closest('[role="menu"]') === null

/** The sheet of the canvas, with what the server last said lies on it. */
export function SheetView(props: SheetViewProps): JSX.Element {
  const { host, scope, canvas, state, preferences, send, dismiss } = props
  const sheet = paperSheet(canvas)
  const looking = useLooking(preferences, canvas)
  const round = useRound(host)
  const [selected, select] = useState<Selection>(() => new Set())
  const root = useRef<HTMLDivElement>(null)
  const pointer = useRef<PaperPoint | undefined>(undefined)
  const layers = useLayers({ canvas, sheet, looking, place: props.place })
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const deps = {
    canvas,
    sheet,
    selected,
    select,
    send,
    newPile: () => `pile-${crypto.randomUUID()}`,
  }
  const acts = itemActs(deps)
  const piled = pileActs(deps)
  const standing = (item: CanvasItemBody) => standingOf(state.kinds, item.reference.kind)
  const choices = useMemo(
    () => canvas.piles.map(pile => ({ id: pile.id, name: pile.name ?? '没有名字的一叠' })),
    [canvas.piles],
  )
  const loose = canvas.items.filter(item => item.state === 'on' && item.pile === null).sort(byRank)
  return (
    <div
      ref={root}
      className="canvas-paper"
      {...canvasPaper.props}
      onPointerMove={event => {
        pointer.current = bareAt(event)
      }}
      onPointerLeave={() => {
        pointer.current = undefined
      }}
      onKeyDown={event => {
        if (!letsGo(event, selected)) return
        event.preventDefault()
        select(new Set())
      }}
    >
      <PaperSurface
        className="canvas-surface"
        label={`纸，宽 ${String(sheet.width)}，高 ${String(sheet.height)}`}
        sheet={sheet}
        view={looking.view}
        onViewChange={looking.look}
        zoomLimits={ZOOM_LIMITS}
        limits={pageLimits(canvas)}
        magnet={looking.magnet}
        onDropAt={(event, at) => {
          const item = event.dataTransfer.getData(ITEM_DRAG)
          if (item !== '') return droppedOut(deps, item, at)
          const files = Array.from(event.dataTransfer.files)
          if (files.length > 0) layers.drop(files, at)
        }}
      >
        <FinderKey
          root={root}
          pointer={pointer}
          closed={layers.finder === undefined}
          open={layers.open}
        />
        <PaperSpot at={{ x: sheet.width / 2, y: sheet.height / 2 }}>
          <IconButton label="回到正面" onClick={() => props.home()}>
            <FigureSeat name={SEAT} priority={1} className="canvas-seat" />
          </IconButton>
        </PaperSpot>
        {canvas.piles.map(pile => (
          <PileView
            key={pile.id}
            host={host}
            scope={scope}
            pile={pile}
            box={pileBox(pile, sheet)}
            footprint={sheet.footprint}
            leaves={canvas.items.filter(item => item.pile === pile.id).sort((a, b) => byRank(b, a))}
            standing={standing}
            round={round}
            pending={state.pending.has(pileKey(pile.id))}
            open={open.has(pile.id)}
            onOpenChange={shown => {
              const next = new Set(open)
              if (shown) next.add(pile.id)
              else next.delete(pile.id)
              setOpen(next)
            }}
            acts={piled}
          />
        ))}
        {loose.map(item => (
          <ItemPage
            key={item.id}
            host={host}
            scope={scope}
            item={item}
            box={itemBox(item, sheet)}
            standing={standing(item)}
            round={round}
            pending={state.pending.has(itemKey(item.id))}
            selected={selected.has(item.id)}
            piles={choices}
            acts={acts}
          />
        ))}
        {layers.dropped.map(dropped => (
          <IntakeSpot
            key={dropped.id}
            host={host}
            scope={scope}
            round={round}
            dropped={dropped}
            placeNear={layers.placeNear}
            close={() => layers.closeDrop(dropped.id)}
          />
        ))}
        {layers.found === undefined ? null : <FoundMark box={layers.found} />}
        {layers.finder === undefined ? null : (
          <Finder
            host={host}
            scope={scope}
            kinds={state.kinds}
            round={round}
            at={layers.finder.at}
            place={layers.placeNear(layers.finder.at)}
            lookAway={props.lookAway}
            close={layers.closeFinder}
          />
        )}
      </PaperSurface>
      <Notices state={state} dismiss={dismiss} />
      <Tools looking={looking} find={opener => layers.open(undefined, opener)} />
    </div>
  )
}
