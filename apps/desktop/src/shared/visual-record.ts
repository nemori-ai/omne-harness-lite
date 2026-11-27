export interface VisualPreferences {
  theme: 'system' | 'light' | 'dark'
  size: 'small' | 'medium' | 'large' | 'reading'
}

export const VISUAL_DEFAULTS: Readonly<VisualPreferences> = Object.freeze({
  theme: 'system',
  size: 'medium',
})

export interface VisualRecord {
  version: 1
  stamp: { t: number; id: string }
  preferences: Partial<VisualPreferences>
}

export type DecodedVisualRecord =
  | { kind: 'missing' | 'invalid'; record?: undefined }
  | { kind: 'valid'; record: VisualRecord }

/** One stamped record of the visual preferences: its codec, its order, and the stamp of the next commit.
 Self-contained, so theme-boot.js carries the same code. */
export function createVisualRecordKernel(defaults: Readonly<VisualPreferences>) {
  function object(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }
  function canonical({ theme, size }: Partial<VisualPreferences>) {
    return { theme, size }
  }
  function encode({ stamp: { t, id }, preferences }: VisualRecord): string {
    return JSON.stringify({ version: 1, stamp: { t, id }, preferences: canonical(preferences) })
  }
  function decode(raw: string | null): DecodedVisualRecord {
    if (raw === null) return { kind: 'missing' }
    try {
      const value: unknown = JSON.parse(raw)
      if (!object(value) || value.version !== 1 || Object.keys(value).length !== 3)
        return { kind: 'invalid' }
      const { stamp, preferences } = value
      if (
        !object(stamp) ||
        Object.keys(stamp).length !== 2 ||
        typeof stamp.t !== 'number' ||
        !Number.isSafeInteger(stamp.t) ||
        stamp.t < 0 ||
        typeof stamp.id !== 'string' ||
        !stamp.id ||
        !object(preferences)
      )
        return { kind: 'invalid' }
      for (const [key, field] of Object.entries(preferences)) {
        if (key === 'theme' && (field === 'system' || field === 'light' || field === 'dark'))
          continue
        if (
          key === 'size' &&
          (field === 'small' || field === 'medium' || field === 'large' || field === 'reading')
        )
          continue
        return { kind: 'invalid' }
      }
      return {
        kind: 'valid',
        record: { version: 1, stamp: { t: stamp.t, id: stamp.id }, preferences },
      }
    } catch {
      return { kind: 'invalid' }
    }
  }
  function compareString(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0
  }
  function compare(a: VisualRecord, b: VisualRecord): number {
    return (
      Math.sign(a.stamp.t - b.stamp.t) ||
      compareString(a.stamp.id, b.stamp.id) ||
      compareString(
        JSON.stringify(canonical(a.preferences)),
        JSON.stringify(canonical(b.preferences)),
      )
    )
  }
  function behind(current: VisualRecord | undefined, target: VisualRecord): boolean {
    return !current || compare(current, target) < 0
  }
  /** At start the first valid replica upstream wins, whatever its stamp: the mirror, then local storage. */
  function atStart(sources: {
    native?: VisualRecord | undefined
    local?: VisualRecord | undefined
  }): VisualRecord | undefined {
    return sources.native ?? sources.local
  }
  function pick(records: readonly (VisualRecord | undefined)[]): VisualRecord | undefined {
    let latest: VisualRecord | undefined
    for (const record of records) if (record && behind(latest, record)) latest = record
    return latest
  }
  function effective(record?: Pick<VisualRecord, 'preferences'>): VisualPreferences {
    return { ...defaults, ...record?.preferences }
  }
  function randomId(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte =>
      byte.toString(16).padStart(2, '0'),
    ).join('')
  }
  function nextStamp(
    seen: readonly (VisualRecord | undefined)[],
    now = /* wall-clock: observation-time -- the stamp that orders a commit among the copies */ Date.now(),
    random = randomId,
  ): VisualRecord['stamp'] {
    const t = Math.max(now, (pick(seen)?.stamp.t ?? -1) + 1)
    if (!Number.isSafeInteger(t))
      throw new RangeError('visual timestamp exceeds safe integer precision')
    return { t, id: random() }
  }
  return { decode, encode, compare, behind, atStart, pick, effective, nextStamp }
}

export const visualRecordKernel = createVisualRecordKernel(VISUAL_DEFAULTS)
