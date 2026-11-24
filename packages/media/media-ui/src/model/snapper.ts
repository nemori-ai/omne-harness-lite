import type { PickedFile } from './attachment-tray.ts'

/** What one capture of the screen came to: a PNG and when it was taken, no permission, or a failure with its reason. */
export type ScreenAnswer =
  | Readonly<{ kind: 'shot'; png: Uint8Array<ArrayBuffer>; takenAt: number }>
  | Readonly<{ kind: 'not-authorized' }>
  | Readonly<{ kind: 'cancelled' }>
  | Readonly<{ kind: 'failed'; reason: string }>

/** Where screenshots come from: the host of the page, when it can read the screen of the person's machine. */
export type ScreenSource = Readonly<{
  available(): Promise<boolean>
  capture(): Promise<ScreenAnswer>
  openSettings?: () => void
}>

export type SnapperState =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'capturing' }>
  | Readonly<{ kind: 'needs-permission'; canOpenSettings: boolean }>
  | Readonly<{ kind: 'failed'; reason: string }>

const UNREACHED = '截图的请求没有发出去'

const twoDigits = (value: number): string => String(value).padStart(2, '0')

export function shotName(takenAt: number): string {
  const at = new Date(takenAt)
  const time = [at.getHours(), at.getMinutes(), at.getSeconds()].map(twoDigits).join('.')
  return `屏幕截图 ${time}.png`
}

type SnapperDeps = Readonly<{ source: ScreenSource; deliver: (file: PickedFile) => void }>

/** One press takes one screenshot and hands it to the tray as a PNG; it says so when the system withholds the permission. */
export class Snapper {
  #state: SnapperState = { kind: 'idle' }
  #disposed = false
  readonly #listeners = new Set<() => void>()
  readonly #deps: SnapperDeps

  constructor(deps: SnapperDeps) {
    this.#deps = deps
  }

  read = (): SnapperState => this.#state

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  async press(): Promise<void> {
    if (this.#disposed || this.#state.kind === 'capturing') return
    this.#set({ kind: 'capturing' })
    const answer = await this.#deps.source
      .capture()
      .catch((): ScreenAnswer => ({ kind: 'failed', reason: UNREACHED }))
    if (this.#disposed) return
    if (answer.kind === 'not-authorized')
      return this.#set({
        kind: 'needs-permission',
        canOpenSettings: this.#deps.source.openSettings !== undefined,
      })
    if (answer.kind === 'failed') return this.#set({ kind: 'failed', reason: answer.reason })
    if (answer.kind === 'cancelled') return this.#set({ kind: 'idle' })
    const { png, takenAt } = answer
    this.#deps.deliver({
      name: shotName(takenAt),
      type: 'image/png',
      size: png.byteLength,
      read: async () => png,
      blob: new Blob([png], { type: 'image/png' }),
    })
    this.#set({ kind: 'idle' })
  }

  openSettings(): void {
    this.#deps.source.openSettings?.()
  }

  dispose(): void {
    this.#disposed = true
    this.#listeners.clear()
  }

  #set(state: SnapperState): void {
    this.#state = state
    for (const listener of this.#listeners) listener()
  }
}
