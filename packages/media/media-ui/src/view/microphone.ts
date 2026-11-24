import { VOICE_RATE, type Capture, type Microphone } from '../model/recorder.ts'

/** The recorded audio as one channel at VOICE_RATE: decoded, then mixed down and resampled offline. */
async function samplesOf(recorded: Blob): Promise<Float32Array> {
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await recorded.arrayBuffer())
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * VOICE_RATE), VOICE_RATE)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    return (await offline.startRendering()).getChannelData(0)
  } finally {
    void context.close()
  }
}

export const browserMicrophone: Microphone = {
  async open(): Promise<Capture> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream)
    const chunks: Blob[] = []
    recorder.addEventListener('dataavailable', event => chunks.push(event.data))
    const stopped = new Promise(done => recorder.addEventListener('stop', done, { once: true }))
    const close = () => {
      if (recorder.state !== 'inactive') recorder.stop()
      for (const track of stream.getTracks()) track.stop()
    }
    recorder.start()
    return {
      async finish() {
        close()
        await stopped
        return samplesOf(new Blob(chunks, { type: recorder.mimeType }))
      },
      cancel: close,
    }
  },
}
