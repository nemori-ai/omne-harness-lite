export type Page = Readonly<{ key: string; at: number }> | null

/** Which section the paper shows once its sections are `keys` (in paper order), none when there are none: the shown one follows its card, not its place. */
export function pageAfter(
  keys: readonly string[],
  before: Page,
  unanswered: (key: string) => boolean,
): string | undefined {
  if (before === null) return keys.find(unanswered) ?? keys[0]
  if (keys.includes(before.key)) return before.key
  return keys[Math.min(before.at, keys.length - 1)]
}
