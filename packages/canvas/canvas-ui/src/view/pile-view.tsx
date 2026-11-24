import type { CanvasItemBody, CanvasPileBody } from '@omne-harness/canvas-protocol'
import { Input, PaperPile, PaperSpot, type PaperBox } from '@omne-harness/ui-kit'
import { useState, type JSX } from 'react'
import type { KindStanding } from '../model/kinds.ts'
import { ByMark, ThingMenu } from './aside.tsx'
import { Element, kindName, type CanvasHost } from './element.tsx'
import { actOf } from './keys.ts'

/** A drag out of an open pile carries the item's identifier under this type. */
export const ITEM_DRAG = 'application/x-omne-canvas-item'

export type PileActs = Readonly<{
  move(pile: CanvasPileBody, box: PaperBox): void
  rename(pile: CanvasPileBody, name: string | null): void
  scatter(pile: CanvasPileBody): void
  out(item: CanvasItemBody): void
  take(item: CanvasItemBody): void
}>

export type PileViewProps = Readonly<{
  host: CanvasHost
  scope: string
  pile: CanvasPileBody
  box: PaperBox
  /** The size of a page that has none of its own: the footprint the server gives. */
  footprint: Readonly<{ width: number; height: number }>
  leaves: readonly CanvasItemBody[]
  standing: (item: CanvasItemBody) => KindStanding
  round: number
  pending: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  acts: PileActs
}>

type LeafProps = Readonly<{
  host: CanvasHost
  scope: string
  item: CanvasItemBody
  standing: KindStanding
  round: number
  open: boolean
  acts: PileActs
}>

function Leaf({ host, scope, item, standing, round, open, acts }: LeafProps): JSX.Element {
  const name = kindName(item, standing)
  return (
    <div
      className="canvas-leaf"
      draggable={open}
      onDragStart={event => event.dataTransfer.setData(ITEM_DRAG, item.id)}
      onKeyDown={event => {
        const act = actOf(event)
        if (act !== 'out' && act !== 'take') return
        event.preventDefault()
        event.stopPropagation()
        if (act === 'out') acts.out(item)
        else acts.take(item)
      }}
    >
      <Element
        host={host}
        scope={scope}
        item={item}
        standing={standing}
        frame="pile"
        round={round}
      />
      {open ? (
        <ThingMenu
          label={`${name}的更多操作`}
          acts={[
            { act: 'out', label: '从这一叠拿出来', run: () => acts.out(item) },
            { act: 'take', label: '拿走', run: () => acts.take(item) },
          ]}
        />
      ) : null}
    </div>
  )
}

function Rename({
  box,
  name,
  done,
}: Readonly<{ box: PaperBox; name: string; done: (name: string | null | undefined) => void }>) {
  const [text, setText] = useState(name)
  return (
    <PaperSpot
      at={{ x: box.x + box.width / 2, y: box.y + box.height / 2 }}
      className="canvas-rename"
    >
      <Input
        autoFocus
        aria-label="一叠的名字"
        value={text}
        onChange={event => setText(event.target.value)}
        onBlur={() => done(undefined)}
        onKeyDown={event => {
          event.stopPropagation()
          if (event.key === 'Escape') done(undefined)
          if (event.key !== 'Enter') return
          event.preventDefault()
          const trimmed = text.trim()
          done(trimmed === '' ? null : trimmed)
        }}
      />
    </PaperSpot>
  )
}

/** On the handle Enter and Space open and close the pile; anywhere on it the act keys rename and scatter it. */
function pileKeyAct(event: React.KeyboardEvent): 'toggle' | 'rename' | 'scatter' | undefined {
  const onHandle = (event.target as Element).closest('[data-slot="paper-handle"]') !== null
  if (onHandle && (event.key === 'Enter' || event.key === ' ')) return 'toggle'
  const act = actOf(event)
  return act === 'rename' || act === 'scatter' ? act : undefined
}

/** A pile where the server says it is: its pages, top first, opened and closed here. */
export function PileView(props: PileViewProps): JSX.Element {
  const { host, scope, pile, box, footprint, leaves, standing, round, pending, open } = props
  const { onOpenChange, acts } = props
  const [renaming, setRenaming] = useState(false)
  const title = pile.name ?? '没有名字的一叠'
  return (
    <div
      className="canvas-thing"
      data-pile={pile.id}
      onKeyDown={event => {
        const act = pileKeyAct(event)
        if (act === undefined) return
        event.preventDefault()
        if (act === 'toggle') onOpenChange(!open)
        else if (act === 'rename') setRenaming(true)
        else acts.scatter(pile)
      }}
    >
      <PaperPile
        box={box}
        {...(pile.name === null ? {} : { name: pile.name })}
        handleLabel={`挪动${title}`}
        open={open}
        onOpenChange={onOpenChange}
        pending={pending}
        onPlace={placed => acts.move(pile, placed)}
        aside={
          <>
            <ByMark by={pile.by} when={pile.when} />
            <ThingMenu
              label={`${title}的更多操作`}
              acts={[
                { act: 'rename', label: '改名', run: () => setRenaming(true), focuses: true },
                { act: 'scatter', label: '散开', run: () => acts.scatter(pile) },
              ]}
            />
          </>
        }
        leaves={leaves.map(item => {
          const kind = standing(item)
          return {
            key: item.id,
            name: kindName(item, kind),
            size: item.size ?? footprint,
            content: (
              <Leaf
                host={host}
                scope={scope}
                item={item}
                standing={kind}
                round={round}
                open={open}
                acts={acts}
              />
            ),
          }
        })}
      />
      {renaming ? (
        <Rename
          box={box}
          name={pile.name ?? ''}
          done={name => {
            setRenaming(false)
            if (name !== undefined && name !== pile.name) acts.rename(pile, name)
          }}
        />
      ) : null}
    </div>
  )
}
