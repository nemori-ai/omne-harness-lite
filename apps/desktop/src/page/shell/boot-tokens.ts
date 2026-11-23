export const TOKENS_KEY = 'omne.tokens'

export type TokenStore = Pick<Storage, 'setItem' | 'removeItem'>

/** Keeps what the whole application is tinted with, for the boot script of the next cold start to read. */
export function storedTokens(store: () => TokenStore): {
  write(tokens: Readonly<Record<string, string>>): void
} {
  return {
    write(tokens) {
      try {
        if (Object.keys(tokens).length === 0) store().removeItem(TOKENS_KEY)
        else store().setItem(TOKENS_KEY, JSON.stringify(tokens))
      } catch {}
    },
  }
}

type BootRoot = {
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
