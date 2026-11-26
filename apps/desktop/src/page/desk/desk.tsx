import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import {
  FIGURE_SIZE,
  FigureLabel,
  LooseFigure,
  ObservationFrame,
  SayBubble,
  useSizeFactor,
  type LooseControl,
} from '@omne-harness/ui-kit'
import {
  newer,
  type DeskInput,
  type Down,
  type Look,
  type Point,
  type Rect,
  type Scene,
  type SceneFrame,
  type SceneNote,
  type SceneLook,
  type SceneWhere,
  type Up,
} from './scene.ts'
import { LookRedraw } from './look.tsx'
import type { LookHost } from '../surface/look-host.ts'
import {
  FIGURE_FRAME_PART,
  FIGURE_LABEL_PART,
  FIGURE_NOTE_PART,
  FIGURE_PART,
  partOf,
} from '../surface/parts.ts'
import { idOf, sayNote, toOf, type Shown } from '../surface/say-note.ts'

export type DeskDeps = Readonly<{
  look: LookHost
  post(message: Up): void
  listen(listener: (message: Down) => void): () => void
  hot(lease: number, rects: readonly Rect[]): void
  frame(callback: () => void): void
  origin(): Point
}>

type HandAt = Readonly<{ client: Point; meta?: boolean; shift?: boolean }>
type Bytes = ReadonlyMap<string, Uint8Array<ArrayBuffer>>

const blank = (text: string): boolean => text.trim() === ''

const homeOf = (scene: Scene): string =>
  scene.where.mode === 'home' ? `${scene.lease} ${scene.where.at.x} ${scene.where.at.y}` : ''

/** Calls `report` in the first frame after the document is visible: never in the step that took the scene. */
function firstShownFrame(frame: (callback: () => void) => void, report: () => void): () => void {
  let live = true
  const go = () => frame(() => live && report())
  const seen = () => {
    if (document.visibilityState !== 'visible') return
    document.removeEventListener('visibilitychange', seen)
    go()
  }
  if (document.visibilityState === 'visible') go()
  else document.addEventListener('visibilitychange', seen)
  return () => {
    live = false
    document.removeEventListener('visibilitychange', seen)
  }
}

function useLook(scene: Scene | null): void {
  const theme = scene?.look.theme
  const size = scene?.look.size
  useLayoutEffect(() => {
    const root = document.documentElement
    if (theme !== undefined) root.dataset['theme'] = theme
    if (size === 'medium') delete root.dataset['size']
    else if (size !== undefined) root.dataset['size'] = size
  }, [theme, size])
}

type Fields = Readonly<{ text: string; chosen: string | null }>
type Unsent = Fields & Readonly<{ lease: number; edit: number }>

/** The fields only buffer the shell's note: they take its words when it opens or its `edit` moves, and hand each change back as `unsent`, one a frame. */
function useWords(deps: DeskDeps) {
  const [fields, setFields] = useState<Fields>({ text: '', chosen: null })
  const now = useRef({ text: '', chosen: null as string | null, lease: 0, edit: 0 })
  const pending = useRef<Unsent | null>(null)
  const flush = useCallback(() => {
    const unsent = pending.current
    pending.current = null
    if (unsent === null) return
    const { lease, text, chosen, edit } = unsent
    const to = chosen === null ? {} : { chosen: toOf(chosen) }
    deps.post({ kind: 'input', lease, input: 'unsent', words: text, ...to, edit })
  }, [deps])
  const took = useCallback((was: SceneNote | null | undefined, next: Scene) => {
    const note = next.note ?? null
    now.current.lease = next.lease
    if (note === null || (was != null && was.edit === note.edit)) return
    const taken = { text: note.words, chosen: note.chosen === undefined ? null : idOf(note.chosen) }
    now.current = { ...now.current, ...taken, edit: note.edit }
    setFields(taken)
  }, [])
  const edited = (next: Partial<Fields>) => {
    const { lease, edit, text, chosen } = now.current
    const changed = { text, chosen, ...next }
    now.current = { ...now.current, ...changed }
    setFields(changed)
    const first = pending.current === null
    pending.current = { lease, edit, ...changed }
    if (first) deps.frame(flush)
  }
  return {
    ...fields,
    took,
    flush,
    drop: () => void (pending.current = null),
    setText: (text: string) => edited({ text }),
    setChosen: (chosen: string) => edited({ chosen }),
  }
}

function useShown(note: SceneNote | null, bytes: Bytes): readonly Shown[] {
  const named = JSON.stringify(note?.pictures ?? [])
  return useMemo(() => {
    const pictures = JSON.parse(named) as NonNullable<SceneNote['pictures']>
    return pictures.flatMap(({ id, name }) => {
      const got = bytes.get(id)
      return got === undefined ? [] : [{ id, name, bytes: got }]
    })
  }, [named, bytes])
}

function kept(bytes: Bytes, note: SceneNote | null): Bytes {
  const named = new Set(note?.pictures?.map(picture => picture.id))
  const keep = [...bytes].filter(([id]) => named.has(id))
  return keep.length === bytes.size ? bytes : new Map(keep)
}

/** With the note open the keyboard is here: Escape closes it; losing focus closes it only when it holds no words and no pictures. */
function useNoteKeys(
  open: boolean,
  text: string,
  pictures: number,
  close: () => void,
  away: () => void,
): void {
  const latest = useRef({ text, pictures, close, away })
  useLayoutEffect(() => {
    latest.current = { text, pictures, close, away }
  })
  useEffect(() => {
    if (!open) return undefined
    const blurred = () =>
      blank(latest.current.text) && latest.current.pictures === 0 && latest.current.away()
    const pressed = (event: KeyboardEvent) =>
      event.key === 'Escape' && !event.defaultPrevented && latest.current.close()
    window.addEventListener('blur', blurred)
    window.addEventListener('keydown', pressed)
    return () => {
      window.removeEventListener('blur', blurred)
      window.removeEventListener('keydown', pressed)
    }
  }, [open])
}

const onScreen = (box: Rect, origin: Point): Rect => ({
  x: box.x + origin.x,
  y: box.y + origin.y,
  width: box.width,
  height: box.height,
})

const inView = (box: Rect, origin: Point): Rect => ({
  x: box.x - origin.x,
  y: box.y - origin.y,
  width: box.width,
  height: box.height,
})

const reachOf = (
  scene: Scene,
  control: RefObject<LooseControl | null>,
  bubble: RefObject<HTMLElement | null>,
): Rect[] | null => {
  const box = control.current?.reach() ?? null
  if (box === null) return null
  const own = scene.note === null ? null : bubble.current
  return [box, ...(own === null ? [] : [own.getBoundingClientRect()])]
}

/** Tells the main process where to take the pointer: 34px about the figure, and the note while it is open. */
function useHot(
  deps: DeskDeps,
  scene: Scene | null,
  control: RefObject<LooseControl | null>,
  bubble: RefObject<HTMLElement | null>,
): void {
  const sent = useRef('')
  const measure = useRef<() => void>(() => undefined)
  useLayoutEffect(() => {
    measure.current = () => {
      const rects = scene === null ? null : reachOf(scene, control, bubble)
      if (scene === null || rects === null) return
      const origin = deps.origin()
      const placed = rects.map(rect => onScreen(rect, origin))
      const key = `${scene.lease} ${JSON.stringify(placed)}`
      if (key === sent.current) return
      sent.current = key
      deps.hot(scene.lease, placed)
    }
    measure.current()
  })
  const open = scene !== null && scene.note !== null
  useEffect(() => {
    if (open) deps.frame(() => measure.current())
  }, [open, deps])
}

function handoverOf(next: Scene, arrived: string): Up | undefined {
  const said = { lease: next.lease, serial: next.serial }
  if (next.where.mode === 'none') return { kind: 'cleared', ...said }
  if (arrived !== '' && arrived === homeOf(next)) return { kind: 'arrived', ...said }
  return undefined
}

type Took = (was: SceneNote | null | undefined, next: Scene) => void

const drawable = (
  look: SceneLook,
  worn: Readonly<{ issuer: string; version: number }> | undefined,
) => worn !== undefined && worn.issuer === look.issuer && worn.version >= look.version

/** Holds the newest scene, the hand on it and its pictures' bytes; reports `cleared` on taking, `arrived` again for the same stroke, `painted` on the first shown frame. A scene waits aside, the newest only, until the projection in hand is the one it names or later. */
function useScene(deps: DeskDeps, took: Took) {
  const [scene, setScene] = useState<Scene | null>(null)
  const [hand, setHand] = useState<Point | null>(null)
  const [bytes, setBytes] = useState<Bytes>(() => new Map())
  const held = useRef<Scene | null>(null)
  const aside = useRef<Scene | null>(null)
  const arrived = useRef('')

  useEffect(() => {
    const draw = (next: Scene) => {
      aside.current = null
      took(held.current?.note, next)
      held.current = next
      setScene(next)
      setHand(null)
      setBytes(was => kept(was, next.note ?? null))
      const said = handoverOf(next, arrived.current)
      if (said !== undefined) deps.post(said)
      if (next.where.mode !== 'home') arrived.current = ''
    }
    const take = (next: Scene) => {
      if (!newer(next, aside.current ?? held.current)) return
      if (drawable(next.look, deps.look.held())) draw(next)
      else aside.current = next
    }
    const voided = () => {
      held.current = null
      aside.current = null
      arrived.current = ''
      setScene(null)
      setHand(null)
    }
    const unwatch = deps.look.subscribe(event => {
      if (event === 'void') voided()
      else if (aside.current !== null && drawable(aside.current.look, deps.look.held()))
        draw(aside.current)
    })
    const stop = deps.listen(message => {
      if (message.kind === 'scene') take(message.scene)
      else if (message.kind === 'picture')
        setBytes(was => new Map(was).set(message.id, message.bytes))
      else if (message.kind === 'hand' && message.lease === held.current?.lease) setHand(message.at)
    })
    deps.post({ kind: 'hello' })
    return () => {
      stop()
      unwatch()
    }
  }, [deps, took])

  useLayoutEffect(() => {
    if (scene?.where.mode !== 'hand') return undefined
    return firstShownFrame(deps.frame, () => {
      if (held.current === scene)
        deps.post({ kind: 'painted', lease: scene.lease, serial: scene.serial })
    })
  }, [scene, deps])

  const onArrived = () => {
    const now = held.current
    if (now === null || now.where.mode !== 'home') return
    arrived.current = homeOf(now)
    deps.post({ kind: 'arrived', lease: now.lease, serial: now.serial })
  }
  return { scene, hand, bytes, held, onArrived }
}

const keysOf = (at: HandAt | undefined) => ({
  ...(at?.meta === true ? { meta: true } : {}),
  ...(at?.shift === true ? { shift: true } : {}),
})

function reports(deps: DeskDeps, held: RefObject<Scene | null>) {
  const report = (input: DeskInput) => (at?: HandAt) => {
    const lease = held.current?.lease
    if (lease === undefined) return
    const origin = deps.origin()
    const screen =
      at === undefined ? null : { x: at.client.x + origin.x, y: at.client.y + origin.y }
    deps.post({ kind: 'input', lease, input, at: screen, ...keysOf(at) })
  }
  const send = (text: string, target: string, pictures: readonly Shown[]) => {
    const lease = held.current?.lease
    if (lease === undefined) return
    const kept = pictures.length > 0 ? { pictures: pictures.map(picture => picture.id) } : {}
    deps.post({ kind: 'input', lease, input: 'send', words: text, to: toOf(target), ...kept })
  }
  const unpicture = (picture: Shown | undefined) => {
    const lease = held.current?.lease
    if (lease !== undefined && picture !== undefined)
      deps.post({ kind: 'input', lease, input: 'unpicture', picture: picture.id })
  }
  return { report, send, unpicture }
}

function localAt(where: SceneWhere, hand: Point | null, origin: Point): Point | null {
  if (where.mode === 'none') return null
  const point = where.mode === 'hand' ? (hand ?? where.at) : where.at
  return { x: point.x - origin.x, y: point.y - origin.y }
}

const figureBox = (at: Point | null, size: number): Rect => {
  const centre = at ?? { x: 0, y: 0 }
  return { x: centre.x - size / 2, y: centre.y - size / 2, width: size, height: size }
}

const placementOf = (where: SceneWhere, at: Point | null) =>
  at === null || where.mode === 'none' ? { mode: 'none' as const } : { mode: where.mode, at }

type Drawn = Pick<Scene, 'figure' | 'where' | 'label' | 'note' | 'frame'> &
  Readonly<{ look: Partial<Look> }>
const BLANK: Drawn = {
  figure: { waiting: 0 },
  where: { mode: 'none' },
  label: null,
  note: null,
  frame: null,
  look: {},
}

const frameIn = (frame: SceneFrame | null | undefined, origin: Point) => ({
  rect: frame == null ? null : inView(frame.rect, origin),
  covered: frame?.covered.map(box => inView(box, origin)) ?? [],
  closed: frame?.closed,
})

const handLabel = ({ where, label }: Drawn, at: Point | null) =>
  where.mode === 'hand' && at !== null ? label : null

const rewrites = (where: SceneWhere): boolean => where.mode === 'home' && where.rewrite === true

/** The desk page draws the scene it holds and tells the shell what happened to it; it has no facts of its own. */
export function DeskPage({ deps }: { readonly deps: DeskDeps }): React.JSX.Element {
  const control = useRef<LooseControl>(null)
  const bubble = useRef<HTMLElement>(null)
  const factor = useSizeFactor()
  const words = useWords(deps)
  const { scene, hand, bytes, held, onArrived } = useScene(deps, words.took)
  useLook(scene)
  useHot(deps, scene, control, bubble)
  const { report, send, unpicture } = reports(deps, held)
  const away = () => report('close')()
  const close = () => {
    words.flush()
    away()
  }
  const drawn = scene ?? BLANK
  const note = drawn.note ?? null
  const sending = note?.fate?.kind === 'sending'
  const pictures = useShown(note, bytes)
  useNoteKeys(note !== null, words.text, pictures.length, close, away)

  const { where, figure: shape, look, frame } = drawn
  const origin = deps.origin()
  const at = localAt(where, hand, origin)
  const figure = figureBox(at, FIGURE_SIZE * factor)
  const lines = handLabel(drawn, at)
  const bounds = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }
  return (
    <LookRedraw host={deps.look}>
      <main
        className="desk"
        data-mode={where.mode}
        data-doing={shape.doing ?? 'idle'}
        data-waiting={shape.waiting}
      >
        <LooseFigure
          {...partOf(FIGURE_PART)}
          {...placementOf(where, at)}
          doing={shape.doing}
          moment={shape.moment}
          waiting={shape.waiting}
          reduced={look.reduced}
          control={control}
          onLift={report('lift')}
          onMove={report('move')}
          onDrop={report('drop')}
          onCancel={report('cancel')}
          onClick={report('click')}
          onDoubleClick={report('double')}
          onArrived={onArrived}
          rewriteFirst={rewrites(where)}
        />
        {where.mode === 'none' ? null : (
          <ObservationFrame
            {...partOf(FIGURE_FRAME_PART)}
            {...frameIn(frame, origin)}
            figure={figure}
            reduced={look.reduced}
          />
        )}
        {lines == null ? null : (
          <FigureLabel
            {...partOf(FIGURE_LABEL_PART)}
            figure={figure}
            bounds={bounds}
            lines={lines}
          />
        )}
        <SayBubble
          {...partOf(FIGURE_NOTE_PART)}
          ref={bubble}
          note={sayNote(note, words.text, words.chosen, pictures)}
          figure={figure}
          bounds={bounds}
          reduced={look.reduced}
          onTarget={words.setChosen}
          onText={text => sending || words.setText(text)}
          onSend={said => {
            words.drop()
            send(said.text, said.target, pictures)
          }}
          onClose={close}
          onOpen={() => report('show')()}
          onDropPicture={index => unpicture(pictures[index])}
          onSettings={() => report('settings')()}
        />
      </main>
    </LookRedraw>
  )
}
