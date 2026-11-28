/** The content of the files read last, by digest. A digest names one content, so what is kept is never stale. */
export type KeptContents = Readonly<{
  get(digest: string): Uint8Array | undefined
  keep(digest: string, content: Uint8Array): void
}>

/** Keeps the contents used last within a budget of bytes; one that is over the budget alone is not kept. */
export function createKeptContents(budget: number): KeptContents {
  const kept = new Map<string, Uint8Array>()
  let bytes = 0
  return {
    get(digest) {
      const content = kept.get(digest)
      if (content === undefined) return undefined
      kept.delete(digest)
      kept.set(digest, content)
      return content
    },
    keep(digest, content) {
      if (content.byteLength > budget || kept.has(digest)) return
      kept.set(digest, content)
      bytes += content.byteLength
      for (const [oldest, dropped] of kept) {
        if (bytes <= budget) break
        kept.delete(oldest)
        bytes -= dropped.byteLength
      }
    },
  }
}
