import type { CanvasBody, CanvasItemBody } from '@omne-harness/canvas-protocol'
import {
  FigureSeat,
  InlineNotice,
  PaperSpot,
  PaperSurface,
  Switch,
  type PaperView,
} from '@omne-harness/ui-kit'
import { useEffect, useMemo, useState, type JSX } from 'react'
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
import { itemBox, PAGE_LIMITS, paperSheet, pileBox, ZOOM_LIMITS } from '../model/sheet.ts'
import { canvasPaper } from '../parts.ts'
import type { CanvasHost } from './element.tsx'
import { ItemPage } from './item-page.tsx'
import { ITEM_DRAG, PileView } from './pile-view.tsx'
import { droppedOut, itemActs, pileActs, type Selection } from './sheet-acts.ts'

/** The seat of the figure on the back is in the middle of the sheet, at the first priority. */
const SEAT = 'canvas'

export type SheetViewProps = Readonly<{
  host: CanvasHost
  scope: string
  canvas: CanvasBody
  state: CanvasState
  preferences: CanvasPreferences
  send: (command: Command) => void
  dismiss: () => void
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

function Tools({ looking }: Readonly<{ looking: ReturnType<typeof useLooking> }>) {
  const percent = Math.round(looking.view.zoom * 100)
  return (
    <div className="canvas-tools">
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

/** The sheet of the canvas, with what the server last said lies on it. */
export function SheetView(props: SheetViewProps): JSX.Element {
  const { host, scope, canvas, state, preferences, send, dismiss } = props
  const sheet = paperSheet(canvas)
  const looking = useLooking(preferences, canvas)
  const round = useRound(host)
  const [selected, select] = useState<Selection>(() => new Set())
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
    <div className="canvas-paper" {...canvasPaper.props}>
      <PaperSurface
        className="canvas-surface"
        label={`纸，宽 ${String(sheet.width)}，高 ${String(sheet.height)}`}
        sheet={sheet}
        view={looking.view}
        onViewChange={looking.look}
        zoomLimits={ZOOM_LIMITS}
        limits={PAGE_LIMITS}
        magnet={looking.magnet}
        onDropAt={(event, at) => {
          const item = event.dataTransfer.getData(ITEM_DRAG)
          if (item !== '') droppedOut(deps, item, at)
        }}
      >
        <PaperSpot at={{ x: sheet.width / 2, y: sheet.height / 2 }}>
          <FigureSeat name={SEAT} priority={1} className="canvas-seat" />
        </PaperSpot>
        {canvas.piles.map(pile => (
          <PileView
            key={pile.id}
            host={host}
            scope={scope}
            pile={pile}
            box={pileBox(pile, sheet)}
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
      </PaperSurface>
      <Notices state={state} dismiss={dismiss} />
      <Tools looking={looking} />
    </div>
  )
}
