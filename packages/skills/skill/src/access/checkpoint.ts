export function checkpoint(signal: AbortSignal | undefined): 'aborted' | undefined {
  return signal?.aborted === true ? 'aborted' : undefined
}
