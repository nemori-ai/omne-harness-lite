/** The shape the media module takes as its source of screenshots; written here, the page names no domain outside the assembly. */
export type ScreenAnswer =
  | Readonly<{ kind: 'shot'; png: Uint8Array<ArrayBuffer>; takenAt: number }>
  | Readonly<{ kind: 'not-authorized' }>
  | Readonly<{ kind: 'cancelled' }>
  | Readonly<{ kind: 'failed'; reason: string }>
export type ScreenSource = Readonly<{
  available(): Promise<boolean>
  capture(): Promise<ScreenAnswer>
  openSettings?: () => void
}>

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

const DEVICE_SCREEN = '/device/screen'
const FAILED = '截图没有成功'

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  const read: unknown = await response.json().catch(() => null)
  return typeof read === 'object' && read !== null ? (read as Record<string, unknown>) : {}
}

/** Screenshots of the person's machine, taken by the desktop app's main process (src/main/device-screen.ts). */
export function hostScreen(fetcher: Fetcher = (input, init) => fetch(input, init)): ScreenSource {
  return {
    async available() {
      const response = await fetcher(DEVICE_SCREEN).catch(() => null)
      if (response?.ok !== true) return false
      return (await bodyOf(response))['available'] === true
    },
    async capture(): Promise<ScreenAnswer> {
      const response = await fetcher(DEVICE_SCREEN, { method: 'POST' })
      if (response.status === 204) return { kind: 'cancelled' }
      const takenAt = Number(response.headers.get('x-omne-taken-at'))
      if (response.ok && takenAt > 0)
        return { kind: 'shot', png: new Uint8Array(await response.arrayBuffer()), takenAt }
      const body = response.ok ? {} : await bodyOf(response)
      if (body['reason'] === 'not-authorized') return { kind: 'not-authorized' }
      const detail = body['detail']
      return { kind: 'failed', reason: typeof detail === 'string' ? detail : FAILED }
    },
    openSettings() {
      void fetcher(`${DEVICE_SCREEN}/settings`, { method: 'POST' }).catch(() => undefined)
    },
  }
}
