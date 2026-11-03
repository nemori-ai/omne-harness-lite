// The abort checkpoint: once before each port call and once after each port answer. An aborted
// signal ends the operation with `aborted`; no port is called after that and no content is given.
export function checkpoint(signal: AbortSignal | undefined): 'aborted' | undefined {
  return signal?.aborted === true ? 'aborted' : undefined
}
