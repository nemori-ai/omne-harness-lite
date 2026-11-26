import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { judgeStamp, parseStamp, type Stamp } from '@omne-harness/assembly'
import { COMBINATION_VERSION } from './rows/agent-journal/config.ts'
import { writeWhole } from './write-whole.ts'

export const STATE_STAMP_FILE = 'state-stamp.json'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string
}

/** The formats of the state directory this build reads and writes, each with its number. */
const KNOWN_FORMATS: Readonly<Record<string, number>> = {
  'state-directory': 1,
  'session-composite': Number(COMBINATION_VERSION.split('/')[1]),
}
const THIS_BUILD: Stamp = {
  writtenBy: `harness-server@${manifest.version}`,
  formats: KNOWN_FORMATS,
}

/** Why this build may not open the state directory, or null when it may. Nothing is written. */
export function refusedByStamp(stateRoot: string): string | null {
  let text: string
  try {
    text = readFileSync(join(stateRoot, STATE_STAMP_FILE), 'utf8')
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ENOENT') return null
    return `state-stamp-unreadable: ${(error as Error).message}`
  }
  const stamp = parseStamp(text)
  if (stamp === undefined) return `state-stamp-unreadable: ${STATE_STAMP_FILE} is not a stamp`
  const verdict = judgeStamp(stamp, KNOWN_FORMATS)
  return verdict.kind === 'refused'
    ? `state-root-newer: written by ${verdict.writtenBy}; this build does not know: ${verdict.formats.join(', ')}`
    : null
}

/** Names this build as the last writer: a temporary file, then a rename, so the stamp is whole or the old one. */
export function stampState(stateRoot: string): void {
  writeWhole(join(stateRoot, STATE_STAMP_FILE), `${JSON.stringify(THIS_BUILD)}\n`)
}
