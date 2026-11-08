import type { JsonValue } from '@omne-harness/json-text'

function decimalIdentity(lexeme: string): string {
  const [mantissa = '', exponent = '0'] = lexeme.toLowerCase().split('e')
  const negative = mantissa.startsWith('-')
  const unsigned = negative ? mantissa.slice(1) : mantissa
  const dot = unsigned.indexOf('.')
  const fractional = dot < 0 ? 0 : unsigned.length - dot - 1
  const digits = unsigned.replace('.', '').replace(/^0+/, '')
  if (digits === '') return '0'
  const coefficient = digits.replace(/0+$/, '')
  const scale = BigInt(exponent) - BigInt(fractional) + BigInt(digits.length - coefficient.length)
  return `${negative ? '-' : ''}${coefficient}e${scale}`
}

export function schemaNumberProjection(value: JsonValue): JsonValue | null {
  switch (value.kind) {
    case 'number': {
      const number = Number(value.lexeme)
      if (!Number.isFinite(number)) return null
      const lexeme = JSON.stringify(number)
      return decimalIdentity(value.lexeme) === decimalIdentity(lexeme)
        ? { kind: 'number', lexeme }
        : null
    }
    case 'array': {
      const items: JsonValue[] = []
      for (const item of value.items) {
        const projected = schemaNumberProjection(item)
        if (projected === null) return null
        items.push(projected)
      }
      return { kind: 'array', items }
    }
    case 'object': {
      const entries: { key: string; value: JsonValue }[] = []
      for (const entry of value.entries) {
        const projected = schemaNumberProjection(entry.value)
        if (projected === null) return null
        entries.push({ key: entry.key, value: projected })
      }
      return { kind: 'object', entries }
    }
    default:
      return value
  }
}
