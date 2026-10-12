/** Parses only the current private receipt. Ordinary ANSI and bytes pass through. */
export function createTerminalReceipt(
  id: string,
  output: (data: Buffer) => void,
  complete: (code: number) => void,
) {
  const prefix = Buffer.from('\x1b]777;omne;' + id + ';')
  let pending = Buffer.alloc(0),
    ended = false
  function ordinary(data: Buffer) {
    if (data.length) output(data)
  }
  function tailLength(data: Buffer) {
    for (let size = Math.min(data.length, prefix.length - 1); size > 0; size--)
      if (data.subarray(data.length - size).equals(prefix.subarray(0, size))) return size
    return 0
  }
  function decode(data: Buffer) {
    const text = data.toString('utf8')
    if (!/^(0|[1-9][0-9]*)$/.test(text)) throw new Error('Invalid terminal receipt')
    const code = Number(text)
    if (!Number.isSafeInteger(code) || code > 255) throw new Error('Invalid terminal exit')
    return code
  }
  return {
    feed(data: Buffer) {
      if (!data.length) return
      if (ended) throw new Error('Data after terminal receipt')
      const joined = Buffer.concat([pending, data]),
        start = joined.indexOf(prefix)
      if (start < 0) {
        const keep = tailLength(joined),
          boundary = joined.length - keep
        ordinary(joined.subarray(0, boundary))
        pending = Buffer.from(joined.subarray(boundary))
        return
      }
      ordinary(joined.subarray(0, start))
      pending = Buffer.from(joined.subarray(start))
      if (pending.length > 16384) throw new Error('Terminal receipt too large')
      const end = pending.indexOf(7, prefix.length)
      if (end < 0) return
      if (end !== pending.length - 1) throw new Error('Data after terminal receipt')
      const code = decode(pending.subarray(prefix.length, end))
      pending = Buffer.alloc(0)
      ended = true
      complete(code)
    },
  }
}
