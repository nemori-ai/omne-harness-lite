export type DefaultCompactionConfiguration = Readonly<{
  retainPercent: number
  trimToolText: boolean
  maxToolTextBytes: number
  summaryAttempts: number
}>

export const DEFAULT_COMPACTION_CONFIGURATION: DefaultCompactionConfiguration = Object.freeze({
  retainPercent: 16,
  trimToolText: true,
  maxToolTextBytes: 65536,
  summaryAttempts: 3,
})

export function isDefaultCompactionConfiguration(
  value: unknown,
): value is DefaultCompactionConfiguration {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const fields = Object.getOwnPropertyDescriptors(value)
  const integer = (key: string, min: number, max: number) => {
    const candidate: unknown = fields[key]?.value
    return (
      typeof candidate === 'number' &&
      Number.isInteger(candidate) &&
      candidate >= min &&
      candidate <= max
    )
  }
  return (
    Object.keys(fields).length === 4 &&
    integer('retainPercent', 0, 100) &&
    typeof fields.trimToolText?.value === 'boolean' &&
    integer('maxToolTextBytes', 1, 65536) &&
    integer('summaryAttempts', 1, 3)
  )
}
