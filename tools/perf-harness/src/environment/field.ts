/** A field that could not be taken on this machine, with the reason: never left empty, never guessed. */
export type Unknown = Readonly<{ unknown: string }>

export type Field<T = string | number> = T | Unknown

export const unknown = (reason: string): Unknown => ({ unknown: reason })

export const isUnknown = (field: unknown): field is Unknown =>
  typeof field === 'object' && field !== null && 'unknown' in field

/** Where the facts of a machine are read from: the real machine, or one a test describes. */
export type Sources = Readonly<{
  platform: string
  architecture: string
  /** the text of a file, or null when it cannot be read */
  read: (path: string) => string | null
  /** the names in a directory, or null when it cannot be listed */
  list: (path: string) => readonly string[] | null
  /** where a path really points, or null */
  resolve: (path: string) => string | null
  /** the standard output of a command, or null when it did not run */
  run: (command: string, args: readonly string[]) => string | null
  /** the share of the filesystem under a path that is in use, or null */
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
