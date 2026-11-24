import './shot.css'
import { pickOf, type Pick, type Point } from './selection.ts'

const CHOICE = '/device/screen/choice'
/** Below this many CSS pixels from the top, the size goes inside the box instead of above it. */
const LABEL_ROOM = 24

const screen = new URLSearchParams(window.location.search).get('screen') ?? ''
const surface = document.querySelector('main')
const frame = document.querySelector<HTMLImageElement>('main img')
const shade = document.querySelector<HTMLElement>('.shot-shade')
const box = document.querySelector<HTMLElement>('.shot-box')
const size = document.querySelector<HTMLElement>('.shot-size')
let start: Point | null = null
let sent = false

const view = () => ({ width: window.innerWidth, height: window.innerHeight })
const pictureSize = () => ({ width: frame?.naturalWidth ?? 0, height: frame?.naturalHeight ?? 0 })
const at = (event: PointerEvent): Point => ({ x: event.clientX, y: event.clientY })

function frameBox(from: Point, to: Point): void {
  if (box === null || shade === null || size === null) return
  const x = Math.min(from.x, to.x)
  const y = Math.min(from.y, to.y)
  Object.assign(box.style, {
    left: `${x}px`,
    top: `${y}px`,
    width: `${Math.abs(to.x - from.x)}px`,
    height: `${Math.abs(to.y - from.y)}px`,
  })
  box.dataset['label'] = y < LABEL_ROOM ? 'inside' : 'above'
  const pick = pickOf(from, to, view(), pictureSize())
  box.hidden = pick.kind !== 'region'
  shade.hidden = pick.kind === 'region'
  size.textContent = pick.kind === 'region' ? `${pick.region.width} × ${pick.region.height}` : ''
}

/** The picked part of the frozen frame, in its own pixels. */
function crop(pick: Pick): Promise<Blob> {
  const { x, y, width, height } =
    pick.kind === 'screen' ? { x: 0, y: 0, ...pictureSize() } : pick.region
  const out = document.createElement('canvas')
  out.width = width
  out.height = height
  if (frame !== null)
    out.getContext('2d')?.drawImage(frame, x, y, width, height, 0, 0, width, height)
  return new Promise((resolve, reject) =>
    out.toBlob(
      blob => (blob === null ? reject(new Error('no picture')) : resolve(blob)),
      'image/png',
    ),
  )
}

/** One answer per capture: the picture the person picked, or nothing when they cancel. */
async function send(body: Blob | Uint8Array<ArrayBuffer>): Promise<void> {
  if (sent) return
  sent = true
  await fetch(CHOICE, { method: 'POST', body })
}

const cancel = () => void send(new Uint8Array())

surface?.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !frame?.complete) return
  surface.setPointerCapture(event.pointerId)
  start = at(event)
})
surface?.addEventListener('pointermove', event => {
  if (start !== null) frameBox(start, at(event))
})
surface?.addEventListener('pointerup', event => {
  if (start === null) return
  const pick = pickOf(start, at(event), view(), pictureSize())
  start = null
  void crop(pick).then(send, cancel)
})
surface?.addEventListener('contextmenu', event => {
  event.preventDefault()
  cancel()
})
if (frame !== null) frame.src = `/device/screen/frame?screen=${encodeURIComponent(screen)}`
