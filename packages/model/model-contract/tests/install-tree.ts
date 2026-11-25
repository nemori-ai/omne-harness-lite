import { rmSync } from 'node:fs'
import { afterAll } from 'vitest'

/** Removing an installed consumer tree on a loaded machine outlasts the default ten seconds of a hook. */
export const REMOVAL_LIMIT_MS = 120_000

/** Removes the directories once the file is done, within a limit fit for installed trees. */
export function removeAfterAll(directories: () => readonly string[]): void {
  afterAll(() => {
    for (const directory of directories()) rmSync(directory, { recursive: true, force: true })
  }, REMOVAL_LIMIT_MS)
}
