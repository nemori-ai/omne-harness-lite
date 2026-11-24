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

type Tokens = Readonly<Record<string, string>>

export type BootTokensDeps = Readonly<{
  store: () => TokenStore
  root: BootRoot
  app: Readonly<{ get(): Tokens; subscribe(listener: (tokens: Tokens) => void): () => void }>
  login: Readonly<{ state(): string; subscribe(listener: (state: string) => void): () => void }>
  /** Calls the listener each time everything that is to be loaded has an outcome. */
  outcomes: (listener: () => void) => () => void
}>

/** Keeps for the next start what tints the whole application: only once what is loaded could have put it. */
export function keepBootTokens(deps: BootTokensDeps): () => void {
  const stored = storedTokens(deps.store)
  let settled = false
  const forget = (state: string): void => {
    if (state !== 'signed-out') return
    settled = false
    stored.write({})
    dropBootTokens(deps.root)
  }
  const stops = [
    deps.outcomes(() => {
      settled = true
      dropBootTokens(deps.root)
      stored.write(deps.app.get())
    }),
    deps.app.subscribe(tokens => {
      if (settled) stored.write(tokens)
    }),
    deps.login.subscribe(forget),
  ]
  forget(deps.login.state())
  return () => {
    for (const stop of stops) stop()
  }
}
