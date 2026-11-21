/** Sixteen-bit PCM, one channel, in a RIFF container: the shape of a recorded voice attachment. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const data = samples.length * 2
  const bytes = new Uint8Array(44 + data)
  const view = new DataView(bytes.buffer)
  const tag = (at: number, text: string) => bytes.set(new TextEncoder().encode(text), at)
  tag(0, 'RIFF')
  view.setUint32(4, 36 + data, true)
  tag(8, 'WAVE')
  tag(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  tag(36, 'data')
  view.setUint32(40, data, true)
  samples.forEach((sample, at) => {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(44 + at * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
  })
  return bytes
}
