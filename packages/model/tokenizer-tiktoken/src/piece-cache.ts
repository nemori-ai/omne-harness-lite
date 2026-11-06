import type { TiktokenExecutorLimits } from './executor-types.ts'

type Entry = Readonly<{ lease: number; piece: string; tokens: number; bytes: number }>
type LeaseCache = { entries: Map<string, Entry>; bytes: number }
export type CacheStats = Readonly<{
  cacheBytes: number
  cacheEntries: number
  pieceHits: number
  pieceMisses: number
}>

export class PieceCache {
  private readonly leases = new Map<number, LeaseCache>()
  private readonly entries = new Set<Entry>()
  private bytes = 0
  private hits = 0
  private misses = 0

  private readonly limits: TiktokenExecutorLimits

  constructor(limits: TiktokenExecutorLimits) {
    this.limits = limits
  }

  count(lease: number, piece: string, calculate: () => number): number {
    let cache = this.leases.get(lease)
    const found = cache?.entries.get(piece)
    if (found !== undefined) {
      this.hits++
      this.entries.delete(found)
      this.entries.add(found)
      cache?.entries.delete(piece)
      cache?.entries.set(piece, found)
      return found.tokens
    }
    this.misses++
    const tokens = calculate()
    const bytes = piece.length * 2 + 256
    if (!this.canStore(bytes)) return tokens
    if (cache === undefined) {
      cache = { entries: new Map(), bytes: 0 }
      this.leases.set(lease, cache)
    }
    this.evict(cache, bytes)
    // Copy a match so the cache cannot retain the full ordinary run through a sliced string.
    piece = Buffer.from(piece, 'utf16le').toString('utf16le')
    const entry = { lease, piece, tokens, bytes }
    cache.entries.set(piece, entry)
    cache.bytes += bytes
    this.bytes += bytes
    this.entries.add(entry)
    return tokens
  }

  private canStore(bytes: number): boolean {
    return (
      bytes <=
        Math.min(
          this.limits.maxPieceBytes,
          this.limits.maxLeaseCacheBytes,
          this.limits.maxCacheBytes,
        ) &&
      this.limits.maxCacheEntries > 0 &&
      this.limits.maxLeaseCacheEntries > 0
    )
  }

  private evict(cache: LeaseCache, bytes: number): void {
    while (
      cache.bytes + bytes > this.limits.maxLeaseCacheBytes ||
      cache.entries.size >= this.limits.maxLeaseCacheEntries
    ) {
      const oldest = cache.entries.values().next().value
      if (oldest === undefined) break
      this.remove(oldest)
    }
    while (
      this.bytes + bytes > this.limits.maxCacheBytes ||
      this.entries.size >= this.limits.maxCacheEntries
    ) {
      const oldest = this.entries.values().next().value
      if (oldest === undefined) break
      this.remove(oldest)
    }
  }

  clear(lease: number): void {
    const cache = this.leases.get(lease)
    if (cache === undefined) return
    for (const entry of cache.entries.values()) this.remove(entry)
    this.leases.delete(lease)
  }

  snapshot(): CacheStats {
    return {
      cacheBytes: this.bytes,
      cacheEntries: this.entries.size,
      pieceHits: this.hits,
      pieceMisses: this.misses,
    }
  }

  private remove(entry: Entry): void {
    const cache = this.leases.get(entry.lease)
    if (cache !== undefined) {
      cache.entries.delete(entry.piece)
      cache.bytes -= entry.bytes
    }
    this.entries.delete(entry)
    this.bytes -= entry.bytes
  }
}
