export type Unknown = Readonly<{ unknown: string }>

export type Field<T = string | number> = T | Unknown

export const unknown = (reason: string): Unknown => ({ unknown: reason })

export const isUnknown = (field: unknown): field is Unknown =>
  typeof field === 'object' && field !== null && 'unknown' in field

export type Sources = Readonly<{
  platform: string
  architecture: string
  read: (path: string) => string | null
  list: (path: string) => readonly string[] | null
  resolve: (path: string) => string | null
  run: (command: string, args: readonly string[]) => string | null
  used: (path: string) => number | null
}>

export function taken<T extends string | number>(
  sources: Sources,
  path: string,
  parse: (text: string) => T | null,
): Field<T> {
  if (sources.platform !== 'linux') return unknown(`not read on ${sources.platform}`)
  const text = sources.read(path)
  if (text === null) return unknown(`cannot read ${path}`)
  return parse(text) ?? unknown(`nothing usable in ${path}`)
}

export const trimmed = (text: string): string | null => text.trim() || null
