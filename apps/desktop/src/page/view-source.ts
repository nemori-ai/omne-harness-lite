import { DEVICE_VIEW, type ViewAsked, type ViewCannot } from '../shared/view.ts'

export type ViewAnswer =
  | Readonly<{ kind: 'image'; bytes: Uint8Array; width: number; height: number }>
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
    const { reason } = (await response.json()) as { reason?: unknown }
    if (!REASONS.has(reason)) throw new Error('the application answered no known reason')
    return { kind: 'cannot', reason: reason as ViewCannot }
  }
}
