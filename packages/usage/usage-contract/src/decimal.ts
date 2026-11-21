// Exact sums of the decimal lexemes of call accounts (`0`, `12`, `0.25`); no rounding, no units.
const LEXEME = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/u

export type Decimal = Readonly<{ digits: bigint; places: number }>

export const ZERO: Decimal = { digits: 0n, places: 0 }

export function decimalOf(lexeme: string): Decimal {
  const match = LEXEME.exec(lexeme)
  if (match === null) throw new RangeError(`not a decimal lexeme: ${lexeme}`)
  const fraction = match[2] ?? ''
  return { digits: BigInt(`${match[1] ?? ''}${fraction}`), places: fraction.length }
}

export function plus(a: Decimal, b: Decimal): Decimal {
  if (a.places === b.places) return { digits: a.digits + b.digits, places: a.places }
  const places = Math.max(a.places, b.places)
  const digits =
    a.digits * 10n ** BigInt(places - a.places) + b.digits * 10n ** BigInt(places - b.places)
  return { digits, places }
}

export function lexemeOf(value: Decimal): string {
  const text = value.digits.toString().padStart(value.places + 1, '0')
  if (value.places === 0) return text
  const whole = text.slice(0, text.length - value.places)
  const fraction = text.slice(text.length - value.places).replace(/0+$/u, '')
  return fraction === '' ? whole : `${whole}.${fraction}`
}

export const addLexemes = (left: string, right: string): string =>
  lexemeOf(plus(decimalOf(left), decimalOf(right)))

/** A decimal as a float, for ratios only: they are not summed and need no exact digits. */
export const numberOf = (value: Decimal): number => Number(lexemeOf(value))
