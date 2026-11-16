export type Turns = Readonly<{
  inTurn<T>(key: string, run: () => Promise<T>): Promise<T>
}>

export function createTurns(): Turns {
  const turns = new Map<string, Promise<void>>()

  function inTurn<T>(key: string, run: () => Promise<T>): Promise<T> {
    const previous = turns.get(key) ?? Promise.resolve()
    const turn = previous.then(run)
    const done = turn.then(
      () => undefined,
      () => undefined,
    )
    turns.set(key, done)
    void done.then(() => {
      if (turns.get(key) === done) turns.delete(key)
    })
    return turn
  }

  return { inTurn }
}
