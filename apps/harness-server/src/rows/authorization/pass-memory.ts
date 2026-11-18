/**
 * Reads made for one judging pass over an Agent's batch are made once and shared by its actions.
 * A call without a pass reads every time; a new pass reads again; the oldest passes are dropped.
 */
export function passMemory<V>(limit = 128) {
  const memory = new Map<string, Promise<V>>()
  return (key: string | undefined, read: () => Promise<V>): Promise<V> => {
    if (key === undefined) return read()
    const found = memory.get(key)
    if (found !== undefined) return found
    const pending = read()
    memory.set(key, pending)
    if (memory.size > limit) memory.delete(memory.keys().next().value!)
    return pending
  }
}
