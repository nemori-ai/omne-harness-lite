import { describe, expect, it } from 'vitest'
import type { PickedFile } from '../src/model/attachment-tray.ts'
import { Recorder, type Capture, type Microphone } from '../src/model/recorder.ts'
import { encodeWav } from '../src/model/wav.ts'

describe('encodeWav', () => {
  it('writes 16-bit mono PCM at the given rate in a RIFF container', () => {
    const bytes = encodeWav(new Float32Array([0, 1, -1, 0.5, 2, -3]), 16_000)
    const view = new DataView(bytes.buffer)
    const text = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4))
    expect([text(0), text(8), text(12), text(36)]).toEqual(['RIFF', 'WAVE', 'fmt ', 'data'])
    expect(bytes.byteLength).toBe(44 + 12)
    expect(view.getUint32(4, true)).toBe(36 + 12)
    expect(view.getUint32(16, true)).toBe(16)
    expect(view.getUint16(20, true)).toBe(1)
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(16_000)
    expect(view.getUint32(28, true)).toBe(32_000)
    expect(view.getUint16(32, true)).toBe(2)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(12)
    const samples = Array.from({ length: 6 }, (_, at) => view.getInt16(44 + at * 2, true))
    expect(samples).toEqual([0, 32767, -32768, 16383, 32767, -32768])
  })
})

type Opened = Readonly<{ capture: Capture; cancelled: () => boolean }>

/** A microphone whose recordings end with the samples given, or fail as told. */
function microphoneOf(answer: () => Promise<Float32Array>, refuse = false) {
  const opened: Opened[] = []
  const gate = { held: null as PromiseWithResolvers<void> | null }
  const microphone: Microphone = {
    async open() {
      if (gate.held !== null) await gate.held.promise
      if (refuse) throw new Error('the permission was refused')
      let cancelled = false
      const capture: Capture = { finish: answer, cancel: () => (cancelled = true) }
      opened.push({ capture, cancelled: () => cancelled })
      return capture
    },
  }
  return { microphone, opened, gate }
}

function recorderOver(microphone: Microphone) {
  const delivered: PickedFile[] = []
  const recorder = new Recorder({ microphone, deliver: file => delivered.push(file) })
  return { recorder, delivered }
}

const SPEECH = new Float32Array([0.25, -0.25, 0.5])

describe('the recorder of the attachment tray', () => {
  it('records while held: on release the speech is a 16 kHz mono WAV handed to the tray', async () => {
    const { microphone } = microphoneOf(async () => SPEECH)
    const { recorder, delivered } = recorderOver(microphone)
    const seen: string[] = []
    recorder.subscribe(() => seen.push(recorder.read().kind))
    await recorder.press()
    expect(recorder.read()).toEqual({ kind: 'recording' })
    await recorder.release()
    expect(seen).toEqual(['opening', 'recording', 'encoding', 'idle'])
    expect(recorder.read()).toEqual({ kind: 'idle', problem: null })
    const [file] = delivered
    expect(file).toMatchObject({ name: '录音 1.wav', type: 'audio/wav', size: 50 })
    expect(await file?.read()).toEqual(encodeWav(SPEECH, 16_000))
    await recorder.press()
    await recorder.release()
    expect(delivered.map(each => each.name)).toEqual(['录音 1.wav', '录音 2.wav'])
  })

  it('a microphone it may not use says so and records nothing', async () => {
    const { microphone } = microphoneOf(async () => SPEECH, true)
    const { recorder, delivered } = recorderOver(microphone)
    await recorder.press()
    await recorder.release()
    expect(recorder.read()).toEqual({ kind: 'idle', problem: '用不了麦克风' })
    expect(delivered).toEqual([])
  })

  it('a recording that cannot be made into a WAV says so', async () => {
    const { microphone } = microphoneOf(async () => {
      throw new Error('the audio cannot be decoded')
    })
    const { recorder, delivered } = recorderOver(microphone)
    await recorder.press()
    await recorder.release()
    expect(recorder.read()).toEqual({ kind: 'idle', problem: '录音转不成 WAV' })
    expect(delivered).toEqual([])
  })

  it('released before the microphone opened, or with nothing heard: a hint to hold, nothing kept', async () => {
    const { microphone, opened, gate } = microphoneOf(async () => SPEECH)
    const { recorder, delivered } = recorderOver(microphone)
    gate.held = Promise.withResolvers<void>()
    const pressing = recorder.press()
    expect(recorder.read()).toEqual({ kind: 'opening' })
    await recorder.release()
    gate.held.resolve()
    await pressing
    expect(opened[0]?.cancelled()).toBe(true)
    expect(recorder.read()).toEqual({ kind: 'idle', problem: '按住说话，松开结束' })
    const silent = recorderOver(microphoneOf(async () => new Float32Array(0)).microphone)
    await silent.recorder.press()
    await silent.recorder.release()
    expect(silent.recorder.read()).toEqual({ kind: 'idle', problem: '按住说话，松开结束' })
    expect([...delivered, ...silent.delivered]).toEqual([])
  })

  it('a new recording clears the problem of the last; releasing while idle does nothing', async () => {
    let refuse = true
    const microphone: Microphone = {
      open: async () => {
        if (refuse) throw new Error('refused')
        return { finish: async () => SPEECH, cancel: () => undefined }
      },
    }
    const { recorder, delivered } = recorderOver(microphone)
    await recorder.press()
    refuse = false
    await recorder.release()
    await recorder.press()
    expect(recorder.read()).toEqual({ kind: 'recording' })
    await recorder.release()
    expect(recorder.read()).toEqual({ kind: 'idle', problem: null })
    expect(delivered).toHaveLength(1)
  })

  it('disposed while recording: the microphone is let go and a late recording is not handed over', async () => {
    const late = Promise.withResolvers<Float32Array>()
    const { microphone, opened } = microphoneOf(() => late.promise)
    const { recorder, delivered } = recorderOver(microphone)
    let told = 0
    recorder.subscribe(() => (told += 1))
    await recorder.press()
    const releasing = recorder.release()
    recorder.dispose()
    late.resolve(SPEECH)
    await releasing
    expect(delivered).toEqual([])
    const other = microphoneOf(async () => SPEECH)
    const held = recorderOver(other.microphone)
    await held.recorder.press()
    held.recorder.dispose()
    expect(other.opened[0]?.cancelled()).toBe(true)
    await held.recorder.press()
    expect(other.opened).toHaveLength(1)
    expect(told).toBe(3)
    expect(opened).toHaveLength(1)
  })
})
