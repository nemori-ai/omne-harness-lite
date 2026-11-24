import type { CanvasItemBody } from '@omne-harness/canvas-protocol'
import {
  PaperPage,
  usePaperAt,
  type PaperBox,
  type PaperGesture,
  type PaperPoint,
} from '@omne-harness/ui-kit'
import { memo, useRef, type JSX } from 'react'
import type { KindStanding } from '../model/kinds.ts'
import { ByLine, LockMark, ThingMenu, type PileChoice } from './aside.tsx'
import { Element, kindName, type CanvasHost } from './element.tsx'
import { actOf, type KeyAct } from './keys.ts'

/** How a press selects: alone by a plain click, added or taken away by Shift, ⌘ or the keyboard. */
export type PressHow = 'only' | 'toggle'

/** What the sheet does for a page; each turns into one command, or into a change of the selection. */
export type ItemActs = Readonly<{
  place(item: CanvasItemBody, box: PaperBox, gesture: PaperGesture, under?: PaperPoint): void
  press(item: CanvasItemBody, how: PressHow): void
  act(item: CanvasItemBody, act: KeyAct): void
  putInto(item: CanvasItemBody, pile: string): void
  grouped(item: CanvasItemBody): number
}>

export type ItemPageProps = Readonly<{
  host: CanvasHost
  scope: string
  item: CanvasItemBody
  box: PaperBox
  standing: KindStanding
  round: number
  pending: boolean
  selected: boolean
  /** Whether a pile can be made from it: it and what is selected are two or more. */
  pileable: boolean
  piles: readonly PileChoice[]
  acts: ItemActs
}>

const sameBox = (one: PaperBox, other: PaperBox): boolean =>
  one.x === other.x && one.y === other.y && one.width === other.width && one.height === other.height

/** A page is drawn again only when something it is given is another: the box by where it is. */
const sameProps = (was: ItemPageProps, now: ItemPageProps): boolean =>
  (Object.keys(now) as (keyof ItemPageProps)[]).every(key =>
    key === 'box' ? sameBox(was.box, now.box) : Object.is(was[key], now[key]),
  )

/** One thing lying loose on the sheet, where the server says it is. */
export const ItemPage = memo(function ItemPage(props: ItemPageProps): JSX.Element {
  const { host, scope, item, box, standing, round, pending, selected, piles, acts } = props
  const how = useRef<PressHow>('toggle')
  const under = useRef<PaperPoint | undefined>(undefined)
  const paperAt = usePaperAt()
  const name = kindName(item, standing)
  const menu = (
    <ThingMenu
      label={`${name}的更多操作`}
      acts={[
        { act: 'lock', label: item.locked ? '解开' : '锁上', run: () => acts.act(item, 'lock') },
        { act: 'take', label: '拿走', run: () => acts.act(item, 'take') },
        {
          act: 'pile',
          label: '叠成一叠',
          run: () => acts.act(item, 'pile'),
          disabled: !props.pileable,
        },
      ]}
      piles={piles}
      onPutInto={pile => acts.putInto(item, pile)}
    />
  )
  return (
    <div
      className="canvas-thing"
      data-item={item.id}
      onPointerDownCapture={event => {
        how.current = event.shiftKey || event.metaKey ? 'toggle' : 'only'
        under.current = undefined
      }}
      onPointerUpCapture={event => {
        under.current = paperAt({ x: event.clientX, y: event.clientY })
      }}
      onKeyDownCapture={() => {
        how.current = 'toggle'
        under.current = undefined
      }}
      onKeyDown={event => {
        const act = actOf(event)
        if (act === undefined) return
        event.preventDefault()
        acts.act(item, act)
      }}
    >
      <PaperPage
        box={box}
        name={name}
        handleLabel={`挪动${name} ${item.reference.ref.slice(0, 8)}`}
        aside={
          <>
            <ByLine by={item.by} when={item.when} />
            {item.locked ? <LockMark onUnlock={() => acts.act(item, 'lock')} /> : null}
            {menu}
          </>
        }
        locked={item.locked}
        pending={pending}
        selected={selected}
        onPlace={(placed, gesture) => acts.place(item, placed, gesture, under.current)}
        onPress={() => acts.press(item, how.current)}
      >
        <Element
          host={host}
          scope={scope}
          item={item}
          standing={standing}
          frame="sheet"
          round={round}
        />
      </PaperPage>
    </div>
  )
}, sameProps)
