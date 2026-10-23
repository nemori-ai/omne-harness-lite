import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** A repository-relative path in the checkout that holds this tool, as an absolute path. */
export function repositoryFile(path: string): string {
  return fileURLToPath(new URL(`../../../../${path}`, import.meta.url))
}
/** Parses one JSON file; a syntax error propagates to the caller. */
export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}
