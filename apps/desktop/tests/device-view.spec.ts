import { describe, expect, it } from 'vitest'
import { deviceViewRoute, type DeviceViewDeps, type LookWindow } from '../src/main/device-view.ts'
import { DEVICE_VIEW, VIEW_PARAM, type ViewAsked } from '../src/shared/view.ts'

const ASKED: ViewAsked = {
  tenant:
    '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}',
  page: 'notes',
  theme: 'dark',
  size: 'medium',
  look: { kind: 'built-in' },
  width: 400,
  height: 300,
}

type Listener = (...args: never[]) => void

/** A window whose page mounts or not, then says the marks given, one per read. */
function standIn(
  log: string[],
  name: string,
  page: { mounts: boolean; marks: (string | null)[]; structure?: string },
) {
  const listeners = new Map<string, Set<Listener>>()
  let destroyed = false
  const emit = (event: string, ...args: unknown[]) => {
    for (const listener of listeners.get(event) ?? [])
      (listener as (...a: unknown[]) => void)(...args)
  }
  const on = (event: string, listener: Listener) => {
    listeners.set(event, (listeners.get(event) ?? new Set()).add(listener))
  }
  const window: LookWindow = {
    contents: {
      on,
      once: on,
      off: (event, listener) => void listeners.get(event)?.delete(listener),
      isDestroyed: () => destroyed,
      executeJavaScript: async code => {
        if (code.includes('booting')) return page.mounts
        if (code.includes('data-view-structure')) return page.structure ?? null
        return page.marks.length > 1 ? page.marks.shift() : page.marks[0]
      },
    },
    load(query) {
      log.push(`${name} load ${new URLSearchParams(query).get(VIEW_PARAM)}`)
      queueMicrotask(() =>
        page.mounts ? emit('did-finish-load') : emit('did-fail-load', {}, -2, '', '', true),
      )
    },
    async capture(width, height) {
      log.push(`${name} capture ${String(width)}x${String(height)}`)
      return { png: new Uint8Array([137, 80, 78, 71]), width, height }
    },
    close() {
      log.push(`${name} close`)
      destroyed = true
    },
  }
  return window
}

const post = (body: unknown) =>
  new Request(`omne-app://app${DEVICE_VIEW}`, { method: 'POST', body: JSON.stringify(body) })

function routeWith(
  pages: { mounts: boolean; marks: (string | null)[] }[],
  more: Partial<DeviceViewDeps> = {},
) {
  const log: string[] = []
  let opened = 0
  const route = deviceViewRoute({
    open: (width, height) => {
      const page = pages[opened]
      opened += 1
      log.push(`open ${String(width)}x${String(height)}`)
      return page === undefined ? undefined : standIn(log, `w${String(opened)}`, page)
    },
    deadlineMs: 300,
    pollMs: 5,
    ...more,
  })
  return { route, log }
}

const answerOf = async (response: Promise<Response> | undefined) => {
  const answered = await response
  if (answered === undefined) throw new Error('not claimed')
  return answered.headers.get('content-type') === 'image/png'
    ? {
        image: [...new Uint8Array(await answered.arrayBuffer())],
        width: answered.headers.get('x-omne-width'),
        height: answered.headers.get('x-omne-height'),
      }
    : ((await answered.json()) as unknown)
}

describe('POST /device/view', () => {
  it('opens a window of the size asked, loads the page with the request, takes the picture once it says ready, and closes it', async () => {
    const { route, log } = routeWith([{ mounts: true, marks: [null, null, 'ready'] }])
    expect(await answerOf(route(post(ASKED)))).toEqual({
      image: [137, 80, 78, 71],
      width: '400',
      height: '300',
    })
    expect(log).toEqual([
      'open 400x300',
      `w1 load ${JSON.stringify(ASKED)}`,
      'w1 capture 400x300',
      'w1 close',
    ])
  })

  it('passes on what the page says it cannot draw, and closes the window', async () => {
    for (const reason of ['no-page', 'no-skin', 'bad-mode']) {
      const { route, log } = routeWith([{ mounts: true, marks: [reason] }])
      expect(await answerOf(route(post(ASKED)))).toEqual({ reason })
      expect(log.at(-1)).toBe('w1 close')
    }
  })

  it('answers bad-mode for a request it cannot draw, without opening a window', async () => {
    for (const body of [{ ...ASKED, width: 100 }, { ...ASKED, theme: 'sepia' }, 'notes', null]) {
      const { route, log } = routeWith([{ mounts: true, marks: ['ready'] }])
      expect(await answerOf(route(post(body)))).toEqual({ reason: 'bad-mode' })
      expect(log).toEqual([])
    }
  })

  it('answers not-settled when the page does not say it is drawn in time, or does not load', async () => {
    for (const page of [
      { mounts: true, marks: [null] },
      { mounts: false, marks: [null] },
    ]) {
      const { route, log } = routeWith([page])
      expect(await answerOf(route(post(ASKED)))).toEqual({ reason: 'not-settled' })
      expect(log.at(-1)).toBe('w1 close')
    }
  })

  it('answers unsupported where no window can be opened', async () => {
    const { route } = routeWith([])
    expect(await answerOf(route(post(ASKED)))).toEqual({ reason: 'unsupported' })
  })

  it('opens one window at a time, in the order the requests came', async () => {
    const { route, log } = routeWith([
      { mounts: true, marks: [null, 'ready'] },
      { mounts: true, marks: ['no-page'] },
    ])
    const first = answerOf(route(post(ASKED)))
    const second = answerOf(route(post({ ...ASKED, page: 'sessions' })))
    expect(await second).toEqual({ reason: 'no-page' })
    expect(await first).toMatchObject({ width: '400' })
    expect(log.filter(line => /open|close/u.test(line))).toEqual([
      'open 400x300',
      'w1 close',
      'open 400x300',
      'w2 close',
    ])
  })

  it('claims only its own path, and only for POST', async () => {
    const { route } = routeWith([])
    expect(route(new Request('omne-app://app/device/screen'))).toBeUndefined()
    expect((await route(new Request(`omne-app://app${DEVICE_VIEW}`)))?.status).toBe(405)
  })
})

describe('what the drawing page drew, with its picture', () => {
  it('a page that left what it drew answers JSON: the picture in base64, its size, and the structure', async () => {
    const log: string[] = []
    const structure = { page: 'notes', width: 400, height: 300, parts: [], layers: [], more: 0 }
    const route = deviceViewRoute({
      open: () =>
        standIn(log, 'w', { mounts: true, marks: ['ready'], structure: JSON.stringify(structure) }),
      deadlineMs: 1000,
      sleep: async () => undefined,
    })
    const response = await route(post(ASKED))
    expect(response?.headers.get('content-type')).toBe('application/json')
    expect(await response?.json()).toEqual({
      png: Buffer.from([137, 80, 78, 71]).toString('base64'),
      width: 400,
      height: 300,
      structure,
    })
  })
})
