// Exact sums of the decimal lexemes of call accounts (`0`, `12`, `0.25`); no rounding, no units.
const LEXEME = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/u

type Scaled = Readonly<{ digits: bigint; places: number }>

function scaled(lexeme: string): Scaled {
  const match = LEXEME.exec(lexeme)
  if (match === null) throw new RangeError(`not a decimal lexeme: ${lexeme}`)
  const fraction = match[2] ?? ''
  return { digits: BigInt(`${match[1] ?? ''}${fraction}`), places: fraction.length }
}

function lexemeOf(value: Scaled): string {
  const text = value.digits.toString().padStart(value.places + 1, '0')
  if (value.places === 0) return text
  const whole = text.slice(0, text.length - value.places)
  const fraction = text.slice(text.length - value.places).replace(/0+$/u, '')
  return fraction === '' ? whole : `${whole}.${fraction}`
}

export function addLexemes(left: string, right: string): string {
  const a = scaled(left)
  const b = scaled(right)
  const places = Math.max(a.places, b.places)
  const digits =
    a.digits * 10n ** BigInt(places - a.places) + b.digits * 10n ** BigInt(places - b.places)
  return lexemeOf({ digits, places })
}
