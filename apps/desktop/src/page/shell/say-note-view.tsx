import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react'
import type { FloatNote } from '@omne-harness/shell-contract'
import { SayBubble, type FaceFlip, type SaySaid } from '@omne-harness/ui-kit'
import { FIGURE_NOTE_PART, partOf } from '../surface/parts.ts'
import { idOf, sayNote, toOf } from '../surface/say-note.ts'
import { createShellNote, type NoteSpot, type NoteView, type ShellNote } from './say-note.ts'
import type { Face, ShellState } from './state.ts'

type Box = Readonly<{ x: number; y: number; width: number; height: number }>

const NOWHERE: Box = { x: 0, y: 0, width: 0, height: 0 }
const POPUP = '[data-slot="select-content"]'
const NO_NOTE: FloatNote = {
  there: false,
  open: false,
  toggle: () => undefined,
  close: () => undefined,
}
const nothing = () => undefined

const boxOf = (element: Element | null | undefined): Box => {
  if (element == null) return NOWHERE
  const { left, top, width, height } = element.getBoundingClientRect()
  return { x: left, y: top, width, height }
}

/** The shell's one note, made once for this shell and dropped with it; a change of tenant is told to it. */
export function useShellNote(state: ShellState): ShellNote | null {
  const [note, setNote] = useState<ShellNote | null>(null)
  useEffect(() => {
    const made = createShellNote({
      slots: state.slots,
      scope: () => state.scope.get(),
      phrases: state.phrases,
    })
    setNote(made)
    const unscope = state.scope.subscribe(() => made.rescope())
    return () => {
      unscope()
      made.dispose()
    }
  }, [state])
  return note
}

export function useNoteView(note: ShellNote | null): NoteView | null {
  const subscribe = useCallback(
    (listener: () => void) => note?.subscribe(listener) ?? nothing,
    [note],
  )
  return useSyncExternalStore(subscribe, () => note?.view() ?? null)
}

/** The note closes as a turn of the face begins: as the flip leaves rest, or, with no flip under reduced motion, as the face changes. */
export function useShutOnTurn(
  note: ShellNote | null,
  flip: Pick<FaceFlip, 'subscribe' | 'current'>,
  face: Face,
): void {
  const turning = useSyncExternalStore(flip.subscribe, () => flip.current().phase !== 'idle')
  useEffect(() => {
    if (turning) note?.close()
  }, [turning, note])
  const was = useRef(face)
  useEffect(() => {
    if (was.current === face) return
    was.current = face
    note?.close()
  }, [face, note])
}

export function floatNote(note: ShellNote | null, view: NoteView | null, id: string): FloatNote {
  if (note === null || view === null) return NO_NOTE
  return {
    there: view.present,
    open: view.window?.id === id,
    toggle: element => note.toggle(id, element),
    close: () => note.close(id),
  }
}

/** A press on the element the note was opened from; once that element is replaced, a press anywhere in the same floating item counts. */
function onOpener(spot: NoteSpot, target: Node): boolean {
  if (spot.element.contains(target)) return true
  if (spot.element.isConnected || !(target instanceof Element)) return false
  return target.closest('[data-float]')?.getAttribute('data-float') === spot.id
}

/** A press outside the note and the element it was opened from closes it; one on the element is that element's to toggle, so the note's own closing on blur during that press waits for it. */
function useOutside(note: ShellNote, spot: NoteSpot | null, own: RefObject<HTMLElement | null>) {
  const opener = useRef(false)
  useEffect(() => {
    opener.current = false
    if (spot === null) return undefined
    const pressed = (event: PointerEvent): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      opener.current = onOpener(spot, target)
      if (opener.current || own.current?.contains(target) === true) return
      if (target instanceof Element && target.closest(POPUP) !== null) return
      note.close(spot.id)
    }
    const released = (): void => {
      opener.current = false
    }
    document.addEventListener('pointerdown', pressed, true)
    document.addEventListener('pointerup', released, true)
    document.addEventListener('pointercancel', released, true)
    return () => {
      document.removeEventListener('pointerdown', pressed, true)
      document.removeEventListener('pointerup', released, true)
      document.removeEventListener('pointercancel', released, true)
    }
  }, [note, spot, own])
  return opener
}

/** Closing by the person: focus goes back to the opener when it was in the note; not while the opener is pressed. */
function useClose(note: ShellNote, spot: NoteSpot | null, own: RefObject<HTMLElement | null>) {
  const opener = useOutside(note, spot, own)
  return (): void => {
    if (spot === null || opener.current) return
    const inside = own.current?.contains(document.activeElement) === true
    note.close(spot.id)
    if (inside && spot.element instanceof HTMLElement) spot.element.focus()
  }
}

function actions(note: ShellNote, view: NoteView) {
  const { note: drawn, pictures, window: spot } = view
  return {
    onTarget: (target: string) => note.write(drawn.words, toOf(target)),
    onText: (text: string) => note.write(text, drawn.chosen),
    onSend: (said: SaySaid) =>
      note.send(
        said.text,
        toOf(said.target),
        pictures.map(picture => picture.id),
      ),
    onPhrase: (key: string) => note.phrase(key),
    onOpen: () => spot !== null && note.show() && note.close(spot.id),
    onDropPicture: (index: number) => {
      const picture = pictures[index]
      if (picture !== undefined) note.unpicture(picture.id)
    },
  }
}

type WindowNoteProps = Readonly<{
  note: ShellNote
  view: NoteView
  layer: RefObject<HTMLElement | null>
  settings: () => void
}>

/** The note in the window, written from the element a floating item opened it on, over the floating items. */
export function WindowNote({ note, view, layer, settings }: WindowNoteProps) {
  const own = useRef<HTMLElement>(null)
  const spot = view.window
  const close = useClose(note, spot, own)
  const placed = useRef({ figure: NOWHERE, bounds: NOWHERE })
  if (spot !== null) placed.current = { figure: boxOf(spot.element), bounds: boxOf(layer.current) }
  const { note: drawn, pictures } = view
  const chosen = drawn.chosen === undefined ? null : idOf(drawn.chosen)
  return (
    <SayBubble
      {...partOf(FIGURE_NOTE_PART)}
      {...actions(note, view)}
      ref={own}
      note={spot === null ? null : sayNote(drawn, drawn.words, chosen, pictures)}
      figure={placed.current.figure}
      bounds={placed.current.bounds}
      onClose={close}
      onSettings={settings}
    />
  )
}
