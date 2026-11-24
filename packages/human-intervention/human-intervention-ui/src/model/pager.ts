export type Page = Readonly<{ key: string; at: number }> | null

/** Which section the paper shows once its sections are `keys` (in paper order): the shown one follows its card, not its place. */
export function pageAfter(
  keys: readonly string[],
  before: Page,
  start: string | undefined,
): string | undefined {
  if (keys.length === 0) return undefined
  if (before === null) return start !== undefined && keys.includes(start) ? start : keys[0]
  if (keys.includes(before.key)) return before.key
  return keys[Math.min(before.at, keys.length - 1)]
}
