export type Cancel = () => void

export type WaitOptions = Readonly<{ background?: boolean }>

export type TimeSource = Readonly<{
  now(): number
  elapsed(): number
  after(delayMs: number, fire: () => void, options?: WaitOptions): Cancel
  at(epochMs: number, fire: () => void, options?: WaitOptions): Cancel
}>

export function finite(name: string, value: number): number {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`)
  return value
}
