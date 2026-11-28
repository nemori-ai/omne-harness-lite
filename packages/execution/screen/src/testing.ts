import { declared, type Region, type ScreenPermission } from './backend.ts'
import { listable, type ScreenWindow, type WindowBackend, type WindowCapture } from './windows.ts'

export type SceneWindow = Readonly<{
  id: string
  pid: number
  app: string
  title: string
  layer: number
  opacity: number
  onScreen: boolean
  bounds: Region
  scale: number
}>

/** What the system holds, front to back; a stand-in of a backend answers from it. */
export type WindowScene = Readonly<{
  windows: readonly SceneWindow[]
  permission: ScreenPermission
  fault?: 'list' | 'capture'
}>

export type WindowContractCase = Readonly<{
  name: string
  /** Runs the case against a backend over the scene; rejects with what did not hold. */
  run(open: (scene: WindowScene) => WindowBackend | Promise<WindowBackend>): Promise<void>
}>

const at = (x: number, y: number, width: number, height: number): Region => ({
  x,
  y,
  width,
  height,
})
const normal = (id: string, bounds: Region, change: Partial<SceneWindow> = {}): SceneWindow => ({
  id,
  pid: 4000 + Number(id),
  app: `App ${id}`,
  title: `Title ${id}`,
  layer: 0,
  opacity: 1,
  onScreen: true,
  bounds,
  scale: 2,
  ...change,
})

const FRONT = normal('11', at(100, 80, 640, 400))
const BEHIND = normal('12', at(-1728, 356, 1728, 1084), { scale: 1, title: '' })
const BACK = normal('13', at(0, 30, 2560, 1410), { pid: 4011, app: 'App 11' })
const PANEL = normal('21', at(200, 100, 300, 200), { layer: 3 })
const MENUBAR = normal('22', at(0, 0, 2560, 30), { layer: 24 })
const CLEAR = normal('23', at(10, 10, 50, 50), { opacity: 0 })
const FAINT = normal('24', at(20, 20, 60, 60), { opacity: 0.05 })
const DIM = normal('25', at(30, 30, 70, 70), { opacity: 0.06 })
const AWAY = normal('26', at(40, 40, 80, 80), { onScreen: false })
const TINY = normal('27', at(5, 5, 1, 1))

const SCENE: readonly SceneWindow[] = [MENUBAR, PANEL, FRONT, CLEAR, BEHIND, AWAY, BACK]
const LISTED = [FRONT, BEHIND, BACK]
const NOT_LISTED = [PANEL, MENUBAR, CLEAR, FAINT, AWAY]

const listed = ({ id, pid, app, title, bounds }: SceneWindow, titled = true): ScreenWindow => ({
  id,
  pid,
  app,
  title: titled ? title : '',
  bounds,
})

function same(actual: unknown, expected: unknown, what: string): void {
  const left = JSON.stringify(actual)
  const right = JSON.stringify(expected)
  if (left !== right) throw new Error(`${what}: expected ${right}, got ${left}`)
}

function shotOf(window: SceneWindow, capture: WindowCapture): void {
  if (typeof capture === 'string') throw new Error(`window ${window.id}: answered ${capture}`)
  const { bounds, scale } = window
  const pixels = { width: bounds.width * scale, height: bounds.height * scale }
  same(
    { width: capture.width, height: capture.height, scale: capture.scale, bounds: capture.bounds },
    { ...pixels, scale, bounds },
    `the picture of window ${window.id}`,
  )
  same(declared(capture.png), pixels, `the PNG of window ${window.id}`)
}

async function rejects(attempt: () => Promise<unknown>, what: string): Promise<void> {
  const outcome = await attempt().then(
    answer => ({ answer }),
    () => null,
  )
  if (outcome !== null) throw new Error(`${what}: answered ${JSON.stringify(outcome.answer)}`)
}

const scene = (windows: readonly SceneWindow[], permission: ScreenPermission = 'satisfied') => ({
  windows,
  permission,
})

export const windowContractCases: readonly WindowContractCase[] = [
  {
    name: 'lists the visible windows of the normal layer front to back, with who owns each and where it is',
    async run(open) {
      same(
        await (await open(scene(SCENE))).list(),
        LISTED.map(each => listed(each)),
        'the listing',
      )
    },
  },
  {
    name: 'lists no window above the normal layer',
    async run(open) {
      same(
        await (await open(scene([PANEL, MENUBAR, FRONT]))).list(),
        [listed(FRONT)],
        'the listing',
      )
    },
  },
  {
    name: 'lists a window only when it is more opaque than 0.05',
    async run(open) {
      const answer = await (await open(scene([CLEAR, FAINT, DIM]))).list()
      same(answer, [listed(DIM)], 'the listing')
    },
  },
  {
    name: 'lists no window that is not on the screen',
    async run(open) {
      same(await (await open(scene([AWAY, BACK]))).list(), [listed(BACK)], 'the listing')
    },
  },
  {
    name: 'lists a window however small it is: the size is for the caller to judge',
    async run(open) {
      same(await (await open(scene([TINY]))).list(), [listed(TINY)], 'the listing')
    },
  },
  {
    name: 'lists without the permission to read the screen, with every title empty',
    async run(open) {
      const answer = await (await open(scene(SCENE, 'unsatisfied'))).list()
      same(
        answer,
        LISTED.map(each => listed(each, false)),
        'the listing',
      )
      const unknown = await (await open(scene(SCENE, 'unknown'))).list()
      same(
        unknown.map(each => each.id),
        LISTED.map(each => each.id),
        'the listing',
      )
    },
  },
  {
    name: 'captures each listed window by its identifier, that window alone, in physical pixels',
    async run(open) {
      const backend = await open(scene(SCENE))
      for (const window of LISTED) shotOf(window, await backend.capture(window.id))
    },
  },
  {
    name: 'answers not-found for an identifier it does not know, and takes no other picture',
    async run(open) {
      const backend = await open(scene(SCENE))
      for (const id of ['999', 'no-such-window', ''])
        same(await backend.capture(id), 'not-found', `the capture of "${id}"`)
    },
  },
  {
    name: 'answers not-found for a window it does not list',
    async run(open) {
      const backend = await open(scene([...SCENE, FAINT]))
      for (const { id } of NOT_LISTED)
        same(await backend.capture(id), 'not-found', `the capture of "${id}"`)
    },
  },
  {
    name: 'hands out no picture without the permission to read the screen',
    async run(open) {
      for (const permission of ['unsatisfied', 'unknown'] as const) {
        const backend = await open(scene(SCENE, permission))
        for (const id of [FRONT.id, '999'])
          same(await backend.capture(id), 'not-authorized', `${permission}: the capture of "${id}"`)
      }
    },
  },
  {
    name: 'fails, with no picture and no not-found, when the system cannot take the picture',
    async run(open) {
      const backend = await open({ ...scene(SCENE), fault: 'capture' })
      await rejects(() => backend.capture(FRONT.id), 'the capture')
    },
  },
  {
    name: 'fails, with no empty listing, when the system cannot list the windows',
    async run(open) {
      const backend = await open({ ...scene(SCENE), fault: 'list' })
      await rejects(() => backend.list(), 'the listing')
      await rejects(() => backend.capture(FRONT.id), 'the capture')
    },
  },
]

export function pngOf(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24)
  const view = new DataView(bytes.buffer)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

/** A backend over a scene, as the contract asks: what a caller stands in with. */
export function windowBackendOfScene(world: WindowScene): WindowBackend {
  const visible = async () => {
    if (world.fault === 'list') throw new Error('the system cannot list the windows')
    return world.windows.filter(listable)
  }
  return {
    name: 'scene',
    verification: 'contract-suite',
    async list() {
      return (await visible()).map(each => listed(each, world.permission === 'satisfied'))
    },
    async capture(id) {
      if (world.permission !== 'satisfied') return 'not-authorized'
      const window = (await visible()).find(each => each.id === id)
      if (window === undefined) return 'not-found'
      if (world.fault === 'capture') throw new Error('the system cannot take the picture')
      const { bounds, scale } = window
      const width = bounds.width * scale
      const height = bounds.height * scale
      return { png: pngOf(width, height), width, height, scale, bounds }
    },
  }
}
