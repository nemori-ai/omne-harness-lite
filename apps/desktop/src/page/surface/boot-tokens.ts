export type BootRoot = {
  dataset: Record<string, string | undefined>
  style: { removeProperty(name: string): unknown }
}

/** Takes off the root what the boot script wrote there: from here the sheet of the changes says it. */
export function dropBootTokens(root: BootRoot): void {
  const names = root.dataset['bootTokens']
  if (names === undefined) return
  for (const name of names.split(' ')) root.style.removeProperty(name)
  delete root.dataset['bootTokens']
}
