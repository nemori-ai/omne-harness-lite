import { DEVICE_SHOT, DEVICE_VIEW, type ViewAsked, type ViewCannot } from '../shared/view.ts'

export type ViewAnswer =
  | Readonly<{
      kind: 'image'
      bytes: Uint8Array
      width: number
      height: number
      structure?: unknown
    }>
  | Readonly<{ kind: 'cannot'; reason: ViewCannot }>

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

const REASONS: ReadonlySet<unknown> = new Set<ViewCannot>([
  'no-page',
  'no-skin',
  'bad-mode',
  'not-settled',
  'unsupported',
])

/** A page drawn by the desktop app's main process in a window it never shows (src/main/device-view.ts). Anything else it answers is not known, so it throws. */
export function hostView(
  fetcher: Fetcher = (input, init) => fetch(input, init),
): (asked: ViewAsked, signal: AbortSignal) => Promise<ViewAnswer> {
  return async (asked, signal) => {
    const response = await fetcher(DEVICE_VIEW, {
      method: 'POST',
      body: JSON.stringify(asked),
      signal,
    })
    if (!response.ok) throw new Error(`the application answered ${String(response.status)}`)
    if (response.headers.get('content-type') === 'image/png') {
      const width = Number(response.headers.get('x-omne-width'))
      const height = Number(response.headers.get('x-omne-height'))
      return { kind: 'image', bytes: new Uint8Array(await response.arrayBuffer()), width, height }
    }
    const told = (await response.json()) as { reason?: unknown; png?: unknown }
    if (typeof told.png === 'string') {
      const { width, height, structure } = told as {
        width: number
        height: number
        structure: unknown
      }
      const bytes = Uint8Array.from(atob(told.png), each => each.charCodeAt(0))
      return { kind: 'image', bytes, width, height, structure }
    }
    const { reason } = told
    if (!REASONS.has(reason)) throw new Error('the application answered no known reason')
    return { kind: 'cannot', reason: reason as ViewCannot }
  }
}

/** A picture of the window the person uses, now, of one box of it or all of it; none when the application cannot take one. */
export function hostShot(fetcher: Fetcher = (input, init) => fetch(input, init)) {
  return async (
    box: Readonly<{ x: number; y: number; w: number; h: number }> | undefined,
  ): Promise<Readonly<{ bytes: Uint8Array; width: number; height: number }> | undefined> => {
    const response = await fetcher(DEVICE_SHOT, {
      method: 'POST',
      body: JSON.stringify(box === undefined ? {} : { box }),
    })
    if (!response.ok || response.headers.get('content-type') !== 'image/png') return undefined
    const width = Number(response.headers.get('x-omne-width'))
    const height = Number(response.headers.get('x-omne-height'))
    return { bytes: new Uint8Array(await response.arrayBuffer()), width, height }
  }
}
