let source: () => number = Math.random
let stillSaid: boolean | null = null

const preference = '(prefers-reduced-motion: reduce)'
const platformStill = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(preference).matches

const clamp = (value: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, value))

export const BODY_CASUAL = { landing: 0.1 } as const

export const casual = {
  use(next: (() => number) | null): void {
    source = next ?? Math.random
  },
  setStill(still: boolean | null): void {
    stillSaid = still
  },
  still(): boolean {
    return stillSaid ?? platformStill()
  },
  random(): number {
    return source()
  },
  around(value: number, spread: number, least = -Infinity, most = Infinity): number {
    if (this.still() || spread <= 0) return clamp(value, least, most)
    return clamp(value * (1 + (source() * 2 - 1) * spread), least, most)
  },
  between(least: number, most: number, designed: number): number {
    if (this.still()) return designed
    return least + (most - least) * source()
  },
}
