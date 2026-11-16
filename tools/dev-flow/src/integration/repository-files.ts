import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function repositoryFile(path: string): string {
  return fileURLToPath(new URL(`../../../../${path}`, import.meta.url))
}
export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}
