export function recordingSource(...chunks: readonly Uint8Array[]): {
  readonly source: AsyncIterable<Uint8Array>
  readonly state: { pulled: number; ended: boolean }
} {
  const state = { pulled: 0, ended: false }
  const source: AsyncIterable<Uint8Array> = {
    [Symbol.asyncIterator]: () => ({
      next: async () => {
        const chunk = chunks[state.pulled]
        if (chunk === undefined) return { done: true, value: undefined }
        state.pulled += 1
        return { done: false, value: chunk }
      },
      return: async () => {
        state.ended = true
        return { done: true, value: undefined }
      },
    }),
  }
  return { source, state }
}
