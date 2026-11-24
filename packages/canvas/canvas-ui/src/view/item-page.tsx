import type { CanvasItemBody } from '@omne-harness/canvas-protocol'
import {
  PaperPage,
  usePaperAt,
  type PaperBox,
  type PaperGesture,
  type PaperPoint,
} from '@omne-harness/ui-kit'
import { useRef, type JSX } from 'react'
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
  piles: readonly PileChoice[]
  acts: ItemActs
}>

/** One thing lying loose on the sheet, where the server says it is. */
export function ItemPage(props: ItemPageProps): JSX.Element {
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
          disabled: acts.grouped(item) < 2,
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
        handleLabel={`挪动${name} ${item.reference.ref}`}
        aside={
          <>
            {item.locked ? <LockMark onUnlock={() => acts.act(item, 'lock')} /> : null}
            <ByLine by={item.by} when={item.when} />
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
}
