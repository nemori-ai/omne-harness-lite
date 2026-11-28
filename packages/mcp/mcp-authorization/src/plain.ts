export type Plain = Readonly<Record<string, unknown>>

export function isPlain(value: unknown): value is Plain {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function textOf(value: unknown, key: string): string | undefined {
  const found = isPlain(value) ? value[key] : undefined
  return typeof found === 'string' && found !== '' ? found : undefined
}

export function textsOf(value: unknown, key: string): readonly string[] {
  const found = isPlain(value) ? value[key] : undefined
  return Array.isArray(found)
    ? found.filter((item): item is string => typeof item === 'string')
    : []
}

export function flagOf(value: unknown, key: string): boolean {
  return isPlain(value) && value[key] === true
}

export function wholeOf(value: unknown, key: string): number | undefined {
  const found = isPlain(value) ? value[key] : undefined
  return typeof found === 'number' && Number.isSafeInteger(found) && found >= 0 ? found : undefined
}

export function scopesOf(text: string | undefined): readonly string[] {
  return text === undefined ? [] : text.split(/\s+/u).filter(item => item !== '')
}

export function union(...lists: readonly (readonly string[])[]): readonly string[] {
  return [...new Set(lists.flat())]
}
