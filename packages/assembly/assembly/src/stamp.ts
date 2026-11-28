/** What a state directory says of itself: the build that wrote it last, and the number of every format it uses. */
export type Stamp = Readonly<{ writtenBy: string; formats: Readonly<Record<string, number>> }>

export type StampVerdict =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'current' }>
  | Readonly<{ kind: 'migrate'; formats: readonly string[] }>
  | Readonly<{ kind: 'refused'; writtenBy: string; formats: readonly string[] }>

/** Whether a build that knows `known` may open the directory. A format it does not know, or a newer number, refuses. */
export function judgeStamp(
  stamp: Stamp | undefined,
  known: Readonly<Record<string, number>>,
): StampVerdict {
  if (stamp === undefined) return { kind: 'absent' }
  const ahead = Object.keys(stamp.formats)
    .filter(name => (known[name] ?? 0) < (stamp.formats[name] as number))
    .sort()
  if (ahead.length > 0) return { kind: 'refused', writtenBy: stamp.writtenBy, formats: ahead }
  const behind = Object.keys(known)
    .filter(name => (stamp.formats[name] ?? 0) < (known[name] as number))
    .sort()
  return behind.length > 0 ? { kind: 'migrate', formats: behind } : { kind: 'current' }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export function parseStamp(text: string): Stamp | undefined {
  let read: unknown
  try {
    read = JSON.parse(text)
  } catch {
    return undefined
  }
  if (!isRecord(read) || typeof read['writtenBy'] !== 'string' || read['writtenBy'] === '')
    return undefined
  const formats = read['formats']
  if (!isRecord(formats)) return undefined
  const numbers = Object.entries(formats)
  if (!numbers.every(([, number]) => Number.isInteger(number) && (number as number) > 0))
    return undefined
  return {
    writtenBy: read['writtenBy'],
    formats: Object.fromEntries(numbers) as Record<string, number>,
  }
}
