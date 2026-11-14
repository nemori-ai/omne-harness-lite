const UNSIGNED_NUMBER = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/

export const MAX_PLAIN_DECIMAL_LENGTH = 512

export function plainDecimal(lexeme: string): string | null {
  const match = UNSIGNED_NUMBER.exec(lexeme)
  if (match === null) return null
  const whole = match[1] ?? ''
  const fraction = match[2] ?? ''
  const exponent = match[3]
  if (exponent === undefined) return lexeme
  const magnitude = exponent.replace(/^[+-]/, '').replace(/^0+/, '')
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
