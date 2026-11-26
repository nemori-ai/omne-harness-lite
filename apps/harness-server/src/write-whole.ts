import { renameSync, writeFileSync } from 'node:fs'

/** Writes a temporary file, then renames it over the path: a reader finds the old content or the new, whole. */
export function writeWhole(path: string, text: string): void {
  writeFileSync(`${path}.tmp`, text, { mode: 0o600 })
  renameSync(`${path}.tmp`, path)
}
