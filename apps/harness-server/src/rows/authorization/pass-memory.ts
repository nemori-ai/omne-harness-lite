// One judging pass reads each fact once; a call with no pass reads every time.
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
