// The plain decimal lexeme of a JSON number: string arithmetic only, so no digit is lost to a float.

/** A JSON number without a sign: whole part, optional fraction, optional exponent. */
const UNSIGNED_NUMBER = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/

/** The most characters of a plain lexeme; an exponent that writes more gives `null`. */
export const MAX_PLAIN_DECIMAL_LENGTH = 512

/**
 * The exact plain decimal lexeme (`0|[1-9][0-9]*` with an optional `.` fraction) of a non-negative
 * JSON number lexeme. A plain lexeme comes back as it is. An exponent moves the decimal point:
 * `2.25e-7` is `0.000000225`, `1.50e2` is `150`. `null` for a negative number, a lexeme that is
 * not a JSON number, or a result longer than `MAX_PLAIN_DECIMAL_LENGTH`.
 */
export function plainDecimal(lexeme: string): string | null {
  const match = UNSIGNED_NUMBER.exec(lexeme)
  if (match === null) return null
  const whole = match[1] ?? ''
  const fraction = match[2] ?? ''
  const exponent = match[3]
  if (exponent === undefined) return lexeme
  const magnitude = exponent.replace(/^[+-]/, '').replace(/^0+/, '')
  // A longer exponent cannot give a lexeme within the limit.
  if (magnitude.length > String(MAX_PLAIN_DECIMAL_LENGTH).length) return null
  const digits = whole + fraction
  const point = whole.length + Number(exponent)
  if (point > MAX_PLAIN_DECIMAL_LENGTH || digits.length - point > MAX_PLAIN_DECIMAL_LENGTH)
    return null
  const [integer, decimals] =
    point <= 0
      ? ['0', '0'.repeat(-point) + digits]
      : point >= digits.length
        ? [digits + '0'.repeat(point - digits.length), '']
        : [digits.slice(0, point), digits.slice(point)]
  const trimmed = integer.replace(/^0+(?=[0-9])/, '')
  const plain = decimals.length > 0 ? `${trimmed}.${decimals}` : trimmed
  return plain.length > MAX_PLAIN_DECIMAL_LENGTH ? null : plain
}
