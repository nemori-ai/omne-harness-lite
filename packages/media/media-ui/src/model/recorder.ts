import type { PickedFile } from './attachment-tray.ts'
import { encodeWav } from './wav.ts'

export const VOICE_RATE = 16_000

/** A recording under way: it ends with the speech as one channel of samples at VOICE_RATE. */
export type Capture = Readonly<{ finish(): Promise<Float32Array>; cancel(): void }>
export type Microphone = Readonly<{ open(): Promise<Capture> }>

export type RecorderState =
  | Readonly<{ kind: 'idle'; problem: string | null }>
  | Readonly<{ kind: 'opening' }>
  | Readonly<{ kind: 'recording' }>
  | Readonly<{ kind: 'encoding' }>

const NO_MICROPHONE = '用不了麦克风'
const NOT_ENCODED = '录音转不成 WAV'
const HOLD = '按住说话，松开结束'

type RecorderDeps = Readonly<{ microphone: Microphone; deliver: (file: PickedFile) => void }>

/** Hold to record, release to hand the speech to the tray as a WAV. */
export class Recorder {
  #state: RecorderState = { kind: 'idle', problem: null }
  #capture: Capture | null = null
  #released = false
  #disposed = false
  #recorded = 0
  readonly #listeners = new Set<() => void>()
  readonly #deps: RecorderDeps

  constructor(deps: RecorderDeps) {
    this.#deps = deps
  }

  read = (): RecorderState => this.#state

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  async press(): Promise<void> {
    if (this.#disposed || this.#state.kind !== 'idle') return
    this.#released = false
    this.#set({ kind: 'opening' })
    const capture = await this.#deps.microphone.open().catch(() => null)
    if (capture === null) return this.#set({ kind: 'idle', problem: NO_MICROPHONE })
    if (this.#disposed || this.#released) {
      capture.cancel()
      return this.#set({ kind: 'idle', problem: HOLD })
    }
    this.#capture = capture
    this.#set({ kind: 'recording' })
  }

  async release(): Promise<void> {
    const capture = this.#capture
    if (capture === null) {
      this.#released = true
      return
    }
    this.#capture = null
    this.#set({ kind: 'encoding' })
    const samples = await capture.finish().catch(() => null)
    if (samples === null) return this.#set({ kind: 'idle', problem: NOT_ENCODED })
    if (samples.length === 0) return this.#set({ kind: 'idle', problem: HOLD })
    const bytes = encodeWav(samples, VOICE_RATE)
    this.#recorded += 1
    const name = `录音 ${String(this.#recorded)}.wav`
    if (!this.#disposed)
      this.#deps.deliver({
        name,
        type: 'audio/wav',
        size: bytes.byteLength,
        read: async () => bytes,
      })
    this.#set({ kind: 'idle', problem: null })
  }

  dispose(): void {
    this.#disposed = true
    this.#capture?.cancel()
    this.#capture = null
    this.#listeners.clear()
  }

  #set(state: RecorderState): void {
    this.#state = state
    for (const listener of this.#listeners) listener()
  }
}
